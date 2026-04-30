import os
from gtts import gTTS

# Try to import Coqui TTS
try:
    from TTS.api import TTS as CoquiTTS
    COQUI_AVAILABLE = True
except ImportError:
    COQUI_AVAILABLE = False
    print("Warning: Coqui TTS not available. Install with: pip install TTS")

# Try to import Edge TTS
try:
    import edge_tts
    import asyncio
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    print("Warning: Edge TTS not available. Install with: pip install edge-tts")

def split_text(text, max_length=200):
    """
    Split text into chunks that are under max_length

    Args:
        text: Text to split
        max_length: Maximum length per chunk

    Returns:
        List of text chunks
    """
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
            if current_chunk:
                current_chunk += ". " + sentence
            else:
                current_chunk = sentence
        else:
            if current_chunk:
                chunks.append(current_chunk)
            current_chunk = sentence

    if current_chunk:
        chunks.append(current_chunk)

    return chunks if chunks else [text[:max_length]]

def generate_speech(text, output_path, model_name='gtts', speaker_wav=None, language='en', speaker_idx=None):
    """
    Generate speech from text using various TTS engines

    Args:
        text: Text to convert to speech
        output_path: Path to save the audio file
        model_name: TTS model (default: gtts)
        speaker_wav: Path to speaker audio for voice cloning (XTTS only)
        language: Language code (default: en)
        speaker_idx: Speaker index/name for multi-speaker models

    Returns:
        Path to the generated audio file
    """
    try:
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")

        # Use Edge TTS if model starts with edge-tts
        if model_name == 'edge-tts' and EDGE_TTS_AVAILABLE and speaker_idx:
            return generate_speech_edge(text, output_path, speaker_idx)
        # Use Coqui TTS if model is specified and available
        elif model_name.startswith('tts_models/') and COQUI_AVAILABLE:
            return generate_speech_coqui(text, output_path, model_name, speaker_wav, language, speaker_idx)
        else:
            return generate_speech_gtts(text, output_path, language)

    except Exception as e:
        raise Exception(f"Error generating speech: {str(e)}")

def generate_speech_gtts(text, output_path, language='en'):
    """Generate speech using Google TTS"""
    # Split long text into chunks
    chunks = split_text(text, max_length=200)

    if len(chunks) == 1:
        # Single chunk - direct synthesis
        tts = gTTS(text=text, lang=language, slow=False)
        tts.save(output_path)
    else:
        # Multiple chunks - concatenate audio files
        from pydub import AudioSegment

        combined = AudioSegment.empty()

        for chunk in chunks:
            # Create temporary file for each chunk
            temp_path = output_path.replace('.wav', f'_temp_{chunks.index(chunk)}.mp3')

            tts = gTTS(text=chunk, lang=language, slow=False)
            tts.save(temp_path)

            # Load and combine
            audio = AudioSegment.from_mp3(temp_path)
            combined += audio

            # Remove temp file
            os.remove(temp_path)

        # Export as WAV
        combined.export(output_path, format='wav')

    if not os.path.exists(output_path):
        raise Exception(f"Audio file was not created at {output_path}")

    return output_path

def generate_speech_edge(text, output_path, voice_name):
    """Generate speech using Microsoft Edge TTS"""
    try:
        async def _generate():
            communicate = edge_tts.Communicate(text, voice_name)
            await communicate.save(output_path)

        # Run the async function
        asyncio.run(_generate())

        if not os.path.exists(output_path):
            raise Exception(f"Audio file was not created at {output_path}")

        return output_path

    except Exception as e:
        print(f"Edge TTS error: {str(e)}, falling back to gTTS")
        return generate_speech_gtts(text, output_path, 'en')

def generate_speech_coqui(text, output_path, model_name, speaker_wav=None, language='en', speaker_idx=None):
    """Generate speech using Coqui TTS"""
    try:
        # Initialize TTS model
        tts = CoquiTTS(model_name=model_name)

        # Generate speech based on model type
        if 'xtts' in model_name.lower() and speaker_wav:
            # XTTS with voice cloning
            tts.tts_to_file(
                text=text,
                file_path=output_path,
                speaker_wav=speaker_wav,
                language=language
            )
        elif speaker_idx is not None:
            # Multi-speaker model with speaker selection
            tts.tts_to_file(
                text=text,
                file_path=output_path,
                speaker=speaker_idx
            )
        else:
            # Single speaker model
            tts.tts_to_file(
                text=text,
                file_path=output_path
            )

        if not os.path.exists(output_path):
            raise Exception(f"Audio file was not created at {output_path}")

        return output_path

    except Exception as e:
        print(f"Coqui TTS error: {str(e)}, falling back to gTTS")
        return generate_speech_gtts(text, output_path, language)

def list_available_models():
    """
    List available TTS models

    Returns:
        List of model names
    """
    models = ['gtts']
    if EDGE_TTS_AVAILABLE:
        models.append('edge-tts')
    if COQUI_AVAILABLE:
        models.extend([
            'tts_models/en/vctk/vits',
            'tts_models/en/ljspeech/tacotron2-DDC',
            'tts_models/multilingual/multi-dataset/xtts_v2'
        ])
    return models

def get_speakers_for_model(model_name):
    """
    Get available speakers for a specific model

    Returns:
        Dict with speaker info: {speaker_id: {name, description}}
    """
    speakers = {}

    if model_name == 'gtts':
        speakers = {
            'en': {'name': 'English (US)', 'description': 'Google TTS English voice'},
        }
    elif model_name == 'edge-tts':
        # Microsoft Edge TTS - High quality voices
        speakers = {
            'en-US-AriaNeural': {'name': 'Aria (Female US)', 'description': 'Natural, expressive American female'},
            'en-US-GuyNeural': {'name': 'Guy (Male US)', 'description': 'Natural American male voice'},
            'en-US-JennyNeural': {'name': 'Jenny (Female US)', 'description': 'Warm, friendly female voice'},
            'en-US-DavisNeural': {'name': 'Davis (Male US)', 'description': 'Professional American male'},
            'en-GB-SoniaNeural': {'name': 'Sonia (Female UK)', 'description': 'British female voice'},
            'en-GB-RyanNeural': {'name': 'Ryan (Male UK)', 'description': 'British male voice'},
            'en-AU-NatashaNeural': {'name': 'Natasha (Female AU)', 'description': 'Australian female voice'},
            'en-AU-WilliamNeural': {'name': 'William (Male AU)', 'description': 'Australian male voice'},
            'en-IN-NeerjaNeural': {'name': 'Neerja (Female IN)', 'description': 'Indian English female'},
            'en-IN-PrabhatNeural': {'name': 'Prabhat (Male IN)', 'description': 'Indian English male'},
        }
    elif model_name == 'tts_models/en/vctk/vits':
        # VCTK has 109 speakers, showing popular ones
        speakers = {
            'p225': {'name': 'Female British 1', 'description': 'Young female, Southern England'},
            'p226': {'name': 'Male British 1', 'description': 'Young male, Northern England'},
            'p227': {'name': 'Male British 2', 'description': 'Young male, Cumbria'},
            'p228': {'name': 'Female British 2', 'description': 'Young female, Southern England'},
            'p229': {'name': 'Female British 3', 'description': 'Young female, Southern England'},
            'p230': {'name': 'Female British 4', 'description': 'Young female, Stockton-on-Tees'},
            'p231': {'name': 'Female British 5', 'description': 'Young female, Southern England'},
            'p232': {'name': 'Male British 3', 'description': 'Young male, Southern England'},
            'p233': {'name': 'Female British 6', 'description': 'Young female, Staffordshire'},
            'p234': {'name': 'Female Scottish 1', 'description': 'Young female, Scottish'},
        }
    elif model_name == 'tts_models/en/ljspeech/tacotron2-DDC':
        speakers = {
            'default': {'name': 'LJ Speech', 'description': 'Female American voice'},
        }
    elif model_name == 'tts_models/multilingual/multi-dataset/xtts_v2':
        speakers = {
            'clone': {'name': 'Voice Cloning', 'description': 'Clone from uploaded audio sample'},
        }

    return speakers

def generate_voice_preview(model_name, speaker_id, output_dir):
    """
    Generate a preview audio file for a speaker

    Args:
        model_name: TTS model name
        speaker_id: Speaker identifier
        output_dir: Directory to save preview files

    Returns:
        Path to preview audio file
    """
    os.makedirs(output_dir, exist_ok=True)

    preview_text = "Hello! This is a sample of this voice. Listen to decide if you like it."
    preview_filename = f"preview_{model_name.replace('/', '_')}_{speaker_id}.wav"
    preview_path = os.path.join(output_dir, preview_filename)

    # Skip if preview already exists
    if os.path.exists(preview_path):
        return preview_path

    try:
        generate_speech(
            text=preview_text,
            output_path=preview_path,
            model_name=model_name,
            speaker_idx=speaker_id if speaker_id != 'default' and speaker_id != 'clone' else None
        )
        return preview_path
    except Exception as e:
        print(f"Failed to generate preview for {model_name}/{speaker_id}: {str(e)}")
        return None
