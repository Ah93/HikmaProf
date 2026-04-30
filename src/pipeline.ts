// src/pipeline.ts

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config();
import { createDocumentParser } from './modules/document-parser';
import { createContentAnalyzer } from './modules/content-analyzer';
import { createPPTXGenerator } from './modules/pptx-generator';
import { createEnhancedPPTXGenerator, SlideImages } from './modules/pptx-generator-enhanced';
import { createVisualValidator } from './modules/visual-validator';
import { createAutoFixer } from './modules/auto-fixer';
import { createImageGenerator, ImageGenerator } from './modules/image-generator';
import { DocumentContent } from './schemas/document-content';
import { SlidePlan, SlideDefinition } from './schemas/slide-plan';
import { ValidationReport } from './schemas/validation-report';
import { ImageGenerationOptions, BatchImageResult } from './schemas/image-types';
import { getTemplateStyle, getColorScheme } from './config/templates';

export interface PipelineConfig {
  outputDir: string;
  maxFixIterations: number;
  apiKey?: string;
  skipValidation?: boolean;
  templateStyle?: string;
  colorScheme?: string;
  validationConcurrency?: number;
  previewMode?: boolean; // Stop after analysis for user review
  numSlides?: number; // Target number of slides (5-30)
  // Layout options
  slideLayout?: string; // 'default' | 'section-header'
  // Image generation options
  generateImages?: boolean;
  imageOptions?: Partial<ImageGenerationOptions>;
  skipImageGeneration?: boolean;
  // Language / RTL
  language?: string; // e.g. 'en', 'ar', 'fr'
}

export interface PipelineResult {
  success: boolean;
  pptxPath: string;
  documentContent: DocumentContent;
  slidePlan: SlidePlan;
  validationReport?: ValidationReport;
  fixIterations: number;
  errors: string[];
  // Image generation results
  imageGenerationResult?: BatchImageResult;
  generatedImages?: SlideImages;
}

class PresentationPipeline {
  private config: PipelineConfig;
  private documentParser: ReturnType<typeof createDocumentParser>;
  private contentAnalyzer: ReturnType<typeof createContentAnalyzer>;
  private pptxGenerator: ReturnType<typeof createPPTXGenerator> | ReturnType<typeof createEnhancedPPTXGenerator>;
  private validator: ReturnType<typeof createVisualValidator>;
  private autoFixer: ReturnType<typeof createAutoFixer>;
  private imageGenerator: ImageGenerator | null = null;
  private progressFile?: string;

  constructor(config: PipelineConfig) {
    this.config = config;
    this.progressFile = process.env.PROGRESS_FILE;

    // Initialize all modules
    this.documentParser = createDocumentParser(
      path.join(config.outputDir, 'parsed')
    );
    this.contentAnalyzer = createContentAnalyzer(config.apiKey);

    // Use enhanced generator if template style or color scheme is specified
    if (config.templateStyle || config.colorScheme) {
      this.pptxGenerator = createEnhancedPPTXGenerator(config.outputDir, {
        templateStyle: config.templateStyle || 'modern',
        colorScheme: config.colorScheme || 'blue',
        language: config.language || 'en'
      });
    } else {
      this.pptxGenerator = createPPTXGenerator(config.outputDir);
    }

    this.validator = createVisualValidator(
      path.join(config.outputDir, 'validation'),
      config.apiKey
    );
    this.autoFixer = createAutoFixer(
      config.outputDir,
      config.maxFixIterations,
      config.apiKey,
      config.validationConcurrency || 5,
      {
        templateStyle: config.templateStyle,
        colorScheme: config.colorScheme
      }
    );

    // Initialize image generator if enabled
    if (config.generateImages && !config.skipImageGeneration) {
      const imageCacheDir = process.env.IMAGE_CACHE_DIR || path.join(config.outputDir, 'image-cache');
      this.imageGenerator = createImageGenerator(config.outputDir, imageCacheDir, {
        enabled: true,
        ...config.imageOptions
      });
    }

    // Ensure output directory exists
    fs.mkdirSync(config.outputDir, { recursive: true });
  }

  /**
   * Generate images for slides
   */
  private async generateSlideImages(slidePlan: SlidePlan): Promise<{ result: BatchImageResult; images: SlideImages } | null> {
    if (!this.imageGenerator || this.config.skipImageGeneration) {
      return null;
    }

    try {
      await this.imageGenerator.initialize();

      if (!this.imageGenerator.isEnabled()) {
        console.log('   ⚠️  Image generation not available');
        return null;
      }

      const templateStyle = getTemplateStyle(this.config.templateStyle || 'modern');
      const colorScheme = getColorScheme(this.config.colorScheme || 'blue');

      // Generate image prompts
      const prompts = this.imageGenerator.generateImagePrompts(
        slidePlan.slides,
        templateStyle,
        colorScheme,
        templateStyle.imageStyle
      );

      if (prompts.length === 0) {
        console.log('   - No images needed for this template/slides');
        return null;
      }

      console.log(`   - Generating ${prompts.length} images...`);

      // Convert prompts to requests
      const requests = this.imageGenerator.convertPromptsToRequests(
        prompts,
        colorScheme,
        templateStyle
      );

      // Generate images
      const result = await this.imageGenerator.generateBatch(requests);

      // Organize images by slide ID
      const images: SlideImages = {};
      for (const image of result.images) {
        // Extract slide ID from image ID (format: img-slideId-type)
        const parts = image.id.split('-');
        if (parts.length >= 3) {
          const slideId = parts.slice(1, -1).join('-');
          if (!images[slideId]) {
            images[slideId] = [];
          }
          images[slideId].push(image);
        }
      }

      console.log(`   ✓ Generated ${result.newGenerations} new images (${result.cacheHits} from cache)`);

      if (result.errors.length > 0) {
        console.log(`   ⚠️  ${result.errors.length} images failed to generate`);
      }

      return { result, images };
    } catch (error) {
      console.error(`   ❌ Image generation failed: ${error}`);
      return null;
    }
  }

  private writeProgress(stage: string, progress: number, step: string, description: string) {
    if (this.progressFile) {
      try {
        fs.appendFileSync(this.progressFile, `${stage}|${progress}|${step}|${description}\n`);
      } catch (err) {
        // Ignore errors in progress reporting
      }
    }
  }

  private buildTranscriptText(slidePlan: SlidePlan): string {
    // Format transcript compatible with ppt_to_video:
    // - Uses "## Slide [number] – [title]" headers
    // - Uses "---" separators between slides
    const blocks = slidePlan.slides.map(slide => {
      const slideNo = slide.slideNumber ?? 0;
      const notes = (slide.speakerNotes || '').trim();

      // Get title for header
      const title = (slide.content as any)?.title ? String((slide.content as any).title).trim() : '';

      // Build fallback narration from slide content
      let fallback = '';
      const bullets = Array.isArray((slide.content as any)?.bullets)
        ? (slide.content as any).bullets
            .map((b: any) => (typeof b === 'string' ? b : b?.text))
            .filter(Boolean)
            .map((t: any) => String(t).trim())
        : [];

      if (title && bullets.length) {
        fallback = `${title}. ${bullets.slice(0, 4).join('. ')}`.trim();
      } else if (title) {
        fallback = title;
      } else {
        fallback = `Slide ${slideNo}.`;
      }

      const body = (notes || fallback).replace(/\r\n/g, '\n').trim();

      // Format: ## Slide [number] – [title] (compatible with ppt_to_video)
      const header = title ? `## Slide ${slideNo} – ${title}` : `## Slide ${slideNo}`;
      return `${header}\n${body}`;
    });

    // Join with --- separator (compatible with ppt_to_video)
    return blocks.join('\n---\n') + '\n';
  }

  async runFromSlidePlan(slidePlanPath: string, outputFileName: string): Promise<PipelineResult> {
    // Load existing slide plan and continue from Stage 3
    const errors: string[] = [];
    let slidePlan: SlidePlan | null = null;
    let validationReport: ValidationReport | null = null;
    let pptxPath = '';
    let fixIterations = 0;

    try {
      // Load slide plan
      console.log('📋 Loading slide plan from:', slidePlanPath);
      const planJson = fs.readFileSync(slidePlanPath, 'utf-8');
      slidePlan = JSON.parse(planJson);

      if (!slidePlan) {
        throw new Error('Failed to load slide plan');
      }

      console.log(`   ✓ Loaded ${slidePlan.slides.length} slides`);

      // Load document content if available
      const docContentPath = path.join(this.config.outputDir, 'document-content.json');
      let documentContent: DocumentContent | null = null;
      if (fs.existsSync(docContentPath)) {
        documentContent = JSON.parse(fs.readFileSync(docContentPath, 'utf-8'));
      }

      // Continue from Stage 3
      console.log('\n📊 Stage 3: Generating PowerPoint...');
      this.writeProgress('generating', 70, 'Generating PowerPoint', 'Creating professional slides');
      pptxPath = await this.pptxGenerator.generate(
        slidePlan,
        `${outputFileName}_draft.pptx`
      );
      console.log(`   ✓ Created draft PPTX: ${pptxPath}`);

      const transcriptText = this.buildTranscriptText(slidePlan!);
      const transcriptPath = path.join(this.config.outputDir, `${outputFileName}_transcript.txt`);
      fs.writeFileSync(transcriptPath, transcriptText, 'utf-8');

      // Continue with validation if enabled
      if (!this.config.skipValidation) {
        try {
          console.log('\n🔍 Stage 4: Validating presentation...');
          this.writeProgress('validating', 85, 'Validating Quality', 'Checking presentation quality');
          validationReport = await this.validator.validate(
            pptxPath,
            this.config.validationConcurrency || 5
          );
          console.log(`   ✓ Validation complete:`);
          console.log(`     - Passed: ${validationReport.passedSlides}/${validationReport.totalSlides}`);
          console.log(`     - Failed: ${validationReport.failedSlides}`);
          console.log(`     - Warnings: ${validationReport.warningSlides}`);

          fs.writeFileSync(
            path.join(this.config.outputDir, 'validation-report.json'),
            JSON.stringify(validationReport, null, 2)
          );

          if (validationReport.overallStatus !== 'PASS') {
            console.log('\n🔧 Stage 5: Auto-fixing issues...');
            const fixResult = await this.autoFixer.fix(
              slidePlan,
              validationReport,
              outputFileName + '.pptx'
            );
            pptxPath = fixResult.finalPptxPath;
            validationReport = fixResult.finalReport;
            fixIterations = fixResult.iterations;
            console.log(`   ✓ Fixed in ${fixIterations} iteration(s)`);
            console.log(`   ✓ Final status: ${validationReport.overallStatus}`);
          } else {
            const finalPath = path.join(
              this.config.outputDir,
              'final',
              outputFileName + '.pptx'
            );
            fs.renameSync(pptxPath, finalPath);
            pptxPath = finalPath;
          }
        } catch (validationError) {
          console.warn('\n⚠️  Validation skipped (dependencies not available)');
          console.warn('   Continuing with generated PPTX...');
          const finalPath = path.join(
            this.config.outputDir,
            'final',
            outputFileName + '.pptx'
          );
          fs.renameSync(pptxPath, finalPath);
          pptxPath = finalPath;
        }
      } else {
        const finalPath = path.join(
          this.config.outputDir,
          'final',
          outputFileName + '.pptx'
        );
        fs.renameSync(pptxPath, finalPath);
        pptxPath = finalPath;
      }

      console.log(`\n✅ Pipeline complete! Output: ${pptxPath}`);

      return {
        success: true,
        pptxPath,
        documentContent: documentContent!,
        slidePlan: slidePlan!,
        validationReport: validationReport || undefined,
        fixIterations,
        errors
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      console.error(`\n❌ Pipeline failed: ${errorMessage}`);
      console.error(error);

      return {
        success: false,
        pptxPath,
        documentContent: null as any,
        slidePlan: slidePlan!,
        validationReport: validationReport || undefined,
        fixIterations,
        errors
      };
    }
  }

  private applySectionHeaderLayout(slidePlan: SlidePlan): SlidePlan {
    const newSlides: SlideDefinition[] = [];
    let slideNumber = 1;

    for (const slide of slidePlan.slides) {
      if (slide.layout === 'title-bullets' && slide.content.title) {
        // Insert a section-header slide before each content slide
        newSlides.push({
          slideNumber: slideNumber++,
          slideId: `${slide.slideId}-section`,
          layout: 'section-header',
          sourceSection: slide.sourceSection,
          content: {
            sectionTitle: slide.content.title,
            sectionNumber: String(newSlides.length + 1)
          },
          speakerNotes: slide.content.title
        });
      }
      // Push original slide with updated slide number
      newSlides.push({ ...slide, slideNumber: slideNumber++ });
    }

    return {
      ...slidePlan,
      presentationMetadata: {
        ...slidePlan.presentationMetadata,
        totalSlides: newSlides.length
      },
      slides: newSlides
    };
  }

  async run(inputFilePath: string, outputFileName: string): Promise<PipelineResult> {
    const errors: string[] = [];
    let documentContent: DocumentContent | null = null;
    let slidePlan: SlidePlan | null = null;
    let validationReport: ValidationReport | null = null;
    let pptxPath = '';
    let fixIterations = 0;
    let imageGenResult: { result: BatchImageResult; images: SlideImages } | null = null;

    try {
      // ===== STAGE 1: Document Parsing =====
      console.log('📄 Stage 1: Parsing document...');
      this.writeProgress('parsing', 20, 'Parsing Document', 'Extracting content and structure');
      documentContent = await this.documentParser.parse(inputFilePath);
      console.log(`   ✓ Extracted ${documentContent.sections.length} sections`);
      console.log(`   ✓ Found ${documentContent.figures.length} figures`);
      console.log(`   ✓ Found ${documentContent.tables.length} tables`);

      // Save intermediate result
      fs.writeFileSync(
        path.join(this.config.outputDir, 'document-content.json'),
        JSON.stringify(documentContent, null, 2)
      );

      // ===== STAGE 2: Content Analysis & Slide Planning =====
      console.log('\n🧠 Stage 2: Analyzing content and planning slides...');
      const targetSlides = this.config.numSlides || 12;
      console.log(`   Target: ${targetSlides} slides`);
      this.writeProgress('analyzing', 40, 'AI Analysis', `Claude AI planning ${targetSlides} slides`);
      slidePlan = await this.contentAnalyzer.analyze(documentContent, { numSlides: targetSlides, language: this.config.language || 'en' });
      console.log(`   ✓ Generated ${slidePlan.slides.length} slides`);

      // Generate enhanced transcripts for video narration
      console.log('\n🎤 Generating enhanced video transcripts...');
      this.writeProgress('analyzing', 55, 'Generating Transcripts', 'Creating detailed narration for video');
      slidePlan = await this.contentAnalyzer.generateEnhancedTranscripts(slidePlan, documentContent);
      console.log(`   ✓ Enhanced transcripts generated`);

      // Apply section-header layout if requested
      if (this.config.slideLayout === 'section-header') {
        slidePlan = this.applySectionHeaderLayout(slidePlan);
        console.log(`   ✓ Section-header layout applied (${slidePlan.slides.length} slides total)`);
      }

      // Save intermediate result
      fs.writeFileSync(
        path.join(this.config.outputDir, 'slide-plan.json'),
        JSON.stringify(slidePlan, null, 2)
      );

      const transcriptText = this.buildTranscriptText(slidePlan!);
      const transcriptPath = path.join(this.config.outputDir, `${outputFileName}_transcript.txt`);
      fs.writeFileSync(transcriptPath, transcriptText, 'utf-8');

      // Stop here if preview mode is enabled
      if (this.config.previewMode) {
        console.log('\n👁️  Preview mode: Stopping for user review');
        console.log('   Review the slide plan and call the pipeline again to continue');
        return {
          success: true,
          pptxPath: '',
          documentContent: documentContent!,
          slidePlan: slidePlan!,
          validationReport: undefined,
          fixIterations: 0,
          errors: []
        };
      }

      // ===== STAGE 2.5: Image Generation (Optional) =====
      if (this.config.generateImages && !this.config.skipImageGeneration) {
        console.log('\n🖼️  Stage 2.5: Generating AI images...');
        this.writeProgress('generating', 60, 'Generating Images', 'Creating AI-powered visuals');
        imageGenResult = await this.generateSlideImages(slidePlan);

        if (imageGenResult) {
          // Save image generation results
          fs.writeFileSync(
            path.join(this.config.outputDir, 'image-generation-result.json'),
            JSON.stringify(imageGenResult.result, null, 2)
          );
        }
      }

      // ===== STAGE 3: PPTX Generation =====
      console.log('\n📊 Stage 3: Generating PowerPoint...');
      this.writeProgress('generating', 70, 'Generating PowerPoint', 'Creating professional slides');

      // Pass images to generator if available
      if (imageGenResult && 'setSlideImages' in this.pptxGenerator) {
        (this.pptxGenerator as any).setSlideImages(imageGenResult.images);
      }

      pptxPath = await this.pptxGenerator.generate(
        slidePlan,
        `${outputFileName}_draft.pptx`,
        imageGenResult?.images
      );
      console.log(`   ✓ Created draft PPTX: ${pptxPath}`);

      // ===== STAGE 4: Visual Validation (Optional) =====
      if (!this.config.skipValidation) {
        try {
          console.log('\n🔍 Stage 4: Validating presentation...');
          this.writeProgress('validating', 85, 'Validating Quality', 'Checking presentation quality');
          validationReport = await this.validator.validate(
            pptxPath,
            this.config.validationConcurrency || 5
          );
          console.log(`   ✓ Validation complete:`);
          console.log(`     - Passed: ${validationReport.passedSlides}/${validationReport.totalSlides}`);
          console.log(`     - Failed: ${validationReport.failedSlides}`);
          console.log(`     - Warnings: ${validationReport.warningSlides}`);

          // Save validation report
          fs.writeFileSync(
            path.join(this.config.outputDir, 'validation-report.json'),
            JSON.stringify(validationReport, null, 2)
          );

          // ===== STAGE 5: Auto-Fix (if needed) =====
          if (validationReport.overallStatus !== 'PASS') {
            console.log('\n🔧 Stage 5: Auto-fixing issues...');

            const fixResult = await this.autoFixer.fix(
              slidePlan,
              validationReport,
              outputFileName + '.pptx'
            );

            pptxPath = fixResult.finalPptxPath;
            validationReport = fixResult.finalReport;
            fixIterations = fixResult.iterations;

            console.log(`   ✓ Fixed in ${fixIterations} iteration(s)`);
            console.log(`   ✓ Final status: ${validationReport.overallStatus}`);
          } else {
            // Rename draft to final
            const finalPath = path.join(
              this.config.outputDir,
              'final',
              outputFileName + '.pptx'
            );
            fs.renameSync(pptxPath, finalPath);
            pptxPath = finalPath;
          }
        } catch (validationError) {
          console.warn('\n⚠️  Validation skipped (dependencies not available)');
          console.warn('   Continuing with generated PPTX...');
          // Rename draft to final
          const finalPath = path.join(
            this.config.outputDir,
            'final',
            outputFileName + '.pptx'
          );
          fs.renameSync(pptxPath, finalPath);
          pptxPath = finalPath;
        }
      } else {
        // Rename draft to final
        const finalPath = path.join(
          this.config.outputDir,
          'final',
          outputFileName + '.pptx'
        );
        fs.renameSync(pptxPath, finalPath);
        pptxPath = finalPath;
      }

      console.log(`\n✅ Pipeline complete! Output: ${pptxPath}`);

      return {
        success: true,
        pptxPath,
        documentContent: documentContent!,
        slidePlan: slidePlan!,
        validationReport: validationReport || undefined,
        fixIterations,
        errors,
        imageGenerationResult: imageGenResult?.result,
        generatedImages: imageGenResult?.images
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(errorMessage);
      console.error(`\n❌ Pipeline failed: ${errorMessage}`);
      console.error(error);

      return {
        success: false,
        pptxPath,
        documentContent: documentContent!,
        slidePlan: slidePlan!,
        validationReport: validationReport || undefined,
        fixIterations,
        errors,
        imageGenerationResult: imageGenResult?.result,
        generatedImages: imageGenResult?.images
      };
    }
  }
}

// CLI Entry Point
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: ts-node pipeline.ts <input-file> [output-name]');
    console.log('');
    console.log('Supported formats: .pdf, .docx, .tex');
    console.log('');
    console.log('Example:');
    console.log('  ts-node pipeline.ts research-paper.pdf my-presentation');
    process.exit(1);
  }

  const inputFile = args[0];
  const outputName = args[1] || path.basename(inputFile, path.extname(inputFile));

  const pipeline = new PresentationPipeline({
    outputDir: './output',
    maxFixIterations: 5,
    skipValidation: process.env.SKIP_VALIDATION === 'true',
    templateStyle: process.env.TEMPLATE_STYLE || 'modern',
    colorScheme: process.env.COLOR_SCHEME || 'blue',
    slideLayout: process.env.SLIDE_LAYOUT || 'default',
    validationConcurrency: parseInt(process.env.VALIDATION_CONCURRENCY || '5', 10),
    previewMode: process.env.PREVIEW_MODE === 'true',
    numSlides: parseInt(process.env.NUM_SLIDES || '12', 10),
    language: process.env.PRESENTATION_LANGUAGE || 'en'
  });

  const result = await pipeline.run(inputFile, outputName);

  if (result.success) {
    console.log('\n🎉 Presentation generated successfully!');
    console.log(`📁 Output: ${result.pptxPath}`);
  } else {
    console.log('\n⚠️ Presentation generation failed.');
    console.log(`Errors: ${result.errors.join(', ')}`);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

export { PresentationPipeline };
