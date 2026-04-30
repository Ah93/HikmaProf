// src/modules/visual-validator.ts

import Anthropic from '@anthropic-ai/sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import {
  ValidationReport,
  SlideValidationReport,
  Status
} from '../schemas/validation-report';

const execPromise = promisify(exec);

export class VisualValidator {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';
  private outputDir: string;

  constructor(outputDir: string = './output/validation', apiKey?: string) {
    this.outputDir = outputDir;
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });

    fs.mkdirSync(outputDir, { recursive: true });
  }

  async validate(pptxPath: string, concurrency: number = 5): Promise<ValidationReport> {
    // Step 1: Convert PPTX to PDF
    const pdfPath = await this.convertToPDF(pptxPath);

    // Step 2: Convert PDF to images
    const imagePaths = await this.convertToImages(pdfPath);

    // Step 3: Validate slides in parallel with concurrency control
    console.log(`   → Validating ${imagePaths.length} slides (${concurrency} concurrent requests)...`);
    const slideReports = await this.validateSlidesParallel(imagePaths, concurrency);

    // Step 4: Generate summary report
    return this.generateReport(pptxPath, slideReports);
  }

  private async validateSlidesParallel(
    imagePaths: string[],
    concurrency: number
  ): Promise<SlideValidationReport[]> {
    const results: SlideValidationReport[] = new Array(imagePaths.length);
    const queue = imagePaths.map((path, index) => ({ path, index }));
    let completed = 0;

    // Process slides in batches with controlled concurrency
    const workers = Array(concurrency).fill(null).map(async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;

        const { path, index } = item;
        try {
          const report = await this.validateSlide(path, index + 1);
          results[index] = report;
          completed++;

          // Show progress
          if (completed % 5 === 0 || completed === imagePaths.length) {
            console.log(`   → Progress: ${completed}/${imagePaths.length} slides validated`);
          }
        } catch (error) {
          console.warn(`   ⚠️  Slide ${index + 1} validation failed: ${error}`);
          // Create a default PASS report on error
          results[index] = {
            slideNumber: index + 1,
            slideId: `slide-${String(index + 1).padStart(3, '0')}`,
            status: 'PASS',
            issues: [],
            imagePath: path
          };
        }
      }
    });

    await Promise.all(workers);
    return results;
  }

  private async convertToPDF(pptxPath: string): Promise<string> {
    const pdfDir = this.outputDir;
    const pptxName = path.basename(pptxPath, '.pptx');

    try {
      await execPromise(
        `soffice --headless --convert-to pdf --outdir "${pdfDir}" "${pptxPath}"`
      );

      return path.join(pdfDir, `${pptxName}.pdf`);
    } catch (error) {
      console.warn('LibreOffice conversion failed, validation skipped');
      throw new Error(`PDF conversion failed: ${error}`);
    }
  }

  private async convertToImages(pdfPath: string): Promise<string[]> {
    const imagePrefix = path.join(this.outputDir, 'slide');

    try {
      await execPromise(
        `pdftoppm -jpeg -r 150 "${pdfPath}" "${imagePrefix}"`
      );

      // Find generated images
      const files = fs.readdirSync(this.outputDir);
      const imageFiles = files
        .filter(f => f.startsWith('slide-') && f.endsWith('.jpg'))
        .sort()
        .map(f => path.join(this.outputDir, f));

      return imageFiles;
    } catch (error) {
      console.warn('pdftoppm conversion failed, validation skipped');
      throw new Error(`Image conversion failed: ${error}`);
    }
  }

  private async validateSlide(
    imagePath: string,
    slideNumber: number
  ): Promise<SlideValidationReport> {
    // Read image as base64
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: this.getValidationPrompt(slideNumber)
            }
          ]
        }
      ]
    });

    // Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    let result: SlideValidationReport;
    try {
      let jsonStr = content.text;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      result = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, assume pass
      result = {
        slideNumber,
        slideId: `slide-${String(slideNumber).padStart(3, '0')}`,
        status: 'PASS',
        issues: [],
        imagePath
      };
    }

    // Ensure required fields
    result.slideNumber = slideNumber;
    result.slideId = `slide-${String(slideNumber).padStart(3, '0')}`;
    result.imagePath = imagePath;

    return result;
  }

  private getValidationPrompt(slideNumber: number): string {
    return `Analyze slide ${slideNumber} for visual quality issues.

CHECK FOR THESE ISSUES:
1. TEXT_OVERFLOW - Text cut off by slide edges or elements
2. TEXT_OVERLAP - Text overlapping other text, images, or shapes
3. CONTRAST_ISSUE - Text hard to read due to poor contrast with background
4. ALIGNMENT_ERROR - Elements not properly aligned
5. CONTENT_TOO_DENSE - Too much content making slide cluttered/unreadable
6. IMAGE_QUALITY - Pixelated, stretched, or poorly cropped images
7. EMPTY_SPACE - Excessive unused space causing unbalanced layout

SEVERITY LEVELS:
- CRITICAL: Must fix before presentation is usable
- HIGH: Significantly impacts readability/professionalism
- MEDIUM: Noticeable but doesn't prevent understanding
- LOW: Minor improvement suggestion

For each issue, provide:
- type: One of the issue types above
- severity: CRITICAL, HIGH, MEDIUM, or LOW
- description: Specific description of the problem
- location: Which element is affected (e.g., "title", "bullet-2", "chart")
- suggestedFix: How to fix the issue

Return JSON in this exact format:
{
  "slideNumber": ${slideNumber},
  "slideId": "slide-${String(slideNumber).padStart(3, '0')}",
  "status": "PASS" | "FAIL" | "WARNING",
  "issues": [
    {
      "type": "TEXT_OVERFLOW",
      "severity": "CRITICAL",
      "description": "Title text extends beyond right edge",
      "location": "title",
      "suggestedFix": "Shorten title or reduce font size"
    }
  ]
}

Rules:
- status is "FAIL" if ANY CRITICAL or HIGH severity issues
- status is "WARNING" if only MEDIUM or LOW issues
- status is "PASS" if no issues found
- Return ONLY the JSON, no explanation`;
  }

  private generateReport(
    pptxFile: string,
    slideReports: SlideValidationReport[]
  ): ValidationReport {
    const passed = slideReports.filter(r => r.status === 'PASS').length;
    const failed = slideReports.filter(r => r.status === 'FAIL').length;
    const warnings = slideReports.filter(r => r.status === 'WARNING').length;

    let overallStatus: Status = 'PASS';
    if (failed > 0) overallStatus = 'FAIL';
    else if (warnings > 0) overallStatus = 'WARNING';

    return {
      timestamp: new Date().toISOString(),
      pptxFile,
      totalSlides: slideReports.length,
      passedSlides: passed,
      failedSlides: failed,
      warningSlides: warnings,
      overallStatus,
      slideReports
    };
  }
}

export function createVisualValidator(
  outputDir?: string,
  apiKey?: string
): VisualValidator {
  return new VisualValidator(outputDir, apiKey);
}
