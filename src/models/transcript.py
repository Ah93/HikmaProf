"""Transcript plan data model."""

from typing import List, Dict, Any
from dataclasses import dataclass, field


@dataclass
class SlideNarration:
    """Represents narration for a single slide."""

    slide_number: int
    text: str
    duration_seconds: float
    voice_settings: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TranscriptPlan:
    """Represents a complete transcript plan."""

    narrations: List[SlideNarration] = field(default_factory=list)
    total_duration: float = 0.0
    voice_id: str = "default"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "narrations": [
                {
                    "slide_number": narration.slide_number,
                    "text": narration.text,
                    "duration_seconds": narration.duration_seconds,
                    "voice_settings": narration.voice_settings
                }
                for narration in self.narrations
            ],
            "total_duration": self.total_duration,
            "voice_id": self.voice_id,
            "metadata": self.metadata
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "TranscriptPlan":
        """Create from dictionary."""
        narrations = [
            SlideNarration(**narration_data)
            for narration_data in data.get("narrations", [])
        ]
        return cls(
            narrations=narrations,
            total_duration=data.get("total_duration", 0.0),
            voice_id=data.get("voice_id", "default"),
            metadata=data.get("metadata", {})
        )
