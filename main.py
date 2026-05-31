"""Main entry point for the gen_ppt_video application."""

import sys
import argparse
from pathlib import Path

from src.utils.config import load_config, validate_config
from src.utils.logger import setup_logging
from src.orchestrator.api import app


def run_cli(args):
    """Run the CLI version of the application."""
    from src.orchestrator.pipeline import PipelineOrchestrator

    setup_logging(log_level=args.log_level)
    config = load_config()

    if not validate_config(config):
        sys.exit(1)

    orchestrator = PipelineOrchestrator(config)

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}")
        sys.exit(1)

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Processing document: {input_path}")
    result = orchestrator.run_pipeline(
        input_document=input_path,
        output_dir=output_dir,
        max_fix_iterations=args.max_iterations
    )

    if result["status"] == "success":
        print(f"\nPipeline completed successfully!")
        print(f"PowerPoint: {result['pptx_path']}")
        print(f"Video: {result['video_path']}")
    else:
        print(f"\nPipeline failed: {result.get('error', 'Unknown error')}")
        sys.exit(1)


def run_api(args):
    """Run the Flask API server."""
    setup_logging(log_level=args.log_level)
    config = load_config()

    if not validate_config(config):
        sys.exit(1)

    print(f"Starting Flask API server on {config['flask_host']}:{config['flask_port']}")
    app.run(
        host=config["flask_host"],
        port=config["flask_port"],
        debug=config["flask_debug"]
    )


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Generate presentation videos from documents"
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
        help="Logging level"
    )

    subparsers = parser.add_subparsers(dest="command", help="Commands")

    # CLI command
    cli_parser = subparsers.add_parser("cli", help="Run in CLI mode")
    cli_parser.add_argument("input", help="Input document path")
    cli_parser.add_argument(
        "-o", "--output",
        default="outputs",
        help="Output directory (default: outputs)"
    )
    cli_parser.add_argument(
        "-m", "--max-iterations",
        type=int,
        default=3,
        help="Maximum auto-fix iterations (default: 3)"
    )

    # API command
    api_parser = subparsers.add_parser("api", help="Run Flask API server")

    args = parser.parse_args()

    if args.command == "cli":
        run_cli(args)
    elif args.command == "api":
        run_api(args)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
