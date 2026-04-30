"""Pipeline orchestrator for coordinating all modules."""

from typing import Dict, Any, Optional
from pathlib import Path
import logging

from src.modules.document_parser import DocumentParser
from src.modules.content_analyzer import ContentAnalyzer
from src.modules.pptx_generator import PPTXGenerator
from src.modules.visual_validator import VisualValidator
from src.modules.auto_fixer import AutoFixer
from src.modules.transcript_generator import TranscriptGenerator
from src.modules.video_composer import VideoComposer


logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    """Orchestrates the entire document-to-video pipeline."""

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize the pipeline orchestrator.

        Args:
            config: Configuration dictionary with API keys and settings
        """
        self.config = config
        self._initialize_modules()

    def _initialize_modules(self):
        """Initialize all pipeline modules."""
        self.document_parser = DocumentParser()
        self.content_analyzer = ContentAnalyzer(
            api_key=self.config.get("anthropic_api_key")
        )
        self.pptx_generator = PPTXGenerator()
        self.visual_validator = VisualValidator(
            api_key=self.config.get("anthropic_api_key")
        )
        self.auto_fixer = AutoFixer(
            api_key=self.config.get("anthropic_api_key")
        )
        self.transcript_generator = TranscriptGenerator(
            api_key=self.config.get("anthropic_api_key")
        )
        self.video_composer = VideoComposer(
            did_api_key=self.config.get("did_api_key"),
            elevenlabs_api_key=self.config.get("elevenlabs_api_key")
        )

    def run_pipeline(
        self,
        input_document: Path,
        output_dir: Path,
        max_fix_iterations: int = 3
    ) -> Dict[str, Any]:
        """
        Run the complete pipeline from document to video.

        Args:
            input_document: Path to input document (PDF/DOCX/LaTeX)
            output_dir: Directory to save outputs
            max_fix_iterations: Maximum number of auto-fix iterations

        Returns:
            Dictionary with pipeline results and file paths
        """
        logger.info(f"Starting pipeline for document: {input_document}")

        try:
            # Step 1: Parse document
            logger.info("Step 1/7: Parsing document...")
            document_content = self.document_parser.parse(input_document)

            # Step 2: Analyze content and create slide plan
            logger.info("Step 2/7: Analyzing content...")
            slide_plan = self.content_analyzer.analyze(document_content)

            # Step 3: Generate PPTX
            logger.info("Step 3/7: Generating PowerPoint...")
            pptx_path = output_dir / "presentation.pptx"
            pptx_path = self.pptx_generator.generate(slide_plan, pptx_path)

            # Step 4-5: Validate and fix PPTX
            logger.info("Step 4/7: Validating PowerPoint...")
            for iteration in range(max_fix_iterations):
                validation_report = self.visual_validator.validate(pptx_path)

                if validation_report.get("is_valid", False):
                    logger.info("PowerPoint validated successfully")
                    break

                logger.info(f"Step 5/7: Auto-fixing issues (iteration {iteration + 1})...")
                pptx_path = self.auto_fixer.fix(pptx_path, validation_report)

            # Step 6: Generate transcript
            logger.info("Step 6/7: Generating transcript...")
            transcript_plan = self.transcript_generator.generate(
                slide_plan, document_content
            )

            # Step 7: Compose video
            logger.info("Step 7/7: Composing video...")
            video_path = output_dir / "output_video.mp4"
            video_path = self.video_composer.compose(
                pptx_path, transcript_plan, video_path
            )

            logger.info("Pipeline completed successfully")

            return {
                "status": "success",
                "document_content": document_content,
                "slide_plan": slide_plan,
                "pptx_path": str(pptx_path),
                "transcript_plan": transcript_plan,
                "video_path": str(video_path)
            }

        except Exception as e:
            logger.error(f"Pipeline failed: {str(e)}", exc_info=True)
            return {
                "status": "error",
                "error": str(e)
            }

    def run_partial_pipeline(
        self,
        start_step: str,
        end_step: str,
        input_data: Any,
        output_dir: Path
    ) -> Dict[str, Any]:
        """
        Run a partial pipeline from a specific step to another.

        Args:
            start_step: Starting step name
            end_step: Ending step name
            input_data: Input data for the starting step
            output_dir: Directory to save outputs

        Returns:
            Dictionary with partial pipeline results
        """
        raise NotImplementedError("Partial pipeline execution pending")
