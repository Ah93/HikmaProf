import os
import subprocess
import tempfile
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from moviepy.editor import VideoFileClip, ImageClip, CompositeVideoClip, AudioFileClip, concatenate_videoclips

# Pillow 10+ removed ANTIALIAS; MoviePy still references it — patch it back.
if not hasattr(Image, 'ANTIALIAS'):
    Image.ANTIALIAS = Image.LANCZOS

# Display names for each avatar, keyed by video filename (no extension).
_AVATAR_DISPLAY_NAMES = {
    'Arab Gulf Old Male':   'Khalid Al-Rashidi',
    'Young Arab Gulf Male': 'Zayed Al-Mansoori',
    'Professional Female':  'Sophie Laurent',
    'Middle-aged Female':   'Ji-Yeon Park',
    'Business Male':        'James Harrington',
    'Young Casual Male':    'Ryan Carter',
}

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

def _apply_border_circle(frame, border_px, border_color=(255, 255, 255)):
    """
    Per-frame transform: shrinks the frame to leave room for a white ring,
    pastes it on a white circle background.
    The outer circular mask (set_mask) then cuts the whole thing to a circle,
    producing: [white ring edge → avatar circle in centre].
    """
    total = frame.shape[0]          # square — width == height
    inner = total - border_px * 2

    pil_inner = Image.fromarray(frame.astype('uint8')).resize(
        (inner, inner), Image.LANCZOS
    )

    # White background the full size
    canvas = Image.new('RGB', (total, total), border_color)

    # Circular crop mask for the inner avatar
    inner_mask = Image.new('L', (inner, inner), 0)
    ImageDraw.Draw(inner_mask).ellipse((0, 0, inner - 1, inner - 1), fill=255)

    canvas.paste(pil_inner, (border_px, border_px), mask=inner_mask)
    return np.array(canvas)


def _make_panel_bg(panel_w, panel_h):
    """Deep navy vertical gradient for the side panel background."""
    t = np.linspace(0, 1, panel_h)[:, np.newaxis]
    top = np.array([8,  14,  35], dtype=np.float32)
    bot = np.array([18, 30,  62], dtype=np.float32)
    gradient = (top + t * (bot - top)).astype(np.uint8)   # shape (panel_h, 3)
    # tile across width:  (panel_h, 3) → (panel_h, 1, 3) → (panel_h, panel_w, 3)
    return np.tile(gradient[:, np.newaxis, :], (1, panel_w, 1))


def _draw_panel_overlay(panel_w, panel_h, av_cx, av_cy, av_r):
    """RGBA overlay: glow, decorative rings, accent pill, dot grid."""
    overlay = Image.new('RGBA', (panel_w, panel_h), (0, 0, 0, 0))

    # ── Soft radial glow behind avatar ──────────────────────────
    glow_r  = int(av_r * 1.55)
    glow_cv = Image.new('RGBA', (panel_w, panel_h), (0, 0, 0, 0))
    ImageDraw.Draw(glow_cv).ellipse(
        (av_cx - glow_r, av_cy - glow_r, av_cx + glow_r, av_cy + glow_r),
        fill=(90, 65, 230, 145)
    )
    glow_cv = glow_cv.filter(ImageFilter.GaussianBlur(radius=int(av_r * 0.65)))
    overlay = Image.alpha_composite(overlay, glow_cv)
    draw = ImageDraw.Draw(overlay)

    # ── Concentric decorative rings ──────────────────────────────
    for extra, alpha, width in [(av_r + 26, 38, 1), (av_r + 50, 22, 1), (av_r + 74, 12, 1)]:
        draw.ellipse(
            (av_cx - extra, av_cy - extra, av_cx + extra, av_cy + extra),
            outline=(150, 120, 255, alpha), width=width
        )

    # ── Top center accent pill ───────────────────────────────────
    pill_w = int(panel_w * 0.38)
    pill_x = (panel_w - pill_w) // 2
    draw.rounded_rectangle((pill_x, 22, pill_x + pill_w, 25), radius=2,
                            fill=(140, 110, 255, 110))

    # ── Dot grid (bottom area, fading out) ──────────────────────
    dot_top  = int(panel_h * 0.68)
    cols, rows = 4, 5
    h_gap  = panel_w // (cols + 1)
    v_gap  = int(panel_h * 0.055)
    for r in range(rows):
        for c in range(cols):
            dx = (c + 1) * h_gap
            dy = dot_top + r * v_gap
            if dy < panel_h - 16:
                alpha = max(0, 58 - r * 13)
                draw.ellipse((dx - 2, dy - 2, dx + 2, dy + 2),
                             fill=(170, 150, 255, alpha))

    # ── Bottom vignette (fade to black at bottom edge) ───────────
    for y in range(int(panel_h * 0.82), panel_h):
        t_v = (y - panel_h * 0.82) / (panel_h * 0.18)
        draw.line([(0, y), (panel_w, y)], fill=(0, 0, 0, int(t_v * 90)))

    return np.array(overlay)


def _compose_side_panel(slide_image, audio_path, output_path, avatar_video, side='side-left'):
    """
    Side-panel layout: a styled vertical strip holds the avatar on the
    left (or right), the slide fills the remaining area.

    Design details:
      - 22 % panel  |  78 % slide content
      - Panel: deep navy gradient, purple glow behind avatar, decorative
               concentric rings, dot grid, top accent pill, gradient separator
      - Slide: scaled to fit content width (aspect-ratio preserved),
               letterbox strips filled with matching dark navy
      - Avatar: 68 % of panel width, white circular border, 0.5 s fade-in
    """
    from moviepy.editor import VideoFileClip, ImageClip, CompositeVideoClip, AudioFileClip

    audio_clip = AudioFileClip(audio_path)
    duration   = audio_clip.duration
    fade_dur   = min(0.5, duration * 0.15)

    # ── Canvas dimensions ────────────────────────────────────────
    slide_pil             = Image.open(slide_image).convert('RGB')
    total_w, total_h      = slide_pil.size
    panel_w               = int(total_w * 0.22)
    content_w             = total_w - panel_w

    # Scale slide to fit content_w maintaining 16:9 aspect ratio
    scaled_h   = int(total_h * content_w / total_w)
    y_offset   = (total_h - scaled_h) // 2          # letterbox strip height

    # ── Content-area background (dark navy, matches panel) ───────
    bg_np  = np.full((total_h, content_w, 3), [8, 14, 35], dtype=np.uint8)

    # ── Panel background + overlay composite ────────────────────
    avatar_size  = int(panel_w * 0.68)
    border_px    = max(5, int(avatar_size * 0.04))
    av_r         = avatar_size // 2
    av_cx        = panel_w // 2
    av_cy        = int(total_h * 0.38)               # avatar center Y in panel

    panel_bg_np  = _make_panel_bg(panel_w, total_h)
    overlay_rgba = _draw_panel_overlay(panel_w, total_h, av_cx, av_cy, av_r)

    panel_pil    = Image.fromarray(panel_bg_np).convert('RGBA')
    overlay_pil  = Image.fromarray(overlay_rgba, 'RGBA')
    panel_rgba   = Image.alpha_composite(panel_pil, overlay_pil)  # keep RGBA for name card

    # ── Presenter name card ──────────────────────────────────────────
    avatar_key   = os.path.splitext(os.path.basename(avatar_video))[0]
    display_name = _AVATAR_DISPLAY_NAMES.get(avatar_key, avatar_key)

    from PIL import ImageFont
    name_font_size = max(13, int(av_r * 0.21))
    for font_path in ("C:/Windows/Fonts/calibrib.ttf", "C:/Windows/Fonts/arialbd.ttf",
                      "C:/Windows/Fonts/arial.ttf", "arial.ttf"):
        try:
            name_font = ImageFont.truetype(font_path, name_font_size)
            break
        except Exception:
            name_font = ImageFont.load_default()

    draw_nc = ImageDraw.Draw(panel_rgba)
    # Measure text
    bbox   = draw_nc.textbbox((0, 0), display_name, font=name_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

    pad_x  = int(av_r * 0.22)
    pad_y  = int(av_r * 0.10)
    pill_w = tw + pad_x * 2
    pill_h = th + pad_y * 2
    pill_x = (panel_w - pill_w) // 2
    pill_y = av_cy + av_r + max(10, int(av_r * 0.14))

    # Thin accent bar above pill
    bar_half = int(av_r * 0.30)
    bar_y    = pill_y - max(7, int(av_r * 0.07))
    bar_h    = max(2, int(av_r * 0.026))
    draw_nc.rounded_rectangle(
        [panel_w // 2 - bar_half, bar_y, panel_w // 2 + bar_half, bar_y + bar_h],
        radius=bar_h, fill=(160, 110, 255, 210))

    # Pill background
    draw_nc.rounded_rectangle(
        [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
        radius=pill_h // 2, fill=(22, 14, 58, 210))

    # Pill border (subtle purple glow)
    draw_nc.rounded_rectangle(
        [pill_x, pill_y, pill_x + pill_w, pill_y + pill_h],
        radius=pill_h // 2, outline=(130, 80, 240, 140), width=1)

    # Name text
    draw_nc.text(
        (pill_x + pad_x - bbox[0], pill_y + pad_y - bbox[1]),
        display_name, fill=(225, 215, 255, 255), font=name_font)

    panel_final = panel_rgba.convert('RGB')
    panel_np    = np.array(panel_final)

    # ── Gradient separator (3 px, purple → blue top → bottom) ───
    sep_np = np.zeros((total_h, 3, 3), dtype=np.uint8)
    t_sep  = np.linspace(0, 1, total_h)
    sep_np[:, :, 0] = np.clip(99  - t_sep * 39, 0, 255).astype(np.uint8)[:, None]
    sep_np[:, :, 1] = np.clip(60  + t_sep * 70, 0, 255).astype(np.uint8)[:, None]
    sep_np[:, :, 2] = np.clip(220 + t_sep * 35, 0, 255).astype(np.uint8)[:, None]

    # ── Slide edge drop-shadow (dark navy fade on the panel-side edge) ──
    shadow_w   = max(40, int(content_w * 0.04))
    t_shd      = np.linspace(1, 0, shadow_w)           # 1 (opaque) → 0 (transparent)
    shd_alpha  = (185 * (t_shd ** 1.6)).astype(np.uint8)  # (shadow_w,)
    shadow_rgb_np  = np.zeros((total_h, shadow_w, 3), dtype=np.uint8)
    shadow_rgb_np[:] = [4, 8, 22]
    shadow_mask_np = np.tile(shd_alpha[np.newaxis, :] / 255.0, (total_h, 1))

    # ── MoviePy clips ────────────────────────────────────────────
    bg_clip     = ImageClip(bg_np,       duration=duration)
    panel_clip  = ImageClip(panel_np,    duration=duration).fadein(fade_dur * 0.6)
    sep_clip    = ImageClip(sep_np,      duration=duration)
    shadow_clip = ImageClip(shadow_rgb_np, duration=duration).set_mask(
                      ImageClip(shadow_mask_np, ismask=True, duration=duration))
    slide_clip  = ImageClip(slide_image, duration=duration).resize(width=content_w)

    # ── Avatar clip ──────────────────────────────────────────────
    src      = VideoFileClip(avatar_video, audio=False)
    av_clip  = src.loop(duration=duration) if src.duration < duration else src.subclip(0, duration)
    av_clip  = av_clip.resize(newsize=(avatar_size, avatar_size))
    av_clip  = av_clip.fl_image(lambda f, b=border_px: _apply_border_circle(f, b))
    mask_arr = create_circular_mask((avatar_size, avatar_size))
    av_clip  = av_clip.set_mask(ImageClip(mask_arr, ismask=True, duration=duration))

    # ── Absolute positions ───────────────────────────────────────
    av_x_panel = (panel_w - avatar_size) // 2        # centered in panel
    av_y_abs   = av_cy - av_r                         # top-left of avatar square

    if side == 'side-left':
        panel_pos   = (0,            0)
        bg_pos      = (panel_w,      0)
        slide_pos   = (panel_w,      y_offset)
        sep_pos     = (panel_w - 2,  0)
        shadow_pos  = (panel_w,      0)               # shadow on left edge of content
        av_pos      = (av_x_panel,   av_y_abs)
    else:                                             # side-right
        panel_pos   = (content_w,              0)
        bg_pos      = (0,                      0)
        slide_pos   = (0,                      y_offset)
        sep_pos     = (content_w - 1,          0)
        shadow_pos  = (content_w - shadow_w,   0)    # shadow on right edge of content
        av_pos      = (content_w + av_x_panel, av_y_abs)

    bg_clip     = bg_clip.set_position(bg_pos)
    slide_clip  = slide_clip.set_position(slide_pos)
    panel_clip  = panel_clip.set_position(panel_pos)
    sep_clip    = sep_clip.set_position(sep_pos)
    shadow_clip = shadow_clip.set_position(shadow_pos)
    av_clip     = av_clip.set_position(av_pos).fadein(fade_dur)

    final_clip = CompositeVideoClip(
        [bg_clip, slide_clip, shadow_clip, panel_clip, sep_clip, av_clip],
        size=(total_w, total_h)
    )
    final_clip = final_clip.set_audio(audio_clip).set_duration(duration)
    final_clip.write_videofile(output_path, fps=25, codec='libx264',
                               audio_codec='aac', verbose=False, logger=None)
    audio_clip.close()
    final_clip.close()
    return output_path


def compose_slide_video(slide_image, audio_path, output_path,
                        avatar_video=None, avatar_position='side-left'):
    """
    Compose a slide video with optional pre-built avatar overlay.

    Avatar is placed bottom-left at 19% of slide height with:
      - white circular border ring
      - blurred drop shadow
      - semi-transparent dark rounded panel behind the avatar
      - 0.4 s fade-in on all overlay elements
    The avatar video is looped (muted) — only TTS audio is used.
    """
    # ── Route side-panel layout ──────────────────────────────────
    print(f"[COMPOSE] avatar_position={avatar_position!r}  avatar_video={avatar_video!r}")
    if avatar_video and os.path.exists(avatar_video) and avatar_position in ('side-left', 'side-right'):
        print("[COMPOSE] routing to _compose_side_panel")
        try:
            return _compose_side_panel(slide_image, audio_path, output_path,
                                       avatar_video, avatar_position)
        except Exception as e:
            import traceback
            print(f"[COMPOSE] Side panel FAILED: {e}")
            traceback.print_exc()
            print("[COMPOSE] falling back to corner overlay...")

    try:
        from moviepy.editor import VideoFileClip, ImageClip, CompositeVideoClip, AudioFileClip

        audio_clip = AudioFileClip(audio_path)
        duration   = audio_clip.duration

        slide_clip = ImageClip(slide_image, duration=duration)
        slide_width, slide_height = slide_clip.size

        if avatar_video and os.path.exists(avatar_video):
            avatar_size = int(slide_height * 0.19)
            border_px   = max(6, int(avatar_size * 0.04))
            fade_dur    = min(0.4, duration * 0.15)

            # ── Load & prepare avatar clip ─────────────────────────────
            avatar_source = VideoFileClip(avatar_video, audio=False)
            avatar_clip   = (avatar_source.loop(duration=duration)
                             if avatar_source.duration < duration
                             else avatar_source.subclip(0, duration))
            avatar_clip = avatar_clip.resize(newsize=(avatar_size, avatar_size))
            avatar_clip = avatar_clip.fl_image(
                lambda f, b=border_px: _apply_border_circle(f, b)
            )
            mask_arr    = create_circular_mask((avatar_size, avatar_size))
            mask_clip   = ImageClip(mask_arr, ismask=True, duration=duration)
            avatar_clip = avatar_clip.set_mask(mask_clip)

            # ── Avatar position ────────────────────────────────────────
            margin_x = int(slide_width  * 0.025)
            margin_y = int(slide_height * 0.025)
            if avatar_position in ('bottom-left', 'side-left'):
                av_x = margin_x
                av_y = slide_height - avatar_size - margin_y
            elif avatar_position in ('bottom-right', 'side-right'):
                av_x = slide_width - avatar_size - margin_x
                av_y = slide_height - avatar_size - margin_y
            elif avatar_position == 'top-left':
                av_x, av_y = margin_x, margin_y
            else:  # top-right
                av_x = slide_width - avatar_size - margin_x
                av_y = margin_y

            # ── Drop shadow (blurred dark ellipse, offset right+down) ──
            blur_r     = max(10, int(avatar_size * 0.10))
            sh_off     = max(3,  int(avatar_size * 0.035))
            sh_canvas  = avatar_size + blur_r * 2
            shadow_img = Image.new('RGBA', (sh_canvas, sh_canvas), (0, 0, 0, 0))
            ImageDraw.Draw(shadow_img).ellipse(
                (blur_r, blur_r, blur_r + avatar_size - 1, blur_r + avatar_size - 1),
                fill=(0, 0, 0, 120)
            )
            shadow_img  = shadow_img.filter(ImageFilter.GaussianBlur(radius=blur_r))
            shadow_np   = np.array(shadow_img)
            shadow_clip = ImageClip(shadow_np[:, :, :3], duration=duration)
            shadow_mask = ImageClip(shadow_np[:, :, 3] / 255.0, ismask=True, duration=duration)
            shadow_clip = (shadow_clip
                           .set_mask(shadow_mask)
                           .set_position((av_x - blur_r + sh_off, av_y - blur_r + sh_off))
                           .fadein(fade_dur))

            # ── Dark rounded panel behind avatar ───────────────────────
            pad_p   = int(avatar_size * 0.18)
            panel_w = avatar_size + pad_p * 2
            panel_h = avatar_size + pad_p * 2
            panel_img = Image.new('RGBA', (panel_w, panel_h), (0, 0, 0, 0))
            ImageDraw.Draw(panel_img).rounded_rectangle(
                (0, 0, panel_w - 1, panel_h - 1),
                radius=int(panel_w * 0.18),
                fill=(12, 25, 45, 178)
            )
            panel_np   = np.array(panel_img)
            panel_clip = ImageClip(panel_np[:, :, :3], duration=duration)
            panel_mask = ImageClip(panel_np[:, :, 3] / 255.0, ismask=True, duration=duration)
            panel_clip = (panel_clip
                          .set_mask(panel_mask)
                          .set_position((av_x - pad_p, av_y - pad_p))
                          .fadein(fade_dur))

            # ── Avatar with fade-in ────────────────────────────────────
            avatar_clip = avatar_clip.set_position((av_x, av_y)).fadein(fade_dur)

            final_clip = CompositeVideoClip(
                [slide_clip, shadow_clip, panel_clip, avatar_clip],
                size=(slide_width, slide_height)
            )
        else:
            final_clip = slide_clip

        final_clip = final_clip.set_audio(audio_clip).set_duration(duration)
        final_clip.write_videofile(
            output_path, fps=25, codec='libx264',
            audio_codec='aac', verbose=False, logger=None
        )

        slide_clip.close()
        audio_clip.close()
        final_clip.close()
        return output_path

    except Exception as e:
        print(f"compose_slide_video MoviePy failed: {e}, falling back to FFmpeg...")
        return compose_slide_video_ffmpeg(slide_image, audio_path, output_path,
                                         avatar_video, avatar_position)


def compose_slide_video_ffmpeg(slide_image, audio_path, output_path,
                                avatar_video=None, avatar_position='bottom-left'):
    """FFmpeg fallback for compose_slide_video — white-bordered circular avatar + dark panel."""
    try:
        import json

        probe = subprocess.run(
            ['ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_streams', audio_path],
            capture_output=True, text=True
        )
        duration = float(json.loads(probe.stdout)['streams'][0]['duration'])

        if avatar_video and os.path.exists(avatar_video):
            probe2 = subprocess.run(
                ['ffprobe', '-v', 'quiet', '-print_format', 'json',
                 '-show_streams', '-select_streams', 'v', slide_image],
                capture_output=True, text=True
            )
            info       = json.loads(probe2.stdout)['streams'][0]
            slide_w    = int(info['width'])
            slide_h    = int(info['height'])
            total_size = int(slide_h * 0.19)
            border_px  = max(6, int(total_size * 0.04))
            inner_size = total_size - border_px * 2
            margin_x   = int(slide_w  * 0.025)
            margin_y   = int(slide_h  * 0.025)

            if avatar_position == 'bottom-left':
                ox, oy = margin_x, slide_h - total_size - margin_y
            elif avatar_position == 'bottom-right':
                ox, oy = slide_w - total_size - margin_x, slide_h - total_size - margin_y
            elif avatar_position == 'top-left':
                ox, oy = margin_x, margin_y
            else:  # top-right
                ox, oy = slide_w - total_size - margin_x, margin_y

            pad_p    = int(total_size * 0.18)
            panel_x  = ox - pad_p
            panel_y  = oy - pad_p
            panel_w  = total_size + pad_p * 2
            panel_h  = total_size + pad_p * 2
            half     = total_size / 2

            # dark panel via drawbox → circular avatar overlay
            filt = (
                f'[0:v]drawbox=x={panel_x}:y={panel_y}:w={panel_w}:h={panel_h}'
                f':color=0x0C192D@0.70:t=fill[bg];'
                f'[1:v]scale={inner_size}:{inner_size}[sc];'
                f'[sc]pad={total_size}:{total_size}:{border_px}:{border_px}:color=0xFFFFFF[pd];'
                f'[pd]format=yuva420p,'
                f"geq=lum='p(X,Y)':a='if(gt(sqrt(pow(X-{half},2)+pow(Y-{half},2)),{half}),0,255)'"
                f'[av];'
                f'[bg][av]overlay={ox}:{oy}'
            )

            cmd = [
                'ffmpeg', '-y',
                '-loop', '1', '-t', str(duration), '-i', slide_image,
                '-stream_loop', '-1', '-i', avatar_video,
                '-i', audio_path,
                '-filter_complex', filt,
                '-map', '0:v', '-map', '2:a',
                '-c:v', 'libx264', '-c:a', 'aac',
                '-pix_fmt', 'yuv420p', '-shortest', output_path
            ]
        else:
            cmd = [
                'ffmpeg', '-y',
                '-loop', '1', '-t', str(duration), '-i', slide_image,
                '-i', audio_path,
                '-c:v', 'libx264', '-c:a', 'aac',
                '-pix_fmt', 'yuv420p', '-shortest', output_path
            ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        if result.returncode != 0:
            raise Exception(f"FFmpeg failed: {result.stderr}")
        return output_path

    except Exception as e:
        raise Exception(f"compose_slide_video_ffmpeg failed: {e}")


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
