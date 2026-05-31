# AI Avatar Presentation Generator - Setup Guide

This guide will help you set up the AI Avatar Presentation Generator on your system.

## System Requirements

- **Operating System**: Linux (Ubuntu 20.04+ recommended), macOS, or Windows with WSL
- **Python**: 3.8 or higher
- **RAM**: At least 8GB (16GB recommended for faster processing)
- **GPU**: Optional but recommended for faster TTS and avatar animation (CUDA-compatible GPU)
- **Disk Space**: At least 10GB free space

## Prerequisites

### 1. System Dependencies

#### Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install -y \
    libreoffice \
    ffmpeg \
    poppler-utils \
    python3-pip \
    python3-venv \
    python3-dev \
    build-essential \
    git
```

#### macOS:
```bash
brew install libreoffice ffmpeg poppler python3
```

#### Windows (WSL):
Follow Ubuntu instructions after setting up WSL2.

## Installation Steps

### Option 1: Automated Setup (Recommended)

1. Make the setup script executable:
```bash
chmod +x setup.sh
```

2. Run the setup script:
```bash
./setup.sh
```

The script will:
- Install system dependencies
- Create a Python virtual environment
- Install all Python packages
- Set up directory structure
- Optionally install Wav2Lip and SadTalker

### Option 2: Manual Setup

1. **Create a virtual environment:**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install Python dependencies:**
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

3. **Create directory structure:**
```bash
mkdir -p uploads outputs/slides outputs/audio outputs/avatar_videos outputs/final avatars external
```

4. **Add avatar images:**
Place your avatar images (PNG or JPEG) in the `avatars/` folder and name them:
- `avatar1.png`
- `avatar2.png`
- `avatar3.png`

## Optional: Advanced Avatar Animation

### Installing Wav2Lip

Wav2Lip provides high-quality lip-sync animation.

1. **Clone Wav2Lip repository:**
```bash
cd external
git clone https://github.com/Rudrabha/Wav2Lip.git
cd Wav2Lip
```

2. **Install Wav2Lip dependencies:**
```bash
pip install -r requirements.txt
```

3. **Download checkpoint files:**
- Visit: https://github.com/Rudrabha/Wav2Lip#getting-the-weights
- Download `wav2lip_gan.pth`
- Place it in: `external/Wav2Lip/checkpoints/`

### Installing SadTalker

SadTalker provides more natural-looking avatar animations with head movements.

1. **Clone SadTalker repository:**
```bash
cd external
git clone https://github.com/OpenTalker/SadTalker.git
cd SadTalker
```

2. **Install SadTalker dependencies:**
```bash
pip install -r requirements.txt
```

3. **Download checkpoint files:**
Follow the instructions in the SadTalker repository to download required models.

## Configuration

Edit `config.py` to customize:

- **Avatar animation method**: Set `AVATAR_ANIMATION_METHOD` to `'wav2lip'` or `'sadtalker'`
- **Default TTS model**: Change `TTS_MODEL` to your preferred voice model
- **File size limits**: Adjust `MAX_CONTENT_LENGTH` as needed
- **Avatar positions**: Modify default avatar placement on slides

## Running the Application

1. **Activate the virtual environment:**
```bash
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Start the Flask application:**
```bash
python app.py
```

3. **Open your web browser:**
Navigate to: `http://localhost:5000`

The application should now be running!

## Usage Guide

### Basic Workflow

1. **Upload Presentation**: Upload a PDF or PowerPoint file
2. **Add Transcript**: Enter or upload the narration text for each slide
3. **Select Avatar**: Choose a predefined avatar or upload your own image
4. **Choose Voice**: Select a TTS model and optionally upload a voice sample for cloning
5. **Generate Video**: Click the button and wait for processing

### Transcript Format

For best results, separate text for each slide with blank lines:

```
This is the narration for slide 1. It can be multiple sentences.

This is the narration for slide 2. Make it engaging!

This is the narration for slide 3. Keep it clear and concise.
```

### Voice Cloning

To clone a voice:
1. Select "XTTS v2" as the voice model
2. Upload a 3-10 second audio sample of the target voice
3. The system will use this voice for all narration

## Troubleshooting

### Issue: LibreOffice conversion fails

**Solution**: Ensure LibreOffice is properly installed and accessible from command line:
```bash
libreoffice --version
```

### Issue: TTS model download is slow

**Solution**: Models are downloaded on first use. Be patient or pre-download them:
```python
from TTS.api import TTS
TTS("tts_models/multilingual/multi-dataset/xtts_v2")
```

### Issue: Avatar animation not working

**Solution**:
- If Wav2Lip/SadTalker fails, the system falls back to static avatar
- Check that checkpoint files are properly downloaded
- Ensure GPU drivers are installed if using CUDA

### Issue: Out of memory errors

**Solution**:
- Reduce presentation size (fewer slides)
- Lower image resolution in `config.py`
- Use CPU instead of GPU for processing
- Close other applications

### Issue: Video generation is slow

**Solution**:
- Install CUDA-compatible GPU drivers for faster processing
- Use simpler TTS models (e.g., Tacotron2 instead of XTTS)
- Use static avatar instead of Wav2Lip/SadTalker
- Reduce video quality settings

## Performance Tips

1. **Use GPU**: Install PyTorch with CUDA support for 3-5x faster processing
2. **Optimize images**: Reduce slide DPI in `pdf_converter.py` (currently 300 DPI)
3. **Batch processing**: Process multiple presentations in sequence overnight
4. **Caching**: The TTS model is cached after first load

## File Structure

```
ppt_to_video/
├── app.py                 # Main Flask application
├── config.py              # Configuration settings
├── requirements.txt       # Python dependencies
├── setup.sh              # Automated setup script
├── SETUP.md              # This file
├── templates/
│   └── index.html        # Web interface
├── static/               # CSS/JS assets
├── utils/
│   ├── pdf_converter.py  # PDF/PPT to images
│   ├── tts_engine.py     # Text-to-speech
│   ├── avatar_animator.py # Avatar animation
│   └── video_composer.py # Video composition
├── uploads/              # Uploaded files
├── outputs/              # Generated content
│   ├── slides/           # Slide images
│   ├── audio/            # Generated audio
│   ├── avatar_videos/    # Avatar videos
│   └── final/            # Final presentations
├── avatars/              # Avatar images
└── external/             # Optional external tools
    ├── Wav2Lip/          # Wav2Lip (optional)
    └── SadTalker/        # SadTalker (optional)
```

## Support

For issues and questions:
- Check the troubleshooting section above
- Review error messages in the terminal
- Check Flask logs for detailed error information

## License

This project uses open-source components. Please refer to individual component licenses:
- Flask: BSD License
- Coqui TTS: MPL 2.0 License
- Wav2Lip: License specified in their repository
- SadTalker: License specified in their repository
