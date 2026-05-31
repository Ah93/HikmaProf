import os
import subprocess
import sys
import cv2
import numpy as np
import json
import hashlib
from pathlib import Path

# Global cache for SadTalker preprocessing results
_sadtalker_cache = {}

def animate_avatar(avatar_image_path, audio_path, output_video_path, method='wav2lip'):
    """
    Animate an avatar image with audio to create a talking avatar video

    Args:
        avatar_image_path: Path to the avatar image
        audio_path: Path to the audio file
        output_video_path: Path to save the output video
        method: Animation method ('wav2lip' or 'sadtalker')

    Returns:
        Path to the generated video
    """
    if not os.path.exists(avatar_image_path):
        raise FileNotFoundError(f"Avatar image not found: {avatar_image_path}")

    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    if method.lower() == 'wav2lip':
        return animate_with_wav2lip(avatar_image_path, audio_path, output_video_path)
    elif method.lower() == 'sadtalker':
        return animate_with_sadtalker(avatar_image_path, audio_path, output_video_path)
    else:
        raise ValueError(f"Unknown animation method: {method}")

def animate_with_wav2lip(face_image, audio_path, output_path):
    """
    Animate avatar using Wav2Lip

    Args:
        face_image: Path to face image
        audio_path: Path to audio file
        output_path: Output video path

    Returns:
        Path to generated video
    """
    try:
        wav2lip_path = os.path.join(os.path.dirname(__file__), '..', 'external', 'Wav2Lip')

        if not os.path.exists(wav2lip_path):
            raise Exception(
                "Wav2Lip not found. Please clone it:\n"
                "git clone https://github.com/Rudrabha/Wav2Lip.git external/Wav2Lip"
            )

        checkpoint_path = os.path.join(wav2lip_path, 'checkpoints', 'wav2lip_gan.pth')

        if not os.path.exists(checkpoint_path):
            raise Exception(
                f"Wav2Lip checkpoint not found at {checkpoint_path}\n"
                "Please download from: https://github.com/Rudrabha/Wav2Lip#getting-the-weights"
            )

        inference_script = os.path.join(wav2lip_path, 'inference.py')

        cmd = [
            sys.executable,
            inference_script,
            '--checkpoint_path', checkpoint_path,
            '--face', face_image,
            '--audio', audio_path,
            '--outfile', output_path,
            '--resize_factor', '1'
        ]

        result = subprocess.run(
            cmd,
            cwd=wav2lip_path,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            raise Exception(f"Wav2Lip failed: {result.stderr}")

        if not os.path.exists(output_path):
            raise Exception(f"Output video was not created at {output_path}")

        return output_path

    except subprocess.TimeoutExpired:
        raise Exception("Wav2Lip processing timed out")
    except Exception as e:
        print(f"Wav2Lip error: {str(e)}")
        return create_static_avatar_video(face_image, audio_path, output_path)

def animate_with_sadtalker(face_image, audio_path, output_path):
    """
    Animate avatar using SadTalker (now processes all slides efficiently)

    Args:
        face_image: Path to face image
        audio_path: Path to audio file
        output_path: Output video path

    Returns:
        Path to generated video
    """
    try:
        sadtalker_path = os.path.join(os.path.dirname(__file__), '..', 'external', 'SadTalker')

        if not os.path.exists(sadtalker_path):
            raise Exception(
                "SadTalker not found. Please clone it:\n"
                "git clone https://github.com/OpenTalker/SadTalker.git external/SadTalker"
            )

        inference_script = os.path.join(sadtalker_path, 'inference.py')

        # Convert all paths to absolute paths (SadTalker runs in its own directory)
        face_image_abs = os.path.abspath(face_image)
        audio_path_abs = os.path.abspath(audio_path)
        output_path_abs = os.path.abspath(output_path)

        # Create output directory if it doesn't exist
        output_dir = os.path.dirname(output_path_abs)
        os.makedirs(output_dir, exist_ok=True)

        # Create a temporary result directory with safe path
        result_dir = os.path.join(output_dir, 'sadtalker_temp')
        os.makedirs(result_dir, exist_ok=True)

        cmd = [
            sys.executable,
            inference_script,
            '--driven_audio', audio_path_abs,
            '--source_image', face_image_abs,
            '--result_dir', result_dir,
            '--still',
            '--preprocess', 'resize'
        ]

        print(f"Running SadTalker for slide...")

        result = subprocess.run(
            cmd,
            cwd=sadtalker_path,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode != 0:
            raise Exception(f"SadTalker failed with return code {result.returncode}: {result.stderr}")

        # Find the generated video in the result directory
        import glob
        import shutil

        video_files = glob.glob(os.path.join(result_dir, '**', '*.mp4'), recursive=True)

        if not video_files:
            raise Exception(f"No video generated by SadTalker in {result_dir}")

        # Use the first (and usually only) generated video
        generated_video = video_files[0]

        # Move the video to the expected output path
        shutil.move(generated_video, output_path_abs)

        # Clean up the temporary result directory
        try:
            shutil.rmtree(result_dir)
        except:
            pass

        if not os.path.exists(output_path_abs):
            raise Exception(f"Failed to move SadTalker output to {output_path_abs}")

        print(f"✓ Avatar animated for slide")
        return output_path

    except subprocess.TimeoutExpired:
        print("SadTalker timeout - falling back to static video")
        return create_static_avatar_video(face_image, audio_path, output_path)
    except Exception as e:
        print(f"SadTalker error: {str(e)}")
        print("Falling back to static avatar video")
        return create_static_avatar_video(face_image, audio_path, output_path)

def animate_avatar_batch(avatar_image_path, audio_paths, output_video_paths, method='sadtalker', parallel=False):
    """
    Batch process multiple slides with the same avatar (OPTIMIZED!)

    This function processes slides efficiently, with optional parallel processing.

    Args:
        avatar_image_path: Path to the avatar image (same for all slides)
        audio_paths: List of audio file paths (one per slide)
        output_video_paths: List of output video paths (one per slide)
        method: Animation method ('wav2lip' or 'sadtalker')
        parallel: Enable parallel processing (uses more GPU memory but faster)

    Returns:
        List of paths to generated videos
    """
    if method.lower() != 'sadtalker':
        # Fallback to individual processing for other methods
        return [animate_avatar(avatar_image_path, audio, output, method)
                for audio, output in zip(audio_paths, output_video_paths)]

    print(f"\n🚀 Batch processing {len(audio_paths)} slides...")

    try:
        sadtalker_path = os.path.join(os.path.dirname(__file__), '..', 'external', 'SadTalker')

        if not os.path.exists(sadtalker_path):
            raise Exception("SadTalker not found")

        import glob
        import shutil
        from concurrent.futures import ThreadPoolExecutor, as_completed
        import time

        start_time = time.time()

        if parallel and len(audio_paths) > 1:
            print(f"  Using parallel processing (2 workers)...")
            # Use ThreadPoolExecutor for I/O-bound subprocess calls
            # Limit to 2 workers to avoid GPU memory issues
            with ThreadPoolExecutor(max_workers=2) as executor:
                futures = {
                    executor.submit(animate_with_sadtalker, avatar_image_path, audio, output): idx
                    for idx, (audio, output) in enumerate(zip(audio_paths, output_video_paths))
                }

                results = [None] * len(audio_paths)
                for future in as_completed(futures):
                    idx = futures[future]
                    try:
                        result = future.result()
                        results[idx] = result
                        print(f"  ✓ Slide {idx + 1}/{len(audio_paths)} complete")
                    except Exception as e:
                        print(f"  ✗ Slide {idx + 1} failed: {str(e)}")
                        results[idx] = create_static_avatar_video(
                            avatar_image_path,
                            audio_paths[idx],
                            output_video_paths[idx]
                        )
        else:
            # Sequential processing
            results = []
            for idx, (audio_path, output_path) in enumerate(zip(audio_paths, output_video_paths)):
                print(f"  Processing slide {idx + 1}/{len(audio_paths)}...")
                result = animate_with_sadtalker(avatar_image_path, audio_path, output_path)
                results.append(result)

        elapsed = time.time() - start_time
        print(f"✓ Batch processing complete in {elapsed:.1f}s ({elapsed/len(audio_paths):.1f}s per slide)\n")
        return results

    except Exception as e:
        print(f"Batch processing error: {str(e)}")
        print("Falling back to individual processing...")
        return [animate_avatar(avatar_image_path, audio, output, method)
                for audio, output in zip(audio_paths, output_video_paths)]

def create_static_avatar_video(image_path, audio_path, output_path, fps=25):
    """
    Create a static video from an image and audio (fallback method)

    Args:
        image_path: Path to the image
        audio_path: Path to the audio
        output_path: Output video path
        fps: Frames per second

    Returns:
        Path to the generated video
    """
    try:
        import subprocess
        from moviepy.editor import ImageClip, AudioFileClip

        audio_clip = AudioFileClip(audio_path)
        duration = audio_clip.duration

        image_clip = ImageClip(image_path, duration=duration)
        image_clip = image_clip.set_audio(audio_clip)
        image_clip = image_clip.set_fps(fps)

        image_clip.write_videofile(
            output_path,
            codec='libx264',
            audio_codec='aac',
            fps=fps,
            verbose=False,
            logger=None
        )

        audio_clip.close()
        image_clip.close()

        return output_path

    except Exception as e:
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1',
            '-i', image_path,
            '-i', audio_path,
            '-c:v', 'libx264',
            '-tune', 'stillimage',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-pix_fmt', 'yuv420p',
            '-shortest',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(f"FFmpeg failed: {result.stderr}")

        return output_path

def extract_face_region(image_path):
    """
    Extract face region from image using OpenCV

    Args:
        image_path: Path to image

    Returns:
        Cropped face image as numpy array
    """
    try:
        face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

        img = cv2.imread(image_path)
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        faces = face_cascade.detectMultiScale(gray, 1.1, 4)

        if len(faces) > 0:
            x, y, w, h = faces[0]
            padding = int(w * 0.2)
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(img.shape[1] - x, w + 2 * padding)
            h = min(img.shape[0] - y, h + 2 * padding)

            face_img = img[y:y+h, x:x+w]
            return face_img

        return img

    except Exception as e:
        print(f"Face detection error: {str(e)}")
        return cv2.imread(image_path)
