#!/usr/bin/env python3
"""
ERNIE-Image-Turbo — Production API Server
Batch image generation via Flask + optional ngrok tunnel.

Usage:
    python ernie_server.py                          # local only
    python ernie_server.py --ngrok                  # with ngrok (token from NGROK_TOKEN env)
    python ernie_server.py --ngrok --ngrok-token XY # with ngrok token inline
    python ernie_server.py --port 8080 --dtype float16
"""

import argparse
import base64
import io
import logging
import os
import queue
import signal
import sys
import threading
import time
import uuid

import torch
from diffusers import ErnieImagePipeline
from flask import Flask, jsonify, request
from flask_cors import CORS
from PIL import Image

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler('ernie_server.log', encoding='utf-8'),
    ],
)
log = logging.getLogger(__name__)


# ── CLI Arguments ──────────────────────────────────────────────────────────────
def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='ERNIE-Image-Turbo API Server')
    p.add_argument('--port',        type=int,   default=5000,
                   help='Flask port (default: 5000)')
    p.add_argument('--host',        type=str,   default='0.0.0.0',
                   help='Flask host (default: 0.0.0.0)')
    p.add_argument('--output-dir',  type=str,   default='./slides_output',
                   help='Directory to save generated images')
    p.add_argument('--max-prompts', type=int,   default=10,
                   help='Max prompts accepted per batch request (default: 10)')
    p.add_argument('--steps',       type=int,   default=8,
                   help='Inference steps per image (default: 8)')
    p.add_argument('--guidance',    type=float, default=1.0,
                   help='Guidance scale (default: 1.0)')
    p.add_argument('--dtype',       type=str,   default='float16',
                   choices=['float16', 'bfloat16', 'float32'],
                   help='Model dtype — use float16 for RTX 2080 Ti (default: float16)')
    p.add_argument('--ngrok',       action='store_true',
                   help='Enable ngrok public tunnel')
    p.add_argument('--ngrok-token', type=str,   default='',
                   help='ngrok auth token (or set NGROK_TOKEN env var)')
    return p.parse_args()


# ── Model Loading ──────────────────────────────────────────────────────────────
def load_model(dtype_str: str) -> ErnieImagePipeline:
    dtype_map = {
        'float16': torch.float16,
        'bfloat16': torch.bfloat16,
        'float32': torch.float32,
    }
    dtype = dtype_map[dtype_str]

    n_gpus = torch.cuda.device_count()
    if n_gpus == 0:
        log.warning('No CUDA GPUs found — running on CPU (very slow!)')
    else:
        log.info(f'GPUs detected: {n_gpus}')
        for i in range(n_gpus):
            props = torch.cuda.get_device_properties(i)
            log.info(f'  GPU {i}: {props.name}  ({props.total_memory / 1e9:.1f} GB VRAM)')

    log.info(f'Loading baidu/ERNIE-Image-Turbo  [dtype={dtype_str}, device_map=balanced] ...')
    pipe = ErnieImagePipeline.from_pretrained(
        'baidu/ERNIE-Image-Turbo',
        torch_dtype=dtype,
        device_map='balanced',
    )

    log.info('Model loaded successfully.')
    for i in range(n_gpus):
        used = torch.cuda.memory_allocated(i) / 1e9
        total = torch.cuda.get_device_properties(i).total_memory / 1e9
        log.info(f'  GPU {i} VRAM: {used:.1f} GB used / {total:.1f} GB total')

    return pipe


# ── Image Generation ───────────────────────────────────────────────────────────
def generate_image(
    pipe: ErnieImagePipeline,
    prompt: str,
    seed: int = 42,
    width: int = 1024,
    height: int = 768,
    steps: int = 8,
    guidance: float = 1.0,
) -> Image.Image:
    generator = torch.Generator('cpu').manual_seed(seed)
    result = pipe(
        prompt=prompt,
        height=height,
        width=width,
        num_inference_steps=steps,
        guidance_scale=guidance,
        use_pe=True,
        generator=generator,
    )
    return result.images[0]


def image_to_b64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return base64.b64encode(buf.read()).decode('utf-8')


# ── Worker Thread ──────────────────────────────────────────────────────────────
def start_worker(
    pipe: ErnieImagePipeline,
    job_store: dict,
    req_queue: queue.Queue,
    output_dir: str,
    steps: int,
    guidance: float,
) -> threading.Thread:

    def worker():
        log.info('Worker thread ready.')
        while True:
            task = req_queue.get()
            if task is None:       # poison pill → clean shutdown
                log.info('Worker received shutdown signal.')
                break

            job_id  = task['job_id']
            prompts = task['prompts']
            short   = job_id[:8]
            log.info(f'[{short}] Processing {len(prompts)} image(s) ...')

            results = []
            try:
                for i, prompt in enumerate(prompts):
                    job_store[job_id]['status'] = f'generating {i + 1}/{len(prompts)}'
                    log.info(f'[{short}] [{i+1}/{len(prompts)}] {prompt[:100]}')

                    t0  = time.time()
                    img = generate_image(
                        pipe, prompt,
                        seed=task['seed'] + i,
                        width=task['width'],
                        height=task['height'],
                        steps=steps,
                        guidance=guidance,
                    )
                    elapsed = round(time.time() - t0, 1)
                    log.info(f'[{short}] [{i+1}/{len(prompts)}] Done in {elapsed}s')

                    # Persist to disk
                    out_path = os.path.join(output_dir, f'{short}_{i}.png')
                    img.save(out_path)
                    log.info(f'[{short}] Saved → {out_path}')

                    results.append({
                        'index':   i,
                        'image':   image_to_b64(img),
                        'status':  'ok',
                        'elapsed': elapsed,
                        'path':    out_path,
                    })
                    job_store[job_id]['results'] = results[:]   # update incrementally

                job_store[job_id]['status']     = 'done'
                job_store[job_id]['finished_at'] = time.strftime('%Y-%m-%dT%H:%M:%S')
                log.info(f'[{short}] Job complete — {len(results)} image(s) generated.')

            except Exception as exc:
                log.exception(f'[{short}] Generation failed: {exc}')
                job_store[job_id]['status'] = 'error'
                job_store[job_id]['error']  = str(exc)
            finally:
                req_queue.task_done()

    t = threading.Thread(target=worker, daemon=True, name='ernie-worker')
    t.start()
    return t


# ── Flask App ──────────────────────────────────────────────────────────────────
def create_app(
    pipe: ErnieImagePipeline,
    job_store: dict,
    req_queue: queue.Queue,
    max_prompts: int,
) -> Flask:
    app = Flask(__name__)
    CORS(app)

    # ── GET /health ────────────────────────────────────────────────────────────
    @app.route('/health', methods=['GET'])
    def health():
        gpu_info = []
        for i in range(torch.cuda.device_count()):
            gpu_info.append({
                'id':       i,
                'name':     torch.cuda.get_device_properties(i).name,
                'used_gb':  round(torch.cuda.memory_allocated(i) / 1e9, 2),
                'total_gb': round(torch.cuda.get_device_properties(i).total_memory / 1e9, 2),
            })
        return jsonify({
            'status':       'running',
            'queue_depth':  req_queue.qsize(),
            'jobs_tracked': len(job_store),
            'gpus':         gpu_info,
        })

    # ── POST /generate-batch ───────────────────────────────────────────────────
    @app.route('/generate-batch', methods=['POST'])
    def generate_batch():
        data    = request.json or {}
        prompts = data.get('prompts', [])

        if not prompts:
            return jsonify({'error': 'prompts list is required'}), 400
        if not isinstance(prompts, list):
            return jsonify({'error': 'prompts must be a list of strings'}), 400
        if len(prompts) > max_prompts:
            return jsonify({'error': f'maximum {max_prompts} prompts per batch'}), 400

        job_id = str(uuid.uuid4())
        job_store[job_id] = {
            'status':     'queued',
            'results':    [],
            'queued_at':  time.strftime('%Y-%m-%dT%H:%M:%S'),
            'num_images': len(prompts),
        }
        req_queue.put({
            'job_id':  job_id,
            'prompts': prompts,
            'seed':    int(data.get('seed', 42)),
            'width':   int(data.get('width', 1024)),
            'height':  int(data.get('height', 768)),
        })
        log.info(f'[{job_id[:8]}] Queued — {len(prompts)} prompt(s) | queue depth: {req_queue.qsize()}')
        return jsonify({'job_id': job_id, 'status': 'queued'}), 202

    # ── GET /job/<job_id> ──────────────────────────────────────────────────────
    @app.route('/job/<job_id>', methods=['GET'])
    def get_job(job_id):
        job = job_store.get(job_id)
        if not job:
            return jsonify({'error': 'job not found'}), 404
        return jsonify(job)

    # ── GET /jobs ──────────────────────────────────────────────────────────────
    @app.route('/jobs', methods=['GET'])
    def list_jobs():
        return jsonify({
            jid: {
                'status':     j.get('status'),
                'num_images': j.get('num_images', 0),
                'done':       len(j.get('results', [])),
                'queued_at':  j.get('queued_at'),
                'finished_at': j.get('finished_at'),
            }
            for jid, j in job_store.items()
        })

    # ── DELETE /job/<job_id> ───────────────────────────────────────────────────
    @app.route('/job/<job_id>', methods=['DELETE'])
    def delete_job(job_id):
        if job_id not in job_store:
            return jsonify({'error': 'job not found'}), 404
        del job_store[job_id]
        return jsonify({'deleted': job_id})

    return app


# ── ngrok ──────────────────────────────────────────────────────────────────────
def start_ngrok(port: int, token: str) -> str:
    try:
        from pyngrok import ngrok as ng
    except ImportError:
        log.error('pyngrok not installed. Run: pip install pyngrok')
        sys.exit(1)

    resolved_token = token or os.environ.get('NGROK_TOKEN', '')
    if resolved_token:
        ng.set_auth_token(resolved_token)
    else:
        log.warning('No NGROK_TOKEN set — using unauthenticated tunnel (limited bandwidth)')

    tunnel = ng.connect(port)
    return tunnel.public_url


# ── Entry Point ────────────────────────────────────────────────────────────────
def main() -> None:
    args = parse_args()

    log.info('=' * 60)
    log.info('  ERNIE-Image-Turbo Server')
    log.info('=' * 60)

    os.makedirs(args.output_dir, exist_ok=True)
    log.info(f'Output directory : {os.path.abspath(args.output_dir)}')

    # Load model
    pipe = load_model(args.dtype)

    # Shared state
    job_store: dict        = {}
    req_queue: queue.Queue = queue.Queue()

    # Start worker
    start_worker(pipe, job_store, req_queue, args.output_dir, args.steps, args.guidance)

    # Build Flask app
    app = create_app(pipe, job_store, req_queue, args.max_prompts)

    # Optional ngrok
    if args.ngrok:
        public_url = start_ngrok(args.port, args.ngrok_token)
        log.info(f'ngrok tunnel : {public_url}')
        log.info(f'  Batch URL  : {public_url}/generate-batch')
        log.info(f'  Poll URL   : {public_url}/job/<job_id>')
        log.info(f'  Health     : {public_url}/health')
        log.info(f'  Jobs list  : {public_url}/jobs')
    else:
        base = f'http://localhost:{args.port}'
        log.info(f'Local server :')
        log.info(f'  Batch URL  : {base}/generate-batch')
        log.info(f'  Poll URL   : {base}/job/<job_id>')
        log.info(f'  Health     : {base}/health')
        log.info(f'  Jobs list  : {base}/jobs')

    log.info('=' * 60)

    # Graceful shutdown on Ctrl+C or SIGTERM
    def shutdown(sig, _frame):
        log.info(f'Signal {sig} received — shutting down ...')
        req_queue.put(None)    # stop worker cleanly
        sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Start Flask (blocking)
    app.run(host=args.host, port=args.port, use_reloader=False, threaded=True)


if __name__ == '__main__':
    main()
