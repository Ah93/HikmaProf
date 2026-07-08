#!/usr/bin/env python3
"""
XTTS v2 Voice Cloning Server — port 5001
Run with: xtts_venv\Scripts\python xtts_server.py

Endpoints:
  GET  /health                   — server + model status
  POST /clone                    — upload WAV sample, returns voice_id
  POST /synthesize               — {voice_id, text, language} → WAV audio
  GET  /voices                   — list saved voice samples
  DELETE /voice/<voice_id>       — delete a voice sample
"""

import gc
import logging
import os
import sys
import uuid

import torch

# coqui-tts references isin_mps_friendly which was removed in transformers 5.x
try:
    from transformers.pytorch_utils import isin_mps_friendly  # noqa: F401
except ImportError:
    import transformers.pytorch_utils as _pu
    _pu.isin_mps_friendly = lambda elements, test_elements: torch.isin(elements, test_elements)

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

VOICE_SAMPLES_DIR = os.path.join(os.path.dirname(__file__), 'voice_samples')
SYNTH_OUTPUT_DIR  = os.path.join(os.path.dirname(__file__), 'voice_output')
PORT = 5001

os.makedirs(VOICE_SAMPLES_DIR, exist_ok=True)
os.makedirs(SYNTH_OUTPUT_DIR,  exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)-8s  %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)

# ── Model ──────────────────────────────────────────────────────────────────────
tts_model = None

def load_model():
    global tts_model
    log.info('Loading XTTS v2 model (first run downloads ~2 GB) ...')
    from TTS.api import TTS
    use_gpu = torch.cuda.is_available()
    tts_model = TTS('tts_models/multilingual/multi-dataset/xtts_v2', gpu=use_gpu)
    log.info(f'XTTS v2 loaded  [gpu={use_gpu}]')

# ── Flask ──────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    gpu_info = []
    for i in range(torch.cuda.device_count()):
        p = torch.cuda.get_device_properties(i)
        gpu_info.append({
            'id': i,
            'name': p.name,
            'used_gb':  round(torch.cuda.memory_allocated(i) / 1e9, 2),
            'total_gb': round(p.total_memory / 1e9, 2),
        })
    return jsonify({
        'status':       'running',
        'model_loaded': tts_model is not None,
        'gpus':         gpu_info,
    })


@app.route('/clone', methods=['POST'])
def clone_voice():
    """Upload a WAV/MP3 voice sample. Returns voice_id for future synthesis."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded. Send as multipart/form-data field "file"'}), 400

    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'Empty filename'}), 400

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ('.wav', '.mp3', '.ogg', '.flac'):
        return jsonify({'error': 'Unsupported format. Use WAV, MP3, OGG, or FLAC'}), 400

    voice_id  = str(uuid.uuid4())
    save_path = os.path.join(VOICE_SAMPLES_DIR, f'{voice_id}{ext}')
    f.save(save_path)

    log.info(f'Voice sample saved: {voice_id}{ext}  ({os.path.getsize(save_path)} bytes)')
    return jsonify({'voice_id': voice_id, 'filename': f.filename}), 201


@app.route('/synthesize', methods=['POST'])
def synthesize():
    """Synthesize speech with a cloned voice. Returns WAV audio file."""
    if tts_model is None:
        return jsonify({'error': 'Model not loaded'}), 503

    data     = request.json or {}
    voice_id = data.get('voice_id', '').strip()
    text     = data.get('text', '').strip()
    language = data.get('language', 'en').strip()

    if not voice_id:
        return jsonify({'error': 'voice_id is required'}), 400
    if not text:
        return jsonify({'error': 'text is required'}), 400

    # Find the sample file (any extension)
    sample_path = None
    for fname in os.listdir(VOICE_SAMPLES_DIR):
        if fname.startswith(voice_id):
            sample_path = os.path.join(VOICE_SAMPLES_DIR, fname)
            break

    if not sample_path:
        return jsonify({'error': f'Voice sample not found for voice_id: {voice_id}'}), 404

    out_path = os.path.join(SYNTH_OUTPUT_DIR, f'{uuid.uuid4()}.wav')

    try:
        log.info(f'Synthesizing  lang={language}  chars={len(text)}  voice={voice_id[:8]}...')
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        tts_model.tts_to_file(
            text=text,
            speaker_wav=sample_path,
            language=language,
            file_path=out_path,
        )
        log.info(f'Done → {out_path}')
        return send_file(out_path, mimetype='audio/wav', as_attachment=False)

    except Exception as e:
        log.exception(f'Synthesis failed: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/voices', methods=['GET'])
def list_voices():
    voices = []
    for fname in os.listdir(VOICE_SAMPLES_DIR):
        fpath = os.path.join(VOICE_SAMPLES_DIR, fname)
        voice_id = os.path.splitext(fname)[0]
        voices.append({
            'voice_id':  voice_id,
            'filename':  fname,
            'size_bytes': os.path.getsize(fpath),
        })
    return jsonify({'voices': voices})


@app.route('/voice/<voice_id>', methods=['DELETE'])
def delete_voice(voice_id):
    for fname in os.listdir(VOICE_SAMPLES_DIR):
        if fname.startswith(voice_id):
            os.remove(os.path.join(VOICE_SAMPLES_DIR, fname))
            return jsonify({'deleted': voice_id})
    return jsonify({'error': 'Voice not found'}), 404


# ── Entry Point ────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    log.info('=' * 55)
    log.info('  XTTS v2 Voice Cloning Server')
    log.info(f'  http://localhost:{PORT}')
    log.info('=' * 55)
    load_model()
    app.run(host='0.0.0.0', port=PORT, use_reloader=False, threaded=True)
