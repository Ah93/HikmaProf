"""Flask API for the pipeline orchestrator."""

from flask import Flask, request, jsonify, send_file
from pathlib import Path
import logging
import os
from werkzeug.utils import secure_filename

from src.orchestrator.pipeline import PipelineOrchestrator
from src.utils.config import load_config

logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB max file size
app.config["UPLOAD_FOLDER"] = Path("uploads")
app.config["OUTPUT_FOLDER"] = Path("outputs")

# Create necessary directories
app.config["UPLOAD_FOLDER"].mkdir(exist_ok=True)
app.config["OUTPUT_FOLDER"].mkdir(exist_ok=True)

# Load configuration and initialize orchestrator
config = load_config()
orchestrator = PipelineOrchestrator(config)


def allowed_file(filename: str) -> bool:
    """Check if file extension is allowed."""
    allowed_extensions = {"pdf", "docx", "tex"}
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_extensions


@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify({"status": "healthy", "service": "gen_ppt_video"}), 200


@app.route("/api/v1/generate", methods=["POST"])
def generate_video():
    """
    Generate video from uploaded document.

    Expected form data:
        - file: Document file (PDF/DOCX/LaTeX)
        - max_fix_iterations: Optional, maximum auto-fix iterations (default: 3)
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]

    if file.filename == "":
        return jsonify({"error": "Empty filename"}), 400

    if not allowed_file(file.filename):
        return jsonify({"error": "File type not allowed. Use PDF, DOCX, or TEX"}), 400

    try:
        # Save uploaded file
        filename = secure_filename(file.filename)
        upload_path = app.config["UPLOAD_FOLDER"] / filename
        file.save(upload_path)

        # Create output directory for this job
        job_id = os.urandom(8).hex()
        output_dir = app.config["OUTPUT_FOLDER"] / job_id
        output_dir.mkdir(exist_ok=True)

        # Get optional parameters
        max_fix_iterations = int(request.form.get("max_fix_iterations", 3))

        # Run pipeline
        logger.info(f"Starting pipeline for job {job_id}")
        result = orchestrator.run_pipeline(
            input_document=upload_path,
            output_dir=output_dir,
            max_fix_iterations=max_fix_iterations
        )

        if result["status"] == "success":
            return jsonify({
                "status": "success",
                "job_id": job_id,
                "video_path": result["video_path"],
                "pptx_path": result["pptx_path"]
            }), 200
        else:
            return jsonify({
                "status": "error",
                "error": result.get("error", "Unknown error")
            }), 500

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/v1/download/<job_id>/<file_type>", methods=["GET"])
def download_file(job_id: str, file_type: str):
    """
    Download generated files.

    Args:
        job_id: Job identifier
        file_type: Type of file to download ('video' or 'pptx')
    """
    output_dir = app.config["OUTPUT_FOLDER"] / job_id

    if not output_dir.exists():
        return jsonify({"error": "Job not found"}), 404

    if file_type == "video":
        file_path = output_dir / "output_video.mp4"
        mimetype = "video/mp4"
    elif file_type == "pptx":
        file_path = output_dir / "presentation.pptx"
        mimetype = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    else:
        return jsonify({"error": "Invalid file type"}), 400

    if not file_path.exists():
        return jsonify({"error": "File not found"}), 404

    return send_file(file_path, mimetype=mimetype, as_attachment=True)


@app.route("/api/v1/status/<job_id>", methods=["GET"])
def get_job_status(job_id: str):
    """
    Get status of a job.

    Args:
        job_id: Job identifier
    """
    output_dir = app.config["OUTPUT_FOLDER"] / job_id

    if not output_dir.exists():
        return jsonify({"error": "Job not found"}), 404

    video_exists = (output_dir / "output_video.mp4").exists()
    pptx_exists = (output_dir / "presentation.pptx").exists()

    if video_exists:
        status = "completed"
    elif pptx_exists:
        status = "in_progress"
    else:
        status = "started"

    return jsonify({
        "job_id": job_id,
        "status": status,
        "video_ready": video_exists,
        "pptx_ready": pptx_exists
    }), 200


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    app.run(host="0.0.0.0", port=5000, debug=True)
