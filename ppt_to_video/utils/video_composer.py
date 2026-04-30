import os
import subprocess
import tempfile
import numpy as np
from PIL import Image, ImageDraw
from moviepy.editor import VideoFileClip, ImageClip, CompositeVideoClip, AudioFileClip, concatenate_videoclips

def create_circular_mask(size):
    """
    Create a circular mask for the avatar

    Args:
        size: Tuple of (width, height)

    Returns:
        Numpy array of the mask
    """
    mask = Image.new('L', size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size[0], size[1]), fill=255)
    return np.array(mask) / 255.0

def apply_circular_mask(frame):
    """
    Apply circular mask to a video frame

    Args:
        frame: Video frame as numpy array

    Returns:
        Frame with circular mask applied
    """
    h, w = frame.shape[:2]
    mask = create_circular_mask((w, h))

    if len(frame.shape) == 3:
        mask = np.stack([mask] * 3, axis=2)

    return (frame * mask).astype('uint8')

def compose_video(slide_image, avatar_video, audio_path, output_path,
                 avatar_position='bottom-right', avatar_size=250):
    """
    Compose final video by overlaying avatar on slide with audio

    Args:
        slide_image: Path to slide image
        avatar_video: Path to avatar video
        audio_path: Path to audio file
        output_path: Path to save final video
        avatar_position: Position of avatar ('bottom-right', 'bottom-left', 'top-right', 'top-left')
        avatar_size: Fixed size for avatar (width and height in pixels)

    Returns:
        Path to the composed video
    """
    try:
        audio_clip = AudioFileClip(audio_path)
        duration = audio_clip.duration

        slide_clip = ImageClip(slide_image, duration=duration)

        avatar_clip = VideoFileClip(avatar_video)
        avatar_clip = avatar_clip.set_duration(duration)

        # Fixed circular avatar size
        avatar_width = avatar_size
        avatar_height = avatar_size

        # Resize avatar to fixed size (square for circle)
        avatar_clip = avatar_clip.resize(newsize=(avatar_width, avatar_height))

        # Apply circular mask
        avatar_clip = avatar_clip.fl_image(apply_circular_mask)

        slide_width, slide_height = slide_clip.size
        margin = 20

        if avatar_position == 'bottom-right':
            pos_x = slide_width - avatar_width - margin
            pos_y = slide_height - avatar_height - margin
        elif avatar_position == 'bottom-left':
            pos_x = margin
            pos_y = slide_height - avatar_height - margin
        elif avatar_position == 'top-right':
            pos_x = slide_width - avatar_width - margin
            pos_y = margin
        elif avatar_position == 'top-left':
            pos_x = margin
            pos_y = margin
        else:
            pos_x = slide_width - avatar_width - margin
            pos_y = slide_height - avatar_height - margin

        avatar_clip = avatar_clip.set_position((pos_x, pos_y))

        final_clip = CompositeVideoClip([slide_clip, avatar_clip], size=(slide_width, slide_height))
        final_clip = final_clip.set_audio(audio_clip)
        final_clip = final_clip.set_duration(duration)

        final_clip.write_videofile(
            output_path,
            fps=25,
            codec='libx264',
            audio_codec='aac',
            verbose=False,
            logger=None
        )

        slide_clip.close()
        avatar_clip.close()
        audio_clip.close()
        final_clip.close()

        return output_path

    except Exception as e:
        print(f"MoviePy composition failed: {str(e)}, trying FFmpeg directly...")
        return compose_video_ffmpeg(slide_image, avatar_video, audio_path, output_path,
                                   avatar_position, avatar_size)

def compose_video_ffmpeg(slide_image, avatar_video, audio_path, output_path,
                        avatar_position='bottom-right', avatar_size=250):
    """
    Compose video using FFmpeg directly (fallback method)

    Args:
        slide_image: Path to slide image
        avatar_video: Path to avatar video
        audio_path: Path to audio file
        output_path: Path to save final video
        avatar_position: Position of avatar
        avatar_size: Fixed size for avatar (width and height in pixels)

    Returns:
        Path to the composed video
    """
    try:
        import json
        probe_cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', audio_path]
        result = subprocess.run(probe_cmd, capture_output=True, text=True)
        audio_info = json.loads(result.stdout)
        duration = float(audio_info['streams'][0]['duration'])

        if avatar_position == 'bottom-right':
            overlay_pos = f'main_w-{avatar_size}-20:main_h-{avatar_size}-20'
        elif avatar_position == 'bottom-left':
            overlay_pos = f'20:main_h-{avatar_size}-20'
        elif avatar_position == 'top-right':
            overlay_pos = f'main_w-{avatar_size}-20:20'
        elif avatar_position == 'top-left':
            overlay_pos = '20:20'
        else:
            overlay_pos = f'main_w-{avatar_size}-20:main_h-{avatar_size}-20'

        # Create circular mask using FFmpeg filter
        # Scale to fixed size, then apply circular mask using geq filter
        cmd = [
            'ffmpeg', '-y',
            '-loop', '1', '-t', str(duration), '-i', slide_image,
            '-i', avatar_video,
            '-i', audio_path,
            '-filter_complex',
            f'[1:v]scale={avatar_size}:{avatar_size},format=yuva420p,geq=lum=\'p(X,Y)\':a=\'if(gt(sqrt(pow(X-{avatar_size/2},2)+pow(Y-{avatar_size/2},2)),{avatar_size/2}),0,255)\'[avatar];[0:v][avatar]overlay={overlay_pos}',
            '-map', '0:v',
            '-map', '2:a',
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-pix_fmt', 'yuv420p',
            '-shortest',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            raise Exception(f"FFmpeg composition failed: {result.stderr}")

        return output_path

    except Exception as e:
        raise Exception(f"Video composition failed: {str(e)}")

def concatenate_videos(video_paths, output_path):
    """
    Concatenate multiple videos into one

    Args:
        video_paths: List of video file paths
        output_path: Path to save concatenated video

    Returns:
        Path to the concatenated video
    """
    try:
        clips = [VideoFileClip(video) for video in video_paths]

        final_clip = concatenate_videoclips(clips, method='compose')

        final_clip.write_videofile(
            output_path,
            fps=25,
            codec='libx264',
            audio_codec='aac',
            verbose=False,
            logger=None
        )

        for clip in clips:
            clip.close()
        final_clip.close()

        return output_path

    except Exception as e:
        print(f"MoviePy concatenation failed: {str(e)}, trying FFmpeg...")
        return concatenate_videos_ffmpeg(video_paths, output_path)

def concatenate_videos_ffmpeg(video_paths, output_path):
    """
    Concatenate videos using FFmpeg (fallback method)

    Args:
        video_paths: List of video file paths
        output_path: Path to save concatenated video

    Returns:
        Path to the concatenated video
    """
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            concat_file = f.name
            for video_path in video_paths:
                f.write(f"file '{os.path.abspath(video_path)}'\n")

        cmd = [
            'ffmpeg', '-y',
            '-f', 'concat',
            '-safe', '0',
            '-i', concat_file,
            '-c', 'copy',
            output_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        os.unlink(concat_file)

        if result.returncode != 0:
            raise Exception(f"FFmpeg concatenation failed: {result.stderr}")

        return output_path

    except Exception as e:
        raise Exception(f"Video concatenation failed: {str(e)}")

def remove_background(video_path, output_path):
    """
    Remove background from video using rembg (optional enhancement)

    Args:
        video_path: Path to input video
        output_path: Path to save output video

    Returns:
        Path to the video with background removed
    """
    try:
        from rembg import remove
        import cv2

        cap = cv2.VideoCapture(video_path)
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            output = remove(frame)
            out.write(output)

        cap.release()
        out.release()

        return output_path

    except Exception as e:
        print(f"Background removal failed: {str(e)}")
        return video_path

def get_video_duration(video_path):
    """
    Get duration of video in seconds

    Args:
        video_path: Path to video file

    Returns:
        Duration in seconds
    """
    try:
        clip = VideoFileClip(video_path)
        duration = clip.duration
        clip.close()
        return duration
    except Exception as e:
        try:
            import json
            cmd = ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', video_path]
            result = subprocess.run(cmd, capture_output=True, text=True)
            info = json.loads(result.stdout)
            return float(info['streams'][0]['duration'])
        except:
            raise Exception(f"Could not get video duration: {str(e)}")
