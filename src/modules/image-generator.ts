// src/modules/image-generator.ts
// Image generation orchestration with caching and batch processing

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
  ImageGenerationRequest,
  GeneratedImage,
  ImageGenerationError,
  BatchImageResult,
  SlideImagePrompt,
  ImageGenerationOptions,
  ImageCacheEntry,
  ImageCacheStats,
  ImageType,
  TemplateImageStyle
} from '../schemas/image-types';
import { ImagenClient, createImagenClient } from './imagen-client';
import { TemplateStyle, ColorScheme } from '../config/templates';

/**
 * Default image generation options
 */
const DEFAULT_OPTIONS: ImageGenerationOptions = {
  enabled: true,
  skipBackgrounds: false,
  skipIllustrations: false,
  maxImages: 20,
  quality: 90,
  forceRegenerate: false
};

/**
 * Cache index structure
 */
interface CacheIndex {
  entries: Record<string, ImageCacheEntry>;
  stats: ImageCacheStats;
  lastUpdated: string;
}

/**
 * Image Generator with caching and smart prompt generation
 */
export class ImageGenerator {
  private client: ImagenClient;
  private cacheDir: string;
  private outputDir: string;
  private options: ImageGenerationOptions;
  private cacheIndex: CacheIndex | null = null;
  private initialized: boolean = false;

  constructor(
    outputDir: string = './output',
    cacheDir?: string,
    options?: Partial<ImageGenerationOptions>
  ) {
    this.outputDir = outputDir;
    this.cacheDir = cacheDir || path.join(outputDir, 'image-cache');
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.client = createImagenClient();
  }

  /**
   * Initialize the image generator
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create directories
    fs.mkdirSync(this.cacheDir, { recursive: true });
    fs.mkdirSync(path.join(this.outputDir, 'images'), { recursive: true });

    // Load cache index
    this.loadCacheIndex();

    // Initialize Imagen client
    await this.client.initialize();

    this.initialized = true;
    console.log('  - Image generator initialized');
    console.log(`    Cache: ${this.cacheDir}`);
    console.log(`    Imagen available: ${this.client.isAvailable()}`);
  }

  /**
   * Check if image generation is enabled and available
   */
  isEnabled(): boolean {
    return this.options.enabled && this.initialized;
  }

  /**
   * Generate a cache key from request parameters
   */
  private generateCacheKey(request: ImageGenerationRequest): string {
    const data = {
      prompt: request.prompt,
      type: request.type,
      aspectRatio: request.aspectRatio,
      style: request.styleHints.style,
      colors: request.styleHints.colors.sort(),
      mood: request.styleHints.mood
    };
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  }

  /**
   * Load cache index from disk
   */
  private loadCacheIndex(): void {
    const indexPath = path.join(this.cacheDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      try {
        this.cacheIndex = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      } catch (error) {
        console.warn('  - Could not load cache index, starting fresh');
        this.cacheIndex = this.createEmptyCacheIndex();
      }
    } else {
      this.cacheIndex = this.createEmptyCacheIndex();
    }
  }

  /**
   * Save cache index to disk
   */
  private saveCacheIndex(): void {
    if (!this.cacheIndex) return;

    this.cacheIndex.lastUpdated = new Date().toISOString();
    const indexPath = path.join(this.cacheDir, 'index.json');

    try {
      fs.writeFileSync(indexPath, JSON.stringify(this.cacheIndex, null, 2));
    } catch (error) {
      console.warn('  - Could not save cache index');
    }
  }

  /**
   * Create empty cache index
   */
  private createEmptyCacheIndex(): CacheIndex {
    return {
      entries: {},
      stats: {
        totalEntries: 0,
        totalSizeBytes: 0,
        hitRate: 0
      },
      lastUpdated: new Date().toISOString()
    };
  }

  /**
   * Check if an image is in cache
   */
  private getCachedImage(cacheKey: string): ImageCacheEntry | null {
    if (!this.cacheIndex || this.options.forceRegenerate) return null;

    const entry = this.cacheIndex.entries[cacheKey];
    if (entry && fs.existsSync(entry.path)) {
      // Update access stats
      entry.lastAccessedAt = new Date().toISOString();
      entry.accessCount++;
      return entry;
    }

    return null;
  }

  /**
   * Add image to cache
   */
  private addToCache(cacheKey: string, image: GeneratedImage): void {
    if (!this.cacheIndex) return;

    // Copy image to cache directory
    const cachePath = path.join(this.cacheDir, `${cacheKey}.png`);

    try {
      if (fs.existsSync(image.path)) {
        fs.copyFileSync(image.path, cachePath);
        const stats = fs.statSync(cachePath);

        this.cacheIndex.entries[cacheKey] = {
          key: cacheKey,
          path: cachePath,
          prompt: image.prompt,
          type: image.type,
          cachedAt: new Date().toISOString(),
          lastAccessedAt: new Date().toISOString(),
          accessCount: 1,
          fileSize: stats.size
        };

        // Update stats
        this.cacheIndex.stats.totalEntries = Object.keys(this.cacheIndex.entries).length;
        this.cacheIndex.stats.totalSizeBytes += stats.size;

        this.saveCacheIndex();
      }
    } catch (error) {
      console.warn(`    - Could not cache image: ${error}`);
    }
  }

  /**
   * Generate a single image
   */
  async generateSingleImage(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const cacheKey = this.generateCacheKey(request);

    // Check cache first
    const cached = this.getCachedImage(cacheKey);
    if (cached) {
      console.log(`    - Cache hit: ${request.id}`);
      return {
        id: request.id,
        path: cached.path,
        prompt: request.prompt,
        type: request.type,
        width: request.aspectRatio === '16:9' ? 1920 : 1024,
        height: request.aspectRatio === '16:9' ? 1080 : 1024,
        fromCache: true,
        generatedAt: cached.cachedAt,
        cacheKey
      };
    }

    // Generate new image
    const outputPath = path.join(this.outputDir, 'images');
    let image: GeneratedImage;

    try {
      if (this.client.isAvailable()) {
        image = await this.client.generateImage(request, outputPath);
      } else {
        // Generate placeholder if Imagen not available
        image = await this.client.generatePlaceholder(request, outputPath);
      }

      // Add to cache
      this.addToCache(cacheKey, image);
      image.cacheKey = cacheKey;

      return image;
    } catch (error) {
      console.error(`    - Failed to generate image: ${error}`);

      // Return placeholder on failure
      return this.client.generatePlaceholder(request, outputPath);
    }
  }

  /**
   * Generate images for multiple slides in batch
   */
  async generateBatch(requests: ImageGenerationRequest[]): Promise<BatchImageResult> {
    const startTime = Date.now();
    const images: GeneratedImage[] = [];
    const errors: ImageGenerationError[] = [];
    let cacheHits = 0;
    let newGenerations = 0;

    // Filter based on options
    const filteredRequests = requests.filter(req => {
      if (this.options.skipBackgrounds && req.type === 'background') return false;
      if (this.options.skipIllustrations && req.type === 'illustration') return false;
      return true;
    });

    // Limit to max images
    const limitedRequests = filteredRequests.slice(0, this.options.maxImages);

    console.log(`  - Generating ${limitedRequests.length} images...`);

    // Process sequentially to avoid rate limits
    for (const request of limitedRequests) {
      try {
        const image = await this.generateSingleImage(request);
        images.push(image);

        if (image.fromCache) {
          cacheHits++;
        } else {
          newGenerations++;
        }
      } catch (error) {
        errors.push({
          requestId: request.id,
          message: error instanceof Error ? error.message : String(error),
          retryable: true
        });
      }
    }

    // Update cache stats
    if (this.cacheIndex) {
      const totalRequests = images.length + errors.length;
      this.cacheIndex.stats.hitRate = totalRequests > 0 ? cacheHits / totalRequests : 0;
      this.saveCacheIndex();
    }

    return {
      images,
      errors,
      processingTimeMs: Date.now() - startTime,
      cacheHits,
      newGenerations
    };
  }

  /**
   * Generate smart image prompts based on slide content and template
   */
  generateImagePrompts(
    slides: any[],
    templateStyle: TemplateStyle,
    colorScheme: ColorScheme,
    imageStyle?: TemplateImageStyle
  ): SlideImagePrompt[] {
    const prompts: SlideImagePrompt[] = [];

    for (const slide of slides) {
      const slideNumber = slide.slideNumber || 0;
      const slideId = slide.slideId || `slide-${slideNumber}`;
      const layout = slide.layout;
      const content = slide.content || {};

      // Determine what images this slide needs
      const neededImages = this.determineNeededImages(layout, content, imageStyle);

      for (const { type, position, priority } of neededImages) {
        const prompt = this.buildPromptForSlide(
          content,
          type,
          templateStyle,
          colorScheme,
          imageStyle
        );

        const keywords = this.extractKeywords(content);

        prompts.push({
          slideNumber,
          slideId,
          imageType: type,
          prompt,
          keywords,
          priority,
          position
        });
      }
    }

    // Sort by priority (highest first)
    return prompts.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Determine what images a slide needs based on layout
   */
  private determineNeededImages(
    layout: string,
    content: any,
    imageStyle?: TemplateImageStyle
  ): Array<{ type: ImageType; position?: 'background' | 'left' | 'right' | 'center' | 'fullbleed'; priority: number }> {
    const images: Array<{ type: ImageType; position?: 'background' | 'left' | 'right' | 'center' | 'fullbleed'; priority: number }> = [];

    switch (layout) {
      case 'title-slide':
        if (!imageStyle || imageStyle.useTitleSlideImages) {
          images.push({ type: 'background', position: 'fullbleed', priority: 10 });
        }
        break;

      case 'section-header':
        if (!imageStyle || imageStyle.useSectionHeaderImages) {
          images.push({ type: 'background', position: 'fullbleed', priority: 8 });
        }
        break;

      case 'title-image-text':
        // This layout explicitly needs an illustration
        if (!content.image?.path) {
          images.push({ type: 'illustration', position: content.image?.position || 'left', priority: 9 });
        }
        break;

      case 'title-cards':
        // Could use small icons for each card
        if (content.cards && content.cards.length > 0) {
          images.push({ type: 'icon', position: 'center', priority: 5 });
        }
        break;

      case 'quote-slide':
        // Subtle background
        images.push({ type: 'background', position: 'fullbleed', priority: 4 });
        break;

      case 'conclusion':
        // Celebratory background
        images.push({ type: 'background', position: 'fullbleed', priority: 7 });
        break;

      case 'thank-you':
        images.push({ type: 'background', position: 'fullbleed', priority: 6 });
        break;

      // Standard content slides might benefit from subtle backgrounds
      case 'title-bullets':
      case 'title-two-columns':
        if (imageStyle?.useBackgroundPatterns) {
          images.push({ type: 'background', position: 'fullbleed', priority: 2 });
        }
        break;
    }

    return images;
  }

  /**
   * Build a prompt for a specific slide and image type
   */
  private buildPromptForSlide(
    content: any,
    type: ImageType,
    templateStyle: TemplateStyle,
    colorScheme: ColorScheme,
    imageStyle?: TemplateImageStyle
  ): string {
    const title = content.title || '';
    const keywords = this.extractKeywords(content);
    const keywordStr = keywords.slice(0, 5).join(', ');

    // Get style-specific hints
    const styleHint = imageStyle?.[type === 'background' ? 'background' : type === 'illustration' ? 'illustration' : 'icon'] || '';

    // Build prompt based on type
    let prompt = '';

    switch (type) {
      case 'background':
        prompt = `Abstract ${templateStyle.layoutStyle} background design, ${styleHint}`;
        if (keywordStr) {
          prompt += `, subtle visual elements related to: ${keywordStr}`;
        }
        prompt += ', professional, clean, suitable for presentation slide';
        break;

      case 'illustration':
        prompt = `Professional illustration about ${title || keywordStr}, ${styleHint}`;
        prompt += `, ${templateStyle.layoutStyle} style, clean design`;
        break;

      case 'icon':
        prompt = `Simple ${templateStyle.layoutStyle} icon representing ${keywordStr || 'concept'}`;
        prompt += ', flat design, minimal, suitable for presentation';
        break;

      case 'photo':
        prompt = `Professional photograph related to ${title || keywordStr}`;
        prompt += ', high quality, business appropriate';
        break;

      case 'diagram':
        prompt = `Infographic diagram showing ${title || keywordStr}`;
        prompt += ', clean lines, professional, easy to understand';
        break;
    }

    // Add color hints
    const colors = [colorScheme.primary, colorScheme.secondary, colorScheme.accent];
    prompt += `, using colors: ${colors.map(c => '#' + c).join(', ')}`;

    return prompt;
  }

  /**
   * Extract keywords from slide content
   */
  private extractKeywords(content: any): string[] {
    const keywords: string[] = [];
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'this', 'that', 'these',
      'those', 'which', 'what', 'who', 'how', 'when', 'where', 'why'
    ]);

    // Extract from title
    if (content.title) {
      const words = String(content.title).toLowerCase().split(/\s+/);
      words.forEach(w => {
        const cleaned = w.replace(/[^a-z0-9]/g, '');
        if (cleaned.length > 3 && !stopWords.has(cleaned)) {
          keywords.push(cleaned);
        }
      });
    }

    // Extract from bullets
    if (content.bullets && Array.isArray(content.bullets)) {
      content.bullets.forEach((bullet: any) => {
        const text = typeof bullet === 'string' ? bullet : bullet.text || '';
        const words = String(text).toLowerCase().split(/\s+/);
        words.forEach(w => {
          const cleaned = w.replace(/[^a-z0-9]/g, '');
          if (cleaned.length > 4 && !stopWords.has(cleaned)) {
            keywords.push(cleaned);
          }
        });
      });
    }

    // Remove duplicates and limit
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * Convert slide prompts to generation requests
   */
  convertPromptsToRequests(
    prompts: SlideImagePrompt[],
    colorScheme: ColorScheme,
    templateStyle: TemplateStyle
  ): ImageGenerationRequest[] {
    return prompts.map(prompt => ({
      id: `img-${prompt.slideId}-${prompt.imageType}`,
      prompt: prompt.prompt,
      type: prompt.imageType,
      aspectRatio: '16:9' as const,
      styleHints: {
        style: templateStyle.layoutStyle,
        colors: [colorScheme.primary, colorScheme.secondary, colorScheme.accent],
        mood: this.getMoodFromStyle(templateStyle.layoutStyle)
      },
      slideNumber: prompt.slideNumber,
      slideTitle: prompt.prompt.split(',')[0],
      templateStyle: templateStyle.id
    }));
  }

  /**
   * Get mood description from style
   */
  private getMoodFromStyle(style: string): string {
    switch (style) {
      case 'corporate': return 'professional, trustworthy';
      case 'creative': return 'vibrant, energetic';
      case 'minimal': return 'calm, focused';
      case 'modern': return 'sleek, contemporary';
      default: return 'professional';
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): ImageCacheStats | null {
    return this.cacheIndex?.stats || null;
  }

  /**
   * Clear the image cache
   */
  clearCache(): void {
    if (fs.existsSync(this.cacheDir)) {
      fs.rmSync(this.cacheDir, { recursive: true });
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    this.cacheIndex = this.createEmptyCacheIndex();
    this.saveCacheIndex();
    console.log('  - Image cache cleared');
  }

  /**
   * Get an image by cache key
   */
  getImageByCacheKey(cacheKey: string): string | null {
    const entry = this.cacheIndex?.entries[cacheKey];
    if (entry && fs.existsSync(entry.path)) {
      return entry.path;
    }
    return null;
  }
}

/**
 * Create an image generator instance
 */
export function createImageGenerator(
  outputDir?: string,
  cacheDir?: string,
  options?: Partial<ImageGenerationOptions>
): ImageGenerator {
  return new ImageGenerator(outputDir, cacheDir, options);
}
