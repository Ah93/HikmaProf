import os
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

# Best neural voice per language — chosen for naturalness and clarity
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

# gTTS language codes (fallback)
GTTS_LANGUAGE_MAP = {
    'en': 'en', 'ar': 'ar', 'fr': 'fr', 'de': 'de',
    'es': 'es', 'zh': 'zh-CN', 'tr': 'tr', 'ur': 'ur',
    'it': 'it', 'pt': 'pt', 'ru': 'ru',
}


def split_text(text, max_length=500):
    """Split text into sentence-level chunks under max_length."""
    if len(text) <= max_length:
        return [text]

    sentences = text.replace('!', '.').replace('?', '.').split('.')
    chunks = []
    current_chunk = ""

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(current_chunk) + len(sentence) + 2 <= max_length:
            current_chunk = (current_chunk + ". " + sentence) if current_chunk else sentence
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return chunks if chunks else [text[:max_length]]


def generate_speech(text, output_path, model_name='gtts', speaker_wav=None, language='en', speaker_idx=None):
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
            return generate_speech_coqui(text, output_path, model_name, speaker_wav, language, speaker_idx)

        # Edge TTS: use whenever available (default + edge-tts mode)
        if EDGE_TTS_AVAILABLE:
            voice = speaker_idx if speaker_idx else EDGE_TTS_LANGUAGE_DEFAULTS.get(
                language, EDGE_TTS_LANGUAGE_DEFAULTS['en']
            )
            return generate_speech_edge(text, output_path, voice)

        # gTTS fallback
        lang_code = GTTS_LANGUAGE_MAP.get(language, 'en')
        return generate_speech_gtts(text, output_path, lang_code)

    except Exception as e:
        raise Exception(f"Error generating speech: {str(e)}")


def generate_speech_edge(text, output_path, voice_name, rate="-5%", pitch="+0Hz"):
    """
    Generate speech with Microsoft Edge neural TTS.

    rate="-5%" gives slightly slower, clearer pacing without sounding robotic.
    """
    try:
        async def _generate():
            communicate = edge_tts.Communicate(text, voice_name, rate=rate, pitch=pitch)
            await communicate.save(output_path)

        asyncio.run(_generate())

        if not os.path.exists(output_path):
            raise Exception(f"Audio file was not created at {output_path}")

        return output_path

    except Exception as e:
        print(f"Edge TTS error: {e}, falling back to gTTS")
        return generate_speech_gtts(text, output_path, 'en')


def generate_speech_gtts(text, output_path, language='en'):
    """Generate speech using Google TTS (fallback)."""
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


def generate_speech_coqui(text, output_path, model_name, speaker_wav=None, language='en', speaker_idx=None):
    """Generate speech using Coqui TTS."""
    try:
        tts = CoquiTTS(model_name=model_name)

        if 'xtts' in model_name.lower() and speaker_wav:
            tts.tts_to_file(text=text, file_path=output_path, speaker_wav=speaker_wav, language=language)
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


def list_available_models():
    """List available TTS models."""
    models = ['gtts']
    if EDGE_TTS_AVAILABLE:
        models.insert(0, 'edge-tts')  # Edge TTS first since it's the best
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
        # Return all neural Edge TTS voices grouped by language
        return {
            # ── English ────────────────────────────────────
            'en-US-AriaNeural':     {'name': 'Aria — English US (Female)', 'description': 'Expressive, natural American female'},
            'en-US-JennyNeural':    {'name': 'Jenny — English US (Female)', 'description': 'Warm, friendly American female'},
            'en-US-GuyNeural':      {'name': 'Guy — English US (Male)', 'description': 'Natural American male'},
            'en-US-DavisNeural':    {'name': 'Davis — English US (Male)', 'description': 'Professional American male'},
            'en-GB-SoniaNeural':    {'name': 'Sonia — English UK (Female)', 'description': 'Clear British female'},
            'en-GB-RyanNeural':     {'name': 'Ryan — English UK (Male)', 'description': 'Natural British male'},
            # ── Arabic ─────────────────────────────────────
            'ar-SA-ZariyahNeural':  {'name': 'Zariyah — Arabic SA (Female)', 'description': 'Clear, natural Arabic female'},
            'ar-SA-HamedNeural':    {'name': 'Hamed — Arabic SA (Male)', 'description': 'Natural Arabic male'},
            'ar-EG-SalmaNeural':    {'name': 'Salma — Arabic EG (Female)', 'description': 'Egyptian Arabic female'},
            'ar-EG-ShakirNeural':   {'name': 'Shakir — Arabic EG (Male)', 'description': 'Egyptian Arabic male'},
            # ── French ─────────────────────────────────────
            'fr-FR-DeniseNeural':   {'name': 'Denise — French FR (Female)', 'description': 'Natural French female'},
            'fr-FR-HenriNeural':    {'name': 'Henri — French FR (Male)', 'description': 'Natural French male'},
            # ── German ─────────────────────────────────────
            'de-DE-KatjaNeural':    {'name': 'Katja — German DE (Female)', 'description': 'Clear German female'},
            'de-DE-ConradNeural':   {'name': 'Conrad — German DE (Male)', 'description': 'Natural German male'},
            # ── Spanish ────────────────────────────────────
            'es-ES-ElviraNeural':   {'name': 'Elvira — Spanish ES (Female)', 'description': 'Natural Spanish female'},
            'es-ES-AlvaroNeural':   {'name': 'Alvaro — Spanish ES (Male)', 'description': 'Natural Spanish male'},
            'es-MX-DaliaNeural':    {'name': 'Dalia — Spanish MX (Female)', 'description': 'Mexican Spanish female'},
            # ── Chinese ────────────────────────────────────
            'zh-CN-XiaoxiaoNeural': {'name': 'Xiaoxiao — Chinese CN (Female)', 'description': 'Natural Mandarin female'},
            'zh-CN-YunxiNeural':    {'name': 'Yunxi — Chinese CN (Male)', 'description': 'Natural Mandarin male'},
            # ── Turkish ────────────────────────────────────
            'tr-TR-EmelNeural':     {'name': 'Emel — Turkish TR (Female)', 'description': 'Natural Turkish female'},
            'tr-TR-AhmetNeural':    {'name': 'Ahmet — Turkish TR (Male)', 'description': 'Natural Turkish male'},
            # ── Urdu ───────────────────────────────────────
            'ur-PK-UzmaNeural':     {'name': 'Uzma — Urdu PK (Female)', 'description': 'Natural Urdu female'},
            'ur-PK-AsadNeural':     {'name': 'Asad — Urdu PK (Male)', 'description': 'Natural Urdu male'},
            # ── Italian ────────────────────────────────────
            'it-IT-ElsaNeural':     {'name': 'Elsa — Italian IT (Female)', 'description': 'Natural Italian female'},
            'it-IT-DiegoNeural':    {'name': 'Diego — Italian IT (Male)', 'description': 'Natural Italian male'},
            # ── Portuguese ─────────────────────────────────
            'pt-BR-FranciscaNeural':{'name': 'Francisca — Portuguese BR (Female)', 'description': 'Natural Brazilian Portuguese female'},
            'pt-BR-AntonioNeural':  {'name': 'Antonio — Portuguese BR (Male)', 'description': 'Natural Brazilian Portuguese male'},
            'pt-PT-RaquelNeural':   {'name': 'Raquel — Portuguese PT (Female)', 'description': 'European Portuguese female'},
            # ── Russian ────────────────────────────────────
            'ru-RU-SvetlanaNeural': {'name': 'Svetlana — Russian RU (Female)', 'description': 'Natural Russian female'},
            'ru-RU-DmitryNeural':   {'name': 'Dmitry — Russian RU (Male)', 'description': 'Natural Russian male'},
        }

    elif model_name == 'tts_models/en/vctk/vits':
        return {
            'p225': {'name': 'Female British 1', 'description': 'Young female, Southern England'},
            'p226': {'name': 'Male British 1', 'description': 'Young male, Northern England'},
            'p228': {'name': 'Female British 2', 'description': 'Young female, Southern England'},
            'p234': {'name': 'Female Scottish', 'description': 'Young female, Scottish'},
        }

    elif model_name == 'tts_models/en/ljspeech/tacotron2-DDC':
        return {'default': {'name': 'LJ Speech', 'description': 'Female American voice'}}

    elif model_name == 'tts_models/multilingual/multi-dataset/xtts_v2':
        return {'clone': {'name': 'Voice Cloning', 'description': 'Clone from uploaded audio sample'}}

    return {}


def generate_voice_preview(model_name, speaker_id, output_dir):
    """Generate a short preview audio clip for a speaker."""
    os.makedirs(output_dir, exist_ok=True)

    preview_text = "Hello! This is a sample of this voice. I hope it sounds natural and clear to you."
    preview_filename = f"preview_{model_name.replace('/', '_')}_{speaker_id}.wav"
    preview_path = os.path.join(output_dir, preview_filename)

    if os.path.exists(preview_path):
        return preview_path

    try:
        generate_speech(
            text=preview_text,
            output_path=preview_path,
            model_name=model_name,
            speaker_idx=speaker_id if speaker_id not in ('default', 'clone') else None
        )
        return preview_path
    except Exception as e:
        print(f"Failed to generate preview for {model_name}/{speaker_id}: {e}")
        return None
