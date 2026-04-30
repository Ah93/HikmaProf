"""Setup configuration for gen_ppt_video package."""

from setuptools import setup, find_packages
from pathlib import Path

README = (Path(__file__).parent / "README.md").read_text()

setup(
    name="gen_ppt_video",
    version="0.1.0",
    description="Automated presentation video generation from documents",
    long_description=README,
    long_description_content_type="text/markdown",
    author="Your Name",
    author_email="your.email@example.com",
    url="https://github.com/yourusername/gen_ppt_video",
    packages=find_packages(),
    python_requires=">=3.9",
    install_requires=[
        "flask>=3.0.0",
        "pypandoc>=1.13",
        "PyPDF2>=3.0.1",
        "python-docx>=1.1.0",
        "python-pptx>=0.6.23",
        "anthropic>=0.39.0",
        "ffmpeg-python>=0.2.0",
        "pillow>=10.4.0",
        "elevenlabs>=1.11.0",
        "requests>=2.32.3",
        "python-dotenv>=1.0.1",
        "pydantic>=2.10.4",
    ],
    extras_require={
        "dev": [
            "pytest>=8.3.4",
            "pytest-cov>=6.0.0",
            "black>=24.10.0",
            "flake8>=7.1.1",
            "mypy>=1.13.0",
        ]
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
