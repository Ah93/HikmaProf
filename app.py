#!/usr/bin/env python3
"""
Flask API for AI-Powered Presentation Generation Pipeline
"""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from flask import Flask, request, jsonify, send_file, render_template
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
import os
import subprocess
import json
import uuid
from datetime import datetime, timezone
import shutil
import threading
from queue import Queue
import sys
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Import ppt_to_video utilities
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'ppt_to_video'))
from utils.pdf_converter import convert_pdf_to_images
from utils.tts_engine import generate_speech
from utils.video_composer import compose_video, concatenate_videos

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Job tracking
jobs = {}
job_lock = threading.Lock()
ppt_com_lock = threading.Lock()
preview_lock = threading.Lock()

# Voice-video generation tracking  {job_id: {status, progress, error}}
voice_video_jobs = {}
voice_video_lock = threading.Lock()

# Configuration
UPLOAD_FOLDER = './uploads'
OUTPUT_FOLDER = './output'
ALLOWED_EXTENSIONS = {'pdf', 'docx', 'tex'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_FILE_SIZE

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def update_job_status(job_id, status, **kwargs):
    """Update job status with thread safety"""
    with job_lock:
        if job_id in jobs:
            jobs[job_id].update({
                'status': status,
                'last_updated': datetime.now(timezone.utc).isoformat(),
                **kwargs
            })


def generate_video_from_pptx(job_id, pptx_path, transcript_path, output_name, avatar_choice, voice_choice, speaker_choice, avatar_position, custom_positions=None):
    """Generate video from PPTX and transcript"""
    import time as time_module
    video_start_time = time_module.time()

    print(f"\n{'='*60}")
    print(f"[VIDEO GEN] Starting video generation")
    print(f"[VIDEO GEN] Job ID: {job_id}")
    print(f"[VIDEO GEN] PPTX: {pptx_path}")
    print(f"[VIDEO GEN] Transcript: {transcript_path}")
    print(f"[VIDEO GEN] Avatar: {avatar_choice}")
    print(f"[VIDEO GEN] Voice: {voice_choice}")
    print(f"[VIDEO GEN] Position: {avatar_position}")
    print(f"[VIDEO GEN] Custom positions: {custom_positions is not None}")
    print(f"{'='*60}\n")

    try:
        job_output_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)

        # Create video output folders
        video_temp_dir = os.path.join(job_output_dir, 'video_temp')
        slides_folder = os.path.join(video_temp_dir, 'slides')
        audio_folder = os.path.join(video_temp_dir, 'audio')
        avatar_video_folder = os.path.join(video_temp_dir, 'avatar_videos')

        os.makedirs(slides_folder, exist_ok=True)
        os.makedirs(audio_folder, exist_ok=True)
        os.makedirs(avatar_video_folder, exist_ok=True)

        # Step 1: Converting slides to images (70-72%)
        update_job_status(job_id, 'video_generation', progress=70,
                         step='Converting slides to images',
                         step_description='Preparing slides for video')

        # Convert PPTX to PDF first, then to images
        print(f"[VIDEO GEN] Converting PPTX to PDF...")
        pdf_path = _ensure_job_pdf(job_output_dir, pptx_path)
        print(f"[VIDEO GEN] PDF created at: {pdf_path}")

        print(f"[VIDEO GEN] Converting PDF to images...")
        slide_images = convert_pdf_to_images(pdf_path, slides_folder)
        print(f"[VIDEO GEN] Generated {len(slide_images)} slide images")

        # If no custom positions provided, pause and wait for user to position avatar
        if custom_positions is None:
            print(f"[VIDEO GEN] Pausing for avatar positioning...")

            # Generate slide image URLs for frontend
            slide_urls = [f'/api/job/{job_id}/slide-image/{i}' for i in range(len(slide_images))]
            avatar_url = f'/api/avatars/{avatar_choice}'

            # Store paths in job for later continuation
            with job_lock:
                jobs[job_id]['pptx_path'] = pptx_path
                jobs[job_id]['transcript_path'] = transcript_path
                jobs[job_id]['slide_images'] = slide_urls
                jobs[job_id]['avatar_url'] = avatar_url

            # Update status to awaiting positioning
            update_job_status(job_id, 'awaiting_avatar_positioning', progress=72,
                            step='Position Avatar',
                            step_description='Drag avatar to desired position on slides',
                            slide_images=slide_urls,
                            avatar_url=avatar_url)
            return True  # Pause here

        print(f"[VIDEO GEN] Using custom avatar positions for {len(custom_positions)} slides")

        # Step 2: Generating audio (72-80%)
        update_job_status(job_id, 'video_generation', progress=72,
                         step='Generating voice narration',
                         step_description='Creating audio for each slide')

        # Read and parse transcript
        with open(transcript_path, 'r', encoding='utf-8') as f:
            transcript_text = f.read()

        print(f"[VIDEO GEN] Parsing transcript (length: {len(transcript_text)} chars)...")

        # Split transcript by slides
        import re
        num_slides = len(slide_images)

        # Method 1: Try splitting by "## Slide X" markers
        # Pattern matches: "## Slide 1", "## Slide 2 -", "##Slide 3", etc.
        slide_pattern = r'(?=##\s*[Ss]lide\s+\d+)'
        slide_blocks = re.split(slide_pattern, transcript_text.strip())

        # Remove empty first element if exists
        slide_blocks = [block.strip() for block in slide_blocks if block.strip()]

        print(f"[VIDEO GEN] Found {len(slide_blocks)} slide blocks using ## Slide pattern")

        cleaned_parts = []
        for idx, block in enumerate(slide_blocks):
            # Remove the "---" separator at the end
            block = re.sub(r'\n?---+\s*$', '', block)

            # Split into lines
            lines = block.split('\n')
            content_lines = []

            for line in lines:
                line_stripped = line.strip()

                # Skip the slide header line (## Slide X - Title)
                if re.match(r'^##\s*[Ss]lide\s+\d+', line_stripped, flags=re.IGNORECASE):
                    continue

                # Skip lines that are just "---"
                if re.match(r'^---+\s*$', line_stripped):
                    continue

                # Skip empty lines at start
                if not content_lines and not line_stripped:
                    continue

                # Add the line
                content_lines.append(line)

            # Join content and clean up
            content = '\n'.join(content_lines).strip()

            # Remove any remaining markdown headers at the start (###, ####, etc.)
            content = re.sub(r'^#+\s*', '', content, flags=re.MULTILINE)

            # Clean up excessive whitespace but preserve paragraph breaks
            content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)

            # Final cleanup
            content = content.strip()

            if content and len(content) > 5:
                cleaned_parts.append(content)
                print(f"[VIDEO GEN] Slide {idx+1} content: {len(content)} chars - Preview: {content[:80]}...")
            else:
                print(f"[VIDEO GEN] Warning: Slide {idx+1} has no valid content")

        print(f"[VIDEO GEN] Cleaned {len(cleaned_parts)} slides from transcript")

        # Match to number of slides
        if len(cleaned_parts) >= num_slides:
            transcript = cleaned_parts[:num_slides]
            print(f"[VIDEO GEN] Using first {num_slides} slides from transcript")
        elif len(cleaned_parts) > 0:
            transcript = cleaned_parts
            # Pad with placeholder if needed
            while len(transcript) < num_slides:
                transcript.append("This slide continues the presentation.")
            print(f"[VIDEO GEN] Padded transcript to {num_slides} slides")
        else:
            # Fallback: split text evenly
            print(f"[VIDEO GEN] Warning: Could not parse slides, splitting text evenly")
            words = transcript_text.split()
            words_per_slide = max(10, len(words) // num_slides)
            transcript = [
                ' '.join(words[i*words_per_slide:(i+1)*words_per_slide])
                for i in range(num_slides)
            ]

        # Generate audio files
        audio_files = []
        num_slides = len(transcript)
        for idx, text in enumerate(transcript):
            # Clean the text for speech
            if not text or len(text.strip()) < 5:
                text = "This slide has no narration."
            else:
                # Remove any remaining markdown formatting for clean speech
                text = text.strip()
                # Remove markdown headers (##, ###, etc.)
                text = re.sub(r'^#+\s*', '', text, flags=re.MULTILINE)
                # Remove bold/italic markers
                text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # **bold**
                text = re.sub(r'\*([^*]+)\*', r'\1', text)      # *italic*
                # Remove list markers for cleaner speech
                text = re.sub(r'^\s*[-•]\s+', '', text, flags=re.MULTILINE)
                # Clean up multiple spaces
                text = re.sub(r'\s+', ' ', text)
                text = text.strip()

            audio_path = os.path.join(audio_folder, f'slide_{idx}.wav')
            print(f"[VIDEO GEN] Generating audio for slide {idx+1}/{num_slides}...")
            print(f"[VIDEO GEN] Text for slide {idx+1}: {text[:100]}...")

            # Update progress during audio generation (72-80%)
            audio_progress = 72 + int((idx / num_slides) * 8)
            update_job_status(job_id, 'video_generation', progress=audio_progress,
                             step=f'Generating audio ({idx+1}/{num_slides})',
                             step_description=f'Creating narration for slide {idx+1}')

            generate_speech(
                text,
                audio_path,
                model_name=voice_choice,
                speaker_idx=speaker_choice if speaker_choice else None
            )
            audio_files.append(audio_path)

        # Step 3: Animating avatar (80-88%)
        update_job_status(job_id, 'video_generation', progress=80,
                         step='Animating avatar',
                         step_description='Syncing avatar with audio')

        # Get avatar path
        avatar_folder_path = os.path.join(os.path.dirname(__file__), 'ppt_to_video', 'avatars')
        avatar_path = os.path.join(avatar_folder_path, avatar_choice)

        if not os.path.exists(avatar_path):
            # Use default avatar
            avatar_path = os.path.join(avatar_folder_path, 'avatar_woman.png')

        # Generate avatar videos
        avatar_video_paths = [os.path.join(avatar_video_folder, f'avatar_{idx}.mp4')
                            for idx in range(len(slide_images))]

        print(f"[VIDEO GEN] Batch animating {len(audio_files)} slides with avatar...")
        update_job_status(job_id, 'video_generation', progress=82,
                         step='Animating avatar',
                         step_description='Processing avatar movements (this may take several minutes)')

        # Start a heartbeat thread to keep updating status during long avatar animation
        animation_complete = threading.Event()
        def animation_heartbeat():
            progress = 82
            elapsed_minutes = 0
            while not animation_complete.is_set():
                threading.Event().wait(10)  # Update every 10 seconds
                if not animation_complete.is_set():
                    elapsed_minutes += 1
                    progress = min(87, progress + 0.5)
                    time_msg = f" ({elapsed_minutes//6} min)" if elapsed_minutes > 6 else ""
                    update_job_status(job_id, 'video_generation', progress=int(progress),
                                    step='Animating avatar',
                                    step_description=f'Processing avatar movements{time_msg}...')
                    print(f"[VIDEO GEN] Heartbeat: Avatar animation in progress ({int(progress)}%, {elapsed_minutes//6} min)")

        heartbeat_thread = threading.Thread(target=animation_heartbeat)
        heartbeat_thread.daemon = True
        heartbeat_thread.start()

        try:
            raise RuntimeError('Avatar animation is not available (feature removed).')
        finally:
            animation_complete.set()
            heartbeat_thread.join(timeout=1)

        print(f"[VIDEO GEN] Avatar animation completed")

        # Step 4: Composing video (88-95%)
        update_job_status(job_id, 'video_generation', progress=88,
                         step='Composing video',
                         step_description='Combining slides with avatar')

        # Compose each slide with its animated avatar
        slide_videos = []
        num_slides = len(slide_images)
        for idx, (slide_img, avatar_video_path, audio_file) in enumerate(zip(slide_images, avatar_video_paths, audio_files)):
            print(f"[VIDEO GEN] Composing slide {idx+1}/{num_slides}...")

            # Update progress during composition (88-95%)
            compose_progress = 88 + int((idx / num_slides) * 7)
            update_job_status(job_id, 'video_generation', progress=compose_progress,
                             step=f'Composing video ({idx+1}/{num_slides})',
                             step_description=f'Combining slide {idx+1} with avatar')

            final_slide_video = os.path.join(avatar_video_folder, f'slide_{idx}_final.mp4')

            # Composition can take time, add periodic updates
            import time
            start_time = time.time()
            compose_video(
                slide_img,
                avatar_video_path,
                audio_file,
                final_slide_video,
                avatar_position=avatar_position,
                avatar_size=250
            )
            elapsed = int(time.time() - start_time)
            print(f"[VIDEO GEN] Slide {idx+1} composed in {elapsed}s")

            slide_videos.append(final_slide_video)

        # Step 5: Finalizing video (95-100%)
        update_job_status(job_id, 'video_generation', progress=95,
                         step='Finalizing video',
                         step_description='Creating final video file')

        # Concatenate all slides into final video
        final_video_path = os.path.join(job_output_dir, f'{output_name}_video.mp4')
        print(f"[VIDEO GEN] Concatenating {len(slide_videos)} slide videos...")
        concatenate_videos(slide_videos, final_video_path)
        print(f"[VIDEO GEN] Final video created at: {final_video_path}")
        print(f"[VIDEO GEN] Video file size: {os.path.getsize(final_video_path) / (1024*1024):.2f} MB")

        # Calculate total time
        total_time = time_module.time() - video_start_time
        minutes = int(total_time // 60)
        seconds = int(total_time % 60)
        print(f"[VIDEO GEN] Total video generation time: {minutes}m {seconds}s")

        update_job_status(job_id, 'completed', progress=100,
                         output_file=f'{output_name}.pptx',
                         download_url=f'/api/download/{job_id}/{output_name}.pptx',
                         video_file=f'{output_name}_video.mp4',
                         video_url=f'/api/download/{job_id}/{output_name}_video.mp4')

        print(f"[VIDEO GEN] ✅ Video generation completed successfully!\n")
        return True

    except Exception as e:
        print(f"[VIDEO GEN] ❌ Video generation error: {e}")
        import traceback
        traceback.print_exc()
        # Even if video fails, mark job as completed with PPT available
        update_job_status(job_id, 'completed', progress=100,
                         output_file=f'{output_name}.pptx',
                         download_url=f'/api/download/{job_id}/{output_name}.pptx',
                         video_error=f'Video generation failed: {str(e)}')
        return False


def run_pipeline_background(job_id, file_path, output_name, skip_validation, template_style, color_scheme, preview_slides=False, avatar_choice='', voice_choice='gtts', speaker_choice='', avatar_position='bottom-right', generate_images=False, image_style='professional', skip_backgrounds=False, num_slides=12, slide_layout='default', language='en'):
    """Run the pipeline in background thread"""
    progress_file = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'progress.txt')
    os.makedirs(os.path.dirname(progress_file), exist_ok=True)

    try:
        update_job_status(job_id, 'parsing', progress=15, step='Parsing Document',
                         step_description='Extracting content and structure')

        # Set up environment
        env = os.environ.copy()
        env['SKIP_VALIDATION'] = 'true' if skip_validation else 'false'
        env['TEMPLATE_STYLE'] = template_style
        env['COLOR_SCHEME'] = color_scheme
        env['SLIDE_LAYOUT'] = slide_layout
        env['PROGRESS_FILE'] = progress_file  # Pass progress file path to pipeline
        env['PREVIEW_MODE'] = 'true' if preview_slides else 'false'
        env['NUM_SLIDES'] = str(num_slides)
        env['PRESENTATION_LANGUAGE'] = language

        # AI provider settings are inherited from .env file
        # No need to override - will use AI_PROVIDER and corresponding API key from environment

        # Image generation environment variables
        env['GENERATE_IMAGES'] = 'true' if generate_images else 'false'
        env['IMAGE_STYLE'] = image_style
        env['SKIP_BACKGROUNDS'] = 'true' if skip_backgrounds else 'false'

        # Start a thread to monitor progress file
        stop_monitoring = threading.Event()

        def monitor_progress():
            last_position = 0
            while not stop_monitoring.is_set():
                try:
                    if os.path.exists(progress_file):
                        with open(progress_file, 'r') as f:
                            f.seek(last_position)
                            new_content = f.read()
                            last_position = f.tell()

                            for line in new_content.strip().split('\n'):
                                if not line:
                                    continue
                                # Each line is: "stage|progress|step|description"
                                parts = line.split('|')
                                if len(parts) >= 2:
                                    stage = parts[0]
                                    progress = int(parts[1])
                                    step = parts[2] if len(parts) > 2 else stage.title()
                                    desc = parts[3] if len(parts) > 3 else ''
                                    update_job_status(job_id, stage, progress=progress,
                                                    step=step, step_description=desc)
                except Exception as e:
                    print(f"Progress monitor error: {e}")

                threading.Event().wait(0.5)  # Check every 500ms

        monitor_thread = threading.Thread(target=monitor_progress)
        monitor_thread.daemon = True
        monitor_thread.start()

        npx_cmd = 'npx.cmd' if os.name == 'nt' and shutil.which('npx.cmd') else 'npx'

        # Run the pipeline
        result = subprocess.run(
            [npx_cmd, 'ts-node', 'src/pipeline.ts', file_path, output_name],
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            env=env,
            timeout=9000  # 150 minute timeout (2.5 hours - validation can be very slow)
        )

        # Stop monitoring
        stop_monitoring.set()
        monitor_thread.join(timeout=1)

        result_stdout = result.stdout
        stderr_output = result.stderr

        # Check result
        if result.returncode == 0:
            # Check if preview mode
            if preview_slides:
                # Pipeline stopped after analysis for preview
                job_output_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
                os.makedirs(job_output_dir, exist_ok=True)

                # Copy the slide plan
                slide_plan_src = os.path.join(OUTPUT_FOLDER, 'slide-plan.json')
                if os.path.exists(slide_plan_src):
                    slide_plan_dst = os.path.join(job_output_dir, 'slide-plan.json')
                    shutil.copy2(slide_plan_src, slide_plan_dst)

                    with open(slide_plan_src, 'r', encoding='utf-8') as f:
                        slide_plan = json.load(f)

                    update_job_status(job_id, 'awaiting_approval', progress=50,
                                    step='Preview Ready',
                                    step_description='Review slides before generating',
                                    slide_plan=slide_plan,
                                    logs=result_stdout)
                else:
                    update_job_status(job_id, 'failed', error='Slide plan not found',
                                    logs=result_stdout, errors=stderr_output)
            else:
                update_job_status(job_id, 'finalizing', progress=95, step='Finalizing',
                                step_description='Saving presentation')

                # Find the generated PPTX
                output_pptx = os.path.join(OUTPUT_FOLDER, 'final', f'{output_name}.pptx')

                if os.path.exists(output_pptx):
                    # Move to job-specific location
                    job_output_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
                    os.makedirs(job_output_dir, exist_ok=True)

                    final_pptx_path = os.path.join(job_output_dir, f'{output_name}.pptx')
                    shutil.copy2(output_pptx, final_pptx_path)

                    # Copy metadata files
                    metadata_files = [
                        'document-content.json',
                        'slide-plan.json',
                        'validation-report.json'
                    ]

                    metadata = {}
                    for meta_file in metadata_files:
                        src = os.path.join(OUTPUT_FOLDER, meta_file)
                        if os.path.exists(src):
                            dst = os.path.join(job_output_dir, meta_file)
                            shutil.copy2(src, dst)
                            with open(src, 'r', encoding='utf-8') as f:
                                metadata[meta_file.replace('.json', '')] = json.load(f)

                    transcript_src = os.path.join(OUTPUT_FOLDER, f'{output_name}_transcript.txt')
                    transcript_dst = None
                    if os.path.exists(transcript_src):
                        transcript_dst = os.path.join(job_output_dir, f'{output_name}_transcript.txt')
                        shutil.copy2(transcript_src, transcript_dst)

                    # Generate video if avatar is selected
                    print(f"[DEBUG] avatar_choice: '{avatar_choice}'")
                    print(f"[DEBUG] transcript_dst: {transcript_dst}")
                    print(f"[DEBUG] transcript exists: {os.path.exists(transcript_dst) if transcript_dst else False}")

                    if avatar_choice:
                        print(f"[VIDEO] Starting video generation for job {job_id}")
                        update_job_status(job_id, 'video_generation', progress=65,
                                        step='Starting video generation',
                                        step_description='Processing video with avatar')

                        if transcript_dst and os.path.exists(transcript_dst):
                            print(f"[VIDEO] Calling generate_video_from_pptx...")
                            video_success = generate_video_from_pptx(
                                job_id, final_pptx_path, transcript_dst,
                                output_name, avatar_choice, voice_choice, speaker_choice, avatar_position
                            )
                            if not video_success:
                                print(f"[VIDEO] Video generation returned False")
                        else:
                            print(f"[VIDEO] Transcript not found, skipping video generation")
                            update_job_status(job_id, 'completed', progress=100,
                                            output_file=f'{output_name}.pptx',
                                            download_url=f'/api/download/{job_id}/{output_name}.pptx',
                                            metadata=metadata,
                                            logs=result_stdout,
                                            video_error='Transcript not found for video generation')
                    else:
                        print(f"[VIDEO] No avatar selected, skipping video generation")
                        update_job_status(job_id, 'completed', progress=100,
                                        output_file=f'{output_name}.pptx',
                                        download_url=f'/api/download/{job_id}/{output_name}.pptx',
                                        metadata=metadata,
                                        logs=result_stdout)
                else:
                    update_job_status(job_id, 'failed', error='Output file not found',
                                    logs=result_stdout, errors=stderr_output)
        else:
            update_job_status(job_id, 'failed', error='Pipeline execution failed',
                            logs=result_stdout, errors=stderr_output)

    except subprocess.TimeoutExpired:
        update_job_status(job_id, 'failed', error='Pipeline timeout (max 150 minutes). Generation may be too complex.')
    except Exception as e:
        update_job_status(job_id, 'failed', error=str(e))
    finally:
        # Cleanup uploaded file
        if os.path.exists(file_path):
            os.remove(file_path)


@app.route('/', methods=['GET'])
def home():
    """Landing page"""
    return render_template('home.html')


@app.route('/about', methods=['GET'])
def about():
    return render_template('about.html')


@app.route('/app', methods=['GET'])
def app_interface():
    """Web interface - Desktop UI"""
    return render_template('index_desktop.html')


@app.route('/classic', methods=['GET'])
def index_classic():
    """Classic web interface"""
    return render_template('index.html')


@app.route('/test-templates', methods=['GET'])
def test_templates():
    """Test template gallery"""
    with open('test_templates.html', 'r') as f:
        return f.read()


@app.route('/diagnose', methods=['GET'])
def diagnose():
    """Diagnostic page for template gallery"""
    with open('static/diagnose.html', 'r') as f:
        return f.read()


@app.route('/api', methods=['GET'])
def api_docs():
    """API documentation endpoint"""
    return jsonify({
        'service': 'AI-Powered Presentation Generation API',
        'version': '1.0.0',
        'endpoints': {
            'health': {
                'method': 'GET',
                'url': '/health',
                'description': 'Health check'
            },
            'generate': {
                'method': 'POST',
                'url': '/api/generate',
                'description': 'Generate presentation from document',
                'params': {
                    'file': 'Document file (PDF, DOCX, or TEX)',
                    'output_name': 'Output filename (optional)',
                    'skip_validation': 'Skip validation step (optional, default: false)',
                    'generate_images': 'Enable AI image generation (optional, default: false)',
                    'image_style': 'Image generation style (optional, default: professional)',
                    'skip_backgrounds': 'Skip background image generation (optional, default: false)'
                }
            },
            'download': {
                'method': 'GET',
                'url': '/api/download/<job_id>/<filename>',
                'description': 'Download generated file'
            },
            'job_status': {
                'method': 'GET',
                'url': '/api/job/<job_id>',
                'description': 'Get job status and metadata'
            },
            'list_jobs': {
                'method': 'GET',
                'url': '/api/jobs',
                'description': 'List all jobs'
            },
            'generate_image': {
                'method': 'POST',
                'url': '/api/generate-image',
                'description': 'Generate a single AI image for preview',
                'params': {
                    'prompt': 'Text prompt for image generation',
                    'style': 'Template style (optional, default: modern)',
                    'type': 'Image type: background, illustration, icon',
                    'width': 'Image width (optional, default: 1920)',
                    'height': 'Image height (optional, default: 1080)'
                }
            },
            'get_cached_image': {
                'method': 'GET',
                'url': '/api/images/<cache_key>',
                'description': 'Get a cached image by its key'
            },
            'list_job_images': {
                'method': 'GET',
                'url': '/api/job/<job_id>/images',
                'description': 'List all generated images for a job'
            }
        },
        'supported_formats': ['pdf', 'docx', 'tex'],
        'max_file_size': '50MB'
    })


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'service': 'presentation-pipeline'
    })


@app.route('/api/generate', methods=['POST'])
def generate_presentation():
    """
    Generate a PowerPoint presentation from uploaded document (async)

    Request:
        - file: Document file (PDF, DOCX, or TEX)
        - output_name: (optional) Name for output presentation
        - skip_validation: (optional) Skip visual validation step

    Response:
        - job_id: Unique identifier for this generation job
        - status: Job status (queued)
        - message: Status message
    """

    # Check if file is present
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({
            'error': f'Invalid file type. Allowed: {", ".join(ALLOWED_EXTENSIONS)}'
        }), 400

    # Generate job ID
    job_id = str(uuid.uuid4())

    # Save uploaded file
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], f'{job_id}_{filename}')
    file.save(file_path)

    # Get parameters
    output_name = request.form.get('output_name', os.path.splitext(filename)[0])
    # JavaScript sends 'true'/'false' as strings, not 'on'
    skip_validation_param = request.form.get('skip_validation', 'false')
    skip_validation = skip_validation_param in ['true', 'on', '1', 'yes']
    preview_slides_param = request.form.get('preview_slides', 'true')  # Default: preview enabled
    preview_slides = preview_slides_param in ['true', 'on', '1', 'yes']
    template_style = request.form.get('template_style', 'modern')
    color_scheme = request.form.get('color_scheme', 'blue')
    slide_layout = request.form.get('slide_layout', 'default')

    # Video generation parameters
    avatar_choice = request.form.get('avatar_choice', '')
    voice_choice = request.form.get('voice_choice', 'gtts')
    avatar_position = request.form.get('avatar_position', 'bottom-right')
    speaker_choice = request.form.get('speaker_choice', '')

    # Image generation parameters
    generate_images_param = request.form.get('generate_images', 'false')
    generate_images = generate_images_param in ['true', 'on', '1', 'yes']
    image_style = request.form.get('image_style', 'professional')
    skip_backgrounds_param = request.form.get('skip_backgrounds', 'false')
    skip_backgrounds = skip_backgrounds_param in ['true', 'on', '1', 'yes']

    # Slide count parameter
    num_slides_param = request.form.get('num_slides', '12')
    try:
        num_slides = int(num_slides_param)
        num_slides = max(5, min(30, num_slides))  # Clamp between 5-30
    except ValueError:
        num_slides = 12

    # Language parameter
    language = request.form.get('language', 'en')
    # Whitelist to avoid injection
    allowed_languages = {'en', 'ar', 'fr', 'es', 'de', 'it', 'zh', 'tr', 'pt', 'ru', 'ur'}
    if language not in allowed_languages:
        language = 'en'

    # Debug logging
    print(f"\n[FORM DATA] Received parameters:")
    print(f"  - num_slides: {num_slides}")
    print(f"  - language: {language}")
    print(f"  - avatar_choice: '{avatar_choice}'")
    print(f"  - voice_choice: {voice_choice}")
    print(f"  - speaker_choice: '{speaker_choice}'")
    print(f"  - avatar_position: {avatar_position}")
    print(f"  - generate_images: {generate_images}")
    print(f"  - image_style: {image_style}")
    print(f"  - skip_backgrounds: {skip_backgrounds}")
    print(f"  - All form data: {dict(request.form)}\n")

    # Initialize job tracking
    with job_lock:
        jobs[job_id] = {
            'job_id': job_id,
            'status': 'queued',
            'progress': 0,
            'filename': filename,
            'output_name': output_name,
            'template_style': template_style,
            'color_scheme': color_scheme,
            'slide_layout': slide_layout,
            'avatar_choice': avatar_choice,
            'voice_choice': voice_choice,
            'speaker_choice': speaker_choice,
            'avatar_position': avatar_position,
            'generate_images': generate_images,
            'image_style': image_style,
            'skip_backgrounds': skip_backgrounds,
            'num_slides': num_slides,
            'language': language,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_updated': datetime.now(timezone.utc).isoformat()
        }

    # Persist language to disk so it survives server restarts
    job_meta_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    os.makedirs(job_meta_dir, exist_ok=True)
    with open(os.path.join(job_meta_dir, 'job_meta.json'), 'w') as _f:
        json.dump({'language': language}, _f)

    # Start background thread
    thread = threading.Thread(
        target=run_pipeline_background,
        args=(job_id, file_path, output_name, skip_validation, template_style, color_scheme, preview_slides, avatar_choice, voice_choice, speaker_choice, avatar_position, generate_images, image_style, skip_backgrounds, num_slides, slide_layout, language)
    )
    thread.daemon = True
    thread.start()

    # Return immediately with job ID
    return jsonify({
        'job_id': job_id,
        'status': 'queued',
        'message': 'Job queued for processing'
    }), 202


@app.route('/api/generate-video', methods=['POST'])
def generate_video_only():
    """
    Generate video from existing PowerPoint and transcript (PPT-to-Video only mode)

    Request:
        - pptx_file: PowerPoint file (.pptx)
        - transcript_file: Transcript file (.txt)
        - avatar_choice: Avatar selection
        - voice_choice: Voice/TTS model selection
        - avatar_position: Avatar position on video
        - speaker_choice: (optional) Specific speaker for TTS

    Response:
        - job_id: Unique identifier for this generation job
        - status: Job status (queued)
        - message: Status message
    """

    # Check if files are present
    if 'pptx_file' not in request.files:
        return jsonify({'error': 'No PowerPoint file provided'}), 400

    if 'transcript_file' not in request.files:
        return jsonify({'error': 'No transcript file provided'}), 400

    pptx_file = request.files['pptx_file']
    transcript_file = request.files['transcript_file']

    if pptx_file.filename == '' or transcript_file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Validate file extensions
    if not pptx_file.filename.lower().endswith('.pptx'):
        return jsonify({'error': 'Invalid PowerPoint file. Only .pptx format is supported'}), 400

    if not transcript_file.filename.lower().endswith('.txt'):
        return jsonify({'error': 'Invalid transcript file. Only .txt format is supported'}), 400

    # Generate job ID
    job_id = str(uuid.uuid4())

    # Save uploaded files
    pptx_filename = secure_filename(pptx_file.filename)
    transcript_filename = secure_filename(transcript_file.filename)

    job_output_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    os.makedirs(job_output_dir, exist_ok=True)

    pptx_path = os.path.join(job_output_dir, pptx_filename)
    transcript_path = os.path.join(job_output_dir, transcript_filename)

    pptx_file.save(pptx_path)
    transcript_file.save(transcript_path)

    # Get parameters
    output_name = os.path.splitext(pptx_filename)[0]
    avatar_choice = request.form.get('avatar_choice', '')
    voice_choice = request.form.get('voice_choice', 'gtts')
    avatar_position = request.form.get('avatar_position', 'bottom-right')
    speaker_choice = request.form.get('speaker_choice', '')

    # Debug logging
    print(f"\n[PPT-TO-VIDEO] Received parameters:")
    print(f"  - pptx_file: {pptx_filename}")
    print(f"  - transcript_file: {transcript_filename}")
    print(f"  - avatar_choice: '{avatar_choice}'")
    print(f"  - voice_choice: {voice_choice}")
    print(f"  - speaker_choice: '{speaker_choice}'")
    print(f"  - avatar_position: {avatar_position}\n")

    if not avatar_choice:
        return jsonify({'error': 'Avatar selection is required for video generation'}), 400

    # Initialize job tracking
    with job_lock:
        jobs[job_id] = {
            'job_id': job_id,
            'status': 'queued',
            'progress': 0,
            'filename': pptx_filename,
            'output_name': output_name,
            'avatar_choice': avatar_choice,
            'voice_choice': voice_choice,
            'speaker_choice': speaker_choice,
            'avatar_position': avatar_position,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_updated': datetime.now(timezone.utc).isoformat()
        }

    # Start background thread for video generation
    def run_video_generation_background():
        try:
            update_job_status(job_id, 'video_generation', progress=70,
                            step='Starting video generation',
                            step_description='Processing video with avatar')

            video_success = generate_video_from_pptx(
                job_id, pptx_path, transcript_path,
                output_name, avatar_choice, voice_choice, speaker_choice, avatar_position
            )

            if not video_success:
                print(f"[VIDEO] Video generation failed for job {job_id}")
                update_job_status(job_id, 'failed', error='Video generation failed')

        except Exception as e:
            print(f"[VIDEO] Error during video generation: {e}")
            update_job_status(job_id, 'failed', error=str(e))

    thread = threading.Thread(target=run_video_generation_background)
    thread.daemon = True
    thread.start()

    # Return immediately with job ID
    return jsonify({
        'job_id': job_id,
        'status': 'queued',
        'message': 'Video generation job queued for processing'
    }), 202


@app.route('/api/job/<job_id>/slide-plan', methods=['POST'])
def save_slide_plan(job_id):
    """Save an edited slide plan for a job"""

    with job_lock:
        if job_id not in jobs:
            return jsonify({'error': 'Job not found'}), 404

    data = request.get_json(silent=True) or {}
    slide_plan = data.get('slide_plan')
    if not slide_plan or not isinstance(slide_plan, dict):
        return jsonify({'error': 'Invalid slide_plan'}), 400

    # Basic validation
    if 'slides' not in slide_plan or not isinstance(slide_plan.get('slides'), list):
        return jsonify({'error': 'slide_plan.slides must be an array'}), 400

    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    os.makedirs(job_dir, exist_ok=True)
    slide_plan_path = os.path.join(job_dir, 'slide-plan.json')
    with open(slide_plan_path, 'w', encoding='utf-8') as f:
        json.dump(slide_plan, f, ensure_ascii=False, indent=2)

    with job_lock:
        if job_id in jobs:
            jobs[job_id]['slide_plan'] = slide_plan

    return jsonify({'job_id': job_id, 'status': 'saved', 'slide_plan': slide_plan})


@app.route('/api/job/<job_id>/avatar-positions', methods=['POST'])
def save_avatar_positions(job_id):
    """Save avatar positions for each slide and continue video generation"""

    with job_lock:
        if job_id not in jobs:
            return jsonify({'error': 'Job not found'}), 404

        job = jobs[job_id]
        if job['status'] != 'awaiting_avatar_positioning':
            return jsonify({'error': 'Job is not waiting for avatar positioning'}), 400

    # Get positions from request
    req_data = request.get_json()
    if not req_data or 'positions' not in req_data:
        return jsonify({'error': 'Positions data required'}), 400

    positions = req_data['positions']

    # Save positions to job data
    with job_lock:
        jobs[job_id]['avatar_positions'] = positions
        jobs[job_id]['status'] = 'video_generation'
        jobs[job_id]['progress'] = 75
        jobs[job_id]['last_updated'] = datetime.now(timezone.utc).isoformat()

    # Save to file for persistence
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    os.makedirs(job_dir, exist_ok=True)
    positions_file = os.path.join(job_dir, 'avatar-positions.json')
    with open(positions_file, 'w') as f:
        json.dump(positions, f, indent=2)

    print(f"[AVATAR POS] Saved positions for job {job_id}, continuing video generation")

    # Continue video generation in background
    def continue_video_generation():
        try:
            # Get job parameters
            pptx_path = jobs[job_id].get('pptx_path')
            transcript_path = jobs[job_id].get('transcript_path')
            output_name = jobs[job_id].get('output_name', 'presentation')
            avatar_choice = jobs[job_id].get('avatar_choice', '')
            voice_choice = jobs[job_id].get('voice_choice', 'gtts')
            speaker_choice = jobs[job_id].get('speaker_choice', '')
            avatar_position = jobs[job_id].get('avatar_position', 'bottom-right')

            if not pptx_path or not transcript_path:
                update_job_status(job_id, 'failed', error='Missing PPTX or transcript path')
                return

            # Call video generation with custom positions
            generate_video_from_pptx(
                job_id, pptx_path, transcript_path,
                output_name, avatar_choice, voice_choice, speaker_choice, avatar_position,
                custom_positions=positions
            )

        except Exception as e:
            print(f"[VIDEO] Error continuing video generation: {e}")
            update_job_status(job_id, 'failed', error=str(e))

    thread = threading.Thread(target=continue_video_generation)
    thread.daemon = True
    thread.start()

    return jsonify({
        'success': True,
        'job_id': job_id,
        'message': 'Avatar positions saved, continuing video generation'
    }), 200


@app.route('/api/job/<job_id>/continue', methods=['POST'])
def continue_from_preview(job_id):
    """Continue generating PPTX from approved slide plan"""

    with job_lock:
        if job_id not in jobs:
            return jsonify({'error': 'Job not found'}), 404

        job = jobs[job_id]
        if job['status'] != 'awaiting_approval':
            return jsonify({'error': 'Job is not in preview state'}), 400

        # Update status to generating
        jobs[job_id]['status'] = 'generating'
        jobs[job_id]['progress'] = 60
        jobs[job_id]['last_updated'] = datetime.now(timezone.utc).isoformat()

    # Get job parameters
    output_name = job.get('output_name', 'presentation')
    req_data = request.get_json(silent=True) or {}
    skip_validation = req_data.get('skip_validation', True)
    skip_validation = bool(skip_validation)

    # Get template/color from slide plan metadata first, then fall back to job params
    slide_plan = job.get('slide_plan', {})
    metadata = slide_plan.get('metadata', {})
    template_style = metadata.get('template') or job.get('template_style', 'modern')
    color_scheme = metadata.get('colorScheme') or job.get('color_scheme', 'blue')
    language = job.get('language', 'en')

    print(f"[Continue] Job {job_id}: Generating PPTX with skip_validation={skip_validation}, template={template_style}, color={color_scheme}, language={language}")

    # Start background generation
    def continue_generation():
        try:
            job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
            slide_plan_path = os.path.join(job_dir, 'slide-plan.json')

            if not os.path.exists(slide_plan_path):
                update_job_status(job_id, 'failed', error='Slide plan not found')
                return

            # Set up environment
            env = os.environ.copy()
            env['SKIP_VALIDATION'] = 'true' if skip_validation else 'false'
            env['TEMPLATE_STYLE'] = template_style
            env['COLOR_SCHEME'] = color_scheme
            env['PRESENTATION_LANGUAGE'] = language

            # AI provider settings are inherited from .env file
            # No need to override - will use AI_PROVIDER and corresponding API key from environment

            # Run pipeline from slide plan (copy to output for pipeline compatibility)
            shutil.copy2(slide_plan_path, os.path.join(OUTPUT_FOLDER, 'slide-plan.json'))

            # Copy document content if exists
            doc_content_src = os.path.join(job_dir, 'document-content.json')
            if os.path.exists(doc_content_src):
                shutil.copy2(doc_content_src, os.path.join(OUTPUT_FOLDER, 'document-content.json'))

            update_job_status(job_id, 'generating', progress=70, step='Generating PowerPoint',
                            step_description='Creating professional slides')

            # Create a simple continue script file for faster execution
            script_path = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'continue.ts')

            # Use absolute path for the pipeline module
            pipeline_abs_path = os.path.abspath(os.path.join(os.getcwd(), 'src', 'pipeline')).replace('\\', '/')

            continue_script = f'''
import {{ PresentationPipeline }} from '{pipeline_abs_path}';

(async () => {{
  const pipeline = new PresentationPipeline({{
    outputDir: './output',
    maxFixIterations: 5,
    skipValidation: {str(skip_validation).lower()},
    templateStyle: '{template_style}',
    colorScheme: '{color_scheme}',
    validationConcurrency: 5,
    language: '{language}'
  }});

  const result = await pipeline.runFromSlidePlan('./output/slide-plan.json', '{output_name}');
  if (!result.success) {{
    console.error('Pipeline failed:', result.errors);
    process.exit(1);
  }}
  console.log('PPTX generation complete');
}})().catch(err => {{
  console.error('Error:', err);
  process.exit(1);
}});
'''

            # Write temporary script
            with open(script_path, 'w', encoding='utf-8') as f:
                f.write(continue_script)

            # Run TypeScript script
            npx_cmd = 'npx.cmd' if os.name == 'nt' and shutil.which('npx.cmd') else 'npx'
            result = subprocess.run(
                [npx_cmd, 'ts-node', script_path],
                cwd=os.getcwd(),
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                env=env,
                timeout=600  # Reduced timeout since no validation (10 min max)
            )

            if result.returncode == 0:
                # Find generated PPTX
                output_pptx = os.path.join(OUTPUT_FOLDER, 'final', f'{output_name}.pptx')

                if os.path.exists(output_pptx):
                    final_pptx_path = os.path.join(job_dir, f'{output_name}.pptx')
                    shutil.copy2(output_pptx, final_pptx_path)

                    transcript_src = os.path.join(OUTPUT_FOLDER, f'{output_name}_transcript.txt')
                    transcript_dst = None
                    if os.path.exists(transcript_src):
                        transcript_dst = os.path.join(job_dir, f'{output_name}_transcript.txt')
                        shutil.copy2(transcript_src, transcript_dst)

                    # Generate video if avatar was selected originally
                    avatar_choice = job.get('avatar_choice', '')
                    voice_choice = job.get('voice_choice', 'gtts')
                    speaker_choice = job.get('speaker_choice', '')
                    avatar_position = job.get('avatar_position', 'bottom-right')

                    if avatar_choice and transcript_dst and os.path.exists(transcript_dst):
                        update_job_status(job_id, 'video_generation', progress=65,
                                        step='Starting video generation',
                                        step_description='Processing video with avatar')

                        generate_video_from_pptx(
                            job_id, final_pptx_path, transcript_dst,
                            output_name, avatar_choice, voice_choice, speaker_choice, avatar_position
                        )
                    else:
                        update_job_status(job_id, 'completed', progress=100,
                                        output_file=f'{output_name}.pptx',
                                        download_url=f'/api/download/{job_id}/{output_name}.pptx',
                                        logs=result.stdout)
                else:
                    update_job_status(job_id, 'failed', error='Output file not found',
                                    logs=result.stdout, errors=result.stderr)
            else:
                print(f"[Continue] Pipeline failed!")
                print(f"[Continue] STDOUT: {result.stdout}")
                print(f"[Continue] STDERR: {result.stderr}")
                update_job_status(job_id, 'failed', error='Pipeline execution failed',
                                logs=result.stdout, errors=result.stderr)

        except Exception as e:
            import traceback
            print(f"[Continue] Exception: {e}")
            traceback.print_exc()
            update_job_status(job_id, 'failed', error=str(e))

    thread = threading.Thread(target=continue_generation)
    thread.daemon = True
    thread.start()

    return jsonify({
        'job_id': job_id,
        'status': 'generating',
        'message': 'Continuing presentation generation'
    }), 202


@app.route('/api/download/<job_id>/<filename>', methods=['GET'])
def download_file(job_id, filename):
    """Download generated presentation or metadata file"""

    file_path = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, filename)

    # Handle hidden files (starting with .) - find actual pptx
    if not os.path.exists(file_path) or filename.startswith('.'):
        job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
        if os.path.isdir(job_dir):
            # Find any pptx file in the directory
            pptx_files = [f for f in os.listdir(job_dir) if f.endswith('.pptx')]
            if pptx_files:
                # Prefer non-hidden files, but use hidden if that's all we have
                non_hidden = [f for f in pptx_files if not f.startswith('.')]
                chosen = non_hidden[0] if non_hidden else pptx_files[0]
                file_path = os.path.join(job_dir, chosen)
                filename = chosen if not chosen.startswith('.') else 'presentation.pptx'

    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404

    # Set proper MIME type for PowerPoint files
    mimetype = None
    if filename.lower().endswith('.pptx'):
        mimetype = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    elif filename.lower().endswith('.mp4'):
        mimetype = 'video/mp4'

    return send_file(
        file_path,
        as_attachment=True,
        download_name=filename,
        mimetype=mimetype
    )


@app.route('/api/job/<job_id>/slide-image/<int:slide_index>', methods=['GET'])
def get_slide_image(job_id, slide_index):
    """Get slide image for avatar positioning"""

    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'video_temp', 'slides')

    if not os.path.isdir(job_dir):
        return jsonify({'error': 'Slides not found'}), 404

    # Get list of slide images
    slide_files = sorted([f for f in os.listdir(job_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))])

    if slide_index < 0 or slide_index >= len(slide_files):
        return jsonify({'error': 'Invalid slide index'}), 404

    slide_path = os.path.join(job_dir, slide_files[slide_index])
    return send_file(slide_path, mimetype='image/png')


@app.route('/api/job/<job_id>/transcript', methods=['GET'])
def download_job_transcript(job_id):
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    if not os.path.isdir(job_dir):
        return jsonify({'error': 'Job not found'}), 404

    transcript_files = [f for f in os.listdir(job_dir) if f.lower().endswith('_transcript.txt')]
    if transcript_files:
        transcript_files.sort()
        transcript_path = os.path.join(job_dir, transcript_files[0])
        return send_file(transcript_path, as_attachment=True, download_name=os.path.basename(transcript_path))

    output_name = None
    with job_lock:
        if job_id in jobs:
            output_name = jobs[job_id].get('output_name')

    if output_name:
        transcript_src = os.path.join(OUTPUT_FOLDER, f'{output_name}_transcript.txt')
        if os.path.exists(transcript_src):
            transcript_dst = os.path.join(job_dir, f'{output_name}_transcript.txt')
            shutil.copy2(transcript_src, transcript_dst)
            return send_file(transcript_dst, as_attachment=True, download_name=os.path.basename(transcript_dst))

    return jsonify({'error': 'Transcript not found for this job'}), 404


def _find_soffice_cmd():
    soffice = shutil.which('soffice')
    if soffice:
        return soffice

    soffice = shutil.which('soffice.exe')
    if soffice:
        return soffice

    if os.name == 'nt':
        candidates = [
            os.path.join(os.environ.get('PROGRAMFILES', ''), 'LibreOffice', 'program', 'soffice.exe'),
            os.path.join(os.environ.get('PROGRAMFILES(X86)', ''), 'LibreOffice', 'program', 'soffice.exe'),
        ]
        for p in candidates:
            if p and os.path.exists(p):
                return p

    return None


def _find_pdftoppm_cmd():
    cmd = shutil.which('pdftoppm')
    if cmd:
        return cmd

    cmd = shutil.which('pdftoppm.exe')
    if cmd:
        return cmd

    return None


def _ensure_job_pdf(job_dir: str, pptx_path: str) -> str:
    pptx_filename = os.path.basename(pptx_path)
    pdf_filename = os.path.splitext(pptx_filename)[0] + '.pdf'
    pdf_path = os.path.join(job_dir, pdf_filename)

    if os.path.exists(pdf_path) and os.path.getmtime(pdf_path) >= os.path.getmtime(pptx_path):
        return pdf_path

    soffice_cmd = _find_soffice_cmd()
    if not soffice_cmd and os.name != 'nt':
        raise RuntimeError('LibreOffice (soffice) not found. Install LibreOffice to enable PDF export on this server.')

    if soffice_cmd:
        result = subprocess.run(
            [
                soffice_cmd,
                '--headless',
                '--nologo',
                '--nofirststartwizard',
                '--convert-to', 'pdf',
                '--outdir', job_dir,
                pptx_path
            ],
            cwd=os.getcwd(),
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=300
        )
        if result.returncode != 0:
            details = (result.stderr or result.stdout or '').strip()[:2000]
            raise RuntimeError(f'Failed to convert PPTX to PDF (LibreOffice): {details}')
    else:
        with ppt_com_lock:
            _convert_pptx_to_pdf_via_powerpoint(pptx_path, pdf_path)

    if os.path.exists(pdf_path):
        return pdf_path

    # LibreOffice may output with a different basename; pick newest PDF
    pdf_candidates = [
        os.path.join(job_dir, f) for f in os.listdir(job_dir)
        if f.lower().endswith('.pdf')
    ]
    if pdf_candidates:
        pdf_candidates.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return pdf_candidates[0]

    raise RuntimeError('PDF conversion did not produce an output file')


def _convert_pptx_to_pdf_via_powerpoint(pptx_path: str, pdf_path: str):
    """Convert PPTX to PDF using Microsoft PowerPoint COM automation (Windows only)."""
    if os.name != 'nt':
        raise RuntimeError('PowerPoint COM conversion is only supported on Windows')

    # Import locally so Linux deployments don't require comtypes
    try:
        import pythoncom
        import comtypes.client
    except Exception as e:
        raise RuntimeError(f'PowerPoint COM dependencies not available: {e}')

    abs_pptx = os.path.abspath(pptx_path)
    abs_pdf = os.path.abspath(pdf_path)

    pythoncom.CoInitialize()
    app = None
    presentation = None
    try:
        app = comtypes.client.CreateObject('PowerPoint.Application')
        app.Visible = 1
        try:
            app.DisplayAlerts = 0
        except Exception:
            pass

        # Open read-only, no window
        presentation = app.Presentations.Open(abs_pptx, WithWindow=False, ReadOnly=True)

        # ppSaveAsPDF = 32
        presentation.SaveAs(abs_pdf, 32)

    finally:
        try:
            if presentation is not None:
                presentation.Close()
        except Exception:
            pass
        try:
            if app is not None:
                app.Quit()
        except Exception:
            pass
        try:
            pythoncom.CoUninitialize()
        except Exception:
            pass


@app.route('/api/job/<job_id>/pdf', methods=['GET'])
def download_job_pdf(job_id):
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    if not os.path.isdir(job_dir):
        return jsonify({'error': 'Job not found'}), 404

    # Pick the pptx to convert
    pptx_files = [f for f in os.listdir(job_dir) if f.lower().endswith('.pptx')]
    if not pptx_files:
        return jsonify({'error': 'PPTX file not found for this job'}), 404

    pptx_files.sort()
    pptx_filename = pptx_files[0]
    pptx_path = os.path.join(job_dir, pptx_filename)

    try:
        pdf_path = _ensure_job_pdf(job_dir, pptx_path)
        return send_file(pdf_path, as_attachment=True, download_name=os.path.basename(pdf_path))
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'PDF conversion timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ─────────────────────────────────────────────────────────────────────────────
# VOICE-ONLY VIDEO GENERATION
# ─────────────────────────────────────────────────────────────────────────────

def _parse_transcript_for_tts(transcript_path, n_slides):
    """Parse *_transcript.txt into a list of per-slide narration strings."""
    import re

    if not transcript_path or not os.path.exists(transcript_path):
        return [f'Slide {i + 1}.' for i in range(n_slides)]

    with open(transcript_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # pipeline.ts joins blocks with '\n---\n'
    blocks = re.split(r'\n---\n', content)

    texts = []
    for block in blocks:
        block = block.strip()
        if not block:
            continue
        lines = block.split('\n', 1)
        # Drop the "## Slide N – Title" header line
        body = lines[1].strip() if len(lines) > 1 else lines[0].strip()
        # Strip residual markdown formatting
        body = re.sub(r'#+\s*', '', body)
        body = re.sub(r'\*\*(.+?)\*\*', r'\1', body)
        body = re.sub(r'\*(.+?)\*', r'\1', body)
        body = body.strip()
        if body:
            texts.append(body[:1800])  # cap length for TTS engine

    # Pad or trim to match actual slide count
    while len(texts) < n_slides:
        texts.append(f'Slide {len(texts) + 1}.')
    return texts[:n_slides]


# Best neural voice per language — edge-tts (Microsoft Azure neural, free)
# Secondary voice used as alternate for more natural variety where available
_EDGE_TTS_VOICES = {
    'en': 'en-US-JennyNeural',      # warm, natural American English
    'ar': 'ar-EG-SalmaNeural',       # Egyptian Arabic — more natural, widely understood
    'fr': 'fr-FR-DeniseNeural',     # natural French
    'es': 'es-ES-ElviraNeural',     # clear Castilian Spanish
    'de': 'de-DE-KatjaNeural',      # natural German
    'it': 'it-IT-ElsaNeural',       # natural Italian
    'zh': 'zh-CN-XiaoxiaoNeural',   # expressive Mandarin
    'tr': 'tr-TR-EmelNeural',       # Turkish
    'pt': 'pt-BR-FranciscaNeural',  # Brazilian Portuguese (more natural than PT-PT)
    'ru': 'ru-RU-SvetlanaNeural',   # Russian
    'ur': 'ur-PK-UzmaNeural',       # Urdu
}

# gTTS language codes (some differ from BCP-47 used by edge-tts)
_GTTS_LANG_CODES = {
    'en': 'en', 'ar': 'ar', 'fr': 'fr', 'es': 'es', 'de': 'de',
    'it': 'it', 'zh': 'zh-CN', 'tr': 'tr', 'pt': 'pt', 'ru': 'ru', 'ur': 'ur',
}


def _tts_audio(text, out_path, language='en'):
    """Generate MP3 audio for *text*.

    Priority:
      1. edge-tts  — Microsoft Azure neural voices (best quality, free, no key)
      2. gTTS      — Google TTS (decent fallback, robotic but reliable)
      3. silence   — 3-second silent MP3 so video still renders
    """
    lang = language or 'en'
    edge_voice = _EDGE_TTS_VOICES.get(lang, 'en-US-JennyNeural')

    # ── 1. edge-tts (primary) ─────────────────────────────────────────────────
    try:
        import asyncio
        import edge_tts

        async def _run_edge():
            communicate = edge_tts.Communicate(text, edge_voice, rate="-15%")
            await asyncio.wait_for(communicate.save(out_path), timeout=60)

        asyncio.run(_run_edge())
        print(f'[VOICE VIDEO] edge-tts OK  voice={edge_voice}  lang={lang}')
        return
    except Exception as edge_err:
        print(f'[VOICE VIDEO] edge-tts failed ({edge_err}), falling back to gTTS…')

    # ── 2. gTTS (fallback) ────────────────────────────────────────────────────
    try:
        from gtts import gTTS
        gtts_lang = _GTTS_LANG_CODES.get(lang, 'en')
        tts = gTTS(text=text, lang=gtts_lang, slow=False)
        tts.save(out_path)
        print(f'[VOICE VIDEO] gTTS OK  lang={gtts_lang}')
        return
    except Exception as gtts_err:
        print(f'[VOICE VIDEO] gTTS failed ({gtts_err}), using silent audio…')

    # ── 3. Silent fallback ────────────────────────────────────────────────────
    _tts_silent_audio(out_path, duration=3)


def _tts_silent_audio(out_path, duration=3):
    """Create a silent MP3 via FFmpeg (fallback when TTS engines fail)."""
    subprocess.run(
        ['ffmpeg', '-y', '-f', 'lavfi', '-i', f'anullsrc=r=22050:cl=mono',
         '-t', str(duration), '-q:a', '9', '-acodec', 'libmp3lame', out_path],
        capture_output=True, timeout=30
    )


def _compose_voice_clip(img_path, audio_path, clip_path):
    """Combine one static slide image + audio into a single MP4 clip."""
    result = subprocess.run(
        ['ffmpeg', '-y',
         '-loop', '1', '-i', img_path,
         '-i', audio_path,
         '-c:v', 'libx264', '-tune', 'stillimage',
         '-c:a', 'aac', '-b:a', '128k',
         '-pix_fmt', 'yuv420p',
         '-shortest',
         clip_path],
        capture_output=True, timeout=120
    )
    if result.returncode != 0:
        raise RuntimeError(f'FFmpeg clip error: {result.stderr.decode(errors="replace")[-500:]}')


def _concat_voice_clips(clip_paths, output_path):
    """Concatenate all slide MP4 clips into the final video."""
    abs_output = os.path.abspath(output_path)
    list_path = abs_output + '.list.txt'
    with open(list_path, 'w', encoding='utf-8') as f:
        for p in clip_paths:
            safe = os.path.abspath(p).replace('\\', '/').replace("'", "\\'")
            f.write(f"file '{safe}'\n")
    try:
        result = subprocess.run(
            ['ffmpeg', '-y',
             '-f', 'concat', '-safe', '0',
             '-i', os.path.abspath(list_path),
             '-c', 'copy',
             abs_output],
            capture_output=True, timeout=300
        )
        if result.returncode != 0:
            raise RuntimeError(f'FFmpeg concat error: {result.stderr.decode(errors="replace")[-500:]}')
    finally:
        try:
            os.remove(os.path.abspath(list_path))
        except OSError:
            pass


def _update_voice_job(job_id, status, progress, error=''):
    with voice_video_lock:
        voice_video_jobs[job_id] = {'status': status, 'progress': progress, 'error': error}


def _generate_voice_video_background(job_id, job_dir, pptx_path, transcript_path, output_path, language='en'):
    """Full pipeline: PPTX → slide images → TTS audio → compose clips → concatenate."""
    try:
        import fitz  # PyMuPDF

        work_dir = os.path.join(job_dir, 'voice_video')
        os.makedirs(work_dir, exist_ok=True)

        # ── Step 1: PPTX → PDF ───────────────────────────────────────────────
        _update_voice_job(job_id, 'converting_slides', 5)
        print(f'[VOICE VIDEO] Converting PPTX to PDF for job {job_id}…')
        pdf_path = _ensure_job_pdf(job_dir, pptx_path)

        # ── Step 2: PDF → PNG slide images ───────────────────────────────────
        _update_voice_job(job_id, 'rendering_slides', 15)
        print(f'[VOICE VIDEO] Rendering slide images…')
        doc = fitz.open(pdf_path)
        n_slides = len(doc)
        mat = fitz.Matrix(1.5, 1.5)   # ~144 DPI → 1440×1080
        slide_images = []
        for i in range(n_slides):
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img_path = os.path.join(work_dir, f'slide_{i + 1:03d}.png')
            pix.save(img_path)
            slide_images.append(img_path)
        doc.close()
        print(f'[VOICE VIDEO] Rendered {n_slides} slide images')

        # ── Step 3: Parse transcript ──────────────────────────────────────────
        _update_voice_job(job_id, 'parsing_transcript', 22)
        slide_texts = _parse_transcript_for_tts(transcript_path, n_slides)
        print(f'[VOICE VIDEO] Parsed {len(slide_texts)} transcript blocks')

        # ── Step 4: TTS audio per slide ───────────────────────────────────────
        audio_files = []
        for i, text in enumerate(slide_texts):
            _update_voice_job(job_id, 'generating_voice', 25 + int((i / n_slides) * 40))
            print(f'[VOICE VIDEO] TTS slide {i + 1}/{n_slides}…')
            audio_path = os.path.join(work_dir, f'audio_{i + 1:03d}.mp3')
            _tts_audio(text, audio_path, language=language)
            audio_files.append(audio_path)

        # ── Step 5: Compose one video clip per slide ──────────────────────────
        clip_files = []
        for i, (img, audio) in enumerate(zip(slide_images, audio_files)):
            _update_voice_job(job_id, 'composing_video', 65 + int((i / n_slides) * 25))
            print(f'[VOICE VIDEO] Composing clip {i + 1}/{n_slides}…')
            clip_path = os.path.join(work_dir, f'clip_{i + 1:03d}.mp4')
            _compose_voice_clip(img, audio, clip_path)
            clip_files.append(clip_path)

        # ── Step 6: Concatenate all clips ─────────────────────────────────────
        _update_voice_job(job_id, 'finalizing', 92)
        print(f'[VOICE VIDEO] Concatenating {len(clip_files)} clips…')
        _concat_voice_clips(clip_files, output_path)

        _update_voice_job(job_id, 'done', 100)
        print(f'[VOICE VIDEO] Complete → {output_path}')

    except Exception as exc:
        _update_voice_job(job_id, 'error', 0, str(exc))
        print(f'[VOICE VIDEO] ERROR for job {job_id}: {exc}')
        import traceback
        traceback.print_exc()


@app.route('/api/job/<job_id>/voice-video/generate', methods=['POST'])
def start_voice_video(job_id):
    """Kick off background voice-only video generation for a completed job."""
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    if not os.path.isdir(job_dir):
        return jsonify({'error': 'Job not found'}), 404

    output_path = os.path.join(job_dir, 'voice_presentation.mp4')

    # Already generated – nothing to do
    if os.path.exists(output_path):
        _update_voice_job(job_id, 'done', 100)
        return jsonify({'status': 'done'})

    # Already running – return current state without spawning a second thread
    with voice_video_lock:
        existing = voice_video_jobs.get(job_id, {})
    in_progress = {
        'starting', 'converting_slides', 'rendering_slides',
        'parsing_transcript', 'generating_voice', 'composing_video', 'finalizing'
    }
    if existing.get('status') in in_progress:
        return jsonify({'status': existing['status'], 'progress': existing.get('progress', 0)})

    # Find the PPTX file
    pptx_files = sorted(f for f in os.listdir(job_dir) if f.lower().endswith('.pptx'))
    if not pptx_files:
        return jsonify({'error': 'No PPTX file found for this job'}), 404
    pptx_path = os.path.join(job_dir, pptx_files[0])

    # Find the transcript (generated by pipeline.ts)
    transcript_files = sorted(f for f in os.listdir(job_dir) if f.endswith('_transcript.txt'))
    transcript_path = os.path.join(job_dir, transcript_files[0]) if transcript_files else None

    # Get language from the in-memory job record, fall back to disk
    with job_lock:
        job_language = jobs.get(job_id, {}).get('language', None)
    if not job_language:
        meta_path = os.path.join(job_dir, 'job_meta.json')
        if os.path.exists(meta_path):
            with open(meta_path, 'r') as _f:
                job_language = json.load(_f).get('language', 'en')
        else:
            job_language = 'en'

    _update_voice_job(job_id, 'starting', 0)
    thread = threading.Thread(
        target=_generate_voice_video_background,
        args=(job_id, job_dir, pptx_path, transcript_path, output_path, job_language),
        daemon=True
    )
    thread.start()
    return jsonify({'status': 'started'})


@app.route('/api/job/<job_id>/voice-video/status', methods=['GET'])
def voice_video_status(job_id):
    """Poll the current status of a voice video generation."""
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    output_path = os.path.join(job_dir, 'voice_presentation.mp4')

    # File on disk is ground truth – handles server restarts gracefully
    if os.path.exists(output_path):
        return jsonify({'status': 'done', 'progress': 100})

    with voice_video_lock:
        info = voice_video_jobs.get(job_id, {'status': 'not_started', 'progress': 0, 'error': ''})
    return jsonify(info)


@app.route('/api/job/<job_id>/voice-video/download', methods=['GET'])
def download_voice_video(job_id):
    """Serve the completed voice-only presentation video."""
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    output_path = os.path.join(job_dir, 'voice_presentation.mp4')
    if not os.path.exists(output_path):
        return jsonify({'error': 'Voice video not yet generated for this job'}), 404
    return send_file(
        output_path,
        as_attachment=True,
        download_name=f'voice-presentation-{job_id}.mp4'
    )


@app.route('/api/job/<job_id>/previews', methods=['GET'])
def list_job_previews(job_id):
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    if not os.path.isdir(job_dir):
        return jsonify({'error': 'Job not found'}), 404

    preview_dir = os.path.join(job_dir, 'previews')
    if not os.path.isdir(preview_dir):
        return jsonify({'job_id': job_id, 'previews': []})

    images = [f for f in os.listdir(preview_dir) if f.lower().endswith('.png')]
    images.sort()
    return jsonify({
        'job_id': job_id,
        'previews': [
            {
                'filename': f,
                'url': f'/api/job/{job_id}/previews/{f}'
            }
            for f in images
        ]
    })


@app.route('/api/job/<job_id>/previews/generate', methods=['POST'])
def generate_job_previews(job_id):
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    if not os.path.isdir(job_dir):
        return jsonify({'error': 'Job not found'}), 404

    pptx_files = [f for f in os.listdir(job_dir) if f.lower().endswith('.pptx')]
    if not pptx_files:
        return jsonify({'error': 'PPTX file not found for this job'}), 404

    pptx_files.sort()
    pptx_path = os.path.join(job_dir, pptx_files[0])

    pdftoppm_cmd = _find_pdftoppm_cmd()
    has_pymupdf = False
    if not pdftoppm_cmd:
        try:
            import fitz  # PyMuPDF
            has_pymupdf = True
        except Exception:
            has_pymupdf = False

    if not pdftoppm_cmd and not has_pymupdf:
        return jsonify({
            'error': 'Thumbnail renderer not found. Install Poppler (pdftoppm) or PyMuPDF (pymupdf) to enable slide thumbnails.'
        }), 400

    preview_dir = os.path.join(job_dir, 'previews')
    os.makedirs(preview_dir, exist_ok=True)

    # Simple cache check: if we already have previews newer than pptx, return.
    existing = [f for f in os.listdir(preview_dir) if f.lower().endswith('.png')]
    if existing:
        newest = max(os.path.getmtime(os.path.join(preview_dir, f)) for f in existing)
        if newest >= os.path.getmtime(pptx_path):
            return list_job_previews(job_id)

    with preview_lock:
        try:
            pdf_path = _ensure_job_pdf(job_dir, pptx_path)

            # Clean old previews
            for f in os.listdir(preview_dir):
                if f.lower().endswith('.png'):
                    try:
                        os.remove(os.path.join(preview_dir, f))
                    except Exception:
                        pass

            # Render pages to png: outprefix-1.png, outprefix-2.png, ...
            if pdftoppm_cmd:
                out_prefix = os.path.join(preview_dir, 'page')
                result = subprocess.run(
                    [
                        pdftoppm_cmd,
                        '-png',
                        '-r', '144',
                        pdf_path,
                        out_prefix
                    ],
                    cwd=os.getcwd(),
                    capture_output=True,
                    text=True,
                    encoding='utf-8',
                    errors='replace',
                    timeout=300
                )

                if result.returncode != 0:
                    details = (result.stderr or result.stdout or '').strip()[:2000]
                    return jsonify({
                        'error': 'Failed to render slide previews',
                        'details': details
                    }), 500

                # Rename to slide-001.png etc.
                generated = [f for f in os.listdir(preview_dir) if f.lower().startswith('page-') and f.lower().endswith('.png')]
                def _page_num(name: str) -> int:
                    base = os.path.splitext(name)[0]
                    try:
                        return int(base.split('-')[-1])
                    except Exception:
                        return 10**9
                generated.sort(key=_page_num)
                for idx, fname in enumerate(generated, start=1):
                    src = os.path.join(preview_dir, fname)
                    dst = os.path.join(preview_dir, f'slide-{idx:03d}.png')
                    try:
                        if os.path.exists(dst):
                            os.remove(dst)
                    except Exception:
                        pass
                    os.rename(src, dst)
            else:
                import fitz  # PyMuPDF
                doc = fitz.open(pdf_path)
                try:
                    zoom = 144.0 / 72.0
                    mat = fitz.Matrix(zoom, zoom)
                    for i in range(len(doc)):
                        page = doc.load_page(i)
                        pix = page.get_pixmap(matrix=mat, alpha=False)
                        out_path = os.path.join(preview_dir, f'slide-{(i+1):03d}.png')
                        pix.save(out_path)
                finally:
                    doc.close()

            return list_job_previews(job_id)

        except subprocess.TimeoutExpired:
            return jsonify({'error': 'Slide preview generation timed out'}), 500
        except Exception as e:
            return jsonify({'error': str(e)}), 500


@app.route('/api/job/<job_id>/previews/<filename>', methods=['GET'])
def get_job_preview_image(job_id, filename):
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    preview_dir = os.path.join(job_dir, 'previews')
    file_path = os.path.join(preview_dir, filename)

    if not os.path.exists(file_path):
        return jsonify({'error': 'Preview image not found'}), 404

    return send_file(file_path, as_attachment=False)


@app.route('/api/job/<job_id>', methods=['GET'])
def get_job_status(job_id):
    """Get job status and metadata (real-time)"""

    # Check in-memory job tracking first
    with job_lock:
        if job_id in jobs:
            job = jobs[job_id]

            # Minimal watchdog: if job hasn't updated in a long time, mark as failed
            try:
                last_updated_str = job.get('last_updated')
                if last_updated_str:
                    last_updated = datetime.fromisoformat(last_updated_str)
                else:
                    last_updated = None

                stale_states = {'parsing', 'analyzing', 'generating', 'finalizing', 'video_generation'}
                if job.get('status') in stale_states and last_updated:
                    age_seconds = (datetime.now(timezone.utc) - last_updated).total_seconds()
                    # 90 minutes without any update = stalled (video generation with avatar can take very long)
                    if age_seconds > 90 * 60:
                        job['status'] = 'failed'
                        job['error'] = 'Job stalled (no progress updates for 90 minutes)'
                        job['last_updated'] = datetime.now(timezone.utc).isoformat()
            except Exception:
                pass

            return jsonify(job)

    # Check completed jobs on disk
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)

    if not os.path.exists(job_dir):
        return jsonify({'error': 'Job not found'}), 404

    # List files in job directory
    files = os.listdir(job_dir)

    metadata = {}
    for file in files:
        if file.endswith('.json'):
            with open(os.path.join(job_dir, file), 'r', encoding='utf-8') as f:
                metadata[file.replace('.json', '')] = json.load(f)

    return jsonify({
        'job_id': job_id,
        'status': 'completed',
        'progress': 100,
        'files': files,
        'metadata': metadata
    })


@app.route('/api/job/<job_id>', methods=['DELETE'])
def delete_job(job_id):
    """Delete a job and its files"""
    import re
    if not re.match(r'^[a-zA-Z0-9_-]+$', job_id):
        return jsonify({'error': 'Invalid job ID'}), 400

    with job_lock:
        jobs.pop(job_id, None)

    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    if os.path.exists(job_dir):
        shutil.rmtree(job_dir)
        return jsonify({'success': True})

    return jsonify({'error': 'Job not found'}), 404


@app.route('/api/jobs', methods=['GET'])
def list_jobs():
    """List all jobs"""

    jobs_dir = os.path.join(OUTPUT_FOLDER, 'jobs')

    if not os.path.exists(jobs_dir):
        return jsonify({'jobs': []})

    jobs_list = []
    for job_id in os.listdir(jobs_dir):
        job_dir = os.path.join(jobs_dir, job_id)
        if os.path.isdir(job_dir):
            files = os.listdir(job_dir)
            pptx_files = [f for f in files if f.endswith('.pptx')]
            has_slide_plan = 'slide-plan.json' in files

            jobs_list.append({
                'job_id': job_id,
                'files': files,
                'pptx_files': pptx_files,
                'has_slide_plan': has_slide_plan,
                'created_at': datetime.fromtimestamp(
                    os.path.getctime(job_dir)
                ).isoformat()
            })

    # Sort by created_at descending (newest first)
    jobs_list.sort(key=lambda x: x['created_at'], reverse=True)

    return jsonify({'jobs': jobs_list})


@app.route('/api/job/<job_id>/slide-plan-data', methods=['GET'])
def get_slide_plan_data(job_id):
    """Get slide plan data for a job"""
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    slide_plan_path = os.path.join(job_dir, 'slide-plan.json')

    if not os.path.exists(slide_plan_path):
        return jsonify({'error': 'Slide plan not found'}), 404

    try:
        with open(slide_plan_path, 'r', encoding='utf-8') as f:
            slide_plan = json.load(f)
        return jsonify(slide_plan)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/avatars/<filename>', methods=['GET'])
def serve_avatar(filename):
    """Serve avatar images from ppt_to_video/avatars folder"""
    avatar_folder = os.path.join(os.path.dirname(__file__), 'ppt_to_video', 'avatars')
    avatar_path = os.path.join(avatar_folder, filename)

    if not os.path.exists(avatar_path):
        return jsonify({'error': 'Avatar not found'}), 404

    return send_file(avatar_path, mimetype='image/png' if filename.endswith('.png') else 'image/jpeg')


@app.route('/api/voice-preview', methods=['POST'])
def voice_preview():
    """Generate voice preview audio"""
    try:
        data = request.get_json()
        voice_model = data.get('voice_model', 'gtts')
        speaker_id = data.get('speaker_id', None)

        # Sample text for preview
        preview_text = "Hello! This is a preview of the selected voice. Your presentation will use this voice for narration."

        # Create temp directory for preview
        preview_dir = os.path.join(OUTPUT_FOLDER, 'voice_previews')
        os.makedirs(preview_dir, exist_ok=True)

        # Generate unique filename
        speaker_suffix = f'_{speaker_id}' if speaker_id else ''
        preview_filename = f'preview_{voice_model.replace("/", "_")}{speaker_suffix}_{uuid.uuid4().hex[:8]}.wav'
        preview_path = os.path.join(preview_dir, preview_filename)

        # Generate speech
        print(f"[PREVIEW] Generating voice preview: model={voice_model}, speaker={speaker_id}")
        generate_speech(
            preview_text,
            preview_path,
            model_name=voice_model,
            speaker_idx=speaker_id if speaker_id else None
        )

        if os.path.exists(preview_path):
            return jsonify({
                'success': True,
                'audio_url': f'/api/voice-preview-audio/{preview_filename}'
            })
        else:
            return jsonify({'error': 'Failed to generate preview'}), 500

    except Exception as e:
        print(f"Voice preview error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/voice-preview-audio/<filename>', methods=['GET'])
def serve_voice_preview(filename):
    """Serve generated voice preview audio"""
    preview_dir = os.path.join(OUTPUT_FOLDER, 'voice_previews')
    audio_path = os.path.join(preview_dir, filename)

    if not os.path.exists(audio_path):
        return jsonify({'error': 'Preview audio not found'}), 404

    return send_file(audio_path, mimetype='audio/wav')


@app.route('/api/speakers/<path:model_name>', methods=['GET'])
def get_speakers_api(model_name):
    """Get available speakers/voices for a TTS model"""
    try:
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'ppt_to_video'))
        from utils.tts_engine import get_speakers_for_model
        speakers = get_speakers_for_model(model_name)
        return jsonify({'speakers': speakers})
    except Exception as e:
        print(f"Error getting speakers: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# ============================================
# Image Generation Endpoints
# ============================================

@app.route('/api/generate-image', methods=['POST'])
def generate_single_image():
    """
    Generate a single AI image for preview purposes

    Request:
        - prompt: Text prompt for image generation
        - style: Template style (optional, default: modern)
        - type: Image type (background, illustration, icon)
        - width: Image width (optional, default: 1920)
        - height: Image height (optional, default: 1080)

    Response:
        - success: boolean
        - image_url: URL to download generated image
        - cache_key: Cache key for the image
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'JSON body required'}), 400

        prompt = data.get('prompt', '')
        if not prompt:
            return jsonify({'error': 'Prompt is required'}), 400

        style = data.get('style', 'modern')
        image_type = data.get('type', 'background')
        width = data.get('width', 1920)
        height = data.get('height', 1080)

        # Create temporary job for image generation
        image_id = str(uuid.uuid4())[:8]

        # For now, return a placeholder response since Imagen requires setup
        # In production, this would call the image generator
        return jsonify({
            'success': True,
            'message': 'Image generation queued',
            'image_id': image_id,
            'prompt': prompt,
            'style': style,
            'type': image_type,
            'note': 'Configure GOOGLE_CLOUD_PROJECT and IMAGE_GENERATION_ENABLED=true to enable AI image generation'
        })

    except Exception as e:
        print(f"Image generation error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/images/<cache_key>', methods=['GET'])
def get_cached_image(cache_key):
    """
    Get a cached image by its cache key

    Response:
        - Image file (PNG/JPEG)
    """
    # Check in image cache directory
    cache_dir = os.environ.get('IMAGE_CACHE_DIR', os.path.join(OUTPUT_FOLDER, 'image-cache'))

    # Look for image with this cache key
    for ext in ['.png', '.jpg', '.jpeg']:
        image_path = os.path.join(cache_dir, f'{cache_key}{ext}')
        if os.path.exists(image_path):
            mimetype = 'image/png' if ext == '.png' else 'image/jpeg'
            return send_file(image_path, mimetype=mimetype)

    return jsonify({'error': 'Image not found'}), 404


@app.route('/api/job/<job_id>/images', methods=['GET'])
def list_job_images(job_id):
    """
    List all generated images for a job

    Response:
        - job_id: Job identifier
        - images: List of image info (path, type, slide_id)
    """
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    if not os.path.isdir(job_dir):
        return jsonify({'error': 'Job not found'}), 404

    # Check for image generation results
    image_result_path = os.path.join(job_dir, 'image-generation-result.json')
    images = []

    if os.path.exists(image_result_path):
        with open(image_result_path, 'r', encoding='utf-8') as f:
            result = json.load(f)
            images = result.get('images', [])

    # Also check for images in job directory
    image_dir = os.path.join(job_dir, 'images')
    if os.path.isdir(image_dir):
        for filename in os.listdir(image_dir):
            if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                images.append({
                    'filename': filename,
                    'url': f'/api/job/{job_id}/images/{filename}',
                    'path': os.path.join(image_dir, filename)
                })

    return jsonify({
        'job_id': job_id,
        'images': images,
        'count': len(images)
    })


@app.route('/api/job/<job_id>/images/<filename>', methods=['GET'])
def get_job_image(job_id, filename):
    """
    Get a specific image from a job
    """
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    image_dir = os.path.join(job_dir, 'images')
    image_path = os.path.join(image_dir, filename)

    if not os.path.exists(image_path):
        # Also check cache directory
        cache_dir = os.environ.get('IMAGE_CACHE_DIR', os.path.join(OUTPUT_FOLDER, 'image-cache'))
        image_path = os.path.join(cache_dir, filename)

    if not os.path.exists(image_path):
        return jsonify({'error': 'Image not found'}), 404

    mimetype = 'image/png' if filename.lower().endswith('.png') else 'image/jpeg'
    return send_file(image_path, mimetype=mimetype)


@app.route('/api/templates', methods=['GET'])
def get_templates():
    """Get available templates and color schemes"""
    templates = [
        {'id': 'modern', 'name': 'Modern', 'description': 'Clean, contemporary design with gradients and shapes', 'category': 'professional'},
        {'id': 'corporate', 'name': 'Corporate', 'description': 'Professional business style with clean lines', 'category': 'professional'},
        {'id': 'business', 'name': 'Executive Business', 'description': 'Premium corporate design for C-suite presentations', 'category': 'professional'},
        {'id': 'creative', 'name': 'Creative', 'description': 'Bold and colorful with dynamic shapes', 'category': 'creative'},
        {'id': 'minimal', 'name': 'Minimal', 'description': 'Simple and elegant with lots of whitespace', 'category': 'minimal'},
        {'id': 'academic', 'name': 'Academic', 'description': 'Serif fonts, formal layout for research presentations', 'category': 'professional'},
        {'id': 'tech', 'name': 'Tech', 'description': 'Monospace headers, neon accents, modern developer aesthetic', 'category': 'modern'},
        {'id': 'startup', 'name': 'Startup', 'description': 'Bold, vibrant colors, playful icons, energetic style', 'category': 'creative'},
        {'id': 'medical', 'name': 'Medical', 'description': 'Calm blues, professional, minimal icons for healthcare', 'category': 'professional'},
        {'id': 'elegant', 'name': 'Elegant', 'description': 'Sophisticated serif fonts, gold accents, premium feel', 'category': 'elegant'},
        {'id': 'nature', 'name': 'Nature', 'description': 'Organic greens, earth tones, rounded corners', 'category': 'creative'},
        {'id': 'retro', 'name': 'Retro', 'description': 'Vintage fonts, warm colors, nostalgic 80s/90s style', 'category': 'creative'},
        {'id': 'luxury', 'name': 'Luxury', 'description': 'Premium fonts, metallic accents, high-end fashion style', 'category': 'elegant'},
        {'id': 'industrial', 'name': 'Industrial', 'description': 'Bold sans-serif, metallic grays, manufacturing style', 'category': 'modern'},
        {'id': 'festival', 'name': 'Festival', 'description': 'Playful fonts, rainbow colors, celebration style', 'category': 'creative'},
        {'id': 'magazine', 'name': 'Magazine Editorial', 'description': 'Bold typography, editorial layout, magazine-style design', 'category': 'creative'},
        {'id': 'futuristic', 'name': 'Futuristic', 'description': 'Sci-fi inspired, neon accents, cutting-edge technology', 'category': 'modern'},
        {'id': 'swiss', 'name': 'Swiss Design', 'description': 'Clean grid system, Helvetica, Swiss modernism', 'category': 'minimal'},
        {'id': 'architect', 'name': 'Architect', 'description': 'Precise lines, blueprint style, architectural precision', 'category': 'minimal'},
        {'id': 'storytelling', 'name': 'Storytelling', 'description': 'Narrative-focused, emotional, book-like presentation', 'category': 'elegant'},
        {'id': 'vibrant', 'name': 'Vibrant Pop', 'description': 'High-energy colors, dynamic gradients, youth-oriented', 'category': 'creative'},
        {'id': 'monochrome', 'name': 'Monochrome', 'description': 'Black and white, high contrast, timeless elegance', 'category': 'minimal'},
        {'id': 'gradient', 'name': 'Gradient Flow', 'description': 'Smooth gradients, fluid design, modern aesthetics', 'category': 'modern'}
    ]

    colors = [
        {'id': 'blue', 'name': 'Professional Blue', 'primary': '#3B82F6', 'category': 'light'},
        {'id': 'teal', 'name': 'Modern Teal', 'primary': '#14B8A6', 'category': 'light'},
        {'id': 'purple', 'name': 'Creative Purple', 'primary': '#9333EA', 'category': 'light'},
        {'id': 'orange', 'name': 'Energetic Orange', 'primary': '#F97316', 'category': 'light'},
        {'id': 'green', 'name': 'Nature Green', 'primary': '#10B981', 'category': 'light'},
        {'id': 'red', 'name': 'Bold Red', 'primary': '#EF4444', 'category': 'light'},
        {'id': 'indigo', 'name': 'Deep Indigo', 'primary': '#6366F1', 'category': 'light'},
        {'id': 'rose', 'name': 'Elegant Rose', 'primary': '#F43F5E', 'category': 'light'},
        {'id': 'amber', 'name': 'Warm Amber', 'primary': '#F59E0B', 'category': 'light'},
        {'id': 'cyan', 'name': 'Bright Cyan', 'primary': '#06B6D4', 'category': 'light'},
        {'id': 'lime', 'name': 'Fresh Lime', 'primary': '#84CC16', 'category': 'light'},
        {'id': 'pink', 'name': 'Vibrant Pink', 'primary': '#EC4899', 'category': 'light'},
        {'id': 'gold', 'name': 'Luxury Gold', 'primary': '#D4AF37', 'category': 'light'},
        {'id': 'silver', 'name': 'Premium Silver', 'primary': '#A8A8A8', 'category': 'light'},
        {'id': 'slate', 'name': 'Professional Slate', 'primary': '#475569', 'category': 'light'},
        {'id': 'navy', 'name': 'Corporate Navy', 'primary': '#1E3A8A', 'category': 'light'},
        {'id': 'emerald', 'name': 'Elegant Emerald', 'primary': '#047857', 'category': 'light'},
        {'id': 'sunset', 'name': 'Sunset Gradient', 'primary': '#FF6B35', 'category': 'light'},
        {'id': 'ocean', 'name': 'Ocean Blue', 'primary': '#0077BE', 'category': 'light'},
        {'id': 'forest', 'name': 'Forest Green', 'primary': '#2D5016', 'category': 'light'},
        {'id': 'monochrome', 'name': 'Pure Monochrome', 'primary': '#000000', 'category': 'light'},
        {'id': 'dark', 'name': 'Dark Mode', 'primary': '#6366F1', 'category': 'dark'},
        {'id': 'dark-orange', 'name': 'Dark Orange', 'primary': '#F59E0B', 'category': 'dark'},
        {'id': 'dark-teal', 'name': 'Dark Teal', 'primary': '#14B8A6', 'category': 'dark'},
        {'id': 'dark-purple', 'name': 'Dark Purple', 'primary': '#A855F7', 'category': 'dark'},
        {'id': 'dark-emerald', 'name': 'Dark Emerald', 'primary': '#10B981', 'category': 'dark'},
        {'id': 'dark-red', 'name': 'Dark Red', 'primary': '#EF4444', 'category': 'dark'}
    ]

    return jsonify({
        'templates': templates,
        'colors': colors
    })


@app.errorhandler(413)
def request_entity_too_large(error):
    """Handle file too large error"""
    return jsonify({
        'error': 'File too large',
        'max_size': f'{MAX_FILE_SIZE / 1024 / 1024}MB'
    }), 413


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Presentation Pipeline API')
    parser.add_argument('--port', '-p', type=int, default=9000, help='Port to run the server on (default: 9000)')
    args = parser.parse_args()

    # Check if required dependencies are installed
    print("Starting Presentation Pipeline API...")
    print(f"📁 Upload folder: {UPLOAD_FOLDER}")
    print(f"📁 Output folder: {OUTPUT_FOLDER}")
    print(f"📋 Allowed file types: {', '.join(ALLOWED_EXTENSIONS)}")
    print(f"📏 Max file size: {MAX_FILE_SIZE / 1024 / 1024}MB")

    # Show which AI provider is configured
    ai_provider = os.environ.get('AI_PROVIDER', 'claude').upper()
    print(f"🤖 AI Provider: {ai_provider} (from .env)")

    # Check for Node.js dependencies
    try:
        result = subprocess.run(['npm', 'list', '--depth=0'],
                              capture_output=True, text=True)
        if result.returncode != 0:
            print("\n⚠️  Warning: npm dependencies may not be installed")
            print("   Run: npm install")
    except FileNotFoundError:
        print("\n⚠️  Warning: npm not found")

    print("\n✅ Server ready!")
    print(f"   http://localhost:{args.port}")
    print(f"   http://localhost:{args.port}/health")
    print("\n")

    app.run(host='0.0.0.0', port=args.port, debug=True)
