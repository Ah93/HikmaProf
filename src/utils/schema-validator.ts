// src/utils/schema-validator.ts

import { SlidePlan, SlideDefinition, LayoutType } from '../schemas/slide-plan';

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning';
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  slidePlan?: SlidePlan;
}

export class SchemaValidator {
  private errors: ValidationError[] = [];
  private warnings: ValidationError[] = [];

  /**
   * Validate complete slide plan
   */
  validate(slidePlan: any): ValidationResult {
    this.errors = [];
    this.warnings = [];

    try {
      // Validate structure
      if (!slidePlan) {
        this.addError('root', 'Slide plan is null or undefined');
        return this.getResult();
      }

      // Validate presentation metadata
      this.validatePresentationMetadata(slidePlan.presentationMetadata);

      // Validate slides array
      if (!Array.isArray(slidePlan.slides)) {
        this.addError('slides', 'Slides must be an array');
      } else if (slidePlan.slides.length === 0) {
        this.addWarning('slides', 'No slides found in presentation');
      } else {
        slidePlan.slides.forEach((slide: any, index: number) => {
          this.validateSlide(slide, index);
        });
      }

      return this.getResult(slidePlan);
    } catch (error) {
      this.addError('validation', `Validation error: ${error}`);
      return this.getResult();
    }
  }

  /**
   * Validate presentation metadata
   */
  private validatePresentationMetadata(metadata: any): void {
    if (!metadata) {
      this.addError('presentationMetadata', 'Missing presentation metadata');
      return;
    }

    // Title
    if (!metadata.title || typeof metadata.title !== 'string') {
      this.addError('presentationMetadata.title', 'Title is required and must be a string');
    } else if (metadata.title.length > 100) {
      this.addWarning('presentationMetadata.title', 'Title is very long (>100 chars)');
    }

    // Theme
    if (!metadata.theme) {
      this.addWarning('presentationMetadata.theme', 'Missing theme, using defaults');
    } else {
      this.validateTheme(metadata.theme);
    }

    // Total slides
    if (typeof metadata.totalSlides !== 'number') {
      this.addWarning('presentationMetadata.totalSlides', 'totalSlides should be a number');
    }

    // Generated at
    if (!metadata.generatedAt) {
      this.addWarning('presentationMetadata.generatedAt', 'Missing generatedAt timestamp');
    }
  }

  /**
   * Validate theme configuration
   */
  private validateTheme(theme: any): void {
    const colorFields = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor'];

    colorFields.forEach(field => {
      if (!theme[field]) {
        this.addWarning(`theme.${field}`, `Missing ${field}`);
      } else if (!this.isValidHexColor(theme[field])) {
        this.addError(
          `theme.${field}`,
          `Invalid hex color: ${theme[field]}`,
          'Use format #RRGGBB (e.g., #3b82f6)'
        );
      }
    });

    if (!theme.fontFamily) {
      this.addWarning('theme.fontFamily', 'Missing fontFamily, using default');
    }
  }

  /**
   * Validate individual slide
   */
  private validateSlide(slide: any, index: number): void {
    const path = `slides[${index}]`;

    // Slide number
    if (typeof slide.slideNumber !== 'number') {
      this.addError(`${path}.slideNumber`, 'slideNumber must be a number');
    } else if (slide.slideNumber !== index + 1) {
      this.addWarning(
        `${path}.slideNumber`,
        `slideNumber (${slide.slideNumber}) doesn't match index (${index + 1})`
      );
    }

    // Slide ID
    if (!slide.slideId || typeof slide.slideId !== 'string') {
      this.addError(`${path}.slideId`, 'slideId is required and must be a string');
    }

    // Layout
    if (!slide.layout) {
      this.addError(`${path}.layout`, 'layout is required');
    } else if (!this.isValidLayout(slide.layout)) {
      this.addError(
        `${path}.layout`,
        `Invalid layout: ${slide.layout}`,
        `Valid layouts: title-slide, section-header, title-bullets, title-two-columns, title-image-text, title-chart, title-table, title-cards, quote-slide, conclusion, thank-you`
      );
    }

    // Content
    if (!slide.content) {
      this.addError(`${path}.content`, 'content is required (can be empty object)');
    } else {
      this.validateSlideContent(slide.content, slide.layout, path);
    }

    // Speaker notes (optional but recommended)
    if (!slide.speakerNotes) {
      this.addWarning(`${path}.speakerNotes`, 'No speaker notes provided');
    }
  }

  /**
   * Validate slide content based on layout
   */
  private validateSlideContent(content: any, layout: string, path: string): void {
    const contentPath = `${path}.content`;

    switch (layout) {
      case 'title-slide':
        if (!content.title) {
          this.addError(`${contentPath}.title`, 'Title slide requires a title');
        }
        break;

      case 'title-bullets':
        if (!content.title) {
          this.addWarning(`${contentPath}.title`, 'Bullet slide should have a title');
        }
        if (!content.bullets || !Array.isArray(content.bullets)) {
          this.addError(`${contentPath}.bullets`, 'title-bullets layout requires bullets array');
        } else {
          this.validateBullets(content.bullets, contentPath);
        }
        break;

      case 'title-two-columns':
        if (!content.leftColumn && !content.rightColumn) {
          this.addError(
            contentPath,
            'title-two-columns requires leftColumn and/or rightColumn'
          );
        }
        break;

      case 'title-chart':
        if (!content.chart) {
          this.addError(`${contentPath}.chart`, 'title-chart layout requires chart data');
        } else {
          this.validateChart(content.chart, contentPath);
        }
        break;

      case 'title-table':
        if (!content.table) {
          this.addError(`${contentPath}.table`, 'title-table layout requires table data');
        } else {
          this.validateTable(content.table, contentPath);
        }
        break;

      case 'title-cards':
        if (!content.cards || !Array.isArray(content.cards)) {
          this.addError(`${contentPath}.cards`, 'title-cards layout requires cards array');
        } else if (content.cards.length < 2 || content.cards.length > 4) {
          this.addWarning(
            `${contentPath}.cards`,
            'Cards layout works best with 2-4 cards'
          );
        }
        break;

      case 'quote-slide':
        if (!content.quote) {
          this.addError(`${contentPath}.quote`, 'quote-slide layout requires quote object');
        } else {
          if (!content.quote.text) {
            this.addError(`${contentPath}.quote.text`, 'Quote requires text');
          }
          if (!content.quote.attribution) {
            this.addWarning(`${contentPath}.quote.attribution`, 'Quote should have attribution');
          }
        }
        break;

      case 'conclusion':
        if (!content.keyTakeaways || !Array.isArray(content.keyTakeaways)) {
          this.addError(
            `${contentPath}.keyTakeaways`,
            'conclusion layout requires keyTakeaways array'
          );
        }
        break;

      case 'section-header':
        if (!content.sectionTitle) {
          this.addError(`${contentPath}.sectionTitle`, 'section-header requires sectionTitle');
        }
        break;
    }
  }

  /**
   * Validate bullets
   */
  private validateBullets(bullets: any[], path: string): void {
    if (bullets.length === 0) {
      this.addWarning(`${path}.bullets`, 'Empty bullets array');
      return;
    }

    if (bullets.length > 6) {
      this.addWarning(
        `${path}.bullets`,
        `Too many bullets (${bullets.length}). Recommended: 5-6 max for readability`
      );
    }

    bullets.forEach((bullet, index) => {
      if (!bullet.text || typeof bullet.text !== 'string') {
        this.addError(`${path}.bullets[${index}]`, 'Bullet must have text string');
      } else {
        const wordCount = bullet.text.split(/\s+/).length;
        if (wordCount > 15) {
          this.addWarning(
            `${path}.bullets[${index}]`,
            `Bullet too long (${wordCount} words). Keep under 15 words.`
          );
        }
      }
    });
  }

  /**
   * Validate chart data
   */
  private validateChart(chart: any, path: string): void {
    const chartPath = `${path}.chart`;

    const validTypes = ['bar', 'line', 'pie', 'doughnut'];
    if (!chart.type || !validTypes.includes(chart.type)) {
      this.addError(
        `${chartPath}.type`,
        `Invalid chart type: ${chart.type}`,
        `Valid types: ${validTypes.join(', ')}`
      );
    }

    if (!chart.data) {
      this.addError(`${chartPath}.data`, 'Chart requires data object');
      return;
    }

    if (!Array.isArray(chart.data.labels)) {
      this.addError(`${chartPath}.data.labels`, 'Chart data requires labels array');
    }

    if (!Array.isArray(chart.data.datasets)) {
      this.addError(`${chartPath}.data.datasets`, 'Chart data requires datasets array');
    } else {
      chart.data.datasets.forEach((dataset: any, index: number) => {
        if (!Array.isArray(dataset.values)) {
          this.addError(
            `${chartPath}.data.datasets[${index}].values`,
            'Dataset requires values array'
          );
        }
      });
    }
  }

  /**
   * Validate table data
   */
  private validateTable(table: any, path: string): void {
    const tablePath = `${path}.table`;

    if (!Array.isArray(table.headers)) {
      this.addError(`${tablePath}.headers`, 'Table requires headers array');
    } else if (table.headers.length > 5) {
      this.addWarning(`${tablePath}.headers`, 'Too many columns (>5), may not fit well');
    }

    if (!Array.isArray(table.rows)) {
      this.addError(`${tablePath}.rows`, 'Table requires rows array');
    } else if (table.rows.length > 6) {
      this.addWarning(`${tablePath}.rows`, 'Too many rows (>6), may not fit on slide');
    }
  }

  /**
   * Check if layout is valid
   */
  private isValidLayout(layout: string): boolean {
    const validLayouts: LayoutType[] = [
      'title-slide',
      'section-header',
      'title-bullets',
      'title-two-columns',
      'title-image-text',
      'title-chart',
      'title-table',
      'title-cards',
      'quote-slide',
      'conclusion',
      'thank-you'
    ];
    return validLayouts.includes(layout as LayoutType);
  }

  /**
   * Check if hex color is valid
   */
  private isValidHexColor(color: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(color);
  }

  /**
   * Add error
   */
  private addError(path: string, message: string, suggestion?: string): void {
    this.errors.push({ path, message, severity: 'error', suggestion });
  }

  /**
   * Add warning
   */
  private addWarning(path: string, message: string, suggestion?: string): void {
    this.warnings.push({ path, message, severity: 'warning', suggestion });
  }

  /**
   * Get validation result
   */
  private getResult(slidePlan?: SlidePlan): ValidationResult {
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      slidePlan: this.errors.length === 0 ? slidePlan : undefined
    };
  }

  /**
   * Format validation report
   */
  static formatReport(result: ValidationResult): string {
    const lines: string[] = [];

    if (result.valid) {
      lines.push('✅ Validation passed');
    } else {
      lines.push('❌ Validation failed');
    }

    if (result.errors.length > 0) {
      lines.push(`\n🔴 Errors (${result.errors.length}):`);
      result.errors.forEach(err => {
        lines.push(`  - [${err.path}] ${err.message}`);
        if (err.suggestion) {
          lines.push(`    💡 ${err.suggestion}`);
        }
      });
    }

    if (result.warnings.length > 0) {
      lines.push(`\n⚠️  Warnings (${result.warnings.length}):`);
      result.warnings.forEach(warn => {
        lines.push(`  - [${warn.path}] ${warn.message}`);
        if (warn.suggestion) {
          lines.push(`    💡 ${warn.suggestion}`);
        }
      });
    }

    return lines.join('\n');
  }
}

export function validateSlidePlan(slidePlan: any): ValidationResult {
  const validator = new SchemaValidator();
  return validator.validate(slidePlan);
}
