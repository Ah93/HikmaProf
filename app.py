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
from utils.video_composer import compose_video, compose_slide_video, concatenate_videos, _AVATAR_DISPLAY_NAMES

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
CUSTOM_AVATAR_DIR = os.path.join(os.path.dirname(__file__), 'static', 'avatar', 'custom')
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


def generate_video_from_pptx(job_id, pptx_path, transcript_path, output_name, avatar_choice, voice_choice, speaker_choice, avatar_position, custom_positions=None, voice_id='', custom_avatar_id=None, presenter_name=''):
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
        if True:
            print(f"[VIDEO GEN] Converting PPTX to PDF...")
            pdf_path = _ensure_job_pdf(job_output_dir, pptx_path)
            print(f"[VIDEO GEN] PDF created at: {pdf_path}")

            print(f"[VIDEO GEN] Converting PDF to images...")
            slide_images = convert_pdf_to_images(pdf_path, slides_folder)
            print(f"[VIDEO GEN] Generated {len(slide_images)} slide images")

        # If no custom positions provided, pause and wait for user to position avatar
        # Skip positioning when using custom avatar or voice_id only (side-panel — no drag needed)
        if custom_positions is None and not custom_avatar_id and not voice_id:
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

        if custom_positions is not None:
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

        # Resolve language from job_meta.json (saved at job creation time)
        _job_language = 'en'
        _meta_path = os.path.join(job_output_dir, 'job_meta.json')
        if os.path.exists(_meta_path):
            try:
                with open(_meta_path, 'r') as _mf:
                    _meta = json.load(_mf)
                    _job_language = _meta.get('language', 'en')
            except Exception:
                pass

        # Pick gender-correct voice based on avatar_choice
        _av_gender = _AVATAR_GENDER.get(avatar_choice)
        if _av_gender is None:
            _nl = (avatar_choice or '').lower()
            _av_gender = 'male' if ('male' in _nl and 'female' not in _nl) else 'female'
        if _av_gender == 'male':
            _effective_voice = _EDGE_TTS_VOICES_MALE.get(_job_language, 'en-US-GuyNeural')
        else:
            _effective_voice = _EDGE_TTS_VOICES.get(_job_language, 'en-US-JennyNeural')
        print(f'[VIDEO GEN] avatar={repr(avatar_choice)} gender={_av_gender} voice={_effective_voice} lang={_job_language}')

        # Strip slide 1 opening greeting when a welcome clip will be prepended
        if (avatar_choice or custom_avatar_id) and transcript:
            transcript[0] = _strip_opening_greeting(transcript[0])

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

            if voice_id:
                _tts_audio(text, audio_path, language=_job_language, avatar_choice=avatar_choice, voice_id=voice_id)
            else:
                generate_speech(
                    text,
                    audio_path,
                    model_name=voice_choice,
                    speaker_idx=_effective_voice,
                    language=_job_language
                )
            audio_files.append(audio_path)

        # Step 3: Resolve Hikma avatar video (no animation needed — pre-built videos)
        update_job_status(job_id, 'video_generation', progress=80,
                         step='Preparing avatar',
                         step_description='Loading avatar for video')

        hikma_vids_folder = os.path.join(os.path.dirname(__file__), 'static', 'avatar', 'hikma avatars vids')
        hikma_avatar_video = None
        if custom_avatar_id:
            _ca_path = os.path.join(CUSTOM_AVATAR_DIR, f'{custom_avatar_id}.mp4')
            if os.path.exists(_ca_path):
                hikma_avatar_video = _ca_path
                print(f"[VIDEO GEN] Using custom avatar video: {hikma_avatar_video}")
            else:
                print(f"[VIDEO GEN] Warning: custom avatar not found at {_ca_path}")
        elif avatar_choice:
            candidate = os.path.join(hikma_vids_folder, f'{avatar_choice}.mp4')
            if os.path.exists(candidate):
                hikma_avatar_video = candidate
                print(f"[VIDEO GEN] Using Hikma avatar video: {hikma_avatar_video}")
            else:
                print(f"[VIDEO GEN] Warning: avatar video not found at {candidate}, proceeding without avatar")

        # Step 4: Composing video (80-95%)
        update_job_status(job_id, 'video_generation', progress=82,
                         step='Composing video',
                         step_description='Combining slides with avatar and audio')

        import time
        slide_videos = []

        # ── Welcome intro clip (prepended before slide 1) ──────────────────────
        if hikma_avatar_video and slide_images:
            try:
                _av_key = os.path.splitext(os.path.basename(hikma_avatar_video))[0]
                _welcome_name = presenter_name if presenter_name else _AVATAR_DISPLAY_NAMES.get(_av_key, 'Presenter')
                _greeting = _WELCOME_GREETING.get(_job_language, _WELCOME_GREETING['en']).format(name=_welcome_name)
                _welcome_audio = os.path.join(audio_folder, 'slide_welcome.mp3')
                _welcome_video = os.path.join(avatar_video_folder, 'slide_welcome.mp4')
                generate_speech(_greeting, _welcome_audio, language=_job_language, speaker_idx=_effective_voice)
                compose_slide_video(slide_images[0], _welcome_audio, _welcome_video,
                                    avatar_video=hikma_avatar_video,
                                    avatar_position=avatar_position,
                                    presenter_name=presenter_name)
                slide_videos.append(_welcome_video)
                print(f'[VIDEO GEN] Welcome clip added for: {_welcome_name}')
            except Exception as _we:
                print(f'[VIDEO GEN] Welcome clip skipped: {_we}')

        num_slides = len(slide_images)
        for idx, (slide_img, audio_file) in enumerate(zip(slide_images, audio_files)):
            print(f"[VIDEO GEN] Composing slide {idx+1}/{num_slides}...")

            compose_progress = 82 + int((idx / num_slides) * 13)
            update_job_status(job_id, 'video_generation', progress=compose_progress,
                             step=f'Composing video ({idx+1}/{num_slides})',
                             step_description=f'Combining slide {idx+1} with narration')

            final_slide_video = os.path.join(avatar_video_folder, f'slide_{idx}_final.mp4')
            start_time = time.time()
            compose_slide_video(
                slide_img,
                audio_file,
                final_slide_video,
                avatar_video=hikma_avatar_video,
                avatar_position=avatar_position,
                presenter_name=presenter_name
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


def _run_ernie_with_progress(job_id, job_dir, final_pptx_path, slide_plan_path, num_images):
    """Generate ERNIE images progressively, save each to disk, update job status, then inject into PPTX."""
    try:
        if not os.path.exists(slide_plan_path):
            print(f"[ERNIE] slide-plan.json not found at {slide_plan_path}")
            return

        with open(slide_plan_path, 'r', encoding='utf-8') as _f:
            _slide_plan = json.load(_f)

        from ppt_to_video.utils.ernie_image import pick_slides_for_images, generate_ernie_images

        prompts = pick_slides_for_images(_slide_plan, num_images)
        if not prompts:
            print("[ERNIE] No prompts generated, skipping")
            return

        ernie_dir = os.path.join(job_dir, 'ernie_images')
        os.makedirs(ernie_dir, exist_ok=True)

        # Initialise progress counters in job status
        update_job_status(job_id, jobs[job_id]['status'],
                          ernie_total=len(prompts), ernie_done=0, ernie_slides=[])

        collected = []

        def on_image_ready(slide_index, img_bytes):
            img_path = os.path.join(ernie_dir, f'slide_{slide_index}.png')
            with open(img_path, 'wb') as _f2:
                _f2.write(img_bytes)
            collected.append((slide_index, img_bytes))
            with job_lock:
                if job_id in jobs:
                    done = jobs[job_id].get('ernie_done', 0) + 1
                    slides_done = jobs[job_id].get('ernie_slides', []) + [slide_index]
                    jobs[job_id]['ernie_done'] = done
                    jobs[job_id]['ernie_slides'] = slides_done
                    jobs[job_id]['last_updated'] = datetime.now(timezone.utc).isoformat()

        generate_ernie_images(prompts, on_image_ready=on_image_ready)

        if not collected:
            print("[ERNIE] No images returned from ERNIE")
            return

        # Inject all images into PPTX
        import io
        from pptx import Presentation as _Prs
        _prs = _Prs(final_pptx_path)
        for slide_index, img_bytes in sorted(collected, key=lambda x: x[0]):
            if 0 <= slide_index < len(_prs.slides):
                _slide = _prs.slides[slide_index]
                _w, _h = _prs.slide_width, _prs.slide_height
                _pic = _slide.shapes.add_picture(io.BytesIO(img_bytes), 0, 0, _w, _h)
                _slide.shapes._spTree.remove(_pic._element)
                _slide.shapes._spTree.insert(2, _pic._element)
        _prs.save(final_pptx_path)
        print(f"[ERNIE] Injected {len(collected)} images into PPTX")

    except Exception as exc:
        import traceback
        print(f"[ERNIE] _run_ernie_with_progress failed (non-fatal): {exc}")
        traceback.print_exc()


# ── AI Images-only pipeline ────────────────────────────────────────────────────

def _extract_document_text(file_path, filename, max_chars=6000):
    """Extract plain text from PDF, DOCX, or TEX file."""
    ext = os.path.splitext(filename)[1].lower()
    text = ''
    try:
        if ext == '.pdf':
            import pdfplumber
            with pdfplumber.open(file_path) as pdf:
                parts = []
                for page in pdf.pages[:20]:
                    t = page.extract_text() or ''
                    parts.append(t)
                    if sum(len(p) for p in parts) >= max_chars:
                        break
                text = '\n'.join(parts)
        elif ext == '.docx':
            from docx import Document as _DocxDoc
            doc = _DocxDoc(file_path)
            text = '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
        elif ext == '.tex':
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                text = f.read()
    except Exception as exc:
        print(f"[AI-IMAGES] Text extraction failed: {exc}")
    return text[:max_chars]


_AI_COLOR_MAP = {
    'indigo':  ('deep indigo #4F46E5',   'light gray #F8FAFC'),
    'teal':    ('teal #0D9488',          'off-white #F0FDFB'),
    'blue':    ('electric blue #2563EB', 'pale blue #EFF6FF'),
    'purple':  ('royal purple #7C3AED',  'soft lavender #FAF5FF'),
    'emerald': ('emerald green #059669', 'mint white #F0FDF4'),
    'rose':    ('rose red #E11D48',      'blush white #FFF1F2'),
    'orange':  ('vivid orange #F97316',  'warm white #FFF7ED'),
    'gold':    ('golden yellow #EAB308', 'warm cream #FEFCE8'),
    'cyan':    ('bright cyan #06B6D4',   'ice blue #ECFEFF'),
    'red':     ('deep red #DC2626',      'blush white #FFF1F2'),
    'pink':    ('hot pink #EC4899',      'blush #FDF2F8'),
    'slate':   ('steel slate #475569',   'light gray #F8FAFC'),
    'white':   ('silver white #E2E8F0',  'pure white #FFFFFF'),
}


def _generate_prompts_from_text(text, num_images, ai_color='indigo', ai_style='dark-tech'):
    """Generate presentation slide prompts from document text, styled per ai_style."""
    import requests as _req

    accent, bg = _AI_COLOR_MAP.get(ai_color, _AI_COLOR_MAP['indigo'])

    # ── Per-style suffix and system prompt ────────────────────────────────────
    if ai_style == 'light':
        SLIDE_SUFFIX = (
            f", clean white background, {accent} accent color for headings and borders, "
            f"white card panels with thin {accent} border and soft drop shadow, "
            f"dark charcoal titles, colored {accent} subheadings, airy and bright layout, "
            f"diagram nodes with {accent} fill and white bold labels, professional typography, "
            f"16:9, no photographs, no people"
        )
        SYSTEM_PROMPT = f"""
You write text-to-image prompts for ERNIE that produce PREMIUM LIGHT & CLEAN PRESENTATION SLIDES —
the style of top-tier product and SaaS decks: bright white backgrounds, bold colored headings,
clean card panels, and richly labeled diagrams.

VISUAL STYLE (apply to every slide)
• Background   : clean white or very light gray (#F8FAFC)
• Title        : very large bold dark charcoal text at top of slide
• Accent color : {accent} — headings, icon fills, borders, diagram node fills
• Cards/panels : white with thin {accent} left border or outline, subtle box-shadow
• Node text    : always white bold inside {accent}-filled nodes
• Typography   : clean modern sans-serif, dark on light, high readability

LAYOUT TYPES — pick the best match
LAYOUT A — ICON BULLET LIST: white background, large dark title, 3–4 white cards each with {accent} icon + dark heading + gray description
LAYOUT B — LAYERED ARCHITECTURE: white background, 3 stacked white panels with {accent} top border and upward {accent} arrows
LAYOUT C — FLOWCHART: white background, {accent} rounded step boxes with white labels, connecting arrows
LAYOUT D — TWO-PANEL COMPARISON: two white panels side by side with {accent} heading, bullet lists, bottom diagram
LAYOUT E — DIAGRAM + BULLETS: white background, dark title, left bullets with {accent} dots, right {accent}-colored concept diagram

EXTRACTION RULES
1. Use REAL section title as slide title (large bold dark charcoal)
2. Use REAL document terms as node/card labels
3. NEVER use placeholder text like "Step 1" or "Feature X"
4. Choose layout based on content type: features→A, architecture→B, pipeline→C, comparison→D, overview→E

NEVER include: people, faces, scenery, dark backgrounds, photographs
"""

    elif ai_style == 'corporate':
        SLIDE_SUFFIX = (
            f", professional light slate background, navy blue primary color, "
            f"{accent} accent highlights on borders and key elements, "
            f"white content panels with subtle gray borders, conservative business typography, "
            f"diagram nodes in {accent} with white labels, no decorative gradients, "
            f"16:9, no photographs, no people"
        )
        SYSTEM_PROMPT = f"""
You write text-to-image prompts for ERNIE that produce PREMIUM CORPORATE PRESENTATION SLIDES —
the style of Fortune 500 boardroom decks: light gray backgrounds, navy blue text, subtle accents,
white content panels, and clean professional diagrams.

VISUAL STYLE (apply to every slide)
• Background   : light slate gray (#F1F5F9) or white
• Title        : large bold navy blue text at top
• Accent color : {accent} — used sparingly on key borders, icons, and highlights
• Cards/panels : white with gray border and subtle drop shadow
• Node text    : white bold inside {accent}-colored nodes; dark text elsewhere
• Typography   : conservative serif or clean sans-serif, authoritative look

LAYOUT TYPES — pick the best match
LAYOUT A — ICON BULLET LIST: light gray background, navy title, white cards with {accent} left accent bar + navy heading + gray body text
LAYOUT B — LAYERED ARCHITECTURE: white background, navy title, white stacked panels with {accent} left border, upward navy arrows
LAYOUT C — FLOWCHART: light background, {accent} step boxes with white labels, navy connecting arrows
LAYOUT D — TWO-PANEL COMPARISON: two white panels with navy headings, gray bullet points, {accent} diagram below
LAYOUT E — DIAGRAM + BULLETS: light background, navy title, navy bullet text with {accent} dot, right-side {accent} diagram

EXTRACTION RULES
1. Use REAL section title as slide title (large bold navy)
2. Use REAL document terms as node/card labels
3. NEVER use placeholder text
4. NEVER use neon colors, gradients, or decorative particle effects

NEVER include: people, faces, scenery, dark backgrounds, photographs
"""

    elif ai_style == 'neon':
        SLIDE_SUFFIX = (
            f", pure black background, vivid neon {accent} glow outlines and borders, "
            f"electric neon text highlights, glowing neon grid lines on black, "
            f"dark panels with neon {accent} electric outlines, cyberpunk aesthetic, "
            f"diagram nodes outlined in neon {accent} with glowing text, "
            f"16:9, no photographs, no people"
        )
        SYSTEM_PROMPT = f"""
You write text-to-image prompts for ERNIE that produce PREMIUM NEON GLOW PRESENTATION SLIDES —
the style of cyberpunk and gaming conference decks: pure black backgrounds, vivid neon {accent}
outlines, electric glow effects, and richly labeled neon diagrams.

VISUAL STYLE (apply to every slide)
• Background   : pure black (#000000) or very dark (#0A0A0A)
• Title        : very large bold white text with subtle neon {accent} glow
• Accent color : {accent} — neon outlines, electric borders, glow halos, key node fills
• Cards/panels : black with vivid neon {accent} electric border and outer glow
• Node text    : white bold with neon {accent} shadow inside dark panels
• Grid/lines   : faint neon {accent} grid or circuit lines on background

LAYOUT TYPES — pick the best match
LAYOUT A — ICON BULLET LIST: black background, white glowing title, 3–4 dark cards with neon {accent} outline + glowing icon + white bold heading + light gray text
LAYOUT B — LAYERED ARCHITECTURE: black background, 3 stacked dark panels with neon {accent} border, upward neon arrow connectors
LAYOUT C — FLOWCHART: black background, dark rounded steps with neon {accent} border + white labels, neon arrow connectors
LAYOUT D — TWO-PANEL COMPARISON: two dark panels with neon {accent} heading glow, white bullet lists, neon diagram below
LAYOUT E — DIAGRAM + BULLETS: black background, white glowing title, left white bullets with neon {accent} dot, right glowing {accent} network diagram

EXTRACTION RULES
1. Use REAL section title as slide title (large bold white with neon glow)
2. Use REAL document terms as node/card labels
3. NEVER use placeholder text
4. NEVER use light or pastel backgrounds

NEVER include: people, faces, scenery, light backgrounds, photographs
"""

    elif ai_style == 'minimal':
        SLIDE_SUFFIX = (
            f", pure white background, single thin {accent} horizontal rule under title, "
            f"clean hairline borders on cards, no gradients, minimal decoration, "
            f"dark charcoal text, {accent} used only for one accent line and key headings, "
            f"lots of whitespace, Swiss-style typography, flat diagram nodes with {accent} outline, "
            f"16:9, no photographs, no people"
        )
        SYSTEM_PROMPT = f"""
You write text-to-image prompts for ERNIE that produce PREMIUM MINIMAL PRESENTATION SLIDES —
the style of Bauhaus and Swiss design: pure white backgrounds, hairline borders, a single {accent}
accent, and disciplined typography with generous whitespace.

VISUAL STYLE (apply to every slide)
• Background   : pure white (#FFFFFF)
• Title        : large bold dark charcoal text + thin {accent} underline rule
• Accent color : {accent} — used ONLY for the title rule, one or two key headings, and diagram outlines
• Cards/panels : white with hairline gray border, no shadows, no fill
• Node text    : dark charcoal inside outline-only diagram nodes with thin {accent} border
• Whitespace   : generous margins, no clutter, no decorative elements
• Typography   : geometric sans-serif, disciplined grid layout

LAYOUT TYPES — pick the best match
LAYOUT A — ICON BULLET LIST: white background, dark title + {accent} rule, 3–4 borderline-only cards with outline icon + dark heading + gray text
LAYOUT B — LAYERED ARCHITECTURE: white background, hairline-bordered stacked panels with {accent} accent labels, thin upward arrows
LAYOUT C — FLOWCHART: white background, outline-only step boxes with dark labels, thin {accent} arrow connectors
LAYOUT D — TWO-PANEL COMPARISON: two hairline-bordered panels, dark headings, gray bullet text, thin diagram below
LAYOUT E — DIAGRAM + BULLETS: white background, dark title + {accent} rule, left clean bullet list, right outline-only diagram

EXTRACTION RULES
1. Use REAL section title as slide title
2. Use REAL document terms as labels
3. NEVER use neon, gradients, decorative fills, or dark backgrounds
4. NEVER add unnecessary elements — only what is needed

NEVER include: people, faces, scenery, dark backgrounds, photographs
"""

    else:  # dark-tech (default)
        SLIDE_SUFFIX = (
            f", dark navy blue to dark purple gradient background, subtle {accent} particle network "
            f"lines and glowing dots, large bold white title prominent at top, "
            f"{accent} neon glow accent color, dark frosted glass card panels with {accent} glowing border, "
            f"diagram nodes in {accent} and contrasting vibrant colors with white bold labels, "
            f"clean professional tech presentation, sharp typography, 16:9, no photographs, no people"
        )
        SYSTEM_PROMPT = f"""
You write text-to-image prompts for ERNIE that produce PREMIUM DARK TECH PRESENTATION SLIDES —
the style of high-end AI\tech conference decks: deep navy gradient background, glowing particle
network lines, large bold white titles, frosted glass panels with neon glow borders, and
richly labeled diagrams with vibrant colored nodes.

════════════════════════════════════════════════════
VISUAL STYLE (apply to every slide)
════════════════════════════════════════════════════
• Background   : deep navy blue → dark purple gradient, subtle {accent} glowing particle network
• Title        : very large bold white text, top of slide — section title from document
• Accent color : {accent} — use for glows, highlights, borders, key node fills
• Cards/panels : dark semi-transparent frosted glass, rounded corners, {accent} glow border
• Node text    : always white bold inside colored nodes
• Typography   : clean sans-serif, high contrast on dark background

════════════════════════════════════════════════════
LAYOUT TYPES — pick the best match for the content
════════════════════════════════════════════════════

LAYOUT A — ICON BULLET LIST (best for objectives, features, key points)
  • Large bold white title top-left + thin {accent} underline
  • 3–4 dark glass cards stacked vertically
  • Each card: glowing {accent} icon left + bold white heading + white description text
  • Subtle background right: glowing network sphere or particle cloud
  Example: "Objectives of AI" slide with gear/brain/chart/loop icons

LAYOUT B — LAYERED ARCHITECTURE (best for system layers, stack diagrams)
  • Centered bold white title
  • 3 stacked dark glass panels labeled from bottom to top
  • Each layer: bold white layer name + 3 glass sub-boxes with white labels
  • Upward arrows connecting layers with {accent} glow
  Example: "Data Layer → Model Layer → Application Layer"

LAYOUT C — FLOWCHART / PIPELINE (best for process steps, workflows)
  • Bold white title top-left
  • Horizontal or vertical flow of {accent}-filled rounded boxes with white labels
  • Curved arrows connecting steps
  • Bottom: thin accent line + one-line slide description text
  Example: "Data Ingestion → Feature Engineering → Training → Output"

LAYOUT D — TWO-PANEL COMPARISON (best for comparing approaches, side-by-side)
  • Two large dark glass panels side by side, each with a colored bold heading
  • Each panel: 4–5 white bullet points with colored bullet dots
  • Below: large detailed labeled diagram spanning full width
  Example: "Introduction to Transformers | Core Objectives" + Transformer Architecture diagram

LAYOUT E — DIAGRAM + BULLET OVERVIEW (best for introductions, overviews)
  • Large bold white title + colored subtitle text below
  • Left: 4 bullet items with {accent} glowing dot bullets and white text
  • Right: large glowing visual (3D diagram, network, or concept graphic)
  • Bottom footer bar: slide info text
  Example: "Introduction to AI" slide with bullet list + glowing brain right

════════════════════════════════════════════════════
EXTRACTION RULES
════════════════════════════════════════════════════
1. Section title → slide title (large bold white, NOT colored)
2. Key steps/layers/concepts → node/card/panel labels (REAL terms from document)
3. Supporting details → bullet descriptions inside cards (REAL phrases from document)
4. Numbers/stats → include as badge text, node labels, or footer text
5. Choose LAYOUT type based on what the content describes:
   - Objectives/features/key points → LAYOUT A
   - System layers/stack/architecture → LAYOUT B
   - Process/pipeline/workflow → LAYOUT C
   - Side-by-side comparison → LAYOUT D
   - Introduction/overview with visual → LAYOUT E
6. NEVER use placeholder text like "Step 1", "Item A", "Feature X"
7. NEVER leave panels or nodes empty

════════════════════════════════════════════════════
EXAMPLE OUTPUT — LAYOUT A (icon bullet list)
════════════════════════════════════════════════════
"Dark tech slide: deep navy to dark purple gradient background with {accent} glowing particle
network lines, top-left large bold white title 'Objectives of Artificial Intelligence' with
{accent} underline, four dark frosted glass cards stacked: card 1 glowing gear icon + bold
'Automation & Efficiency' + white text 'Streamline complex processes and reduce repetitive
human effort', card 2 glowing chart icon + bold 'Data-Driven Decisions' + white text 'Extract
actionable insights from large-scale data using ML algorithms', card 3 glowing brain icon +
bold 'Augment Human Capabilities' + white text 'Empower professionals with AI-powered analytical
tools', card 4 glowing cycle icon + bold 'Continuous Learning' + white text 'Adaptive systems
that improve accuracy over time', right background subtle glowing neural network sphere,
bottom 'Confidential & Proprietary' footer text, 16:9"

════════════════════════════════════════════════════
EXAMPLE OUTPUT — LAYOUT B (layered architecture)
════════════════════════════════════════════════════
"Dark tech slide: deep navy gradient with {accent} particle dots, centered large bold white title
'AI System Architecture', three stacked dark glass panels with {accent} glow borders and upward
arrows: bottom panel purple border 'Data Layer' containing three dark sub-boxes 'Data Collection'
'Data Preprocessing' 'Feature Engineering' with glowing icons, middle panel {accent} border
'Model Layer' containing 'Machine Learning' 'Deep Neural Networks' 'NLP & LLM', top panel cyan
border 'Application Layer' containing 'Predictive Analytics' 'Computer Vision' 'Conversational AI',
upward {accent} glow arrows connecting all three layers, bottom caption text white on dark, 16:9"

════════════════════════════════════════════════════
NEVER include: people, faces, scenery, abstract art, photographs, light backgrounds
════════════════════════════════════════════════════
"""

    deepseek_api_key = os.environ.get('DEEPSEEK_API_KEY', '')
    if deepseek_api_key and text.strip():
        if num_images == 1:
            task_msg = (
                f"Task: Write exactly 1 slide prompt covering ALL key concepts from the document. "
                f"Choose the LAYOUT type (A–E) that best fits the document's overall content. "
                f"Pack the most important concepts as real labels, panel headings, and bullet text. "
                f"Max 120 words. "
                f'Respond ONLY with a JSON array of 1 string: ["prompt"]'
            )
        else:
            task_msg = (
                f"Task: Divide the document into exactly {num_images} sections in document order. "
                f"Write one dark tech slide prompt per section. "
                f"For each section, choose the LAYOUT type (A–E) that best fits that section's content type. "
                f"Use REAL section title as the slide title, REAL terms as labels, REAL details as bullet text. "
                f"Together all {num_images} slides must cover the ENTIRE document. "
                f"Max 120 words per prompt. "
                f'Respond ONLY with a JSON array of {num_images} strings: ["prompt1", "prompt2", ...]'
            )

        system_msg = SYSTEM_PROMPT + "\n" + task_msg

        try:
            resp = _req.post(
                'https://api.deepseek.com/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {deepseek_api_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': 'deepseek-chat',
                    'messages': [
                        {'role': 'system', 'content': system_msg},
                        {'role': 'user',   'content': f'Document content:\n{text[:5000]}'},
                    ],
                    'temperature': 0.2,
                    'max_tokens': 2000,
                },
                timeout=60,
            )
            resp.raise_for_status()
            raw = resp.json()['choices'][0]['message']['content'].strip()
            if raw.startswith('```'):
                parts = raw.split('```')
                raw = parts[1] if len(parts) > 1 else raw
                if raw.startswith('json'):
                    raw = raw[4:]
            prompts_list = json.loads(raw.strip())
            if isinstance(prompts_list, list) and prompts_list:
                result = []
                for i, p in enumerate(prompts_list[:num_images]):
                    prompt_text = str(p).rstrip(' ,') + SLIDE_SUFFIX
                    result.append({'slide_index': i, 'title': f'Slide {i + 1}', 'prompt': prompt_text})
                print(f'[AI-IMAGES] DeepSeek generated {len(result)} dark tech slide prompts')
                for j, r in enumerate(result):
                    print(f'[AI-IMAGES] Slide {j + 1}: {r["prompt"][:220]}')
                return result
        except Exception as exc:
            print(f'[AI-IMAGES] DeepSeek prompt generation failed: {exc}')

    # Fallback — generic dark tech slide prompts (used only if DeepSeek is unavailable)
    print('[AI-IMAGES] Using fallback dark tech slide prompts')
    if num_images == 1:
        fallbacks = [
            f'Dark tech slide: deep navy to dark purple gradient background with {accent} glowing particle '
            f'network lines, top-left large bold white title "Research Overview" with {accent} underline, '
            f'four dark frosted glass cards stacked: card 1 glowing icon + bold "Introduction" + white text '
            f'"Problem context and research gap", card 2 glowing icon + bold "Methodology" + white text '
            f'"Framework design and data pipeline", card 3 glowing icon + bold "Results" + white text '
            f'"Key findings and performance metrics", card 4 glowing icon + bold "Impact" + white text '
            f'"Contributions and future directions", right background glowing neural network sphere, 16:9',
        ]
    else:
        fallbacks = [
            f'Dark tech slide: deep navy gradient with {accent} particle dots, top-left large bold white '
            f'title "Introduction & Background" with {accent} underline, four dark frosted glass cards: '
            f'glowing icon + bold "Research Problem" + white description, '
            f'glowing icon + bold "Knowledge Gap" + white description, '
            f'glowing icon + bold "Study Objective" + white description, '
            f'glowing icon + bold "Scope" + white description, '
            f'right glowing network sphere, bottom footer text, 16:9',

            f'Dark tech slide: deep navy to dark purple gradient with {accent} particle network, '
            f'centered large bold white title "Methodology & Framework", '
            f'three stacked dark glass panels with {accent} glow borders and upward arrows: '
            f'bottom panel "Data Layer" with sub-boxes "Data Collection" "Preprocessing" "Feature Engineering", '
            f'middle panel "Model Layer" with sub-boxes "Algorithm Design" "Training" "Validation", '
            f'top panel "Output Layer" with sub-boxes "Evaluation" "Deployment" "Monitoring", '
            f'upward {accent} glow arrows connecting layers, bottom caption text, 16:9',

            f'Dark tech slide: deep navy gradient with {accent} particle dots, top-left large bold white '
            f'title "Results & Evaluation" with {accent} underline, '
            f'two dark glass panels side by side: left panel cyan heading "Baseline Model" with '
            f'four white bullet metrics, right panel {accent} heading "Proposed Model" with four white bullet metrics, '
            f'below large {accent}-bordered glass panel "Performance Comparison" with labeled bar chart nodes '
            f'"Accuracy" "Precision" "Recall" "F1-Score" in vibrant colored boxes with white bold labels, 16:9',

            f'Dark tech slide: deep navy to dark purple gradient with {accent} particle network lines, '
            f'top-left large bold white title "Discussion & Future Work" with {accent} underline, '
            f'four dark frosted glass cards: '
            f'glowing icon + bold "Key Strengths" + white text "Main contributions validated", '
            f'glowing icon + bold "Limitations" + white text "Scope and dataset constraints", '
            f'glowing icon + bold "Ethical Considerations" + white text "Responsible AI principles", '
            f'glowing icon + bold "Future Directions" + white text "Extensions and open problems", '
            f'right background glowing network, 16:9',

            f'Dark tech slide: deep navy gradient with {accent} glow, large bold white centered title '
            f'"Conclusion & Impact", {accent} colored subtitle "Unlocking Research Contributions", '
            f'left side four bullet items with {accent} glowing dot bullets: '
            f'"Problem clearly defined and addressed" '
            f'"Novel methodology proposed and validated" '
            f'"Results outperform existing benchmarks" '
            f'"Code and data openly available", '
            f'right side large glowing {accent} concept diagram or sphere, '
            f'bottom footer "Slide 5 of 5  |  Presented by Research Team", 16:9',
        ]
    return [
        {'slide_index': i, 'title': f'Slide {i + 1}', 'prompt': fallbacks[i % len(fallbacks)]}
        for i in range(num_images)
    ]


def _run_images_only_background(job_id, file_path, filename, num_images, ai_color='indigo', ai_style='dark-tech'):
    """Background worker: extract text → generate prompts → ERNIE batch API → save images."""
    import time as _time
    import base64 as _b64
    import requests as _req

    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    ernie_dir = os.path.join(job_dir, 'ernie_images')
    os.makedirs(ernie_dir, exist_ok=True)

    # Derive base URL from env var (strip /generate suffix if present)
    ernie_base = os.environ.get(
        'ERNIE_ENDPOINT', 'https://intercessory-idiosyncratically-gaylord.ngrok-free.dev/generate'
    ).rsplit('/generate', 1)[0]
    headers = {'ngrok-skip-browser-warning': 'true'}

    try:
        # Step 1 — Extract document text
        update_job_status(job_id, 'extracting', progress=10,
                          step='Extracting document text',
                          step_description='Reading your document...')
        text = _extract_document_text(file_path, filename)
        print(f'[AI-IMAGES] Extracted {len(text)} chars from {filename}')

        # Step 2 — Generate prompts with DeepSeek
        update_job_status(job_id, 'generating_prompts', progress=30,
                          step='Generating image prompts',
                          step_description='Analyzing document with DeepSeek...')
        prompt_entries = _generate_prompts_from_text(text, num_images, ai_color, ai_style)
        if not prompt_entries:
            update_job_status(job_id, 'failed', error='No image prompts could be generated')
            return

        prompts = [p['prompt'] for p in prompt_entries]
        print(f'[AI-IMAGES] Prompts: {prompts}')

        # Step 3 — Submit batch job to Kaggle
        update_job_status(job_id, 'generating_images', progress=40,
                          step='Creating AI images',
                          step_description='Submitting batch to ERNIE...',
                          ernie_total=num_images, ernie_done=0, ernie_slides=[])

        res = _req.post(
            f'{ernie_base}/generate-batch',
            json={'prompts': prompts, 'seed': 42, 'width': 1024, 'height': 768},
            headers=headers,
            timeout=60,
        )
        res.raise_for_status()
        kaggle_job_id = res.json()['job_id']
        print(f'[AI-IMAGES] Kaggle job submitted: {kaggle_job_id}')

        # Step 4 — Poll until done, saving images progressively as they arrive
        saved_set = set()  # track which indices are already written to disk
        last_results = []

        for _ in range(360):  # max 48 min (360 × 8 s)
            _time.sleep(8)
            try:
                poll = _req.get(f'{ernie_base}/job/{kaggle_job_id}', headers=headers, timeout=20)
                poll.raise_for_status()
                job_data = poll.json()
                status = job_data.get('status', '')
                last_results = job_data.get('results', last_results)

                # Save any newly completed images
                newly_saved = []
                for r in last_results:
                    idx = r.get('index')
                    if idx is None or idx in saved_set or 'image' not in r:
                        continue
                    img_path = os.path.join(ernie_dir, f'slide_{idx}.png')
                    with open(img_path, 'wb') as _fh:
                        _fh.write(_b64.b64decode(r['image']))
                    saved_set.add(idx)
                    newly_saved.append(idx)
                    print(f'[AI-IMAGES] Saved slide_{idx}.png')

                if newly_saved:
                    with job_lock:
                        if job_id in jobs:
                            done_so_far = len(saved_set)
                            jobs[job_id]['ernie_done'] = done_so_far
                            jobs[job_id]['ernie_slides'] = sorted(saved_set)
                            jobs[job_id]['progress'] = 40 + int(done_so_far / num_images * 55)
                            jobs[job_id]['last_updated'] = datetime.now(timezone.utc).isoformat()

                print(f'[AI-IMAGES] Kaggle status: {status} | images saved: {len(saved_set)}/{num_images}')

                if status == 'done':
                    done_count = len(saved_set)
                    if done_count == 0:
                        update_job_status(job_id, 'failed', error='ERNIE returned no images')
                        return
                    update_job_status(job_id, 'completed', progress=100,
                                      step='Done',
                                      step_description=f'{done_count} image(s) generated successfully')
                    print(f'[AI-IMAGES] Job {job_id} completed — {done_count} images')
                    return

                if status == 'error':
                    done_count = len(saved_set)
                    if done_count > 0:
                        # Partial success — return what we have
                        update_job_status(job_id, 'completed', progress=100,
                                          step='Partial success',
                                          step_description=f'{done_count} of {num_images} image(s) generated')
                    else:
                        update_job_status(job_id, 'failed',
                                          error=job_data.get('error', 'ERNIE batch error'))
                    return

            except Exception as poll_err:
                print(f'[AI-IMAGES] Poll error (retrying): {poll_err}')
                continue

        # Timed out — return partial results if any were saved
        done_count = len(saved_set)
        if done_count > 0:
            update_job_status(job_id, 'completed', progress=100,
                              step='Partial (timed out)',
                              step_description=f'{done_count} of {num_images} image(s) generated')
        else:
            update_job_status(job_id, 'failed', error='Timed out waiting for ERNIE images')

    except Exception as exc:
        import traceback
        traceback.print_exc()
        update_job_status(job_id, 'failed', error=str(exc))
    finally:
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception:
                pass


def run_pipeline_background(job_id, file_path, output_name, skip_validation, template_style, color_scheme, preview_slides=False, avatar_choice='', voice_choice='gtts', speaker_choice='', avatar_position='side-left', generate_images=False, image_style='professional', skip_backgrounds=False, num_slides=12, slide_layout='default', language='en', num_images=0, voice_id='', custom_avatar_id=None, presenter_name=''):
    """Run the pipeline in background thread"""
    progress_file = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'progress.txt')
    os.makedirs(os.path.dirname(progress_file), exist_ok=True)

    try:
        update_job_status(job_id, 'parsing', progress=15, step='Parsing Document',
                         step_description='Extracting content and structure')

        # Set up environment
        env = os.environ.copy()
        if color_scheme == 'default':
            color_scheme = TEMPLATE_DEFAULT_COLORS.get(template_style, 'blue')
        env['SKIP_VALIDATION'] = 'true' if skip_validation else 'false'
        env['TEMPLATE_STYLE'] = template_style
        env['COLOR_SCHEME'] = color_scheme
        env['SLIDE_LAYOUT'] = slide_layout
        env['PROGRESS_FILE'] = progress_file  # Pass progress file path to pipeline
        env['PREVIEW_MODE'] = 'true' if preview_slides else 'false'
        env['NUM_SLIDES'] = str(num_slides)
        env['PRESENTATION_LANGUAGE'] = language
        env['NUM_ERNIE_IMAGES'] = str(num_images)

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

                # Find the generated PPTX output file
                output_pptx = os.path.join(OUTPUT_FOLDER, 'final', f'{output_name}.pptx')

                if os.path.exists(output_pptx):
                    # Move to job-specific location
                    job_output_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
                    os.makedirs(job_output_dir, exist_ok=True)

                    final_pptx_path = os.path.join(job_output_dir, f'{output_name}.pptx')
                    shutil.copy2(output_pptx, final_pptx_path)

                    # Inject AI images progressively (saves each image, updates job status)
                    if num_images > 0:
                        update_job_status(job_id, 'finalizing', progress=96,
                                        step='Generating AI images',
                                        step_description=f'Creating {num_images} AI images with ERNIE')
                        slide_plan_src = os.path.join(OUTPUT_FOLDER, 'slide-plan.json')
                        _run_ernie_with_progress(job_id, job_output_dir, final_pptx_path,
                                                 slide_plan_src, num_images)

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

                    output_label    = f'{output_name}.pptx'
                    download_url_base = f'/api/download/{job_id}/{output_label}'

                    if (voice_id or custom_avatar_id) and transcript_dst and os.path.exists(transcript_dst):
                        # ── New path: use the proven voice-video pipeline ─────────
                        print(f"[VIDEO] Using voice-video pipeline (voice_id={bool(voice_id)}, custom_avatar={bool(custom_avatar_id)})")
                        update_job_status(job_id, 'video_generation', progress=65,
                                        step='Generating video',
                                        step_description='Processing slides with your voice and avatar')

                        _vid_out = os.path.join(job_output_dir, f'{output_name}_video.mp4')
                        _ca_path = None
                        if custom_avatar_id:
                            _p = os.path.join(CUSTOM_AVATAR_DIR, f'{custom_avatar_id}.mp4')
                            if os.path.exists(_p):
                                _ca_path = _p
                            else:
                                print(f"[VIDEO] Custom avatar file not found: {_p}")

                        _tmp_vid_id = f'pptx_{job_id}'
                        _generate_voice_video_background(
                            _tmp_vid_id, job_output_dir, final_pptx_path, transcript_dst,
                            _vid_out, language, avatar_choice, '', voice_id, _ca_path, presenter_name
                        )

                        _vr = voice_video_jobs.get(_tmp_vid_id, {})
                        with voice_video_lock:
                            voice_video_jobs.pop(_tmp_vid_id, None)

                        if _vr.get('status') == 'done' and os.path.exists(_vid_out):
                            update_job_status(job_id, 'completed', progress=100,
                                            output_file=output_label,
                                            download_url=download_url_base,
                                            metadata=metadata,
                                            logs=result_stdout,
                                            video_file=f'{output_name}_video.mp4',
                                            video_url=f'/api/download/{job_id}/{output_name}_video.mp4')
                        else:
                            update_job_status(job_id, 'completed', progress=100,
                                            output_file=output_label,
                                            download_url=download_url_base,
                                            metadata=metadata,
                                            logs=result_stdout,
                                            video_error=_vr.get('error', 'Video generation failed'))

                    elif avatar_choice:
                        # ── Existing Hikma-avatar path with positioning UI ─────────
                        print(f"[VIDEO] Starting Hikma-avatar video for job {job_id}")
                        update_job_status(job_id, 'video_generation', progress=65,
                                        step='Starting video generation',
                                        step_description='Processing video with avatar')

                        if transcript_dst and os.path.exists(transcript_dst):
                            print(f"[VIDEO] Calling generate_video_from_pptx...")
                            video_success = generate_video_from_pptx(
                                job_id, final_pptx_path, transcript_dst,
                                output_name, avatar_choice, voice_choice, speaker_choice,
                                avatar_position
                            )
                            if not video_success:
                                print(f"[VIDEO] Video generation returned False")
                        else:
                            update_job_status(job_id, 'completed', progress=100,
                                            output_file=output_label,
                                            download_url=download_url_base,
                                            metadata=metadata,
                                            logs=result_stdout,
                                            video_error='Transcript not found for video generation')
                    else:
                        print(f"[VIDEO] No avatar/voice selected, skipping video generation")
                        update_job_status(job_id, 'completed', progress=100,
                                        output_file=output_label,
                                        download_url=download_url_base,
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
    avatar_position = request.form.get('avatar_position', 'side-left')
    speaker_choice = request.form.get('speaker_choice', '')
    voice_id = request.form.get('voice_id', '').strip()
    custom_avatar_id = request.form.get('custom_avatar_id', '').strip() or None
    presenter_name = request.form.get('presenter_name', '').strip()

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

    # Number of AI images to generate (0 = disabled, 3-5 = add images to PPTX)
    try:
        num_images = int(request.form.get('num_images', 0))
    except (ValueError, TypeError):
        num_images = 0
    if num_images != 0 and num_images not in range(3, 9):
        num_images = 0

    # AI Images mode skips the edit-slides preview entirely
    if num_images > 0:
        preview_slides = False

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
            'num_images': num_images,
            'voice_id': voice_id,
            'custom_avatar_id': custom_avatar_id,
            'presenter_name': presenter_name,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_updated': datetime.now(timezone.utc).isoformat()
        }

    # Persist job settings to disk so they survive server restarts
    job_meta_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    os.makedirs(job_meta_dir, exist_ok=True)
    with open(os.path.join(job_meta_dir, 'job_meta.json'), 'w') as _f:
        json.dump({'language': language, 'avatar_choice': avatar_choice}, _f)

    # Start background thread
    thread = threading.Thread(
        target=run_pipeline_background,
        args=(job_id, file_path, output_name, skip_validation, template_style, color_scheme, preview_slides, avatar_choice, voice_choice, speaker_choice, avatar_position, generate_images, image_style, skip_backgrounds, num_slides, slide_layout, language, num_images),
        kwargs={'voice_id': voice_id, 'custom_avatar_id': custom_avatar_id, 'presenter_name': presenter_name}
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
    avatar_position = request.form.get('avatar_position', 'side-left')
    speaker_choice = request.form.get('speaker_choice', '')

    # Debug logging
    print(f"\n[PPT-TO-VIDEO] Received parameters:")
    print(f"  - pptx_file: {pptx_filename}")
    print(f"  - transcript_file: {transcript_filename}")
    print(f"  - avatar_choice: '{avatar_choice}'")
    print(f"  - voice_choice: {voice_choice}")
    print(f"  - speaker_choice: '{speaker_choice}'")
    print(f"  - avatar_position: {avatar_position}\n")

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


def _extract_slides_transcript(file_path, filename):
    """Extract slide text from PPTX or PDF into the ---‑separated format expected by _parse_transcript_for_tts."""
    ext = filename.lower().rsplit('.', 1)[-1]
    parts = []
    try:
        if ext == 'pptx':
            from pptx import Presentation as _Prs
            prs = _Prs(file_path)
            for i, slide in enumerate(prs.slides, 1):
                texts = [sh.text.strip() for sh in slide.shapes
                         if hasattr(sh, 'text') and sh.text.strip()]
                if texts:
                    body = '. '.join(texts)
                    parts.append(f"## Slide {i}\n{body}")
        elif ext == 'pdf':
            import pdfplumber as _pdp
            with _pdp.open(file_path) as pdf:
                for i, page in enumerate(pdf.pages, 1):
                    text = (page.extract_text() or '').strip()
                    if text:
                        parts.append(f"## Slide {i}\n{text}")
    except Exception as e:
        print(f'[AVATAR-VIDEO] Transcript extraction error: {e}')
    return '\n---\n'.join(parts) if parts else '## Slide 1\nWelcome to this presentation.'


@app.route('/api/clone-voice', methods=['POST'])
def clone_voice():
    """Proxy voice sample upload to XTTS server and return voice_id."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'Empty filename'}), 400
    try:
        import requests as _req
        resp = _req.post(
            f'{XTTS_SERVER_URL}/clone',
            files={'file': (f.filename, f.stream, f.mimetype)},
            timeout=30,
        )
        resp.raise_for_status()
        return jsonify(resp.json()), resp.status_code
    except Exception as e:
        print(f'[CLONE-VOICE] XTTS server error: {e}')
        return jsonify({'error': f'XTTS server unavailable: {e}'}), 503


@app.route('/api/upload-avatar', methods=['POST'])
def upload_custom_avatar():
    """Upload a personal avatar MP4 (white background). Returns avatar_id."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'Empty filename'}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ('.mp4', '.mov', '.webm'):
        return jsonify({'error': 'Unsupported format. Use MP4, MOV, or WebM'}), 400

    os.makedirs(CUSTOM_AVATAR_DIR, exist_ok=True)
    avatar_id  = str(uuid.uuid4())
    raw_path   = os.path.join(CUSTOM_AVATAR_DIR, f'{avatar_id}_raw{ext}')
    final_path = os.path.join(CUSTOM_AVATAR_DIR, f'{avatar_id}.mp4')
    f.save(raw_path)

    try:
        import subprocess as _sp2
        _sp2.run([
            'ffmpeg', '-y', '-i', raw_path,
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',
            '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
            '-an', '-r', '25',
            final_path,
        ], check=True, capture_output=True)
        os.remove(raw_path)
        print(f'[CUSTOM-AVATAR] Saved {avatar_id}.mp4  ({os.path.getsize(final_path):,} bytes)')
    except Exception as e:
        print(f'[CUSTOM-AVATAR] Normalization failed ({e}), using raw file')
        try:
            os.rename(raw_path, final_path)
        except Exception:
            pass

    return jsonify({'avatar_id': avatar_id}), 201


@app.route('/api/avatar-video', methods=['POST'])
def avatar_video_standalone():
    """Standalone avatar video: upload PPTX/PDF + optional script → video."""
    if 'slides_file' not in request.files:
        return jsonify({'error': 'No slides file provided'}), 400
    slides_file = request.files['slides_file']
    if not slides_file.filename:
        return jsonify({'error': 'No file selected'}), 400
    fname = slides_file.filename.lower()
    if not (fname.endswith('.pptx') or fname.endswith('.pdf')):
        return jsonify({'error': 'Only .pptx or .pdf files are supported'}), 400

    avatar_choice    = request.form.get('avatar_choice', '')
    voice_choice     = request.form.get('voice_choice', 'edge-tts')
    speaker_choice   = request.form.get('speaker_choice', '')
    avatar_position  = request.form.get('avatar_position', 'bottom-right')
    language         = request.form.get('language', 'en')
    voice_id         = request.form.get('voice_id', '').strip()
    custom_avatar_id = request.form.get('custom_avatar_id', '').strip()
    presenter_name   = request.form.get('presenter_name', '').strip()

    # Resolve custom avatar (overrides avatar_choice when present)
    custom_avatar_path = None
    if custom_avatar_id:
        _ca = os.path.join(CUSTOM_AVATAR_DIR, f'{custom_avatar_id}.mp4')
        if os.path.exists(_ca):
            custom_avatar_path = _ca
            print(f'[AVATAR-VIDEO] Using custom avatar: {_ca}')
        else:
            print(f'[AVATAR-VIDEO] Custom avatar not found: {_ca}')

    # Resolve voice here — unambiguous, fully logged, no risk of it changing later
    _av_gender = _AVATAR_GENDER.get(avatar_choice)
    if _av_gender is None:
        _nl = (avatar_choice or '').lower()
        _av_gender = 'male' if ('male' in _nl and 'female' not in _nl) else 'female'
    if _av_gender == 'male':
        tts_voice = _EDGE_TTS_VOICES_MALE.get(language, 'en-US-GuyNeural')
    else:
        tts_voice = _EDGE_TTS_VOICES.get(language, 'en-US-JennyNeural')
    print(f'[AVATAR-VIDEO] avatar={repr(avatar_choice)} gender={_av_gender} voice={tts_voice} lang={language}')

    job_id  = str(uuid.uuid4())
    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    os.makedirs(job_dir, exist_ok=True)

    safe_name   = secure_filename(slides_file.filename)
    slides_path = os.path.join(job_dir, safe_name)
    slides_file.save(slides_path)
    output_name = os.path.splitext(safe_name)[0]

    transcript_text = _extract_slides_transcript(slides_path, safe_name)
    transcript_path = os.path.join(job_dir, f'{output_name}_transcript.txt')
    with open(transcript_path, 'w', encoding='utf-8') as _tf:
        _tf.write(transcript_text)

    print(f'[AVATAR-VIDEO] job={job_id} file={safe_name} avatar={avatar_choice} voice={voice_choice}')

    with job_lock:
        jobs[job_id] = {
            'job_id': job_id, 'status': 'queued', 'progress': 0,
            'filename': safe_name, 'output_name': output_name,
            'avatar_choice': avatar_choice, 'voice_choice': voice_choice,
            'speaker_choice': speaker_choice, 'avatar_position': avatar_position,
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_updated': datetime.now(timezone.utc).isoformat(),
        }

    def _run():
        try:
            output_path = os.path.join(job_dir, 'voice_presentation.mp4')
            _update_voice_job(job_id, 'starting', 0)
            _generate_voice_video_background(
                job_id, job_dir, slides_path, transcript_path,
                output_path, language, avatar_choice, tts_voice, voice_id,
                custom_avatar_path=custom_avatar_path,
                presenter_name=presenter_name,
            )
        except Exception as e:
            print(f'[AVATAR-VIDEO] Error: {e}')
            _update_voice_job(job_id, 'error', 0, str(e))

    threading.Thread(target=_run, daemon=True).start()
    return jsonify({'job_id': job_id, 'status': 'queued'}), 202


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
            avatar_position = jobs[job_id].get('avatar_position', 'side-left')
            voice_id = jobs[job_id].get('voice_id', '')
            custom_avatar_id = jobs[job_id].get('custom_avatar_id', None)
            presenter_name = jobs[job_id].get('presenter_name', '')

            if not pptx_path or not transcript_path:
                update_job_status(job_id, 'failed', error='Missing PPTX or transcript path')
                return

            # Call video generation with custom positions
            generate_video_from_pptx(
                job_id, pptx_path, transcript_path,
                output_name, avatar_choice, voice_choice, speaker_choice, avatar_position,
                custom_positions=positions,
                voice_id=voice_id,
                custom_avatar_id=custom_avatar_id,
                presenter_name=presenter_name
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
            effective_color = TEMPLATE_DEFAULT_COLORS.get(template_style, 'blue') if color_scheme == 'default' else color_scheme
            env['SKIP_VALIDATION'] = 'true' if skip_validation else 'false'
            env['TEMPLATE_STYLE'] = template_style
            env['COLOR_SCHEME'] = effective_color
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
                timeout=3600  # 60 min max for PPTX generation from approved plan
            )

            if result.returncode == 0:
                # Find generated PPTX
                output_pptx = os.path.join(OUTPUT_FOLDER, 'final', f'{output_name}.pptx')

                if os.path.exists(output_pptx):
                    final_pptx_path = os.path.join(job_dir, f'{output_name}.pptx')
                    shutil.copy2(output_pptx, final_pptx_path)

                    # Inject ERNIE AI images progressively
                    num_images = job.get('num_images', 0)
                    if num_images > 0:
                        update_job_status(job_id, 'generating', progress=88,
                                        step='Generating AI images',
                                        step_description=f'Creating {num_images} AI images with ERNIE')
                        _run_ernie_with_progress(job_id, job_dir, final_pptx_path,
                                                 os.path.join(job_dir, 'slide-plan.json'), num_images)

                    transcript_src = os.path.join(OUTPUT_FOLDER, f'{output_name}_transcript.txt')
                    transcript_dst = None
                    if os.path.exists(transcript_src):
                        transcript_dst = os.path.join(job_dir, f'{output_name}_transcript.txt')
                        shutil.copy2(transcript_src, transcript_dst)

                    # Generate video if avatar/voice was selected originally
                    avatar_choice = job.get('avatar_choice', '')
                    voice_choice = job.get('voice_choice', 'gtts')
                    speaker_choice = job.get('speaker_choice', '')
                    avatar_position = job.get('avatar_position', 'side-left')
                    voice_id = job.get('voice_id', '')
                    custom_avatar_id = job.get('custom_avatar_id', None)
                    presenter_name = job.get('presenter_name', '')

                    if (voice_id or custom_avatar_id) and transcript_dst and os.path.exists(transcript_dst):
                        print(f"[VIDEO] continue_from_preview: voice-video pipeline (voice_id={bool(voice_id)}, custom_avatar={bool(custom_avatar_id)})")
                        update_job_status(job_id, 'video_generation', progress=65,
                                        step='Generating video',
                                        step_description='Processing slides with your voice and avatar')

                        _vid_out = os.path.join(job_dir, f'{output_name}_video.mp4')
                        _ca_path = None
                        if custom_avatar_id:
                            _p = os.path.join(CUSTOM_AVATAR_DIR, f'{custom_avatar_id}.mp4')
                            if os.path.exists(_p):
                                _ca_path = _p
                            else:
                                print(f"[VIDEO] Custom avatar file not found: {_p}")

                        _tmp_vid_id = f'pptx_{job_id}'
                        _generate_voice_video_background(
                            _tmp_vid_id, job_dir, final_pptx_path, transcript_dst,
                            _vid_out, language, avatar_choice, '', voice_id, _ca_path, presenter_name
                        )

                        _vr = voice_video_jobs.get(_tmp_vid_id, {})
                        with voice_video_lock:
                            voice_video_jobs.pop(_tmp_vid_id, None)

                        if _vr.get('status') == 'done' and os.path.exists(_vid_out):
                            update_job_status(job_id, 'completed', progress=100,
                                            output_file=f'{output_name}.pptx',
                                            download_url=f'/api/download/{job_id}/{output_name}.pptx',
                                            logs=result.stdout,
                                            video_file=f'{output_name}_video.mp4',
                                            video_url=f'/api/download/{job_id}/{output_name}_video.mp4')
                        else:
                            update_job_status(job_id, 'completed', progress=100,
                                            output_file=f'{output_name}.pptx',
                                            download_url=f'/api/download/{job_id}/{output_name}.pptx',
                                            logs=result.stdout,
                                            video_error=_vr.get('error', 'Video generation failed'))

                    elif avatar_choice and transcript_dst and os.path.exists(transcript_dst):
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


@app.route('/api/job/<job_id>/ernie-image/<int:slide_idx>', methods=['GET'])
def get_ernie_image(job_id, slide_idx):
    """Serve a single ERNIE-generated image for a job slide."""
    img_path = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'ernie_images', f'slide_{slide_idx}.png')
    if not os.path.exists(img_path):
        return jsonify({'error': 'Image not ready yet'}), 404
    return send_file(img_path, mimetype='image/png')


@app.route('/api/job/<job_id>/ernie-image/<int:slide_idx>', methods=['PUT'])
def update_ernie_image(job_id, slide_idx):
    """Save a user-edited image (base64 PNG) back to disk, replacing the original ERNIE output."""
    import base64 as _b64
    data = request.get_json(silent=True)
    if not data or 'image_data' not in data:
        return jsonify({'error': 'No image_data provided'}), 400

    b64 = data['image_data']
    if ',' in b64:
        b64 = b64.split(',', 1)[1]

    try:
        img_bytes = _b64.b64decode(b64)
    except Exception as e:
        return jsonify({'error': f'Invalid base64: {e}'}), 400

    ernie_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'ernie_images')
    if not os.path.isdir(ernie_dir):
        return jsonify({'error': 'No ERNIE images found for this job'}), 404

    img_path = os.path.join(ernie_dir, f'slide_{slide_idx}.png')
    with open(img_path, 'wb') as f:
        f.write(img_bytes)

    return jsonify({'status': 'ok', 'message': f'slide_{slide_idx}.png updated'})




@app.route('/api/job/<job_id>/export-images/<export_format>', methods=['GET'])
def export_ernie_images(job_id, export_format):
    """Export all ERNIE images for a job as a PPTX or PDF file."""
    if export_format not in ('pptx', 'pdf'):
        return jsonify({'error': 'Invalid format. Use pptx or pdf'}), 400

    ernie_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'ernie_images')
    if not os.path.isdir(ernie_dir):
        return jsonify({'error': 'Images not found for this job'}), 404

    img_files = sorted(
        [f for f in os.listdir(ernie_dir) if f.lower().endswith('.png')],
        key=lambda x: int(x.split('_')[1].split('.')[0])
    )
    if not img_files:
        return jsonify({'error': 'No images found'}), 404

    img_paths = [os.path.join(ernie_dir, f) for f in img_files]

    if export_format == 'pptx':
        import io as _io
        from pptx import Presentation as _Prs
        from pptx.util import Inches as _Inches
        prs = _Prs()
        prs.slide_width  = _Inches(13.333)
        prs.slide_height = _Inches(7.5)
        blank_layout = prs.slide_layouts[6]
        for img_path in img_paths:
            slide = prs.slides.add_slide(blank_layout)
            slide.shapes.add_picture(img_path, 0, 0, prs.slide_width, prs.slide_height)
        buf = _io.BytesIO()
        prs.save(buf)
        buf.seek(0)
        return send_file(
            buf, as_attachment=True,
            download_name=f'ai_presentation_{job_id[:8]}.pptx',
            mimetype='application/vnd.openxmlformats-officedocument.presentationml.presentation'
        )

    # PDF — merge images using Pillow
    import io as _io
    from PIL import Image as _Img
    images = [_Img.open(p).convert('RGB') for p in img_paths]
    buf = _io.BytesIO()
    if len(images) == 1:
        images[0].save(buf, format='PDF')
    else:
        images[0].save(buf, format='PDF', save_all=True, append_images=images[1:])
    buf.seek(0)
    return send_file(
        buf, as_attachment=True,
        download_name=f'ai_presentation_{job_id[:8]}.pdf',
        mimetype='application/pdf'
    )


@app.route('/api/generate-ai-images', methods=['POST'])
def generate_ai_images_only():
    """Generate AI images from a document — no PPTX, no video pipeline."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not supported. Use PDF, DOCX, or TEX'}), 400

    try:
        num_images = int(request.form.get('num_images', 3))
    except (ValueError, TypeError):
        num_images = 3
    if num_images not in range(3, 9):
        num_images = 3

    ai_color = request.form.get('ai_color', 'indigo')
    if ai_color not in _AI_COLOR_MAP:
        ai_color = 'indigo'

    _VALID_STYLES = {'dark-tech', 'light', 'corporate', 'neon', 'minimal'}
    ai_style = request.form.get('ai_style', 'dark-tech')
    if ai_style not in _VALID_STYLES:
        ai_style = 'dark-tech'

    job_id = str(uuid.uuid4())
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], f'{job_id}_{filename}')
    file.save(file_path)

    with job_lock:
        jobs[job_id] = {
            'job_id': job_id,
            'status': 'queued',
            'progress': 0,
            'filename': filename,
            'num_images': num_images,
            'ai_color': ai_color,
            'ernie_total': 0,
            'ernie_done': 0,
            'ernie_slides': [],
            'created_at': datetime.now(timezone.utc).isoformat(),
            'last_updated': datetime.now(timezone.utc).isoformat(),
        }

    thread = threading.Thread(
        target=_run_images_only_background,
        args=(job_id, file_path, filename, num_images, ai_color, ai_style)
    )
    thread.daemon = True
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'queued', 'message': 'Image generation started'}), 202


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


# Female neural voices per language — standard free Microsoft Neural voices
_EDGE_TTS_VOICES = {
    'en': 'en-US-JennyNeural',       # reliable, clear, free
    'ar': 'ar-EG-SalmaNeural',       # Egyptian Arabic, clear & expressive
    'fr': 'fr-FR-DeniseNeural',      # natural French female
    'es': 'es-ES-ElviraNeural',      # clear Castilian Spanish
    'de': 'de-DE-KatjaNeural',       # natural German female
    'it': 'it-IT-ElsaNeural',        # Italian female
    'zh': 'zh-CN-XiaoxiaoNeural',    # very natural Mandarin female
    'tr': 'tr-TR-EmelNeural',        # Turkish female
    'pt': 'pt-BR-FranciscaNeural',   # Brazilian Portuguese female
    'ru': 'ru-RU-SvetlanaNeural',    # Russian female
    'ur': 'ur-PK-UzmaNeural',        # Urdu female
}

# Male neural voices per language — highest-naturalness Microsoft Neural voices
_EDGE_TTS_VOICES_MALE = {
    'en': 'en-US-GuyNeural',         # reliable, clear male, free
    'ar': 'ar-SA-HamedNeural',       # Saudi Arabic male, authoritative
    'fr': 'fr-FR-HenriNeural',       # natural French male
    'es': 'es-ES-AlvaroNeural',      # clear Spanish male
    'de': 'de-DE-ConradNeural',      # natural German male
    'it': 'it-IT-DiegoNeural',       # Italian male
    'zh': 'zh-CN-YunxiNeural',       # very natural Mandarin male
    'tr': 'tr-TR-AhmetNeural',       # Turkish male
    'pt': 'pt-BR-AntonioNeural',     # Brazilian Portuguese male
    'ru': 'ru-RU-DmitryNeural',      # Russian male
    'ur': 'ur-PK-AsadNeural',        # Urdu male
}

XTTS_SERVER_URL = os.environ.get('XTTS_SERVER_URL', 'http://localhost:5001')

# Natural/default color scheme per template — used when user picks "Default (Template Colors)"
TEMPLATE_DEFAULT_COLORS = {
    'modern':         'indigo',
    'minimal':        'slate',
    'tech':           'dark-teal',
    'creative':       'purple',
    'corporate':      'navy',
    'elegant':        'gold',
    'startup':        'orange',
    'magazine':       'red',
    'academic':       'blue',
    'nature':         'green',
    'retro':          'amber',
    'luxury':         'gold',
    'blueprint':      'dark-teal',
    'aurora':         'teal',
    'dark-neon':      'dark-teal',
    'glassmorphism':  'dark-purple',
    'prestige':       'gold',
    'split-bold':     'indigo',
}

def _strip_opening_greeting(text):
    """Remove the first sentence if it is a generic greeting, to avoid doubling with the welcome clip."""
    import re as _re
    pattern = _re.compile(
        r'^(?:hi|hello|good\s+(?:morning|afternoon|evening)|welcome|greetings|'
        r'dear\s+(?:everyone|all)|مرحب[^\s]*|السلام|أهلاً|bonjour|bonsoir|'
        r'hola|hallo|大家好|привет)[^.!?؟]*[.!?؟]\s*',
        _re.IGNORECASE
    )
    stripped = pattern.sub('', text, count=1).strip()
    return stripped if stripped else text


# Welcome greeting per language (name placeholder = {name})
_WELCOME_GREETING = {
    'en': "Hi, my name is {name}.",
    'ar': "مرحباً، اسمي {name}.",
    'fr': "Bonjour, je m'appelle {name}.",
    'de': "Hallo, mein Name ist {name}.",
    'es': "Hola, mi nombre es {name}.",
    'zh': "大家好，我叫{name}。",
    'tr': "Merhaba, benim adım {name}.",
    'ur': "السلام علیکم، میرا نام {name} ہے۔",
    'it': "Salve, mi chiamo {name}.",
    'pt': "Olá, meu nome é {name}.",
    'ru': "Привет, меня зовут {name}.",
}

# Avatar character → gender mapping
_AVATAR_GENDER = {
    'Professional Female':  'female',
    'Middle-aged Female':   'female',
    'Business Male':        'male',
    'Young Casual Male':    'male',
    'Young Arab Gulf Male': 'male',
    'Arab Gulf Old Male':   'male',
}

# gTTS language codes (some differ from BCP-47 used by edge-tts)
_GTTS_LANG_CODES = {
    'en': 'en', 'ar': 'ar', 'fr': 'fr', 'es': 'es', 'de': 'de',
    'it': 'it', 'zh': 'zh-CN', 'tr': 'tr', 'pt': 'pt', 'ru': 'ru', 'ur': 'ur',
}


def _make_presenter_script(slide_texts, language='en'):
    """Wrap slide narration with a natural presenter intro and outro."""
    if not slide_texts:
        return slide_texts

    lang = language or 'en'

    intros = {
        'en': "Hello everyone! Today, I'd like to walk you through our presentation. Let's get started.",
        'ar': "مرحباً بالجميع! اليوم، سنتناول معاً هذا العرض. تفضّلوا معي.",
        'fr': "Bonjour à tous ! Aujourd'hui, je vous invite à découvrir cette présentation. Commençons.",
        'es': "¡Hola a todos! Hoy les invito a explorar esta presentación juntos. ¡Empecemos!",
        'de': "Hallo zusammen! Heute lade ich Sie ein, diese Präsentation gemeinsam zu erkunden. Legen wir los.",
        'it': "Ciao a tutti! Oggi vi invito a scoprire questa presentazione insieme. Iniziamo.",
        'zh': "大家好！今天，让我带领大家一起了解这份演示文稿。让我们开始吧。",
        'tr': "Herkese merhaba! Bugün sizleri bu sunumla tanıştırmak istiyorum. Başlayalım.",
        'pt': "Olá a todos! Hoje, convido vocês a explorar esta apresentação comigo. Vamos começar.",
        'ru': "Всем привет! Сегодня я приглашаю вас познакомиться с нашей презентацией. Давайте начнём.",
        'ur': "السلام علیکم! آج میں آپ کو اس پریزنٹیشن سے روشناس کرانا چاہتا ہوں۔ شروع کرتے ہیں۔",
    }

    outros = {
        'en': "Thank you all for your attention. I hope this presentation was informative and valuable.",
        'ar': "شكراً جزيلاً لاهتمامكم. أتمنى أن يكون هذا العرض مفيداً وقيّماً.",
        'fr': "Merci à tous pour votre attention. J'espère que cette présentation vous a été utile et enrichissante.",
        'es': "Muchas gracias por su atención. Espero que esta presentación haya sido informativa y valiosa.",
        'de': "Vielen Dank für Ihre Aufmerksamkeit. Ich hoffe, diese Präsentation war informativ und hilfreich.",
        'it': "Grazie a tutti per la vostra attenzione. Spero che questa presentazione sia stata utile e arricchente.",
        'zh': "感谢大家的关注。希望这次演示对您有所帮助和启发。谢谢！",
        'tr': "Dikkatiniz için herkese teşekkürler. Bu sunumun faydalı ve bilgilendirici olduğunu umuyorum.",
        'pt': "Muito obrigado pela atenção de todos. Espero que esta apresentação tenha sido útil e enriquecedora.",
        'ru': "Спасибо всем за внимание. Надеюсь, эта презентация была полезной и информативной.",
        'ur': "آپ سب کا شکریہ۔ امید ہے کہ یہ پریزنٹیشن معلوماتی اور قیمتی رہی۔",
    }

    intro = intros.get(lang, intros['en'])
    outro = outros.get(lang, outros['en'])

    result = list(slide_texts)
    result[0] = f"{intro} {result[0]}"
    result[-1] = f"{result[-1]} {outro}"
    return result


def _clean_text_for_tts(text):
    """Strip markdown and formatting artifacts so TTS reads naturally."""
    import re
    text = re.sub(r'#+\s*', '', text)                   # remove ## headers
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)        # **bold** → bold
    text = re.sub(r'\*(.+?)\*', r'\1', text)            # *italic* → italic
    text = re.sub(r'`(.+?)`', r'\1', text)              # `code` → code
    text = re.sub(r'^\s*[-•*]\s+', '', text, flags=re.MULTILINE)   # bullets
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)   # numbered lists
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)     # [link text](url) → text
    text = re.sub(r'\n{2,}', ' ', text)                 # collapse blank lines
    text = re.sub(r'\n', ' ', text)                     # remaining newlines → space
    text = re.sub(r'\s{2,}', ' ', text)                 # collapse spaces
    return text.strip()


def _tts_audio(text, out_path, language='en', avatar_choice='', tts_voice='', voice_id=''):
    """Generate MP3 audio for *text*, picking a voice that matches the avatar gender.

    Priority:
      0. XTTS v2   — cloned voice (only when voice_id is provided)
      1. edge-tts  — Microsoft Azure neural voices (best quality, free, no key)
      2. gTTS      — Google TTS (decent fallback, robotic but reliable)
      3. silence   — 3-second silent MP3 so video still renders

    If tts_voice is supplied it is used directly, bypassing gender detection.
    """
    lang = language or 'en'
    clean = _clean_text_for_tts(text) or text

    # ── 0. XTTS cloned voice (when user uploaded a sample) ───────────────────
    if voice_id:
        try:
            import requests as _req
            import tempfile, shutil
            resp = _req.post(
                f'{XTTS_SERVER_URL}/synthesize',
                json={'voice_id': voice_id, 'text': clean, 'language': lang, 'speed': 1.1},
                timeout=120,
            )
            if resp.status_code == 200:
                tmp_wav = out_path.replace('.mp3', '_xtts.wav')
                with open(tmp_wav, 'wb') as _wf:
                    _wf.write(resp.content)
                # Convert WAV → MP3 via ffmpeg if available, else keep as WAV renamed to mp3
                import subprocess
                try:
                    subprocess.run(
                        ['ffmpeg', '-y', '-i', tmp_wav, '-q:a', '2', out_path],
                        check=True, capture_output=True
                    )
                    os.remove(tmp_wav)
                except Exception:
                    os.rename(tmp_wav, out_path)
                print(f'[VOICE VIDEO] XTTS cloned voice OK  voice_id={voice_id[:8]}...')
                return
            else:
                print(f'[VOICE VIDEO] XTTS server returned {resp.status_code}, falling back to edge-tts')
        except Exception as xtts_err:
            print(f'[VOICE VIDEO] XTTS failed: {xtts_err}, falling back to edge-tts')

    if tts_voice:
        edge_voice = tts_voice
    else:
        # Gender: dict lookup first, then name-based fallback
        gender = _AVATAR_GENDER.get(avatar_choice)
        if gender is None:
            name_lower = (avatar_choice or '').lower()
            gender = 'male' if ('male' in name_lower and 'female' not in name_lower) else 'female'
        if gender == 'male':
            edge_voice = _EDGE_TTS_VOICES_MALE.get(lang, 'en-US-GuyNeural')
        else:
            edge_voice = _EDGE_TTS_VOICES.get(lang, 'en-US-JennyNeural')

    print(f'[VOICE VIDEO] voice={edge_voice}  lang={lang}  avatar={repr(avatar_choice)}')

    # ── 1. edge-tts (primary) ─────────────────────────────────────────────────
    try:
        import asyncio
        import edge_tts
        print(f'[VOICE VIDEO] edge-tts available, attempting voice={edge_voice}')

        async def _run_edge():
            communicate = edge_tts.Communicate(
                clean, edge_voice,
                rate='-5%',
                volume='+10%',
                pitch='+0Hz',
            )
            await asyncio.wait_for(communicate.save(out_path), timeout=60)

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(_run_edge())
        finally:
            loop.close()
        print(f'[VOICE VIDEO] edge-tts OK  voice={edge_voice}  lang={lang}')
        return
    except ImportError:
        print(f'[VOICE VIDEO] edge-tts NOT INSTALLED — install with: pip install edge-tts')
    except Exception as edge_err:
        import traceback
        print(f'[VOICE VIDEO] edge-tts FAILED voice={edge_voice}: {edge_err}')
        traceback.print_exc()

    # ── 2. gTTS (fallback) ────────────────────────────────────────────────────
    try:
        from gtts import gTTS
        gtts_lang = _GTTS_LANG_CODES.get(lang, 'en')
        tts = gTTS(text=clean, lang=gtts_lang, slow=False)
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


def _generate_voice_video_background(job_id, job_dir, pptx_path, transcript_path, output_path, language='en', avatar_choice='', tts_voice='', voice_id='', custom_avatar_path=None, presenter_name=''):
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

        # ── Resolve avatar video (custom overrides Hikma) ─────────────────────
        hikma_vids_folder = os.path.join(os.path.dirname(__file__), 'static', 'avatar', 'hikma avatars vids')
        hikma_avatar_video = None
        if custom_avatar_path and os.path.exists(custom_avatar_path):
            hikma_avatar_video = custom_avatar_path
            print(f'[VOICE VIDEO] Using custom avatar: {custom_avatar_path}')
        elif avatar_choice:
            candidate = os.path.join(hikma_vids_folder, f'{avatar_choice}.mp4')
            if os.path.exists(candidate):
                hikma_avatar_video = candidate
                print(f'[VOICE VIDEO] Using avatar video: {hikma_avatar_video}')
            else:
                print(f'[VOICE VIDEO] Warning: avatar video not found at {candidate}')

        # ── Step 3: Parse transcript ──────────────────────────────────────────
        _update_voice_job(job_id, 'parsing_transcript', 22)
        slide_texts = _parse_transcript_for_tts(transcript_path, n_slides)
        slide_texts = _make_presenter_script(slide_texts, language)
        print(f'[VOICE VIDEO] Parsed {len(slide_texts)} transcript blocks')

        # Strip slide 1 opening greeting when a welcome clip will be prepended
        if hikma_avatar_video and slide_texts:
            slide_texts[0] = _strip_opening_greeting(slide_texts[0])

        # ── Step 4: TTS audio per slide ───────────────────────────────────────
        audio_files = []
        for i, text in enumerate(slide_texts):
            _update_voice_job(job_id, 'generating_voice', 25 + int((i / n_slides) * 40))
            print(f'[VOICE VIDEO] TTS slide {i + 1}/{n_slides}…')
            audio_path = os.path.join(work_dir, f'audio_{i + 1:03d}.mp3')
            _tts_audio(text, audio_path, language=language, avatar_choice=avatar_choice, tts_voice=tts_voice, voice_id=voice_id)
            audio_files.append(audio_path)

        # ── Step 5: Compose one video clip per slide ──────────────────────────
        clip_files = []

        # ── Welcome intro clip (prepended before slide 1) ─────────────────────
        if hikma_avatar_video and slide_images:
            try:
                _av_key = os.path.splitext(os.path.basename(hikma_avatar_video))[0]
                _welcome_name = presenter_name if presenter_name else _AVATAR_DISPLAY_NAMES.get(_av_key, 'Presenter')
                _greeting = _WELCOME_GREETING.get(language, _WELCOME_GREETING['en']).format(name=_welcome_name)
                _welcome_audio = os.path.join(work_dir, 'clip_welcome.mp3')
                _welcome_video = os.path.join(work_dir, 'clip_welcome.mp4')
                _tts_audio(_greeting, _welcome_audio, language=language, avatar_choice=avatar_choice, tts_voice=tts_voice, voice_id=voice_id)
                compose_slide_video(slide_images[0], _welcome_audio, _welcome_video,
                                    avatar_video=hikma_avatar_video,
                                    presenter_name=presenter_name)
                clip_files.append(_welcome_video)
                print(f'[VOICE VIDEO] Welcome clip added for: {_welcome_name}')
            except Exception as _we:
                print(f'[VOICE VIDEO] Welcome clip skipped: {_we}')

        for i, (img, audio) in enumerate(zip(slide_images, audio_files)):
            _update_voice_job(job_id, 'composing_video', 65 + int((i / n_slides) * 25))
            print(f'[VOICE VIDEO] Composing clip {i + 1}/{n_slides}…')
            clip_path = os.path.join(work_dir, f'clip_{i + 1:03d}.mp4')
            compose_slide_video(img, audio, clip_path, avatar_video=hikma_avatar_video, presenter_name=presenter_name)
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

    # Get all job params from in-memory record, fall back to disk meta
    with job_lock:
        job_mem = jobs.get(job_id, {})
        job_language      = job_mem.get('language', None)
        job_avatar        = job_mem.get('avatar_choice', None)
        job_voice_id      = job_mem.get('voice_id', '')
        job_custom_av_id  = job_mem.get('custom_avatar_id', None)
        job_presenter     = job_mem.get('presenter_name', '')

    if not job_language or job_avatar is None:
        meta_path = os.path.join(job_dir, 'job_meta.json')
        if os.path.exists(meta_path):
            with open(meta_path, 'r') as _f:
                meta = json.load(_f)
            if not job_language:
                job_language = meta.get('language', 'en')
            if job_avatar is None:
                job_avatar = meta.get('avatar_choice', '')
            if not job_voice_id:
                job_voice_id = meta.get('voice_id', '')
            if not job_custom_av_id:
                job_custom_av_id = meta.get('custom_avatar_id', None)
            if not job_presenter:
                job_presenter = meta.get('presenter_name', '')
        else:
            job_language = job_language or 'en'
            job_avatar   = job_avatar or ''

    # Resolve custom avatar file path
    job_custom_av_path = None
    if job_custom_av_id:
        _p = os.path.join(CUSTOM_AVATAR_DIR, f'{job_custom_av_id}.mp4')
        if os.path.exists(_p):
            job_custom_av_path = _p
        else:
            print(f'[VOICE VIDEO] Custom avatar not found: {_p}')

    print(f'[VOICE VIDEO] avatar_choice={repr(job_avatar)}  language={job_language}  voice_id={bool(job_voice_id)}  custom_avatar={bool(job_custom_av_path)}')

    _update_voice_job(job_id, 'starting', 0)
    thread = threading.Thread(
        target=_generate_voice_video_background,
        args=(job_id, job_dir, pptx_path, transcript_path, output_path,
              job_language, job_avatar, '', job_voice_id, job_custom_av_path, job_presenter),
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


@app.route('/api/job/<job_id>/assessment/generate', methods=['POST'])
def generate_assessment(job_id):
    """Generate quiz + flashcards from slide plan using DeepSeek"""
    import requests as _req

    job_dir = os.path.join(OUTPUT_FOLDER, 'jobs', job_id)
    assessment_path = os.path.join(job_dir, 'assessment.json')

    # Return cached assessment if it exists
    if os.path.exists(assessment_path):
        with open(assessment_path, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))

    slide_plan_path = os.path.join(job_dir, 'slide-plan.json')
    if not os.path.exists(slide_plan_path):
        return jsonify({'error': 'Slide plan not found. Generate a presentation first.'}), 404

    with open(slide_plan_path, 'r', encoding='utf-8') as f:
        slide_plan = json.load(f)

    meta   = slide_plan.get('presentationMetadata', slide_plan.get('metadata', {}))
    title  = meta.get('title', 'Presentation')
    slides = slide_plan.get('slides', [])

    # Build content summary (speaker notes + titles/bullets)
    parts = []
    for s in slides[:18]:
        c = s.get('content', {})
        heading = c.get('title') or c.get('sectionTitle') or ''
        bullets = c.get('bullets', [])
        notes   = s.get('speakerNotes', '')
        text    = heading
        if bullets:
            text += '\n' + '\n'.join(f'- {b}' for b in bullets if b)
        if notes:
            text += '\n' + notes[:300]
        if text.strip():
            parts.append(text.strip())

    full_content = '\n\n'.join(parts)

    prompt = f"""You are an educational assessment expert. Create an assessment from this presentation.

Title: {title}

Content:
{full_content}

Return ONLY valid JSON (no markdown fences, no extra text) matching this exact schema:
{{
  "title": "Assessment: {title}",
  "questions": [
    {{
      "id": 1,
      "question": "Question text?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct": 0,
      "explanation": "One sentence explaining the correct answer."
    }}
  ],
  "flashcards": [
    {{
      "id": 1,
      "term": "Key term or concept",
      "definition": "Clear, concise definition."
    }}
  ]
}}

Rules:
- Exactly 8 multiple-choice questions covering the main topics
- Exactly 8 flashcards for the most important terms/concepts
- Each question has exactly 4 options; correct is 0-based index
- Test understanding, not just memorization
- Keep explanations to 1-2 sentences"""

    api_key = os.environ.get('DEEPSEEK_API_KEY', '')
    if not api_key:
        return jsonify({'error': 'DeepSeek API key not configured'}), 500

    try:
        resp = _req.post(
            'https://api.deepseek.com/v1/chat/completions',
            headers={'Authorization': f'Bearer {api_key}', 'Content-Type': 'application/json'},
            json={'model': 'deepseek-chat', 'messages': [{'role': 'user', 'content': prompt}],
                  'temperature': 0.6, 'max_tokens': 4000},
            timeout=90
        )
        resp.raise_for_status()
        raw = resp.json()['choices'][0]['message']['content'].strip()

        # Strip markdown code fences if DeepSeek wraps the JSON
        if raw.startswith('```'):
            raw = raw.split('```')[1]
            if raw.startswith('json'):
                raw = raw[4:]
            raw = raw.strip()

        assessment = json.loads(raw)
        assessment['job_id']      = job_id
        assessment['generated_at'] = datetime.now().isoformat()

        os.makedirs(job_dir, exist_ok=True)
        with open(assessment_path, 'w', encoding='utf-8') as f:
            json.dump(assessment, f, ensure_ascii=False, indent=2)

        return jsonify(assessment)

    except Exception as e:
        return jsonify({'error': f'Assessment generation failed: {str(e)}'}), 500


@app.route('/api/job/<job_id>/assessment', methods=['GET'])
def get_assessment(job_id):
    """Return saved assessment for a job"""
    path = os.path.join(OUTPUT_FOLDER, 'jobs', job_id, 'assessment.json')
    if not os.path.exists(path):
        return jsonify({'error': 'No assessment found for this job'}), 404
    with open(path, 'r', encoding='utf-8') as f:
        return jsonify(json.load(f))


@app.route('/api/avatars/<filename>', methods=['GET'])
def serve_avatar(filename):
    """Serve avatar images from ppt_to_video/avatars folder"""
    avatar_folder = os.path.join(os.path.dirname(__file__), 'ppt_to_video', 'avatars')
    avatar_path = os.path.join(avatar_folder, filename)

    if not os.path.exists(avatar_path):
        return jsonify({'error': 'Avatar not found'}), 404

    return send_file(avatar_path, mimetype='image/png' if filename.endswith('.png') else 'image/jpeg')


@app.route('/api/hikma-avatars/<path:filename>', methods=['GET'])
def serve_hikma_avatar(filename):
    """Serve Hikma avatar images from static/avatar/hikma avatars/"""
    hikma_folder = os.path.join(os.path.dirname(__file__), 'static', 'avatar', 'hikma avatars')
    avatar_path = os.path.join(hikma_folder, filename)

    if not os.path.exists(avatar_path):
        return jsonify({'error': 'Avatar not found'}), 404

    mimetype = 'image/jpeg' if filename.lower().endswith('.jpg') else 'image/png'
    return send_file(avatar_path, mimetype=mimetype)


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
        {'id': 'gradient', 'name': 'Gradient Flow', 'description': 'Smooth gradients, fluid design, modern aesthetics', 'category': 'modern'},
        {'id': 'dark-neon', 'name': 'Dark Neon', 'description': 'Black background with neon cyan accents, cyberpunk aesthetic', 'category': 'modern'},
        {'id': 'glassmorphism', 'name': 'Glassmorphism', 'description': 'Deep purple gradient with frosted glass card overlays', 'category': 'modern'},
        {'id': 'prestige', 'name': 'Prestige', 'description': 'Deep navy with gold bars, authoritative academic style', 'category': 'elegant'},
        {'id': 'split-bold', 'name': 'Split Bold', 'description': 'Bold left color panel with white content area, editorial impact', 'category': 'creative'},
        {'id': 'blueprint', 'name': 'Blueprint', 'description': 'Technical drafting aesthetic — dark navy grid, cyan crosshairs, monospace precision', 'category': 'modern'},
        {'id': 'aurora', 'name': 'Aurora', 'description': 'Northern-lights gradient layers on deep space-dark background', 'category': 'creative'}
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


# ═══════════════════════════════════════════════════════════════════════════════
# PODCAST GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════

podcast_jobs: dict = {}
podcast_lock = threading.Lock()

# 4 distinct Edge TTS voices per gender per language for multi-speaker assignment
_PODCAST_VOICES = {
    'en': {
        'female': ['en-US-AriaNeural',  'en-US-JennyNeural', 'en-GB-SoniaNeural',   'en-AU-NatashaNeural'],
        'male':   ['en-US-GuyNeural',   'en-GB-RyanNeural',  'en-US-DavisNeural',   'en-AU-WilliamNeural'],
    },
    'ar': {
        'female': ['ar-SA-ZariyahNeural','ar-EG-SalmaNeural','ar-AE-FatimaNeural',  'ar-MA-MounaNeural'],
        'male':   ['ar-SA-HamedNeural',  'ar-EG-ShakirNeural','ar-AE-HamdanNeural', 'ar-MA-JamalNeural'],
    },
    'fr': {
        'female': ['fr-FR-DeniseNeural', 'fr-CA-SylvieNeural','fr-BE-CharlineNeural','fr-CH-ArianeNeural'],
        'male':   ['fr-FR-HenriNeural',  'fr-CA-JeanNeural',  'fr-BE-GerardNeural', 'fr-CH-FabriceNeural'],
    },
    'de': {
        'female': ['de-DE-KatjaNeural',  'de-AT-IngridNeural','de-CH-LeniNeural',   'de-DE-AmalaNeural'],
        'male':   ['de-DE-ConradNeural', 'de-AT-JonasNeural', 'de-CH-JanNeural',    'de-DE-BerndNeural'],
    },
    'es': {
        'female': ['es-ES-ElviraNeural', 'es-MX-DaliaNeural', 'es-AR-ElenaNeural',  'es-CO-SalomeNeural'],
        'male':   ['es-ES-AlvaroNeural', 'es-MX-JorgeNeural', 'es-AR-TomasNeural',  'es-CO-GonzaloNeural'],
    },
    'zh': {
        'female': ['zh-CN-XiaoxiaoNeural','zh-CN-XiaoyiNeural','zh-CN-XiaohanNeural','zh-TW-HsiaoChenNeural'],
        'male':   ['zh-CN-YunxiNeural',  'zh-CN-YunjianNeural','zh-CN-YunfengNeural','zh-TW-YunJheNeural'],
    },
    'it': {
        'female': ['it-IT-ElsaNeural',   'it-IT-IsabellaNeural','it-IT-FiammaNeural','it-IT-PalmiraNeural'],
        'male':   ['it-IT-DiegoNeural',  'it-IT-BenignoNeural','it-IT-CalimeroNeural','it-IT-GianniNeural'],
    },
    'pt': {
        'female': ['pt-BR-FranciscaNeural','pt-PT-RaquelNeural','pt-BR-ThalitaNeural','pt-PT-FernandaNeural'],
        'male':   ['pt-BR-AntonioNeural','pt-PT-DuarteNeural','pt-BR-FabioNeural',  'pt-PT-RobertoNeural'],
    },
    'ru': {
        'female': ['ru-RU-SvetlanaNeural','ru-RU-DariyaNeural','ru-RU-IrinaNeural', 'ru-RU-OlgaNeural'],
        'male':   ['ru-RU-DmitryNeural', 'ru-RU-ErmolaNeural','ru-RU-PavelNeural',  'ru-RU-SergeiNeural'],
    },
    'tr': {
        'female': ['tr-TR-EmelNeural',   'tr-TR-AyseNeural',  'tr-TR-CansuNeural',  'tr-TR-HilalNeural'],
        'male':   ['tr-TR-AhmetNeural',  'tr-TR-BurakNeural', 'tr-TR-OrhanNeural',  'tr-TR-SerdarNeural'],
    },
    'ur': {
        'female': ['ur-PK-UzmaNeural',   'ur-IN-GulNeural',   'ur-PK-UzmaNeural',   'ur-IN-GulNeural'],
        'male':   ['ur-PK-AsadNeural',   'ur-IN-SalmanNeural','ur-PK-AsadNeural',   'ur-IN-SalmanNeural'],
    },
}
# Per-speaker speaking rate variation so same-voice pairs sound distinct
_PODCAST_RATES = ['-8%', '-2%', '+3%', '+8%']


def _update_podcast_job(job_id, machine_status, progress=0, step='', error=''):
    with podcast_lock:
        podcast_jobs[job_id] = {
            'status': machine_status,
            'progress': progress,
            'step': step,
            'error': error,
        }


def _extract_doc_text(file_path):
    """Extract plain text from PDF or DOCX."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.pdf':
        import fitz
        doc = fitz.open(file_path)
        text = ''.join(page.get_text() for page in doc)
        doc.close()
        return text.strip()
    if ext in ('.docx', '.doc'):
        try:
            import docx as _docx
            d = _docx.Document(file_path)
            return '\n'.join(p.text for p in d.paragraphs if p.text.strip())
        except Exception:
            return ''
    return ''


def _build_podcast_prompt(content_chunk, speakers, language, style,
                           turns_target, segment_idx, total_segments, previous_tail=''):
    lang_names = {
        'en': 'English', 'ar': 'Arabic', 'fr': 'French', 'de': 'German',
        'es': 'Spanish', 'zh': 'Chinese', 'it': 'Italian', 'pt': 'Portuguese',
        'ru': 'Russian', 'tr': 'Turkish', 'ur': 'Urdu',
    }
    lang_name = lang_names.get(language, 'English')

    host   = speakers[0]['name']
    guests = [s['name'] for s in speakers[1:]]
    guest_str = ', '.join(guests)

    style_instructions = {
        'casual': (
            "Keep the tone warm, friendly and entertaining. Use everyday language and "
            "natural reactions ('Oh interesting!', 'That actually surprised me...'). "
            "Light humor is welcome."
        ),
        'academic': (
            "Maintain an analytical, thorough tone. Guests elaborate on concepts in depth, "
            "reference specific details from the document, and explore wider implications. "
            "The host asks structured follow-up questions to go deeper."
        ),
        'debate': (
            "Encourage respectful disagreement. Guests challenge each other's interpretations. "
            "The host plays devil's advocate, pushes speakers to defend their views, "
            "and synthesizes competing perspectives at the end of each topic."
        ),
    }.get(style, "Keep the conversation natural and engaging.")

    is_first = segment_idx == 0
    is_last  = segment_idx == total_segments - 1

    if is_first:
        opening_instruction = (
            f"Open the podcast with {host} welcoming the listeners, naming the episode topic "
            f"in one or two sentences, and briefly introducing the guest(s): {guest_str}. "
            f"Then immediately launch into the first question."
        )
    else:
        opening_instruction = (
            f"Continue the podcast naturally — do NOT re-introduce anyone or re-open the episode. "
            f"Start with {host} asking a new question on a new aspect of the topic.\n"
            f"For continuity, the last exchanges were:\n{previous_tail}"
        )

    if is_last:
        closing_instruction = (
            f"End the podcast with {host} summarising the two or three most important takeaways "
            f"from the whole conversation, then thanking the guest(s) and signing off warmly."
        )
    else:
        closing_instruction = (
            f"End this part mid-discussion — no goodbyes, no closings. "
            f"The conversation will continue in the next segment."
        )

    multi_note = (
        f"\nThis is part {segment_idx + 1} of {total_segments}. "
        f"Cover roughly 1/{total_segments} of the document content in this part."
        if total_segments > 1 else ""
    )

    guest_role = (
        f"- {guest_str} are the GUESTS/EXPERTS. They answer the host's questions in depth, "
        f"share insights, and may occasionally build on or respectfully challenge each other."
        if len(guests) > 1 else
        f"- {guest_str} is the GUEST/EXPERT. They answer the host's questions in depth "
        f"and elaborate with concrete examples and detail."
    )

    return (
        f"You are writing a podcast script in {lang_name}.\n\n"
        f"ROLES:\n"
        f"- {host} is the HOST/INTERVIEWER. They ask probing questions, react to answers "
        f"  ('That's a great point — can you say more about…'), and keep the conversation moving.\n"
        f"{guest_role}\n\n"
        f"STYLE: {style_instructions}\n\n"
        f"FORMAT RULES (follow exactly):\n"
        f"- Write ONLY in {lang_name}.\n"
        f"- Every turn: speaker name, colon, their words. One turn per line. Nothing else.\n"
        f"  Correct example:  {host}: [host speaks here]\n"
        f"- Host turns: 1-3 sentences (short questions and reactions).\n"
        f"- Guest turns: 3-5 sentences (detailed, informative answers).\n"
        f"- Speakers may address each other by name for a natural feel.\n"
        f"- Do NOT use markdown, asterisks, headers, or any formatting symbols.\n"
        f"- Write exactly {turns_target} turns total.{multi_note}\n\n"
        f"OPENING: {opening_instruction}\n\n"
        f"CLOSING: {closing_instruction}\n\n"
        f"DOCUMENT CONTENT:\n---\n{content_chunk}\n---\n\n"
        f"Write the podcast script now:"
    )


def _parse_podcast_script(script_text, speaker_names):
    """Parse 'Name: text' lines into list of (name, text) tuples."""
    import re as _re
    turns = []
    escaped = [_re.escape(n) for n in speaker_names]
    pattern = _re.compile(
        r'^(' + '|'.join(escaped) + r')\s*:\s*(.+)',
        _re.IGNORECASE | _re.MULTILINE
    )
    for m in pattern.finditer(script_text):
        name = m.group(1).strip()
        text = m.group(2).strip()
        # Normalize to original casing
        for orig in speaker_names:
            if orig.lower() == name.lower():
                name = orig
                break
        if text:
            turns.append((name, text))
    return turns


def _make_intro_jingle(work_dir):
    """Ascending A-major arpeggio (~2 s) with a warm echo, generated via FFmpeg sine sources."""
    out = os.path.join(work_dir, 'jingle_intro.mp3')
    # Notes: A3 220 Hz → E4 330 → A4 440 → C#5 554 → E5 659, each starting 220 ms after the last
    fc = (
        '[0]afade=t=in:st=0:d=0.03,afade=t=out:st=0.52:d=0.06,'
        'aformat=channel_layouts=stereo,adelay=0|0[n0];'
        '[1]afade=t=in:st=0:d=0.03,afade=t=out:st=0.52:d=0.06,'
        'aformat=channel_layouts=stereo,adelay=220|220[n1];'
        '[2]afade=t=in:st=0:d=0.03,afade=t=out:st=0.52:d=0.06,'
        'aformat=channel_layouts=stereo,adelay=440|440[n2];'
        '[3]afade=t=in:st=0:d=0.03,afade=t=out:st=0.52:d=0.06,'
        'aformat=channel_layouts=stereo,adelay=660|660[n3];'
        '[4]afade=t=in:st=0:d=0.03,afade=t=out:st=1.30:d=0.20,'
        'aformat=channel_layouts=stereo,adelay=880|880[n4];'
        '[n0][n1][n2][n3][n4]amix=inputs=5:normalize=0:duration=longest,'
        'aecho=0.7:0.4:80:0.35,volume=0.28[out]'
    )
    r = subprocess.run([
        'ffmpeg', '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=0.58',
        '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=0.58',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=0.58',
        '-f', 'lavfi', '-i', 'sine=frequency=554:sample_rate=44100:duration=0.58',
        '-f', 'lavfi', '-i', 'sine=frequency=659:sample_rate=44100:duration=1.50',
        '-filter_complex', fc, '-map', '[out]',
        '-c:a', 'libmp3lame', '-q:a', '2', out,
    ], capture_output=True)
    if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    print(f'[PODCAST] Intro jingle failed: {r.stderr[-300:]}')
    return None


def _make_outro_jingle(work_dir):
    """Descending A-major arpeggio (~1.8 s) with a warm fade-to-silence, generated via FFmpeg."""
    out = os.path.join(work_dir, 'jingle_outro.mp3')
    # Notes: E5 659 Hz → C#5 554 → A4 440 → A3 220, last note held and faded out
    fc = (
        '[0]afade=t=in:st=0:d=0.03,afade=t=out:st=0.52:d=0.06,'
        'aformat=channel_layouts=stereo,adelay=0|0[n0];'
        '[1]afade=t=in:st=0:d=0.03,afade=t=out:st=0.52:d=0.06,'
        'aformat=channel_layouts=stereo,adelay=220|220[n1];'
        '[2]afade=t=in:st=0:d=0.03,afade=t=out:st=0.52:d=0.06,'
        'aformat=channel_layouts=stereo,adelay=440|440[n2];'
        '[3]afade=t=in:st=0:d=0.03,afade=t=out:st=1.15:d=0.40,'
        'aformat=channel_layouts=stereo,adelay=660|660[n3];'
        '[n0][n1][n2][n3]amix=inputs=4:normalize=0:duration=longest,'
        'aecho=0.7:0.4:80:0.35,volume=0.28[out]'
    )
    r = subprocess.run([
        'ffmpeg', '-y',
        '-f', 'lavfi', '-i', 'sine=frequency=659:sample_rate=44100:duration=0.58',
        '-f', 'lavfi', '-i', 'sine=frequency=554:sample_rate=44100:duration=0.58',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=0.58',
        '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=1.50',
        '-filter_complex', fc, '-map', '[out]',
        '-c:a', 'libmp3lame', '-q:a', '2', out,
    ], capture_output=True)
    if r.returncode == 0 and os.path.exists(out) and os.path.getsize(out) > 0:
        return out
    print(f'[PODCAST] Outro jingle failed: {r.stderr[-300:]}')
    return None


def _generate_podcast_background(job_id, file_path, language, speakers, style,
                                   duration_minutes, output_dir):
    """Background thread: document → DeepSeek script (multi-segment) → Edge TTS → MP3."""
    try:
        # 1. Extract text
        _update_podcast_job(job_id, 'running', 5, 'Extracting document content…')
        print(f'[PODCAST] Extracting text from {file_path}')
        content = _extract_doc_text(file_path)
        if not content:
            raise ValueError('Could not extract text from document')
        print(f'[PODCAST] {len(content)} chars extracted')

        # 2. Assign voices
        _update_podcast_job(job_id, 'running', 10, 'Assigning voices…')
        voice_pool = _PODCAST_VOICES.get(language, _PODCAST_VOICES['en'])
        fi = mi = 0
        speaker_voice: dict = {}
        for idx, spk in enumerate(speakers):
            rate = _PODCAST_RATES[idx % len(_PODCAST_RATES)]
            gender = spk.get('gender', 'male')
            if gender == 'female':
                voice = voice_pool['female'][fi % len(voice_pool['female'])]
                fi += 1
            else:
                voice = voice_pool['male'][mi % len(voice_pool['male'])]
                mi += 1
            speaker_voice[spk['name']] = (voice, rate)
            print(f"[PODCAST] '{spk['name']}' → {voice}  rate={rate}")

        # 3. Generate script — one DeepSeek call per 20-min segment
        # 20 min ≈ 60 turns; 40 min = 2 × 60; 60 min = 3 × 60
        num_segments   = max(1, duration_minutes // 20)
        turns_per_seg  = 60
        chars_per_seg  = 5000
        speaker_names  = [s['name'] for s in speakers]
        all_turns      = []
        previous_tail  = ''

        import requests as _req
        deepseek_key = os.environ.get('DEEPSEEK_API_KEY', '')

        for seg_idx in range(num_segments):
            seg_label = (
                f'Writing script (part {seg_idx + 1}/{num_segments})…'
                if num_segments > 1 else 'Writing script…'
            )
            seg_pct = 12 + int((seg_idx / num_segments) * 28)
            _update_podcast_job(job_id, 'running', seg_pct, seg_label)
            print(f'[PODCAST] DeepSeek call {seg_idx + 1}/{num_segments}')

            content_chunk = content[seg_idx * chars_per_seg: (seg_idx + 1) * chars_per_seg]

            prompt = _build_podcast_prompt(
                content_chunk, speakers, language, style,
                turns_target=turns_per_seg,
                segment_idx=seg_idx,
                total_segments=num_segments,
                previous_tail=previous_tail,
            )

            resp = _req.post(
                'https://api.deepseek.com/v1/chat/completions',
                headers={
                    'Authorization': f'Bearer {deepseek_key}',
                    'Content-Type': 'application/json',
                },
                json={
                    'model': 'deepseek-chat',
                    'messages': [{'role': 'user', 'content': prompt}],
                    'max_tokens': 4096,
                    'temperature': 0.82,
                },
                timeout=180,
            )
            resp.raise_for_status()
            script_chunk = resp.json()['choices'][0]['message']['content']
            print(f'[PODCAST] Segment {seg_idx + 1}: {len(script_chunk)} chars')

            chunk_turns = _parse_podcast_script(script_chunk, speaker_names)
            print(f'[PODCAST] Segment {seg_idx + 1}: {len(chunk_turns)} turns parsed')

            if chunk_turns:
                tail = chunk_turns[-5:]
                previous_tail = '\n'.join(f"{n}: {t}" for n, t in tail)
                all_turns.extend(chunk_turns)

        if not all_turns:
            raise ValueError('Script generation produced no speaker turns')

        turns = all_turns
        print(f'[PODCAST] Total turns: {len(turns)}')

        # Save transcript before TTS so it survives even if audio assembly fails later
        _update_podcast_job(job_id, 'running', 41, 'Saving transcript…')
        transcript_path = os.path.join(output_dir, 'transcript.txt')
        _lang_labels = {
            'en': 'English', 'ar': 'Arabic', 'fr': 'French', 'de': 'German',
            'es': 'Spanish', 'zh': 'Chinese', 'it': 'Italian', 'pt': 'Portuguese',
            'ru': 'Russian', 'tr': 'Turkish', 'ur': 'Urdu',
        }
        try:
            with open(transcript_path, 'w', encoding='utf-8') as _tf:
                _tf.write('HikmaProf Podcast — Transcript\n')
                _tf.write('=' * 50 + '\n')
                _tf.write(f'Generated : {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}\n')
                _tf.write(f'Language  : {_lang_labels.get(language, language.upper())}\n')
                _tf.write(f'Style     : {style.capitalize()}\n')
                _tf.write(f'Duration  : ~{duration_minutes} min\n')
                _tf.write(f'Speakers  : {", ".join(s["name"] for s in speakers)}\n')
                _tf.write('=' * 50 + '\n\n')
                for _spk, _txt in turns:
                    _tf.write(f'{_spk}: {_txt}\n\n')
            print(f'[PODCAST] Transcript saved → {transcript_path}')
        except Exception as _te:
            print(f'[PODCAST] Transcript save failed (non-fatal): {_te}')

        # 4. TTS per turn
        work_dir = os.path.join(output_dir, 'tmp')
        os.makedirs(work_dir, exist_ok=True)

        import asyncio
        import edge_tts as _edge

        host_name = speakers[0]['name']

        # Three natural pause lengths (seconds) depending on who speaks next:
        # host → guest  : short  (guest eager to answer)
        # guest → host  : long   (host absorbing, formulating next question)
        # guest → guest : medium (natural handoff between co-guests)
        _PAUSE_DURATIONS = {'short': 0.30, 'medium': 0.50, 'long': 0.70}
        silence_clips: dict = {}
        for label, dur in _PAUSE_DURATIONS.items():
            path = os.path.join(work_dir, f'silence_{label}.mp3')
            subprocess.run([
                'ffmpeg', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
                '-t', str(dur), '-c:a', 'libmp3lame', '-q:a', '2', path
            ], capture_output=True)
            silence_clips[label] = path

        def _pick_pause(current_spk, next_spk):
            """Choose pause clip based on speaker transition."""
            if current_spk == host_name:
                return silence_clips['short']
            elif next_spk == host_name:
                return silence_clips['long']
            else:
                return silence_clips['medium']

        audio_clips = []
        n = len(turns)
        fallback_voice = voice_pool['male'][0]

        for i, (spk_name, text) in enumerate(turns):
            pct = 42 + int((i / n) * 46)
            if i % 8 == 0:
                _update_podcast_job(
                    job_id, 'running', pct,
                    f'Synthesising voices… ({i + 1}/{n} turns)'
                )
                print(f'[PODCAST] TTS {i + 1}/{n}: {spk_name}')

            voice_name, rate = speaker_voice.get(spk_name, (fallback_voice, '+0%'))
            raw_path   = os.path.join(work_dir, f'turn_{i:04d}_raw.mp3')
            clip_path  = os.path.join(work_dir, f'turn_{i:04d}.mp3')

            try:
                clean = text.replace('&', 'and').replace('<', '').replace('>', '')

                async def _synth(t=clean, v=voice_name, r=rate, p=raw_path):
                    await _edge.Communicate(t, v, rate=r).save(p)

                loop = asyncio.new_event_loop()
                try:
                    loop.run_until_complete(_synth())
                finally:
                    loop.close()

                if not (os.path.exists(raw_path) and os.path.getsize(raw_path) > 0):
                    continue

                # Apply 60 ms fade-out so there are no hard cuts between speakers.
                # areverse → afade-in → areverse = fade-out without needing clip duration.
                fade_result = subprocess.run([
                    'ffmpeg', '-y', '-i', raw_path,
                    '-af', 'areverse,afade=t=in:st=0:d=0.06,areverse',
                    clip_path,
                ], capture_output=True)

                final_clip = clip_path if (
                    fade_result.returncode == 0
                    and os.path.exists(clip_path)
                    and os.path.getsize(clip_path) > 0
                ) else raw_path

                audio_clips.append(final_clip)

                # Variable pause based on who speaks next
                if i < n - 1:
                    next_spk = turns[i + 1][0]
                    audio_clips.append(_pick_pause(spk_name, next_spk))

            except Exception as _e:
                print(f'[PODCAST] TTS failed turn {i + 1}: {_e}')

        if not audio_clips:
            raise ValueError('No audio clips were generated')

        # 5a. Bookend with intro / outro jingles (fail-safe — podcast works without them)
        _update_podcast_job(job_id, 'running', 89, 'Adding intro/outro…')
        intro_jingle = _make_intro_jingle(work_dir)
        outro_jingle = _make_outro_jingle(work_dir)
        if intro_jingle or outro_jingle:
            bookended = []
            if intro_jingle:
                bookended.append(intro_jingle)
                bookended.append(silence_clips['medium'])  # 500 ms breath before host speaks
            bookended.extend(audio_clips)
            if outro_jingle:
                bookended.append(silence_clips['medium'])  # 500 ms after last word
                bookended.append(outro_jingle)
            audio_clips = bookended

        # 5. Concatenate + EBU R128 loudness normalisation
        _update_podcast_job(job_id, 'running', 90, 'Mixing and mastering audio…')
        print(f'[PODCAST] Concatenating {len(audio_clips)} clips…')
        concat_list = os.path.join(work_dir, 'concat.txt')
        with open(concat_list, 'w', encoding='utf-8') as f:
            for clip in audio_clips:
                f.write(f"file '{os.path.abspath(clip)}'\n")

        final_path = os.path.join(output_dir, 'podcast.mp3')
        result = subprocess.run([
            'ffmpeg', '-y',
            '-f', 'concat', '-safe', '0', '-i', concat_list,
            '-c:a', 'libmp3lame', '-q:a', '2',
            '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
            final_path,
        ], capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            raise Exception(f'FFmpeg failed: {result.stderr[-500:]}')

        print(f'[PODCAST] Done → {final_path}')
        _update_podcast_job(job_id, 'done', 100, 'Podcast ready!')

    except Exception as exc:
        print(f'[PODCAST] ERROR: {exc}')
        import traceback; traceback.print_exc()
        _update_podcast_job(job_id, 'error', 0, '', str(exc))
    finally:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass


@app.route('/api/podcast/generate', methods=['POST'])
def generate_podcast():
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    f = request.files['file']
    if not f.filename:
        return jsonify({'error': 'Empty filename'}), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ('.pdf', '.docx', '.doc'):
        return jsonify({'error': 'Only PDF and DOCX supported'}), 400

    language         = request.form.get('language', 'en')
    num_speakers     = max(2, min(4, int(request.form.get('num_speakers', 2))))
    style            = request.form.get('style', 'casual')
    raw_dur          = int(request.form.get('duration', 20))
    duration_minutes = raw_dur if raw_dur in (20, 40, 60) else 20

    # Accept either a 'speakers' JSON array (from JS) or individual form fields (fallback)
    speakers = []
    speakers_json = request.form.get('speakers', '')
    if speakers_json:
        import json as _json
        try:
            raw = _json.loads(speakers_json)
            for i, item in enumerate(raw[:4], start=1):
                name   = (str(item.get('name', '') or f'Speaker {i}')).strip()
                gender = str(item.get('gender', 'male')).strip().lower()
                if gender not in ('male', 'female'):
                    gender = 'male'
                speakers.append({'name': name, 'gender': gender})
        except Exception:
            speakers = []
    if not speakers:
        for i in range(1, num_speakers + 1):
            name   = (request.form.get(f'speaker_{i}_name', '') or f'Speaker {i}').strip()
            gender = request.form.get(f'speaker_{i}_gender', 'male').strip().lower()
            if gender not in ('male', 'female'):
                gender = 'male'
            speakers.append({'name': name, 'gender': gender})
    if len(speakers) < 2:
        return jsonify({'error': 'At least 2 speakers are required'}), 400

    job_id     = str(uuid.uuid4())
    output_dir = os.path.join(OUTPUT_FOLDER, 'podcasts', job_id)
    os.makedirs(output_dir, exist_ok=True)

    file_path = os.path.join(output_dir, f'source{ext}')
    f.save(file_path)

    _update_podcast_job(job_id, 'running', 0, 'Starting…')
    threading.Thread(
        target=_generate_podcast_background,
        args=(job_id, file_path, language, speakers, style, duration_minutes, output_dir),
        daemon=True
    ).start()

    return jsonify({'job_id': job_id}), 202


@app.route('/api/podcast/<job_id>/status', methods=['GET'])
def podcast_status(job_id):
    job_dir = os.path.join(OUTPUT_FOLDER, 'podcasts', job_id)
    if os.path.exists(os.path.join(job_dir, 'podcast.mp3')):
        has_transcript = os.path.exists(os.path.join(job_dir, 'transcript.txt'))
        return jsonify({
            'status': 'done', 'progress': 100, 'step': 'Podcast ready!',
            'has_transcript': has_transcript,
        })
    with podcast_lock:
        info = podcast_jobs.get(
            job_id,
            {'status': 'not_started', 'progress': 0, 'step': 'Waiting…', 'error': ''}
        )
    return jsonify(info)


@app.route('/api/podcast/<job_id>/download', methods=['GET'])
def podcast_download(job_id):
    path = os.path.join(OUTPUT_FOLDER, 'podcasts', job_id, 'podcast.mp3')
    if not os.path.exists(path):
        return jsonify({'error': 'Podcast not ready'}), 404
    return send_file(path, as_attachment=True, mimetype='audio/mpeg',
                     download_name=f'podcast-{job_id[:8]}.mp3')


@app.route('/api/podcast/<job_id>/transcript', methods=['GET'])
def podcast_transcript(job_id):
    path = os.path.join(OUTPUT_FOLDER, 'podcasts', job_id, 'transcript.txt')
    if not os.path.exists(path):
        return jsonify({'error': 'Transcript not available'}), 404
    return send_file(path, as_attachment=True, mimetype='text/plain; charset=utf-8',
                     download_name=f'transcript-{job_id[:8]}.txt')


# ═══════════════════════════════════════════════════════════════════════════════

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
