"""Validation report data model."""

from typing import List, Dict, Any
from dataclasses import dataclass, field
from enum import Enum


class IssueSeverity(Enum):
    """Severity levels for validation issues."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ValidationIssue:
    """Represents a validation issue."""

    slide_number: int
    issue_type: str
    description: str
    severity: IssueSeverity
    suggestions: List[str] = field(default_factory=list)


@dataclass
class ValidationReport:
    """Represents a PPTX validation report."""

    is_valid: bool
    issues: List[ValidationIssue] = field(default_factory=list)
    score: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "is_valid": self.is_valid,
            "issues": [
                {
                    "slide_number": issue.slide_number,
                    "issue_type": issue.issue_type,
                    "description": issue.description,
                    "severity": issue.severity.value,
                    "suggestions": issue.suggestions
                }
                for issue in self.issues
            ],
            "score": self.score,
            "metadata": self.metadata
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ValidationReport":
        """Create from dictionary."""
        issues = [
            ValidationIssue(
                slide_number=issue_data["slide_number"],
                issue_type=issue_data["issue_type"],
                description=issue_data["description"],
                severity=IssueSeverity(issue_data["severity"]),
                suggestions=issue_data.get("suggestions", [])
            )
            for issue_data in data.get("issues", [])
        ]
        return cls(
            is_valid=data["is_valid"],
            issues=issues,
            score=data.get("score", 0.0),
            metadata=data.get("metadata", {})
        )
