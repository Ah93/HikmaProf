"""Document content data model."""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field


@dataclass
class DocumentContent:
    """Represents parsed document content."""

    title: str
    author: Optional[str] = None
    sections: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    raw_text: str = ""
    images: List[Dict[str, Any]] = field(default_factory=list)
    tables: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "title": self.title,
            "author": self.author,
            "sections": self.sections,
            "metadata": self.metadata,
            "raw_text": self.raw_text,
            "images": self.images,
            "tables": self.tables
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DocumentContent":
        """Create from dictionary."""
        return cls(**data)
