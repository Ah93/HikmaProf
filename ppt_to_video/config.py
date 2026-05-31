import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-secret-key-change-in-production'

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))

    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
    OUTPUT_FOLDER = os.path.join(BASE_DIR, 'outputs')
    AVATAR_FOLDER = os.path.join(BASE_DIR, 'avatars')

    SLIDES_OUTPUT = os.path.join(OUTPUT_FOLDER, 'slides')
    AUDIO_OUTPUT = os.path.join(OUTPUT_FOLDER, 'audio')
    AVATAR_VIDEO_OUTPUT = os.path.join(OUTPUT_FOLDER, 'avatar_videos')
    FINAL_OUTPUT = os.path.join(OUTPUT_FOLDER, 'final')

    MAX_CONTENT_LENGTH = 100 * 1024 * 1024  # 100MB max file size
    ALLOWED_EXTENSIONS = {'pdf', 'ppt', 'pptx', 'txt', 'png', 'jpg', 'jpeg'}

    PREDEFINED_AVATARS = [
        'avatar_woman.png',
        'avatar_man.jpg',
        'avatar_art1.png',
        'avatar_business.png',
        'avatar_portrait.png'
    ]

    PREDEFINED_VOICES = [
        'tts_models/en/ljspeech/tacotron2-DDC',
        'tts_models/en/vctk/vits',
        'tts_models/multilingual/multi-dataset/xtts_v2'
    ]

    TTS_MODEL = 'gtts'  # Google TTS - MIT License, Commercial-friendly

    AVATAR_ANIMATION_METHOD = 'sadtalker'  # or 'wav2lip'

    # Avatar overlay settings
    AVATAR_SIZE = 250  # Fixed size for circular avatar (width and height in pixels)
    AVATAR_POSITION = 'bottom-right'  # Options: 'bottom-right', 'bottom-left', 'top-right', 'top-left'

    # Performance settings
    PARALLEL_AVATAR_PROCESSING = False  # Process multiple slides in parallel (faster but uses more GPU memory)
