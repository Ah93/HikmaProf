<<<<<<< HEAD
# AI-Powered Presentation Generation Pipeline

A Flask-based application that automatically generates professional PowerPoint presentations from research papers and documents using Claude AI.

## Features

- **Multi-format Support**: PDF, DOCX, and LaTeX/TEX files
- **AI-Powered Analysis**: Claude AI analyzes content and plans optimal slide layouts
- **Professional Layouts**: 11 different slide layout types
- **Visual Validation**: Optional quality checking with Claude Vision API
- **Auto-Fixing**: Automatically corrects visual issues in presentations
- **REST API**: Easy-to-use Flask API for integration

## Architecture

```
Input Document (PDF/DOCX/TEX)
    ↓
Document Parser → Structured JSON
    ↓
Content Analyzer (Claude AI) → Slide Plan
    ↓
PPTX Generator → PowerPoint File
    ↓
Visual Validator (Optional) → Quality Report
    ↓
Auto-Fixer (If needed) → Final PPTX
```

## Installation

### Prerequisites

- **Node.js** (v18 or higher)
- **Python** (v3.8 or higher)
- **npm** (comes with Node.js)
- **Anthropic API Key** (get from https://console.anthropic.com)

### Optional (for validation):
- **LibreOffice** (for PPTX to PDF conversion)
- **poppler-utils** (for PDF to image conversion)

### Setup Steps

1. **Clone or navigate to the project directory**

```bash
cd /home/ushah/genppt
```

2. **Install Node.js dependencies**

```bash
npm install
```

3. **Install Python dependencies**

```bash
pip install -r requirements.txt
# or use pip3
pip3 install -r requirements.txt
```

4. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env and add your Anthropic API key
nano .env
```

Add your API key:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

5. **Install optional dependencies (for validation)**

On Ubuntu/Debian:
```bash
sudo apt-get update
sudo apt-get install -y libreoffice poppler-utils pandoc
```

On macOS:
```bash
brew install libreoffice poppler pandoc
```

## Usage

### Option 1: Flask API Server

1. **Start the Flask server**

```bash
python app.py
# or
python3 app.py
```

2. **Test the API**

Health check:
```bash
curl http://localhost:5000/health
```

Generate presentation:
```bash
curl -X POST http://localhost:5000/api/generate \
  -F "file=@your-document.pdf" \
  -F "output_name=my-presentation"
```

3. **API Endpoints**

- `GET /health` - Health check
- `POST /api/generate` - Generate presentation
  - Form data:
    - `file`: Document file (required)
    - `output_name`: Output filename (optional)
    - `skip_validation`: Skip validation (optional, default: false)
- `GET /api/download/<job_id>/<filename>` - Download generated file
- `GET /api/job/<job_id>` - Get job status and metadata
- `GET /api/jobs` - List all jobs

### Option 2: Command Line Interface

Run the pipeline directly:

```bash
npx ts-node src/pipeline.ts your-document.pdf output-name
```

Examples:

```bash
# Generate from PDF
npx ts-node src/pipeline.ts research-paper.pdf my-presentation

# Generate from DOCX
npx ts-node src/pipeline.ts document.docx slides

# Skip validation (faster, useful if dependencies not installed)
SKIP_VALIDATION=true npx ts-node src/pipeline.ts paper.pdf output
```

## Project Structure

```
genppt/
├── src/
│   ├── modules/
│   │   ├── document-parser.ts      # Extract content from documents
│   │   ├── content-analyzer.ts     # AI slide planning
│   │   ├── pptx-generator.ts       # Generate PowerPoint
│   │   ├── visual-validator.ts     # Quality validation
│   │   └── auto-fixer.ts           # Auto-fix issues
│   ├── schemas/
│   │   ├── document-content.ts     # Type definitions
│   │   ├── slide-plan.ts
│   │   └── validation-report.ts
│   ├── templates/
│   │   └── slide-layouts/          # HTML templates for slides
│   │       ├── title-slide.html
│   │       ├── title-bullets.html
│   │       ├── section-header.html
│   │       ├── title-two-columns.html
│   │       ├── title-cards.html
│   │       ├── conclusion.html
│   │       └── thank-you.html
│   └── pipeline.ts                 # Main orchestrator
├── output/
│   ├── parsed/                     # Extracted content
│   ├── slides/                     # Generated HTML slides
│   ├── validation/                 # Validation images
│   ├── final/                      # Final presentations
│   └── jobs/                       # API job outputs
├── uploads/                        # Temporary file uploads
├── app.py                          # Flask API server
├── package.json
├── tsconfig.json
├── requirements.txt
└── README.md
```

## Available Slide Layouts

1. **title-slide** - Opening slide with title, subtitle, author, date
2. **section-header** - Section divider slides
3. **title-bullets** - Content with bullet points (most common)
4. **title-two-columns** - Two-column comparison layout
5. **title-image-text** - Image with accompanying text
6. **title-chart** - Data visualization slides
7. **title-table** - Tabular data presentation
8. **title-cards** - Key metrics or features (2-4 cards)
9. **quote-slide** - Important quotes or findings
10. **conclusion** - Summary with key takeaways
11. **thank-you** - Closing slide

## Configuration

### Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `SKIP_VALIDATION` - Set to 'true' to skip validation step (optional)

### Pipeline Configuration

In `src/pipeline.ts`:
- `outputDir` - Where to save generated files
- `maxFixIterations` - Max auto-fix attempts (default: 5)
- `skipValidation` - Skip visual validation step

## Output Files

For each generation, the pipeline creates:

1. **document-content.json** - Parsed document structure
2. **slide-plan.json** - AI-generated slide plan
3. **validation-report.json** - Quality validation results (if enabled)
4. **[output-name].pptx** - Final PowerPoint presentation

## Troubleshooting

### "npm dependencies may not be installed"
```bash
npm install
```

### "Validation skipped (dependencies not available)"
This is normal if LibreOffice/pdftoppm are not installed. The presentation is still generated, just without validation. To enable validation:
```bash
# Ubuntu/Debian
sudo apt-get install libreoffice poppler-utils

# macOS
brew install libreoffice poppler
```

### "Failed to parse PDF/DOCX"
Ensure pandoc is installed:
```bash
# Ubuntu/Debian
sudo apt-get install pandoc

# macOS
brew install pandoc
```

### API returns 413 (File too large)
Current limit is 50MB. Edit `app.py` to increase:
```python
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
```

## Development

### Running in Development Mode

```bash
# TypeScript with auto-reload
npm run dev

# Flask with debug mode
python app.py
```

### Building TypeScript

```bash
npm run build
```

## API Usage Examples

### Python Example

```python
import requests

# Upload and generate
with open('paper.pdf', 'rb') as f:
    response = requests.post(
        'http://localhost:5000/api/generate',
        files={'file': f},
        data={'output_name': 'my-presentation'}
    )

result = response.json()
print(f"Job ID: {result['job_id']}")
print(f"Status: {result['status']}")

# Download the presentation
if result['status'] == 'completed':
    download_url = f"http://localhost:5000{result['download_url']}"
    pptx = requests.get(download_url)
    with open('presentation.pptx', 'wb') as f:
        f.write(pptx.content)
```

### JavaScript Example

```javascript
const FormData = require('form-data');
const fs = require('fs');
const axios = require('axios');

async function generatePresentation() {
  const form = new FormData();
  form.append('file', fs.createReadStream('paper.pdf'));
  form.append('output_name', 'my-presentation');

  const response = await axios.post(
    'http://localhost:5000/api/generate',
    form,
    { headers: form.getHeaders() }
  );

  console.log('Job ID:', response.data.job_id);
  console.log('Status:', response.data.status);

  if (response.data.status === 'completed') {
    // Download the file
    const download = await axios.get(
      `http://localhost:5000${response.data.download_url}`,
      { responseType: 'arraybuffer' }
    );

    fs.writeFileSync('presentation.pptx', download.data);
  }
}

generatePresentation();
```

### cURL Example

```bash
# Generate presentation
curl -X POST http://localhost:5000/api/generate \
  -F "file=@research-paper.pdf" \
  -F "output_name=research-presentation" \
  -F "skip_validation=false"

# Download (use job_id from previous response)
curl -O http://localhost:5000/api/download/JOB_ID/research-presentation.pptx

# Check job status
curl http://localhost:5000/api/job/JOB_ID

# List all jobs
curl http://localhost:5000/api/jobs
```

## Performance

- **Typical Processing Time**: 2-5 minutes for a 10-page document
- **With Validation**: +1-2 minutes
- **Without Validation**: Faster, recommended for development

## License

This project is provided as-is for educational and research purposes.

## Credits

Built with:
- **Claude AI** (Anthropic) - Content analysis and planning
- **PptxGenJS** - PowerPoint generation
- **Flask** - REST API framework
- **TypeScript/Node.js** - Pipeline implementation

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review the logs in the API response
3. Set `SKIP_VALIDATION=true` if validation dependencies are missing
=======
# gen_ppt_video
>>>>>>> 42cb5cac724f4a5dd580a2e6037b4977d05bb13a
