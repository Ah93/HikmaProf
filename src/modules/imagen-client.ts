// src/modules/imagen-client.ts
// Vertex AI Imagen API client for AI-powered image generation

import * as fs from 'fs';
import * as path from 'path';
import {
  ImageGenerationRequest,
  GeneratedImage,
  ImagenConfig,
  AspectRatio,
  ImageType
} from '../schemas/image-types';

// Type for the AI Platform client (optional dependency)
interface PredictionServiceClient {
  predict(request: any): Promise<[any]>;
}

/**
 * Default Imagen configuration
 */
const DEFAULT_CONFIG: ImagenConfig = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT || '',
  location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  model: 'imagen-3.0-generate-001',
  defaultAspectRatio: '16:9',
  sampleCount: 1,
  safetyFilterLevel: 'block_some',
  personGeneration: 'allow_adult'
};

/**
 * Aspect ratio to pixel dimensions mapping
 */
const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '4:3': { width: 1600, height: 1200 },
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 1080, height: 1920 }
};

/**
 * Vertex AI Imagen client for generating images
 */
export class ImagenClient {
  private config: ImagenConfig;
  private aiplatform: any;
  private initialized: boolean = false;

  constructor(config?: Partial<ImagenConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the Vertex AI client
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic require to avoid issues if package not installed
      // Using require instead of import to prevent TypeScript module resolution errors
      let aiplatform: any;
      try {
        aiplatform = require('@google-cloud/aiplatform');
      } catch {
        aiplatform = null;
      }

      if (aiplatform) {
        const { PredictionServiceClient } = aiplatform;
        this.aiplatform = new PredictionServiceClient({
          apiEndpoint: `${this.config.location}-aiplatform.googleapis.com`
        });
        this.initialized = true;
        console.log('  - Imagen client initialized');
      } else {
        console.warn('  - @google-cloud/aiplatform not installed, image generation disabled');
        this.initialized = false;
      }
    } catch (error) {
      console.warn('  - Vertex AI not available, image generation disabled');
      this.initialized = false;
    }
  }

  /**
   * Check if image generation is available
   */
  isAvailable(): boolean {
    return this.initialized && !!this.config.projectId;
  }

  /**
   * Generate an image using Vertex AI Imagen
   */
  async generateImage(request: ImageGenerationRequest, outputDir: string): Promise<GeneratedImage> {
    if (!this.isAvailable()) {
      throw new Error('Imagen client not initialized or not available');
    }

    const dimensions = ASPECT_RATIO_DIMENSIONS[request.aspectRatio];
    const outputPath = path.join(outputDir, `${request.id}.png`);

    try {
      // Build the prediction request
      const endpoint = `projects/${this.config.projectId}/locations/${this.config.location}/publishers/google/models/${this.config.model}`;

      // Enhance prompt based on image type
      const enhancedPrompt = this.enhancePrompt(request);

      const instances = [
        {
          prompt: enhancedPrompt
        }
      ];

      const parameters = {
        sampleCount: this.config.sampleCount,
        aspectRatio: request.aspectRatio.replace(':', '_'), // e.g., "16_9"
        safetyFilterLevel: this.config.safetyFilterLevel,
        personGeneration: this.config.personGeneration,
        negativePrompt: request.styleHints.negativePrompt || this.getDefaultNegativePrompt(request.type)
      };

      console.log(`    - Generating ${request.type} image: "${request.prompt.substring(0, 50)}..."`);

      const [response] = await this.aiplatform.predict({
        endpoint,
        instances,
        parameters
      });

      // Extract and save the image
      if (response.predictions && response.predictions.length > 0) {
        const prediction = response.predictions[0];
        const imageBytes = Buffer.from(prediction.bytesBase64Encoded, 'base64');

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, imageBytes);

        return {
          id: request.id,
          path: outputPath,
          prompt: request.prompt,
          type: request.type,
          width: dimensions.width,
          height: dimensions.height,
          fromCache: false,
          generatedAt: new Date().toISOString()
        };
      }

      throw new Error('No image generated in response');
    } catch (error) {
      console.error(`    - Image generation failed: ${error}`);
      throw error;
    }
  }

  /**
   * Enhance the prompt based on image type and style
   */
  private enhancePrompt(request: ImageGenerationRequest): string {
    const { prompt, type, styleHints } = request;
    let enhanced = prompt;

    // Add type-specific enhancements
    switch (type) {
      case 'background':
        enhanced = `${prompt}, abstract background design, suitable for presentation slide, professional, ${styleHints.style}, ${styleHints.mood}`;
        break;
      case 'illustration':
        enhanced = `${prompt}, professional illustration, clean design, ${styleHints.style}, modern, suitable for business presentation`;
        break;
      case 'icon':
        enhanced = `${prompt}, simple icon design, flat design, minimal, clean lines, ${styleHints.style}`;
        break;
      case 'photo':
        enhanced = `${prompt}, professional photography, high quality, ${styleHints.style}, ${styleHints.mood}`;
        break;
      case 'diagram':
        enhanced = `${prompt}, infographic style, clean diagram, professional, easy to understand, ${styleHints.style}`;
        break;
    }

    // Add color hints if provided
    if (styleHints.colors && styleHints.colors.length > 0) {
      const colorStr = styleHints.colors.slice(0, 3).join(', ');
      enhanced += `, color palette: ${colorStr}`;
    }

    return enhanced;
  }

  /**
   * Get default negative prompt based on image type
   */
  private getDefaultNegativePrompt(type: ImageType): string {
    const baseNegative = 'blurry, low quality, distorted, ugly, deformed, text, watermark, signature, logo';

    switch (type) {
      case 'background':
        return `${baseNegative}, too busy, cluttered, distracting elements, faces, people`;
      case 'illustration':
        return `${baseNegative}, photorealistic, too complex, dark`;
      case 'icon':
        return `${baseNegative}, complex, detailed, photorealistic, 3D, gradients`;
      case 'photo':
        return `${baseNegative}, cartoon, illustration, artificial`;
      case 'diagram':
        return `${baseNegative}, too detailed, confusing, hard to read`;
      default:
        return baseNegative;
    }
  }

  /**
   * Generate a placeholder image when Imagen is not available
   */
  async generatePlaceholder(
    request: ImageGenerationRequest,
    outputDir: string
  ): Promise<GeneratedImage> {
    const dimensions = ASPECT_RATIO_DIMENSIONS[request.aspectRatio];
    const outputPath = path.join(outputDir, `${request.id}_placeholder.png`);

    try {
      // Try to use sharp to generate a placeholder
      const sharp = require('sharp');

      // Create a colored rectangle with text
      const primaryColor = request.styleHints.colors[0] || '#3B82F6';
      const svg = this.generatePlaceholderSvg(
        dimensions.width,
        dimensions.height,
        primaryColor,
        request.type,
        request.slideTitle || request.prompt.substring(0, 30)
      );

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });

      await sharp(Buffer.from(svg))
        .png()
        .toFile(outputPath);

      return {
        id: request.id,
        path: outputPath,
        prompt: request.prompt,
        type: request.type,
        width: dimensions.width,
        height: dimensions.height,
        fromCache: false,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      // If sharp fails, create a simple file marker
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath.replace('.png', '.txt'), `Placeholder for: ${request.prompt}`);

      return {
        id: request.id,
        path: outputPath.replace('.png', '.txt'),
        prompt: request.prompt,
        type: request.type,
        width: dimensions.width,
        height: dimensions.height,
        fromCache: false,
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Generate SVG for placeholder image
   */
  private generatePlaceholderSvg(
    width: number,
    height: number,
    color: string,
    type: ImageType,
    label: string
  ): string {
    // Ensure color is a valid hex
    const bgColor = color.startsWith('#') ? color : `#${color}`;
    const textColor = this.getContrastColor(bgColor);

    // Get icon for type
    const icon = this.getTypeIcon(type);

    return `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${this.darkenColor(bgColor, 20)};stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#grad)"/>
        <text x="50%" y="45%" font-size="48" fill="${textColor}" text-anchor="middle" opacity="0.5">${icon}</text>
        <text x="50%" y="55%" font-size="24" fill="${textColor}" text-anchor="middle" opacity="0.7">${this.escapeXml(label)}</text>
        <text x="50%" y="62%" font-size="14" fill="${textColor}" text-anchor="middle" opacity="0.5">[AI Image Placeholder]</text>
      </svg>
    `;
  }

  /**
   * Get icon character for image type
   */
  private getTypeIcon(type: ImageType): string {
    switch (type) {
      case 'background': return '&#9634;'; // Square
      case 'illustration': return '&#9733;'; // Star
      case 'icon': return '&#9679;'; // Circle
      case 'photo': return '&#9744;'; // Camera
      case 'diagram': return '&#9655;'; // Triangle
      default: return '&#9632;';
    }
  }

  /**
   * Get contrasting text color
   */
  private getContrastColor(hex: string): string {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luma > 0.5 ? '#1F2937' : '#FFFFFF';
  }

  /**
   * Darken a hex color by percentage
   */
  private darkenColor(hex: string, percent: number): string {
    const h = hex.replace('#', '');
    const r = Math.max(0, parseInt(h.slice(0, 2), 16) - percent);
    const g = Math.max(0, parseInt(h.slice(2, 4), 16) - percent);
    const b = Math.max(0, parseInt(h.slice(4, 6), 16) - percent);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get configuration
   */
  getConfig(): ImagenConfig {
    return { ...this.config };
  }
}

/**
 * Create an Imagen client instance
 */
export function createImagenClient(config?: Partial<ImagenConfig>): ImagenClient {
  return new ImagenClient(config);
}

// Test function for CLI
async function testImagenClient() {
  console.log('Testing Imagen client...');

  const client = createImagenClient();
  await client.initialize();

  if (client.isAvailable()) {
    console.log('Imagen client is available');
    console.log('Config:', client.getConfig());
  } else {
    console.log('Imagen client is NOT available');
    console.log('Generating placeholder instead...');

    const testRequest: ImageGenerationRequest = {
      id: 'test-001',
      prompt: 'Abstract geometric background for technology presentation',
      type: 'background',
      aspectRatio: '16:9',
      styleHints: {
        style: 'modern',
        colors: ['#3B82F6', '#1E40AF', '#60A5FA'],
        mood: 'professional'
      }
    };

    const result = await client.generatePlaceholder(testRequest, './output/test-images');
    console.log('Generated placeholder:', result);
  }
}

// Run test if called directly
if (require.main === module) {
  testImagenClient().catch(console.error);
}
