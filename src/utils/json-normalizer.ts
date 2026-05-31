// src/utils/json-normalizer.ts

/**
 * Comprehensive JSON normalizer to convert snake_case keys to camelCase
 * Handles nested objects, arrays, and all edge cases
 */

export class JsonNormalizer {
  /**
   * Convert snake_case string to camelCase
   */
  private static snakeToCamel(str: string): string {
    return str.replace(/_([a-z0-9])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Recursively normalize all keys in an object from snake_case to camelCase
   */
  static normalize(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      return obj.map(item => this.normalize(item));
    }

    // Handle objects
    if (typeof obj === 'object' && obj.constructor === Object) {
      const normalized: any = {};

      for (const key of Object.keys(obj)) {
        const camelKey = this.snakeToCamel(key);
        normalized[camelKey] = this.normalize(obj[key]);
      }

      return normalized;
    }

    // Return primitives as-is
    return obj;
  }

  /**
   * Normalize with field mapping for common inconsistencies
   */
  static normalizeWithMapping(obj: any, fieldMappings?: Record<string, string>): any {
    const normalized = this.normalize(obj);

    if (fieldMappings && typeof normalized === 'object' && !Array.isArray(normalized)) {
      return this.applyFieldMappings(normalized, fieldMappings);
    }

    return normalized;
  }

  /**
   * Apply specific field mappings (for legacy compatibility)
   */
  private static applyFieldMappings(obj: any, mappings: Record<string, string>): any {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.applyFieldMappings(item, mappings));
    }

    const result: any = {};

    for (const key of Object.keys(obj)) {
      const mappedKey = mappings[key] || key;
      result[mappedKey] = this.applyFieldMappings(obj[key], mappings);
    }

    return result;
  }

  /**
   * Validate and normalize slide plan structure
   */
  static normalizeSlidePlan(rawPlan: any): any {
    // First pass: normalize all keys
    const normalized = this.normalize(rawPlan);

    // Second pass: ensure correct structure
    const result: any = {
      presentationMetadata: normalized.presentationMetadata || {
        title: normalized.title || 'Untitled Presentation',
        theme: normalized.theme || {},
        totalSlides: 0,
        generatedAt: new Date().toISOString()
      },
      slides: normalized.slides || []
    };

    // Normalize theme
    if (result.presentationMetadata.theme) {
      result.presentationMetadata.theme = this.normalizeTheme(
        result.presentationMetadata.theme
      );
    }

    // Normalize each slide
    result.slides = result.slides.map((slide: any, index: number) =>
      this.normalizeSlide(slide, index)
    );

    // Update total slides
    result.presentationMetadata.totalSlides = result.slides.length;

    return result;
  }

  /**
   * Normalize theme configuration
   */
  private static normalizeTheme(theme: any): any {
    return {
      primaryColor: theme.primaryColor || theme.primary || '#3b82f6',
      secondaryColor: theme.secondaryColor || theme.secondary || '#1e40af',
      accentColor: theme.accentColor || theme.accent || '#60a5fa',
      backgroundColor: theme.backgroundColor || theme.background || '#ffffff',
      fontFamily: theme.fontFamily || theme.font || 'Arial',
      headingFont: theme.headingFont || theme.fontFamily
    };
  }

  /**
   * Normalize individual slide
   */
  private static normalizeSlide(slide: any, index: number): any {
    const normalized: any = {
      slideNumber: slide.slideNumber || index + 1,
      slideId: slide.slideId || `slide-${String(index + 1).padStart(3, '0')}`,
      layout: slide.layout || 'title-bullets',
      sourceSection: slide.sourceSection,
      content: this.normalizeSlideContent(slide.content || {}, slide),
      speakerNotes: slide.speakerNotes || slide.notes || '',
      estimatedDuration: slide.estimatedDuration || slide.duration
    };

    return normalized;
  }

  /**
   * Normalize slide content based on layout
   */
  private static normalizeSlideContent(content: any, slide: any): any {
    // If content is empty, try to extract from slide root level
    if (Object.keys(content).length === 0) {
      content = {
        title: slide.title,
        subtitle: slide.subtitle,
        bullets: slide.bullets,
        author: slide.author,
        date: slide.date,
        sectionTitle: slide.sectionTitle,
        sectionNumber: slide.sectionNumber,
        keyTakeaways: slide.keyTakeaways,
        leftColumn: slide.leftColumn,
        rightColumn: slide.rightColumn,
        quote: slide.quote,
        table: slide.table,
        chart: slide.chart,
        cards: slide.cards,
        image: slide.image,
        bodyText: slide.bodyText
      };
    }

    const normalized: any = {};

    // Common fields
    if (content.title) normalized.title = content.title;
    if (content.subtitle) normalized.subtitle = content.subtitle;
    if (content.author) normalized.author = content.author;
    if (content.date) normalized.date = content.date;
    if (content.footnote) normalized.footnote = content.footnote;

    // Bullets
    if (content.bullets) {
      normalized.bullets = this.normalizeBullets(content.bullets);
    }

    // Two columns
    if (content.leftColumn) {
      normalized.leftColumn = this.normalizeColumn(content.leftColumn);
    }
    if (content.rightColumn) {
      normalized.rightColumn = this.normalizeColumn(content.rightColumn);
    }

    // Other content types
    if (content.image) normalized.image = content.image;
    if (content.bodyText) normalized.bodyText = content.bodyText;
    if (content.chart) normalized.chart = content.chart;
    if (content.table) normalized.table = content.table;
    if (content.cards) normalized.cards = content.cards;
    if (content.quote) normalized.quote = content.quote;
    if (content.sectionTitle) normalized.sectionTitle = content.sectionTitle;
    if (content.sectionNumber) normalized.sectionNumber = content.sectionNumber;
    if (content.keyTakeaways) normalized.keyTakeaways = content.keyTakeaways;
    if (content.thankYouText) normalized.thankYouText = content.thankYouText;
    if (content.contactInfo) normalized.contactInfo = content.contactInfo;

    return normalized;
  }

  /**
   * Normalize bullet points
   */
  private static normalizeBullets(bullets: any): any[] {
    if (!Array.isArray(bullets)) {
      return [];
    }

    return bullets.map(bullet => {
      if (typeof bullet === 'string') {
        return { text: bullet };
      }

      return {
        text: bullet.text || String(bullet),
        subBullets: bullet.subBullets || bullet.sub_bullets || bullet.children
      };
    });
  }

  /**
   * Normalize column content
   */
  private static normalizeColumn(column: any): any {
    if (typeof column === 'string') {
      return { text: column };
    }

    return {
      heading: column.heading || column.title,
      bullets: column.bullets ? this.normalizeBullets(column.bullets) : undefined,
      text: column.text || column.content
    };
  }

  /**
   * Get normalization report for debugging
   */
  static getNormalizationReport(original: any, normalized: any): string {
    const changes: string[] = [];

    const findChanges = (orig: any, norm: any, path: string = '') => {
      if (typeof orig !== 'object' || orig === null) return;

      for (const key of Object.keys(orig)) {
        const camelKey = this.snakeToCamel(key);
        if (key !== camelKey) {
          changes.push(`${path}${key} → ${path}${camelKey}`);
        }

        if (typeof orig[key] === 'object' && orig[key] !== null) {
          findChanges(orig[key], norm[camelKey], `${path}${camelKey}.`);
        }
      }
    };

    findChanges(original, normalized);

    return changes.length > 0
      ? `Normalized ${changes.length} keys:\n${changes.join('\n')}`
      : 'No normalization needed';
  }
}

export function normalizeJson(obj: any): any {
  return JsonNormalizer.normalize(obj);
}

export function normalizeSlidePlan(rawPlan: any): any {
  return JsonNormalizer.normalizeSlidePlan(rawPlan);
}
