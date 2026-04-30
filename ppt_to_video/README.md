# AI Avatar Presentation Generator

Transform your presentations into engaging AI avatar-narrated videos using open-source technologies.

![Project Status](https://img.shields.io/badge/status-active-success.svg)
![Python Version](https://img.shields.io/badge/python-3.8+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Overview

This project creates professional presentation videos where an AI avatar narrates your slides using synthesized or cloned speech. It's fully open-source, offline-capable, and supports:

- Multiple TTS voices and voice cloning
- Custom or predefined avatars
- Automatic lip-sync animation
- PDF and PowerPoint presentations

## Features

### Voice Options
- **Predefined Voices**: Coqui TTS with multiple ready-to-use speakers
- **Voice Cloning**: Clone any voice from just 3-10 seconds of audio
- **Multilingual Support**: Generate speech in multiple languages

### Avatar Options
- **Predefined Avatars**: Use stock avatar images
- **Custom Avatars**: Upload your own avatar image
- **Lip-Sync Animation**: Wav2Lip or SadTalker for realistic talking avatars
- **3D Avatars**: Optional support for 3D avatar models

### Video Pipeline
1. Convert PPT/PDF to images
2. Generate speech audio from transcript
3. Animate avatar with lip-sync
4. Overlay avatar on slides
5. Concatenate into final presentation

## Quick Start

### 1. Install Dependencies

```bash
# Run the automated setup script
chmod +x setup.sh
./setup.sh
```

Or install manually (see [SETUP.md](SETUP.md) for detailed instructions).

### 2. Run the Application

```bash
# Activate virtual environment
source venv/bin/activate

# Start Flask server
python app.py
```

### 3. Open in Browser

Navigate to: `http://localhost:5000`

## Usage

1. **Upload** your PDF or PowerPoint presentation
2. **Enter** or upload the narration script for each slide
3. **Select** an avatar (predefined or custom)
4. **Choose** a voice model or upload a voice sample for cloning
5. **Generate** your video and download when complete

## Technology Stack

- **Backend**: Flask (Python)
- **TTS**: Coqui TTS (XTTS v2)
- **Avatar Animation**: Wav2Lip / SadTalker
- **Video Processing**: FFmpeg, MoviePy
- **PDF Conversion**: LibreOffice, pdf2image
- **Frontend**: HTML, CSS, JavaScript

## Project Structure

```
ppt_to_video/
├── app.py                  # Flask application
├── config.py               # Configuration
├── requirements.txt        # Dependencies
├── setup.sh               # Setup script
├── SETUP.md               # Detailed setup guide
├── templates/
│   └── index.html         # Web interface
├── utils/
│   ├── pdf_converter.py   # PDF/PPT processing
│   ├── tts_engine.py      # Text-to-speech
│   ├── avatar_animator.py # Avatar animation
│   └── video_composer.py  # Video composition
├── avatars/               # Avatar images
└── external/              # Optional tools (Wav2Lip, SadTalker)
```

## Configuration

Edit `config.py` to customize:

```python
# Avatar animation method
AVATAR_ANIMATION_METHOD = 'wav2lip'  # or 'sadtalker'

# Default TTS model
TTS_MODEL = 'tts_models/multilingual/multi-dataset/xtts_v2'

# Avatar position on slides
avatar_position = 'bottom-right'  # Options: bottom-right, bottom-left, top-right, top-left

# Avatar scale
avatar_scale = 0.25  # 25% of slide width
```

## Advanced Setup

### Installing Wav2Lip (High-Quality Lip Sync)

```bash
cd external
git clone https://github.com/Rudrabha/Wav2Lip.git
cd Wav2Lip
pip install -r requirements.txt

# Download checkpoint from: https://github.com/Rudrabha/Wav2Lip#getting-the-weights
# Place in: external/Wav2Lip/checkpoints/
```

### Installing SadTalker (Natural Avatar Animation)

```bash
cd external
git clone https://github.com/OpenTalker/SadTalker.git
cd SadTalker
pip install -r requirements.txt

# Follow SadTalker setup instructions for checkpoints
```

## Performance Tips

- **GPU Support**: Install PyTorch with CUDA for 3-5x faster processing
- **Optimize Images**: Reduce DPI in settings for faster conversion
- **Model Caching**: TTS models are cached after first use
- **Batch Processing**: Process multiple presentations sequentially

## Troubleshooting

### Common Issues

**LibreOffice not found**
```bash
sudo apt-get install libreoffice
```

**Out of memory**
- Reduce number of slides
- Lower image resolution
- Use CPU instead of GPU

**Slow processing**
- Install GPU support
- Use simpler TTS models
- Reduce video quality

See [SETUP.md](SETUP.md) for more troubleshooting tips.

## Requirements

- **OS**: Linux (Ubuntu 20.04+), macOS, or Windows WSL
- **Python**: 3.8+
- **RAM**: 8GB minimum (16GB recommended)
- **GPU**: Optional (CUDA-compatible for faster processing)
- **Disk**: 10GB free space

## API Endpoints

### Upload Files
```
POST /upload
- Files: presentation, transcript, avatar, voice_sample
- Returns: session_id
```

### Process Video
```
POST /process/<session_id>
- Processes uploaded files into video
- Returns: video_url
```

### Download Video
```
GET /download/<session_id>
- Downloads generated video
```

## Example Transcript Format

```text
Welcome to this presentation about AI avatars. Today we'll explore how artificial intelligence is transforming video creation.

In this slide, we'll look at the key technologies that make avatar videos possible, including text-to-speech and lip-sync animation.

Finally, we'll discuss the applications and future of AI-generated presentations in education and business.
```

## Contributing

Contributions are welcome! Areas for improvement:

- Additional avatar animation methods
- More TTS voice options
- Background removal and effects
- Gesture animation
- Multi-language support
- Performance optimizations

## License

This project uses open-source components with various licenses:
- Flask: BSD License
- Coqui TTS: MPL 2.0 License
- Refer to individual component licenses for details

## Acknowledgments

Built using:
- [Coqui TTS](https://github.com/coqui-ai/TTS)
- [Wav2Lip](https://github.com/Rudrabha/Wav2Lip)
- [SadTalker](https://github.com/OpenTalker/SadTalker)
- [Flask](https://flask.palletsprojects.com/)
- [FFmpeg](https://ffmpeg.org/)
- [LibreOffice](https://www.libreoffice.org/)

## Support

For issues and questions:
1. Check [SETUP.md](SETUP.md) for setup instructions
2. Review troubleshooting section
3. Check error logs in terminal
4. Open an issue on GitHub

## Roadmap

- [ ] Add more avatar animation options
- [ ] Implement background music support
- [ ] Add subtitle generation
- [ ] Support for video backgrounds
- [ ] Real-time preview
- [ ] Cloud deployment option
- [ ] Mobile app version

---

**Made with open-source technologies**
