"""Slide plan data model."""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class Slide:
    """Represents a single slide."""

    title: str
    content: List[str] = field(default_factory=list)
    layout: str = "title_and_content"
    notes: str = ""
    images: List[Dict[str, Any]] = field(default_factory=list)
    charts: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class SlidePlan:
    """Represents a complete slide deck plan."""

    title: str
    slides: List[Slide] = field(default_factory=list)
    theme: str = "default"
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "title": self.title,
            "slides": [
                {
                    "title": slide.title,
                    "content": slide.content,
                    "layout": slide.layout,
                    "notes": slide.notes,
                    "images": slide.images,
                    "charts": slide.charts
                }
                for slide in self.slides
            ],
            "theme": self.theme,
            "metadata": self.metadata
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SlidePlan":
        """Create from dictionary."""
        slides = [Slide(**slide_data) for slide_data in data.get("slides", [])]
        return cls(
            title=data["title"],
            slides=slides,
            theme=data.get("theme", "default"),
            metadata=data.get("metadata", {})
        )
