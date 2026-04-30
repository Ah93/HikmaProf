// src/schemas/image-types.ts
// TypeScript interfaces for AI-powered image generation

/**
 * Type of image to generate for slides
 */
export type ImageType = 'background' | 'illustration' | 'icon' | 'photo' | 'diagram';

/**
 * Image aspect ratio for generation
 */
export type AspectRatio = '16:9' | '4:3' | '1:1' | '9:16';

/**
 * Style hints for image generation
 */
export interface ImageStyleHints {
  /** Overall style description (e.g., "professional", "creative", "minimal") */
  style: string;
  /** Color palette to use (hex colors) */
  colors: string[];
  /** Mood/atmosphere (e.g., "corporate", "energetic", "calm") */
  mood: string;
  /** What to avoid in the image */
  negativePrompt?: string;
}

/**
 * Request for generating an image
 */
export interface ImageGenerationRequest {
  /** Unique identifier for tracking */
  id: string;
  /** The prompt describing the desired image */
  prompt: string;
  /** Type of image to generate */
  type: ImageType;
  /** Desired aspect ratio */
  aspectRatio: AspectRatio;
  /** Style hints for generation */
  styleHints: ImageStyleHints;
  /** Slide number this image is for (if applicable) */
  slideNumber?: number;
  /** Slide title for context */
  slideTitle?: string;
  /** Template style ID */
  templateStyle?: string;
}

/**
 * Result of image generation
 */
export interface GeneratedImage {
  /** Unique identifier matching the request */
  id: string;
  /** Path to the generated image file */
  path: string;
  /** Original prompt used */
  prompt: string;
  /** Type of image */
  type: ImageType;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Whether this came from cache */
  fromCache: boolean;
  /** Generation timestamp */
  generatedAt: string;
  /** Cache key used */
  cacheKey?: string;
}

/**
 * Image generation error
 */
export interface ImageGenerationError {
  /** Request ID that failed */
  requestId: string;
  /** Error message */
  message: string;
  /** Error code if available */
  code?: string;
  /** Whether retry is recommended */
  retryable: boolean;
}

/**
 * Batch image generation result
 */
export interface BatchImageResult {
  /** Successfully generated images */
  images: GeneratedImage[];
  /** Failed generation requests */
  errors: ImageGenerationError[];
  /** Total processing time in milliseconds */
  processingTimeMs: number;
  /** Number of images from cache */
  cacheHits: number;
  /** Number of newly generated images */
  newGenerations: number;
}

/**
 * Configuration for image generation per template
 */
export interface TemplateImageStyle {
  /** Prompt hints for background images */
  background: string;
  /** Prompt hints for illustration images */
  illustration: string;
  /** Prompt hints for icon/symbol images */
  icon: string;
  /** What to avoid in generated images */
  negativePrompt: string;
  /** Preferred image types for this template */
  preferredTypes: ImageType[];
  /** Whether to use images on title slides */
  useTitleSlideImages: boolean;
  /** Whether to use images on section headers */
  useSectionHeaderImages: boolean;
  /** Whether to use decorative background patterns */
  useBackgroundPatterns: boolean;
}

/**
 * Image prompt generated during content analysis
 */
export interface SlideImagePrompt {
  /** Slide number */
  slideNumber: number;
  /** Slide ID */
  slideId: string;
  /** Type of image needed */
  imageType: ImageType;
  /** Generated prompt for the image */
  prompt: string;
  /** Keywords extracted from slide content */
  keywords: string[];
  /** Priority (1-10, higher = more important) */
  priority: number;
  /** Position on slide if applicable */
  position?: 'background' | 'left' | 'right' | 'center' | 'fullbleed';
}

/**
 * Image generation options passed to pipeline
 */
export interface ImageGenerationOptions {
  /** Whether to enable image generation */
  enabled: boolean;
  /** Skip background image generation */
  skipBackgrounds?: boolean;
  /** Skip illustration generation */
  skipIllustrations?: boolean;
  /** Maximum images to generate per presentation */
  maxImages?: number;
  /** Image quality (0-100) */
  quality?: number;
  /** Override style for all images */
  styleOverride?: string;
  /** Custom negative prompt to append */
  customNegativePrompt?: string;
  /** Force regeneration (ignore cache) */
  forceRegenerate?: boolean;
}

/**
 * Vertex AI Imagen configuration
 */
export interface ImagenConfig {
  /** Google Cloud project ID */
  projectId: string;
  /** Google Cloud region (e.g., 'us-central1') */
  location: string;
  /** Model name (e.g., 'imagen-3.0-generate-001') */
  model: string;
  /** Default aspect ratio */
  defaultAspectRatio: AspectRatio;
  /** Default number of samples */
  sampleCount: number;
  /** Enable safety filtering */
  safetyFilterLevel: 'block_few' | 'block_some' | 'block_most';
  /** Person generation setting */
  personGeneration: 'dont_allow' | 'allow_adult';
}

/**
 * Image cache entry
 */
export interface ImageCacheEntry {
  /** Cache key (hash of prompt + params) */
  key: string;
  /** Path to cached image */
  path: string;
  /** Original prompt */
  prompt: string;
  /** Image type */
  type: ImageType;
  /** When cached */
  cachedAt: string;
  /** Last accessed */
  lastAccessedAt: string;
  /** Access count */
  accessCount: number;
  /** File size in bytes */
  fileSize: number;
}

/**
 * Image cache statistics
 */
export interface ImageCacheStats {
  /** Total entries in cache */
  totalEntries: number;
  /** Total size in bytes */
  totalSizeBytes: number;
  /** Cache hit rate (0-1) */
  hitRate: number;
  /** Oldest entry date */
  oldestEntry?: string;
  /** Newest entry date */
  newestEntry?: string;
}
