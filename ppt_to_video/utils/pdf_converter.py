import os
import subprocess
from pdf2image import convert_from_path
from PIL import Image

def convert_pdf_to_images(pdf_path, output_folder, dpi=300):
    """
    Convert PDF or PPT to images using LibreOffice and pdf2image

    Args:
        pdf_path: Path to the PDF or PPT file
        output_folder: Folder to save the images
        dpi: DPI for image quality

    Returns:
        List of image file paths
    """
    os.makedirs(output_folder, exist_ok=True)

    if pdf_path.lower().endswith(('.ppt', '.pptx')):
        pdf_path = convert_ppt_to_pdf(pdf_path, output_folder)

    try:
        images = convert_from_path(pdf_path, dpi=dpi)

        image_paths = []
        for i, image in enumerate(images):
            image_path = os.path.join(output_folder, f'slide_{i}.png')
            image.save(image_path, 'PNG')
            image_paths.append(image_path)

        return image_paths

    except Exception as e:
        raise Exception(f"Error converting PDF to images: {str(e)}")

def convert_ppt_to_pdf(ppt_path, output_folder):
    """
    Convert PPT/PPTX to PDF using LibreOffice headless

    Args:
        ppt_path: Path to the PPT file
        output_folder: Folder to save the PDF

    Returns:
        Path to the converted PDF file
    """
    try:
        cmd = [
            'libreoffice',
            '--headless',
            '--convert-to', 'pdf',
            '--outdir', output_folder,
            ppt_path
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            raise Exception(f"LibreOffice conversion failed: {result.stderr}")

        pdf_filename = os.path.splitext(os.path.basename(ppt_path))[0] + '.pdf'
        pdf_path = os.path.join(output_folder, pdf_filename)

        if not os.path.exists(pdf_path):
            raise Exception(f"PDF file was not created at {pdf_path}")

        return pdf_path

    except subprocess.TimeoutExpired:
        raise Exception("LibreOffice conversion timed out")
    except FileNotFoundError:
        raise Exception("LibreOffice is not installed. Please install it using: sudo apt-get install libreoffice")
    except Exception as e:
        raise Exception(f"Error converting PPT to PDF: {str(e)}")

def resize_image(image_path, max_width=1920, max_height=1080):
    """
    Resize image to fit within max dimensions while maintaining aspect ratio

    Args:
        image_path: Path to the image
        max_width: Maximum width
        max_height: Maximum height

    Returns:
        Resized image path
    """
    try:
        img = Image.open(image_path)
        img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
        img.save(image_path)
        return image_path
    except Exception as e:
        raise Exception(f"Error resizing image: {str(e)}")
