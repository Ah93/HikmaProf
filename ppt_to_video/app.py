import os
import uuid
from flask import Flask, render_template, request, jsonify, send_file, url_for
from werkzeug.utils import secure_filename
from config import Config
from utils.pdf_converter import convert_pdf_to_images
from utils.tts_engine import generate_speech, get_speakers_for_model, generate_voice_preview
from utils.avatar_animator import animate_avatar, animate_avatar_batch
from utils.video_composer import compose_video, concatenate_videos
import json

app = Flask(__name__)
app.config.from_object(Config)

def allowed_file(filename, file_type='all'):
    if '.' not in filename:
        return False
    ext = filename.rsplit('.', 1)[1].lower()

    if file_type == 'presentation':
        return ext in {'pdf', 'ppt', 'pptx'}
    elif file_type == 'avatar':
        return ext in {'png', 'jpg', 'jpeg'}
    elif file_type == 'transcript':
        return ext in {'txt', 'json'}
    else:
        return ext in app.config['ALLOWED_EXTENSIONS']

@app.route('/')
def index():
    return render_template('index.html',
                         avatars=app.config['PREDEFINED_AVATARS'],
                         voices=app.config['PREDEFINED_VOICES'])

@app.route('/upload', methods=['POST'])
def upload_files():
    try:
        if 'presentation' not in request.files:
            return jsonify({'error': 'No presentation file provided'}), 400

        if 'transcript' not in request.form and 'transcript_file' not in request.files:
            return jsonify({'error': 'No transcript provided'}), 400

        session_id = str(uuid.uuid4())
        session_folder = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
        os.makedirs(session_folder, exist_ok=True)

        presentation_file = request.files['presentation']
        if presentation_file and allowed_file(presentation_file.filename, 'presentation'):
            filename = secure_filename(presentation_file.filename)
            presentation_path = os.path.join(session_folder, filename)
            presentation_file.save(presentation_path)
        else:
            return jsonify({'error': 'Invalid presentation file'}), 400

        if 'transcript_file' in request.files and request.files['transcript_file'].filename:
            transcript_file = request.files['transcript_file']
            if allowed_file(transcript_file.filename, 'transcript'):
                transcript_filename = secure_filename(transcript_file.filename)
                transcript_path = os.path.join(session_folder, transcript_filename)
                transcript_file.save(transcript_path)

                with open(transcript_path, 'r') as f:
                    if transcript_filename.endswith('.json'):
                        transcript_data = json.load(f)
                    else:
                        transcript_data = f.read()
            else:
                return jsonify({'error': 'Invalid transcript file'}), 400
        else:
            transcript_data = request.form.get('transcript', '')

        avatar_choice = request.form.get('avatar_choice')
        custom_avatar = None

        if avatar_choice == 'custom' and 'custom_avatar' in request.files:
            custom_avatar_file = request.files['custom_avatar']
            if custom_avatar_file and allowed_file(custom_avatar_file.filename, 'avatar'):
                avatar_filename = secure_filename(custom_avatar_file.filename)
                custom_avatar = os.path.join(session_folder, avatar_filename)
                custom_avatar_file.save(custom_avatar)
            else:
                return jsonify({'error': 'Invalid avatar image'}), 400
        elif avatar_choice and avatar_choice != 'custom':
            custom_avatar = os.path.join(app.config['AVATAR_FOLDER'], avatar_choice)

        voice_choice = request.form.get('voice_choice', app.config['TTS_MODEL'])
        speaker_choice = request.form.get('speaker_choice', None)

        voice_clone_audio = None
        if 'voice_clone_audio' in request.files and request.files['voice_clone_audio'].filename:
            voice_file = request.files['voice_clone_audio']
            voice_filename = secure_filename(voice_file.filename)
            voice_clone_audio = os.path.join(session_folder, voice_filename)
            voice_file.save(voice_clone_audio)

        session_data = {
            'session_id': session_id,
            'presentation_path': presentation_path,
            'transcript': transcript_data,
            'avatar_path': custom_avatar,
            'voice_choice': voice_choice,
            'speaker_choice': speaker_choice,
            'voice_clone_audio': voice_clone_audio
        }

        with open(os.path.join(session_folder, 'session_info.json'), 'w') as f:
            json.dump(session_data, f)

        return jsonify({
            'success': True,
            'session_id': session_id,
            'message': 'Files uploaded successfully'
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/process/<session_id>', methods=['POST'])
def process_video(session_id):
    try:
        session_folder = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
        session_info_path = os.path.join(session_folder, 'session_info.json')

        if not os.path.exists(session_info_path):
            return jsonify({'error': 'Session not found'}), 404

        with open(session_info_path, 'r') as f:
            session_data = json.load(f)

        slides_folder = os.path.join(app.config['SLIDES_OUTPUT'], session_id)
        audio_folder = os.path.join(app.config['AUDIO_OUTPUT'], session_id)
        avatar_video_folder = os.path.join(app.config['AVATAR_VIDEO_OUTPUT'], session_id)
        final_folder = os.path.join(app.config['FINAL_OUTPUT'], session_id)

        os.makedirs(slides_folder, exist_ok=True)
        os.makedirs(audio_folder, exist_ok=True)
        os.makedirs(avatar_video_folder, exist_ok=True)
        os.makedirs(final_folder, exist_ok=True)

        slide_images = convert_pdf_to_images(
            session_data['presentation_path'],
            slides_folder
        )

        transcript = session_data['transcript']
        if isinstance(transcript, str):
            num_slides = len(slide_images)

            # Clean and split transcript
            import re

            # Split by "---" markers (slide separators)
            slide_blocks = re.split(r'\n---+\n', transcript.strip())

            cleaned_parts = []
            for block in slide_blocks:
                block = block.strip()
                if not block:
                    continue

                # Remove slide header (## Slide 10 – Confusion Matrix Analysis)
                # This removes the entire first line that starts with ## Slide
                lines = block.split('\n')
                content_lines = []

                for i, line in enumerate(lines):
                    # Skip the header line that matches: ## Slide [number] – [title]
                    if i == 0 and re.match(r'^\#+\s*Slide\s+\d+\s*[–\-—]+\s*.+', line, flags=re.IGNORECASE):
                        continue
                    # Also skip other slide marker formats
                    elif re.match(r'^(Slide|slide)\s+\d+\s*[:\-–—]', line):
                        continue
                    else:
                        content_lines.append(line)

                # Join the content lines
                content = '\n'.join(content_lines).strip()

                # Remove any remaining markdown headers at the start
                content = re.sub(r'^\#+\s*', '', content)

                # Clean up extra whitespace but preserve paragraph breaks
                content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)

                if content and len(content) > 5:
                    cleaned_parts.append(content)

            # If we didn't get enough parts with --- splitting, try alternative methods
            if len(cleaned_parts) < num_slides:
                # Try splitting by ## Slide markers
                slide_blocks = re.split(r'\n(?=\#+\s*Slide\s+\d+)', transcript)

                cleaned_parts = []
                for block in slide_blocks:
                    block = block.strip()
                    if not block:
                        continue

                    # Remove slide header
                    lines = block.split('\n')
                    content_lines = []

                    for i, line in enumerate(lines):
                        if i == 0 and re.match(r'^\#+\s*Slide\s+\d+', line, flags=re.IGNORECASE):
                            continue
                        else:
                            content_lines.append(line)

                    content = '\n'.join(content_lines).strip()
                    content = re.sub(r'^\#+\s*', '', content)
                    content = re.sub(r'\n\s*\n\s*\n+', '\n\n', content)

                    if content and len(content) > 5:
                        cleaned_parts.append(content)

            # If still not enough, try double newline splitting
            if len(cleaned_parts) < num_slides:
                slide_blocks = re.split(r'\n\n+', transcript)
                cleaned_parts = []

                for block in slide_blocks:
                    block = block.strip()
                    # Remove any slide markers
                    block = re.sub(r'^#+\s*Slide\s+\d+[^\n]*\n', '', block, flags=re.IGNORECASE)
                    block = re.sub(r'^(Slide|slide)\s+\d+[^\n]*\n', '', block)

                    if block and len(block) > 5:
                        cleaned_parts.append(block)

            # Match to number of slides
            if len(cleaned_parts) >= num_slides:
                transcript = cleaned_parts[:num_slides]
            elif len(cleaned_parts) > 0:
                # If we have some parts but not enough, distribute remaining slides
                transcript = cleaned_parts
                # Pad with placeholder text
                while len(transcript) < num_slides:
                    transcript.append("This slide continues the presentation.")
            else:
                # Last resort: split all text evenly
                all_text = transcript
                words = all_text.split()
                words_per_slide = max(10, len(words) // num_slides)
                transcript = [
                    ' '.join(words[i*words_per_slide:(i+1)*words_per_slide])
                    for i in range(num_slides)
                ]

        audio_files = []
        for idx, text in enumerate(transcript):
            if isinstance(text, dict):
                text = text.get('text', '')

            # Skip empty text
            if not text or len(text.strip()) < 5:
                text = "This slide has no narration."

            audio_path = os.path.join(audio_folder, f'slide_{idx}.wav')
            generate_speech(
                text,
                audio_path,
                model_name=session_data['voice_choice'],
                speaker_wav=session_data.get('voice_clone_audio'),
                speaker_idx=session_data.get('speaker_choice')
            )
            audio_files.append(audio_path)

        avatar_path = session_data.get('avatar_path')
        if not avatar_path or not os.path.exists(avatar_path):
            avatar_path = os.path.join(app.config['AVATAR_FOLDER'], app.config['PREDEFINED_AVATARS'][0])

        # Prepare all avatar video paths
        avatar_video_paths = [os.path.join(avatar_video_folder, f'avatar_{idx}.mp4')
                            for idx in range(len(slide_images))]

        # OPTIMIZED: Batch process all avatars at once (face detection done only ONCE!)
        print(f"\n🚀 Batch animating {len(audio_files)} slides with same avatar...")
        animate_avatar_batch(
            avatar_path,
            audio_files,
            avatar_video_paths,
            method=app.config['AVATAR_ANIMATION_METHOD'],
            parallel=app.config.get('PARALLEL_AVATAR_PROCESSING', False)
        )

        # Compose each slide with its animated avatar
        slide_videos = []
        for idx, (slide_img, avatar_video_path, audio_file) in enumerate(zip(slide_images, avatar_video_paths, audio_files)):
            print(f"Composing slide {idx + 1}/{len(slide_images)}...")
            final_slide_video = os.path.join(avatar_video_folder, f'slide_{idx}_final.mp4')
            compose_video(
                slide_img,
                avatar_video_path,
                audio_file,
                final_slide_video,
                avatar_position=app.config.get('AVATAR_POSITION', 'bottom-right'),
                avatar_size=app.config.get('AVATAR_SIZE', 250)
            )
            slide_videos.append(final_slide_video)

        final_video_path = os.path.join(final_folder, 'presentation.mp4')
        concatenate_videos(slide_videos, final_video_path)

        return jsonify({
            'success': True,
            'video_url': url_for('download_video', session_id=session_id),
            'message': 'Video generated successfully'
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/download/<session_id>')
def download_video(session_id):
    try:
        video_path = os.path.join(app.config['FINAL_OUTPUT'], session_id, 'presentation.mp4')
        if os.path.exists(video_path):
            return send_file(video_path, as_attachment=True, download_name='presentation.mp4')
        else:
            return jsonify({'error': 'Video not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/status/<session_id>')
def get_status(session_id):
    session_folder = os.path.join(app.config['UPLOAD_FOLDER'], session_id)
    if os.path.exists(session_folder):
        return jsonify({'status': 'processing'})
    else:
        return jsonify({'status': 'not_found'}), 404

@app.route('/avatars/<filename>')
def serve_avatar(filename):
    """Serve avatar images"""
    from flask import send_from_directory
    return send_from_directory(app.config['AVATAR_FOLDER'], filename)

@app.route('/api/speakers/<path:model_name>')
def get_speakers(model_name):
    """Get available speakers for a TTS model"""
    try:
        speakers = get_speakers_for_model(model_name)
        return jsonify({'speakers': speakers})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/voice-preview/<path:model_name>/<speaker_id>')
def get_voice_preview(model_name, speaker_id):
    """Generate and serve voice preview audio"""
    try:
        preview_dir = os.path.join(app.config['OUTPUT_FOLDER'], 'voice_previews')
        preview_path = generate_voice_preview(model_name, speaker_id, preview_dir)

        if preview_path and os.path.exists(preview_path):
            from flask import send_from_directory
            return send_from_directory(
                os.path.dirname(preview_path),
                os.path.basename(preview_path),
                mimetype='audio/wav'
            )
        else:
            return jsonify({'error': 'Preview generation failed'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    os.makedirs(app.config['OUTPUT_FOLDER'], exist_ok=True)
    os.makedirs(app.config['AVATAR_FOLDER'], exist_ok=True)

    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', '-p', type=int, default=5000)
    args = parser.parse_args()
    app.run(debug=True, host='0.0.0.0', port=args.port)
