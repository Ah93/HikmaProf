# HikmaProf 🎓

An AI-powered presentation generator that converts documents into fully narrated video presentations with avatar presenters and voice cloning.

---

## Features

### Core
- **PPTX Templates** — Upload a PDF/PPTX and generate a styled PowerPoint with AI-written speaker notes
- **Avatar Video** — Convert slides into a narrated MP4 video with a lip-synced avatar presenter
- **AI Visual Slides** — Generate image-illustrated slides using ERNIE Image AI
- **Multilingual** — English, Arabic, French, German, Spanish, Chinese, Turkish, Urdu, Italian, Portuguese, Russian

### Unique
- **🎙️ Voice Cloning** — Upload 6–30 sec of your voice; the app narrates the video in your cloned voice (powered by XTTS v2, runs locally on GPU)
- **Avatar Characters** — 6 culturally diverse presenters (Sophie, Ji-Yeon, James, Ryan, Zayed, Khalid) with gender-matched voices
- **Gender-aware TTS** — Male avatars use male neural voices, female avatars use female neural voices automatically
- **Generation Timer** — Live elapsed timer during video generation

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python / Flask |
| Frontend | Vanilla JS + TypeScript |
| TTS (default) | edge-tts (Microsoft Neural voices) |
| TTS (cloned) | Coqui XTTS v2 (local GPU) |
| AI Slides | ERNIE Image Turbo (separate microservice) |
| Slide AI | DeepSeek API + Claude/Gemini |
| Video | MoviePy + FFmpeg |
| PDF render | PyMuPDF (fitz) |

---

## Setup

### Requirements
- Python 3.11+
- CUDA-capable GPU (for XTTS voice cloning)
- FFmpeg installed and on PATH
- Node.js (for TypeScript compilation)

### 1. Main App

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file:
```
DEEPSEEK_API_KEY=your_key
ANTHROPIC_API_KEY=your_key
GOOGLE_API_KEY=your_key
ERNIE_ENDPOINT=http://localhost:5000
```

Run:
```bash
python app.py
```

### 2. Voice Cloning Server (optional)

```bash
python -m venv xtts_venv
xtts_venv\Scripts\pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
xtts_venv\Scripts\pip install coqui-tts flask flask-cors
xtts_venv\Scripts\python xtts_server.py
```

First run downloads the XTTS v2 model (~2 GB).

### 3. ERNIE Image Server (optional)

```bash
python ernie_server.py
```

---

## Usage

1. Open `http://localhost:5000` in your browser
2. Choose a tab:
   - **PPTX Templates** — upload PDF → choose template & avatar → generate PPTX + video
   - **Avatar Video** — upload PPTX/PDF → choose avatar (or No Avatar + your voice) → generate MP4
   - **AI Visual Slides** — upload document → generate image-illustrated slides
3. For voice cloning: select **No Avatar**, upload a WAV/MP3 voice sample, then generate

---

## Comparison vs Existing Tools

| Feature | Beautiful.ai | Gamma | Tome | Canva AI | NotebookLM | **HikmaProf** |
|---|---|---|---|---|---|---|
| Voice Cloning | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Avatar Video | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Arabic/Urdu TTS | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Local GPU Pipeline | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| PPTX → Video | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Upload own PPTX | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |

---

## License

Non-commercial research use. Voice cloning powered by [Coqui XTTS v2](https://coqui.ai/cpml) under CPML license.
