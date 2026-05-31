import os
import re
import subprocess
from gtts import gTTS

# Try to import Coqui TTS
try:
    from TTS.api import TTS as CoquiTTS
    COQUI_AVAILABLE = True
except ImportError:
    COQUI_AVAILABLE = False

# Try to import Edge TTS
try:
    import edge_tts
    import asyncio
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    print("Warning: Edge TTS not available. Install with: pip install edge-tts")

# ── Best neural voice per language ────────────────────────────────────────────
EDGE_TTS_LANGUAGE_DEFAULTS = {
    'en': 'en-US-AriaNeural',
    'ar': 'ar-SA-ZariyahNeural',
    'fr': 'fr-FR-DeniseNeural',
    'de': 'de-DE-KatjaNeural',
    'es': 'es-ES-ElviraNeural',
    'zh': 'zh-CN-XiaoxiaoNeural',
    'tr': 'tr-TR-EmelNeural',
    'ur': 'ur-PK-UzmaNeural',
    'it': 'it-IT-ElsaNeural',
    'pt': 'pt-BR-FranciscaNeural',
    'ru': 'ru-RU-SvetlanaNeural',
}

# ── Speaking rate per language (educational pacing) ───────────────────────────
# Arabic and Chinese benefit from a slower rate; others use a mild slowdown.
LANGUAGE_RATES = {
    'ar': '-12%',
    'zh': '-10%',
    'ur': '-10%',
    'ru': '-8%',
    'de': '-8%',
    'en': '-5%',
}
DEFAULT_RATE = '-5%'

# ── Slight pitch warmth per language ─────────────────────────────────────────
LANGUAGE_PITCHES = {
    'ar': '+0Hz',
    'en': '+1Hz',
}
DEFAULT_PITCH = '+0Hz'

# ── Sentence-boundary pause per language (ms) ────────────────────────────────
LANGUAGE_PAUSE = {
    'ar': 500,
    'zh': 450,
    'en': 380,
}
DEFAULT_PAUSE = 400

# gTTS language codes (fallback)
GTTS_LANGUAGE_MAP = {
    'en': 'en', 'ar': 'ar', 'fr': 'fr', 'de': 'de',
    'es': 'es', 'zh': 'zh-CN', 'tr': 'tr', 'ur': 'ur',
    'it': 'it', 'pt': 'pt', 'ru': 'ru',
}

# Preview sentences per language for voice previews
PREVIEW_TEXT = {
    'ar': 'مرحباً، هذا مثال على هذا الصوت. أتمنى أن يبدو طبيعياً وواضحاً.',
    'fr': "Bonjour, voici un exemple de cette voix. J'espère qu'elle semble naturelle.",
    'de': 'Hallo, dies ist ein Beispiel dieser Stimme. Ich hoffe, sie klingt natürlich.',
    'es': 'Hola, este es un ejemplo de esta voz. Espero que suene natural y clara.',
    'zh': '你好，这是这个声音的示例。希望听起来自然清晰。',
    'default': 'Hello! This is a sample of this voice. I hope it sounds natural and clear to you.',
}


# ── Text preprocessing ────────────────────────────────────────────────────────

def _clean_text(text: str) -> str:
    """Strip markdown/formatting artifacts that TTS would read literally."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)          # **bold**
    text = re.sub(r'\*(.+?)\*',     r'\1', text)           # *italic*
    text = re.sub(r'__(.+?)__',     r'\1', text)           # __underline__
    text = re.sub(r'#{1,6}\s+',     '',    text)           # # headings
    text = re.sub(r'^\s*[-•*]\s+',  '',    text, flags=re.MULTILINE)  # bullets
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)  # [link](url)
    text = re.sub(r'`+[^`]*`+',     '',    text)           # `code`
    text = re.sub(r'-{2,}',         '.',   text)           # --- dividers
    text = re.sub(r'\s+',           ' ',   text).strip()
    return text


def _detect_language(text: str) -> str:
    """Detect Arabic from Unicode range; default to 'en'."""
    if re.search(r'[؀-ۿݐ-ݿ]', text):
        return 'ar'
    return 'en'


def _split_sentences(text: str, lang: str) -> list:
    """
    Split text into sentences, respecting both Western and Arabic punctuation.
    Returns list of non-empty sentence strings.
    """
    # Arabic sentence-ending characters + Western
    pattern = r'(?<=[.!?؟۔])\s+'
    parts = re.split(pattern, text)
    return [s.strip() for s in parts if s.strip()]


def _build_ssml(text: str, voice: str, lang: str) -> str:
    """
    Wrap plain text in SSML with:
    - per-language prosody (rate + pitch)
    - natural sentence-boundary pauses
    - paragraph breaks for multi-line content
    """
    text   = _clean_text(text)
    rate   = LANGUAGE_RATES.get(lang,   DEFAULT_RATE)
    pitch  = LANGUAGE_PITCHES.get(lang, DEFAULT_PITCH)
    pause  = LANGUAGE_PAUSE.get(lang,   DEFAULT_PAUSE)

    # Split into paragraphs first, then sentences within each
    paragraphs = [p.strip() for p in text.split('\n') if p.strip()]
    if not paragraphs:
        paragraphs = [text]

    ssml_body_parts = []
    for pi, para in enumerate(paragraphs):
        sentences = _split_sentences(para, lang)
        for si, sent in enumerate(sentences):
            if not sent:
                continue
            ssml_body_parts.append(f'<s>{_xml_escape(sent)}</s>')
            # Pause after each sentence except the last in a paragraph
            if si < len(sentences) - 1:
                ssml_body_parts.append(f'<break time="{pause}ms"/>')

        # Longer pause between paragraphs
        if pi < len(paragraphs) - 1:
            ssml_body_parts.append(f'<break time="{pause + 200}ms"/>')

    inner = '\n        '.join(ssml_body_parts)

    return (
        f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" '
        f'xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="{voice[:5]}">\n'
        f'  <voice name="{voice}">\n'
        f'    <prosody rate="{rate}" pitch="{pitch}">\n'
        f'      {inner}\n'
        f'    </prosody>\n'
        f'  </voice>\n'
        f'</speak>'
    )


def _xml_escape(text: str) -> str:
    return (text
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;')
            .replace('"', '&quot;')
            .replace("'", '&apos;'))


# ── Audio post-processing ─────────────────────────────────────────────────────

def _postprocess_audio(audio_path: str) -> str:
    """
    Apply FFmpeg loudness normalization (EBU R128).
    Makes all slides consistent in volume and slightly warmer.
    Skips silently if FFmpeg is unavailable.
    """
    try:
        tmp = audio_path + '._norm.mp3'
        result = subprocess.run(
            [
                'ffmpeg', '-y', '-i', audio_path,
                '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                '-c:a', 'libmp3lame', '-q:a', '2',
                tmp
            ],
            capture_output=True, timeout=60
        )
        if result.returncode == 0 and os.path.exists(tmp):
            os.replace(tmp, audio_path)
    except Exception:
        pass  # FFmpeg unavailable — keep original audio
    return audio_path


# ── Public API ────────────────────────────────────────────────────────────────

def generate_speech(text, output_path, model_name='gtts', speaker_wav=None,
                    language='en', speaker_idx=None):
    """
    Generate speech from text.

    Priority:
      1. Edge TTS (neural, most natural) — used automatically when available
      2. Coqui TTS — only when a tts_models/* model is explicitly requested
      3. gTTS — fallback when Edge TTS is not installed
    """
    try:
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        # Coqui: only when explicitly requested
        if model_name.startswith('tts_models/') and COQUI_AVAILABLE:
            return generate_speech_coqui(
                text, output_path, model_name, speaker_wav, language, speaker_idx
            )

        # Edge TTS: use whenever available (default + edge-tts mode)
        if EDGE_TTS_AVAILABLE:
            voice = (speaker_idx if speaker_idx
                     else EDGE_TTS_LANGUAGE_DEFAULTS.get(
                         language, EDGE_TTS_LANGUAGE_DEFAULTS['en']))
            return generate_speech_edge(text, output_path, voice, language)

        # gTTS fallback
        lang_code = GTTS_LANGUAGE_MAP.get(language, 'en')
        return generate_speech_gtts(text, output_path, lang_code)

    except Exception as e:
        raise Exception(f"Error generating speech: {str(e)}")


def generate_speech_edge(text, output_path, voice_name, language='en'):
    """
    Generate speech with Microsoft Edge neural TTS.

    Improvements over plain Communicate():
    - SSML with sentence-boundary pauses
    - Per-language rate and pitch tuning
    - Markdown cleaning before synthesis
    - FFmpeg loudness normalization after synthesis
    """
    try:
        ssml = _build_ssml(text, voice_name, language)

        async def _generate():
            communicate = edge_tts.Communicate(ssml, voice_name)
            await communicate.save(output_path)

        asyncio.run(_generate())

        if not os.path.exists(output_path):
            raise Exception(f"Audio file was not created at {output_path}")

        _postprocess_audio(output_path)
        return output_path

    except Exception as e:
        print(f"Edge TTS error: {e}, falling back to gTTS")
        lang_code = GTTS_LANGUAGE_MAP.get(language, 'en')
        return generate_speech_gtts(text, output_path, lang_code)


def generate_speech_gtts(text, output_path, language='en'):
    """Generate speech using Google TTS (fallback)."""
    text = _clean_text(text)
    chunks = split_text(text, max_length=200)

    if len(chunks) == 1:
        tts = gTTS(text=text, lang=language, slow=False)
        tts.save(output_path)
    else:
        from pydub import AudioSegment
        combined = AudioSegment.empty()
        for i, chunk in enumerate(chunks):
            temp_path = output_path.replace('.wav', f'_temp_{i}.mp3')
            tts = gTTS(text=chunk, lang=language, slow=False)
            tts.save(temp_path)
            combined += AudioSegment.from_mp3(temp_path)
            os.remove(temp_path)
        combined.export(output_path, format='wav')

    if not os.path.exists(output_path):
        raise Exception(f"Audio file was not created at {output_path}")
    return output_path


def generate_speech_coqui(text, output_path, model_name, speaker_wav=None,
                           language='en', speaker_idx=None):
    """Generate speech using Coqui TTS."""
    try:
        tts = CoquiTTS(model_name=model_name)
        text = _clean_text(text)
        if 'xtts' in model_name.lower() and speaker_wav:
            tts.tts_to_file(text=text, file_path=output_path,
                            speaker_wav=speaker_wav, language=language)
        elif speaker_idx is not None:
            tts.tts_to_file(text=text, file_path=output_path, speaker=speaker_idx)
        else:
            tts.tts_to_file(text=text, file_path=output_path)

        if not os.path.exists(output_path):
            raise Exception(f"Audio file was not created at {output_path}")
        return output_path

    except Exception as e:
        print(f"Coqui TTS error: {e}, falling back to gTTS")
        lang_code = GTTS_LANGUAGE_MAP.get(language, 'en')
        return generate_speech_gtts(text, output_path, lang_code)


# ── Legacy helper (used by gTTS path) ────────────────────────────────────────

def split_text(text, max_length=500):
    """Split text into sentence-level chunks under max_length."""
    if len(text) <= max_length:
        return [text]
    sentences = text.replace('!', '.').replace('?', '.').split('.')
    chunks, current = [], ''
    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(current) + len(sentence) + 2 <= max_length:
            current = (current + '. ' + sentence) if current else sentence
        else:
            if current:
                chunks.append(current)
            current = sentence
    if current:
        chunks.append(current)
    return chunks if chunks else [text[:max_length]]


# ── Voice/model listing ───────────────────────────────────────────────────────

def list_available_models():
    """List available TTS models."""
    models = ['gtts']
    if EDGE_TTS_AVAILABLE:
        models.insert(0, 'edge-tts')
    if COQUI_AVAILABLE:
        models.extend([
            'tts_models/en/vctk/vits',
            'tts_models/en/ljspeech/tacotron2-DDC',
            'tts_models/multilingual/multi-dataset/xtts_v2'
        ])
    return models


def get_speakers_for_model(model_name):
    """Get available speakers/voices for a model."""
    if model_name in ('gtts', 'edge-tts'):
        return {
            # ── English ────────────────────────────────────
            'en-US-AriaNeural':      {'name': 'Aria — English US (Female)',   'description': 'Expressive, natural American female'},
            'en-US-JennyNeural':     {'name': 'Jenny — English US (Female)',  'description': 'Warm, friendly American female'},
            'en-US-GuyNeural':       {'name': 'Guy — English US (Male)',      'description': 'Natural American male'},
            'en-US-DavisNeural':     {'name': 'Davis — English US (Male)',    'description': 'Professional American male'},
            'en-GB-SoniaNeural':     {'name': 'Sonia — English UK (Female)', 'description': 'Clear British female'},
            'en-GB-RyanNeural':      {'name': 'Ryan — English UK (Male)',     'description': 'Natural British male'},
            # ── Arabic ─────────────────────────────────────
            'ar-SA-ZariyahNeural':   {'name': 'Zariyah — Arabic SA (Female)', 'description': 'Clear, natural Arabic female'},
            'ar-SA-HamedNeural':     {'name': 'Hamed — Arabic SA (Male)',     'description': 'Natural Arabic male'},
            'ar-EG-SalmaNeural':     {'name': 'Salma — Arabic EG (Female)',   'description': 'Egyptian Arabic female'},
            'ar-EG-ShakirNeural':    {'name': 'Shakir — Arabic EG (Male)',    'description': 'Egyptian Arabic male'},
            # ── French ─────────────────────────────────────
            'fr-FR-DeniseNeural':    {'name': 'Denise — French FR (Female)',  'description': 'Natural French female'},
            'fr-FR-HenriNeural':     {'name': 'Henri — French FR (Male)',     'description': 'Natural French male'},
            # ── German ─────────────────────────────────────
            'de-DE-KatjaNeural':     {'name': 'Katja — German DE (Female)',   'description': 'Clear German female'},
            'de-DE-ConradNeural':    {'name': 'Conrad — German DE (Male)',    'description': 'Natural German male'},
            # ── Spanish ────────────────────────────────────
            'es-ES-ElviraNeural':    {'name': 'Elvira — Spanish ES (Female)', 'description': 'Natural Spanish female'},
            'es-ES-AlvaroNeural':    {'name': 'Alvaro — Spanish ES (Male)',   'description': 'Natural Spanish male'},
            'es-MX-DaliaNeural':     {'name': 'Dalia — Spanish MX (Female)', 'description': 'Mexican Spanish female'},
            # ── Chinese ────────────────────────────────────
            'zh-CN-XiaoxiaoNeural':  {'name': 'Xiaoxiao — Chinese CN (Female)', 'description': 'Natural Mandarin female'},
            'zh-CN-YunxiNeural':     {'name': 'Yunxi — Chinese CN (Male)',    'description': 'Natural Mandarin male'},
            # ── Turkish ────────────────────────────────────
            'tr-TR-EmelNeural':      {'name': 'Emel — Turkish TR (Female)',   'description': 'Natural Turkish female'},
            'tr-TR-AhmetNeural':     {'name': 'Ahmet — Turkish TR (Male)',    'description': 'Natural Turkish male'},
            # ── Urdu ───────────────────────────────────────
            'ur-PK-UzmaNeural':      {'name': 'Uzma — Urdu PK (Female)',     'description': 'Natural Urdu female'},
            'ur-PK-AsadNeural':      {'name': 'Asad — Urdu PK (Male)',       'description': 'Natural Urdu male'},
            # ── Italian ────────────────────────────────────
            'it-IT-ElsaNeural':      {'name': 'Elsa — Italian IT (Female)',   'description': 'Natural Italian female'},
            'it-IT-DiegoNeural':     {'name': 'Diego — Italian IT (Male)',    'description': 'Natural Italian male'},
            # ── Portuguese ─────────────────────────────────
            'pt-BR-FranciscaNeural': {'name': 'Francisca — Portuguese BR (Female)', 'description': 'Natural Brazilian Portuguese female'},
            'pt-BR-AntonioNeural':   {'name': 'Antonio — Portuguese BR (Male)',     'description': 'Natural Brazilian Portuguese male'},
            'pt-PT-RaquelNeural':    {'name': 'Raquel — Portuguese PT (Female)',    'description': 'European Portuguese female'},
            # ── Russian ────────────────────────────────────
            'ru-RU-SvetlanaNeural':  {'name': 'Svetlana — Russian RU (Female)', 'description': 'Natural Russian female'},
            'ru-RU-DmitryNeural':    {'name': 'Dmitry — Russian RU (Male)',     'description': 'Natural Russian male'},
        }

    elif model_name == 'tts_models/en/vctk/vits':
        return {
            'p225': {'name': 'Female British 1', 'description': 'Young female, Southern England'},
            'p226': {'name': 'Male British 1',   'description': 'Young male, Northern England'},
            'p228': {'name': 'Female British 2', 'description': 'Young female, Southern England'},
            'p234': {'name': 'Female Scottish',  'description': 'Young female, Scottish'},
        }

    elif model_name == 'tts_models/en/ljspeech/tacotron2-DDC':
        return {'default': {'name': 'LJ Speech', 'description': 'Female American voice'}}

    elif model_name == 'tts_models/multilingual/multi-dataset/xtts_v2':
        return {'clone': {'name': 'Voice Cloning', 'description': 'Clone from uploaded audio sample'}}

    return {}


def generate_voice_preview(model_name, speaker_id, output_dir, language='en'):
    """Generate a short preview audio clip for a speaker."""
    os.makedirs(output_dir, exist_ok=True)

    # Use language-appropriate preview text
    lang = language if language in PREVIEW_TEXT else 'default'
    # Infer language from voice name (e.g. 'ar-SA-ZariyahNeural' → 'ar')
    if speaker_id and '-' in speaker_id:
        lang_code = speaker_id.split('-')[0].lower()
        if lang_code in PREVIEW_TEXT:
            lang = lang_code

    preview_text = PREVIEW_TEXT.get(lang, PREVIEW_TEXT['default'])
    preview_filename = f"preview_{model_name.replace('/', '_')}_{speaker_id}.mp3"
    preview_path = os.path.join(output_dir, preview_filename)

    if os.path.exists(preview_path):
        return preview_path

    try:
        generate_speech(
            text=preview_text,
            output_path=preview_path,
            model_name=model_name,
            language=lang if lang != 'default' else 'en',
            speaker_idx=speaker_id if speaker_id not in ('default', 'clone') else None,
        )
        return preview_path
    except Exception as e:
        print(f"Failed to generate preview for {model_name}/{speaker_id}: {e}")
        return None
