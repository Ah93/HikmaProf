"""Configuration management utilities."""

import os
from typing import Dict, Any
from pathlib import Path
from dotenv import load_dotenv


def load_config() -> Dict[str, Any]:
    """
    Load configuration from environment variables.

    Returns:
        Dictionary containing configuration values
    """
    # Load .env file if it exists
    env_path = Path(".env")
    if env_path.exists():
        load_dotenv(env_path)

    config = {
        # Anthropic API
        "anthropic_api_key": os.getenv("ANTHROPIC_API_KEY"),

        # D-ID API
        "did_api_key": os.getenv("DID_API_KEY"),

        # ElevenLabs API
        "elevenlabs_api_key": os.getenv("ELEVENLABS_API_KEY"),

        # Flask settings
        "flask_host": os.getenv("FLASK_HOST", "0.0.0.0"),
        "flask_port": int(os.getenv("FLASK_PORT", "5000")),
        "flask_debug": os.getenv("FLASK_DEBUG", "false").lower() == "true",

        # File settings
        "max_file_size_mb": int(os.getenv("MAX_FILE_SIZE_MB", "50")),
        "upload_folder": os.getenv("UPLOAD_FOLDER", "uploads"),
        "output_folder": os.getenv("OUTPUT_FOLDER", "outputs"),

        # Pipeline settings
        "max_fix_iterations": int(os.getenv("MAX_FIX_ITERATIONS", "3")),
    }

    return config


def validate_config(config: Dict[str, Any]) -> bool:
    """
    Validate required configuration values.

    Args:
        config: Configuration dictionary

    Returns:
        True if valid, False otherwise
    """
    required_keys = [
        "anthropic_api_key",
        "did_api_key",
        "elevenlabs_api_key"
    ]

    missing_keys = [key for key in required_keys if not config.get(key)]

    if missing_keys:
        print(f"Missing required configuration: {', '.join(missing_keys)}")
        return False

    return True
