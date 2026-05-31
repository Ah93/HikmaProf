"""
Slidev renderer — exports a Slidev .md file to PNG slide images using
the Slidev CLI (npx @slidev/cli export).

Requirements:
  - Node.js + npx available
  - Playwright Chromium installed: npx playwright install chromium
"""
import os
import subprocess
import glob
import shutil
import sys


def _find_npx() -> str:
    """Return the npx executable name for the current platform."""
    if sys.platform == 'win32':
        npx = shutil.which('npx.cmd') or shutil.which('npx')
    else:
        npx = shutil.which('npx')
    if not npx:
        raise RuntimeError(
            "npx not found. Install Node.js from https://nodejs.org/"
        )
    return npx


def render_slidev_to_images(md_path: str, output_dir: str) -> list:
    """
    Export a Slidev .md file to PNG images.

    Args:
        md_path:    Absolute path to the Slidev .md file.
        output_dir: Directory where PNG files will be written.

    Returns:
        Sorted list of absolute PNG file paths.
        Returns empty list on failure (caller should fall back to PPTX path).
    """
    os.makedirs(output_dir, exist_ok=True)
    abs_md   = os.path.abspath(md_path)
    abs_out  = os.path.abspath(output_dir)
    work_dir = os.path.dirname(abs_md)

    print(f"[SLIDEV] Exporting {abs_md}")
    print(f"[SLIDEV] Output dir: {abs_out}")

    try:
        npx = _find_npx()

        result = subprocess.run(
            [
                npx, '--yes', '@slidev/cli', 'export',
                abs_md,
                '--format',  'png',
                '--output',  abs_out,
                '--timeout', '60000',
                '--dark',    'false',
            ],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            timeout=300,
            cwd=work_dir,
        )

        stdout = result.stdout.strip()
        stderr = result.stderr.strip()

        if result.returncode != 0:
            print(f"[SLIDEV] Export failed (exit {result.returncode})")
            if stderr:
                print(f"[SLIDEV] stderr: {stderr[:800]}")
            return []

        if stdout:
            print(f"[SLIDEV] {stdout[:400]}")

        # Collect and sort PNG files
        png_files = sorted(glob.glob(os.path.join(abs_out, '*.png')))

        if not png_files:
            print("[SLIDEV] No PNG files produced — check Playwright installation.")
            print("[SLIDEV] Run: npx playwright install chromium")
            return []

        print(f"[SLIDEV] Generated {len(png_files)} slide images")
        return png_files

    except subprocess.TimeoutExpired:
        print("[SLIDEV] Export timed out after 5 minutes")
        return []
    except Exception as exc:
        print(f"[SLIDEV] Unexpected error: {exc}")
        return []


def install_playwright_if_needed() -> bool:
    """
    Best-effort: install Playwright Chromium if not already present.
    Returns True if successful or already installed.
    """
    try:
        npx = _find_npx()
        result = subprocess.run(
            [npx, 'playwright', 'install', 'chromium'],
            capture_output=True, timeout=120
        )
        return result.returncode == 0
    except Exception:
        return False
