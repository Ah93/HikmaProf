// Enhanced PPTX Generator with shapes, icons, AI images, and visual elements

import * as fs from 'fs';
import * as path from 'path';
import { SlidePlan, SlideDefinition, LayoutType, ChartContent } from '../schemas/slide-plan';
import { TemplateStyle, ColorScheme, getTemplateStyle, getColorScheme } from '../config/templates';
import { getIcon, suggestIcon } from '../config/icons';
import { DiagramGenerator } from './diagram-generator';
import { GeneratedImage } from '../schemas/image-types';
import {
  CARD_SHADOWS,
  HEADER_ACCENTS,
  CORNER_DECORATIONS,
  DIVIDER_STYLES,
  resolveShapeColors,
  getPresetsForStyle
} from '../config/shape-presets';

export interface GeneratorConfig {
  templateStyle: string;
  colorScheme: string;
  language?: string;
}

export interface SlideImages {
  /** Map of slide ID to array of generated images */
  [slideId: string]: GeneratedImage[];
}

export class EnhancedPPTXGenerator {
  private outputDir: string;
  private slidesDir: string;
  private templateStyle: TemplateStyle;
  private colorScheme: ColorScheme;
  private pptxgen: any;
  private PptxGenJS: any; // Store the constructor for shapes access
  private slideImages: SlideImages = {};
  private isRTL: boolean = false; // true when language is Arabic

  private readonly MARGIN_X = 0.6;
  private readonly HEADER_Y = 0.28;
  private readonly HEADER_H = 0.95;

  constructor(outputDir: string = './output', config?: GeneratorConfig) {
    this.outputDir = outputDir;
    this.slidesDir = path.join(outputDir, 'slides');

    // Load template configuration
    this.templateStyle = getTemplateStyle(config?.templateStyle || 'modern');
    this.colorScheme = getColorScheme(config?.colorScheme || 'blue');

    // Load PptxGenJS constructor
    this.PptxGenJS = require('pptxgenjs');

    // Detect RTL language — config takes priority, then env var
    const lang = config?.language || process.env.PRESENTATION_LANGUAGE || 'en';
    this.isRTL = ['ar', 'ur'].includes(lang);

    // Ensure directories exist
    fs.mkdirSync(this.slidesDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'final'), { recursive: true});
  }

  /**
   * Set generated images to be used in slides
   */
  setSlideImages(images: SlideImages): void {
    this.slideImages = images;
  }

  /**
   * RTL-aware addText helper.
   * When the presentation language is Arabic, automatically injects
   * rtlMode: true and flips horizontal alignment to 'right'.
   */
  private addText(slide: any, text: string | any[], options: any = {}): void {
    if (this.isRTL) {
      options = {
        ...options,
        rtlMode: true,
        align: options.align === 'center' ? 'center' : 'right',
      };
    }
    // Always enable word-wrap so text never bleeds beyond the text-box boundary
    if (options.wrap === undefined) {
      options = { ...options, wrap: true };
    }
    // If text contains Arabic/RTL characters, force Arial which has full Arabic
    // glyph support in LibreOffice (used for PDF and video slide image export).
    const rawText = Array.isArray(text)
      ? text.map((r: any) => (typeof r === 'string' ? r : r?.text || '')).join('')
      : String(text || '');
    if (/[؀-ۿݐ-ݿ؀-ۿ]/.test(rawText) && !options.fontFace?.includes('Arabic')) {
      options = { ...options, fontFace: 'Arial', rtlMode: true };
    }
    slide.addText(text, options);
  }

  /**
   * Get image for a specific slide and type
   */
  private getSlideImage(slideId: string, type?: string): GeneratedImage | null {
    const images = this.slideImages[slideId];
    if (!images || images.length === 0) return null;

    if (type) {
      return images.find(img => img.type === type) || null;
    }
    return images[0];
  }

  /**
   * Add generated image to slide as background
   */
  private addImageBackground(slide: any, imagePath: string): boolean {
    try {
      if (fs.existsSync(imagePath)) {
        slide.background = { path: imagePath };
        return true;
      }
    } catch (error) {
      console.warn(`  - Could not add image background: ${error}`);
    }
    return false;
  }

  /**
   * Add generated image to slide at position
   */
  private addImageToSlide(
    slide: any,
    imagePath: string,
    x: number,
    y: number,
    w: number,
    h: number
  ): boolean {
    try {
      const isDataUrl = imagePath.startsWith('data:');
      if (isDataUrl || fs.existsSync(imagePath)) {
        slide.addImage({
          ...(isDataUrl ? { data: imagePath } : { path: imagePath }),
          x, y, w, h,
          rounding: true
        });
        return true;
      }
    } catch (error) {
      console.warn(`  - Could not add image: ${error}`);
    }
    return false;
  }

  private sanitizeColor(color: string | undefined): string {
    if (!color) return '000000';
    return color.replace('#', '');
  }

  private isDarkHex(hex: string): boolean {
    const h = (hex || '').replace('#', '');
    if (h.length !== 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luma < 0.45;
  }

  private pickTextColorForFill(fill: string | undefined): string {
    const f = this.sanitizeColor(fill || this.colorScheme.background);
    return this.isDarkHex(f) ? this.sanitizeColor(this.colorScheme.lightText) : this.sanitizeColor(this.colorScheme.text);
  }

  private getTitleColor(): string {
    // If background is dark, use light text; otherwise use primary.
    return this.isDarkHex(this.colorScheme.background)
      ? this.colorScheme.text
      : this.colorScheme.primary;
  }

  private applyBaseBackground(slide: any): void {
    slide.background = { fill: this.colorScheme.background };

    if (!this.templateStyle.useShapes) return;

    // Different background patterns based on template style
    switch (this.templateStyle.id) {
      case 'retro':
        // Retro: Cassette tape style diagonal stripe + top/bottom borders + stamp accent
        slide.addShape('rect', {
          x: 0, y: 1.0, w: 10, h: 0.3,
          fill: { color: '#FF6B35', transparency: 45 },
          line: { type: 'none' },
          rotate: -15
        });
        slide.addShape('rect', {
          x: 0, y: 4.5, w: 10, h: 0.3,
          fill: { color: '#FF6B35', transparency: 45 },
          line: { type: 'none' },
          rotate: -15
        });
        // Top border bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.1,
          fill: { color: '#FF6B35', transparency: 25 },
          line: { type: 'none' }
        });
        // Bottom border bar
        slide.addShape('rect', {
          x: 0, y: 5.525, w: 10, h: 0.1,
          fill: { color: '#FF6B35', transparency: 35 },
          line: { type: 'none' }
        });
        // Vintage corner stamp accent (top-right)
        slide.addShape('roundRect', {
          x: 9.35, y: 0.12, w: 0.55, h: 0.38,
          fill: { color: '#FFF8E7', transparency: 50 },
          line: { color: '#FF6B35', width: 1.5, transparency: 25 }
        });
        break;
        
      case 'luxury':
        // Luxury: Gold double frame + corner ornament squares + center accent rule
        slide.addShape('roundRect', {
          x: 0.2, y: 0.2, w: 9.6, h: 5.0,
          fill: { color: '#D4AF37', transparency: 65 },
          line: { color: '#B8860B', width: 2, transparency: 40 }
        });
        slide.addShape('roundRect', {
          x: 0.4, y: 0.4, w: 9.2, h: 4.6,
          fill: { color: this.colorScheme.background },
          line: { type: 'none' }
        });
        // Inner second border rule
        slide.addShape('roundRect', {
          x: 0.5, y: 0.5, w: 9.0, h: 4.4,
          fill: { color: this.colorScheme.background, transparency: 100 },
          line: { color: '#D4AF37', width: 0.5, transparency: 60 }
        });
        // Corner ornament squares (4 corners inside frame)
        ([[0.52, 0.52], [9.28, 0.52], [0.52, 4.68], [9.28, 4.68]] as [number,number][]).forEach(([x, y]) => {
          slide.addShape('rect', {
            x, y, w: 0.12, h: 0.12,
            fill: { color: '#D4AF37', transparency: 20 },
            line: { type: 'none' }
          });
        });
        // Center horizontal accent rule
        slide.addShape('rect', {
          x: 3.8, y: 2.78, w: 2.4, h: 0.025,
          fill: { color: '#D4AF37', transparency: 30 },
          line: { type: 'none' }
        });
        break;
        
      case 'industrial':
        // Industrial: Metal plate + corner bracket marks + center divider + right panel
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 5.625,
          fill: { color: '#4A5568', transparency: 55 },
          line: { type: 'none' }
        });
        // Corner bracket marks (L-shapes made from rects)
        [[0.15, 0.15], [9.45, 0.15], [9.45, 5.1], [0.15, 5.1]].forEach(([x, y], i) => {
          const hx = i === 0 || i === 3 ? x : x - 0.3;
          const vy = i === 0 || i === 1 ? y : y - 0.3;
          slide.addShape('rect', { x: hx, y, w: 0.3, h: 0.04, fill: { color: '#718096' }, line: { type: 'none' } });
          slide.addShape('rect', { x, y: vy, w: 0.04, h: 0.3, fill: { color: '#718096' }, line: { type: 'none' } });
        });
        // Center horizontal divider rule
        slide.addShape('rect', {
          x: 0.2, y: 2.78, w: 9.6, h: 0.04,
          fill: { color: '#718096', transparency: 50 },
          line: { type: 'none' }
        });
        // Right panel accent tint
        slide.addShape('rect', {
          x: 9.5, y: 0, w: 0.5, h: 5.625,
          fill: { color: '#718096', transparency: 70 },
          line: { type: 'none' }
        });
        // Rivet marks along center divider
        ([2.0, 5.0, 8.0] as number[]).forEach(x => {
          slide.addShape('rect', {
            x, y: 2.74, w: 0.08, h: 0.08,
            fill: { color: '#A0AEC0', transparency: 30 },
            line: { type: 'none' }
          });
        });
        break;
        
      case 'festival':
        // Festival: Bold layered color bands + left stacked bars + right accent
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.55,
          fill: { color: '#FF6B6B', transparency: 35 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.075, w: 10, h: 0.275,
          fill: { color: '#4ECDC4', transparency: 45 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.35, w: 10, h: 0.275,
          fill: { color: '#45B7D1', transparency: 50 },
          line: { type: 'none' }
        });
        // Left colorful stacked bars (matching the top/bottom color bands)
        slide.addShape('rect', {
          x: 0, y: 0.55, w: 0.22, h: 1.5,
          fill: { color: '#FF6B6B', transparency: 50 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 2.05, w: 0.22, h: 1.5,
          fill: { color: '#4ECDC4', transparency: 50 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 3.55, w: 0.22, h: 1.525,
          fill: { color: '#45B7D1', transparency: 50 },
          line: { type: 'none' }
        });
        // Right side accent bar (golden yellow)
        slide.addShape('rect', {
          x: 9.78, y: 0.55, w: 0.22, h: 4.525,
          fill: { color: '#FFE66D', transparency: 48 },
          line: { type: 'none' }
        });
        break;
        
      case 'tech':
        // Tech: Dark overlay + grid + left bar + right status indicators + bottom bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 5.625,
          fill: { color: '#1A1A1A', transparency: 65 },
          line: { type: 'none' }
        });
        // Horizontal grid lines
        for (let i = 1; i <= 5; i++) {
          slide.addShape('line', {
            x: 0, y: i * 0.93, w: 10, h: 0,
            line: { color: '#00CC44', width: 0.5, transparency: 72 }
          });
        }
        // Vertical grid lines
        for (let i = 1; i <= 9; i++) {
          slide.addShape('line', {
            x: i, y: 0, w: 0, h: 5.625,
            line: { color: '#00CC44', width: 0.5, transparency: 78 }
          });
        }
        // Left accent bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.06, h: 5.625,
          fill: { color: '#00CC44', transparency: 20 },
          line: { type: 'none' }
        });
        // Right status indicator bars (stacked — like a terminal sidebar)
        ([0.4, 0.9, 1.4, 1.9, 2.4] as number[]).forEach(y => {
          slide.addShape('rect', {
            x: 9.72, y, w: 0.2, h: 0.28,
            fill: { color: '#00CC44', transparency: 58 },
            line: { type: 'none' }
          });
        });
        // Bottom status bar
        slide.addShape('rect', {
          x: 0, y: 5.525, w: 10, h: 0.1,
          fill: { color: '#00CC44', transparency: 30 },
          line: { type: 'none' }
        });
        break;
        
      case 'academic':
        // Academic: Notebook paper — ruled lines + margin + header/footer + tick marks
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 5.4,
          fill: { color: '#F8F8F8', transparency: 65 },
          line: { type: 'none' }
        });
        // Horizontal ruled lines
        for (let i = 1; i <= 5; i++) {
          slide.addShape('line', {
            x: 0.5, y: i * 1.0, w: 9, h: 0,
            fill: { color: '#E0E0E0', transparency: 50 },
            line: { color: '#E0E0E0', width: 1, transparency: 50 }
          });
        }
        // Margin line
        slide.addShape('line', {
          x: 1.5, y: 0, w: 0, h: 5.4,
          fill: { color: '#FF6B6B', transparency: 30 },
          line: { color: '#FF6B6B', width: 1, transparency: 30 }
        });
        // Header solid bar (top)
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.08,
          fill: { color: '#4A90D9', transparency: 30 },
          line: { type: 'none' }
        });
        // Footer solid bar (bottom)
        slide.addShape('rect', {
          x: 0, y: 5.545, w: 10, h: 0.08,
          fill: { color: '#4A90D9', transparency: 45 },
          line: { type: 'none' }
        });
        // Right margin tick marks at each ruled line
        for (let i = 1; i <= 5; i++) {
          slide.addShape('rect', {
            x: 9.5, y: i * 1.0 - 0.04, w: 0.4, h: 0.04,
            fill: { color: '#E0E0E0', transparency: 38 },
            line: { type: 'none' }
          });
        }
        break;
        
      case 'startup':
        // Startup: Bold bottom energy band + left bar + right energy meter + top rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.12, h: 5.625,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.25, w: 10, h: 0.375,
          fill: { color: this.colorScheme.primary, transparency: 30 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.44, w: 10, h: 0.185,
          fill: { color: this.colorScheme.accent, transparency: 40 },
          line: { type: 'none' }
        });
        // Right-side stacked energy meter bars
        ([0, 0.19, 0.38, 0.57, 0.76] as number[]).forEach((offset, i) => {
          slide.addShape('rect', {
            x: 9.72, y: 5.25 - offset - 0.16, w: 0.25, h: 0.14,
            fill: { color: this.colorScheme.accent, transparency: 42 + i * 6 },
            line: { type: 'none' }
          });
        });
        // Subtle top accent rule
        slide.addShape('rect', {
          x: 0.12, y: 0, w: 9.88, h: 0.05,
          fill: { color: this.colorScheme.primary, transparency: 55 },
          line: { type: 'none' }
        });
        break;
        
      case 'medical':
        // Medical: Blue tint + two crosses + top/bottom bars + subtle horizontal lines
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 5.4,
          fill: { color: '#E8F4FD', transparency: 55 },
          line: { type: 'none' }
        });
        // Top-right medical cross
        slide.addShape('rect', {
          x: 8.8, y: 0.3, w: 0.8, h: 0.2,
          fill: { color: '#3B82F6', transparency: 40 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 9.1, y: 0.0, w: 0.2, h: 0.8,
          fill: { color: '#3B82F6', transparency: 40 },
          line: { type: 'none' }
        });
        // Bottom-left small cross
        slide.addShape('rect', {
          x: 0.2, y: 4.95, w: 0.5, h: 0.12,
          fill: { color: '#3B82F6', transparency: 50 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0.39, y: 4.83, w: 0.12, h: 0.5,
          fill: { color: '#3B82F6', transparency: 50 },
          line: { type: 'none' }
        });
        // Top border bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.08,
          fill: { color: '#3B82F6', transparency: 35 },
          line: { type: 'none' }
        });
        // Pulse accent bar (bottom)
        slide.addShape('rect', {
          x: 0, y: 5.525, w: 10, h: 0.1,
          fill: { color: '#3B82F6', transparency: 40 },
          line: { type: 'none' }
        });
        // Subtle horizontal guide lines
        ([2.0, 3.5] as number[]).forEach(y => {
          slide.addShape('line', {
            x: 0, y, w: 10, h: 0,
            line: { color: '#3B82F6', width: 0.5, transparency: 82 }
          });
        });
        break;
        
      case 'nature':
        // Nature: Green tint + left/right bars + top rule + branch tick marks
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 5.625,
          fill: { color: '#F0FFF4', transparency: 65 },
          line: { type: 'none' }
        });
        // Left bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.1, h: 5.625,
          fill: { color: '#16A34A', transparency: 30 },
          line: { type: 'none' }
        });
        // Bottom rule
        slide.addShape('rect', {
          x: 0, y: 5.525, w: 10, h: 0.1,
          fill: { color: '#22C55E', transparency: 30 },
          line: { type: 'none' }
        });
        // Right mirror bar (faint)
        slide.addShape('rect', {
          x: 9.9, y: 0, w: 0.1, h: 5.625,
          fill: { color: '#16A34A', transparency: 55 },
          line: { type: 'none' }
        });
        // Top rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.06,
          fill: { color: '#16A34A', transparency: 40 },
          line: { type: 'none' }
        });
        // "Branch" tick marks jutting from left bar
        ([1.4, 2.8, 4.2] as number[]).forEach(y => {
          slide.addShape('rect', {
            x: 0.1, y, w: 0.4, h: 0.04,
            fill: { color: '#22C55E', transparency: 38 },
            line: { type: 'none' }
          });
        });
        break;
        
      case 'elegant':
        // Elegant: Gold double frame + corner ornaments + top/bottom rules
        slide.addShape('rect', {
          x: 0.18, y: 0.18, w: 9.64, h: 5.265,
          fill: { color: '#FFF8DC', transparency: 72 },
          line: { color: '#D4AF37', width: 1, transparency: 35 }
        });
        // Inner second frame rule
        slide.addShape('rect', {
          x: 0.32, y: 0.32, w: 9.36, h: 4.98,
          fill: { color: this.colorScheme.background, transparency: 100 },
          line: { color: '#D4AF37', width: 0.5, transparency: 60 }
        });
        // Top horizontal rule (thin gold line inside frame)
        slide.addShape('rect', {
          x: 0.5, y: 0.45, w: 9.0, h: 0.025,
          fill: { color: '#D4AF37', transparency: 40 },
          line: { type: 'none' }
        });
        // Bottom horizontal rule
        slide.addShape('rect', {
          x: 0.5, y: 5.15, w: 9.0, h: 0.025,
          fill: { color: '#D4AF37', transparency: 55 },
          line: { type: 'none' }
        });
        // Corner ornament squares (4 corners inside inner frame)
        ([[0.38, 0.38], [9.24, 0.38], [0.38, 5.24], [9.24, 5.24]] as [number,number][]).forEach(([x, y]) => {
          slide.addShape('rect', {
            x, y, w: 0.1, h: 0.1,
            fill: { color: '#D4AF37', transparency: 22 },
            line: { type: 'none' }
          });
        });
        break;
        
      case 'modern':
        // Modern: Left bar + top/bottom rules + left tint + right bar + sub-header rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.08, h: 5.625,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.07,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.555, w: 10, h: 0.07,
          fill: { color: this.colorScheme.accent },
          line: { type: 'none' }
        });
        // Subtle background tint panel (left quarter)
        slide.addShape('rect', {
          x: 0, y: 0, w: 2.6, h: 5.625,
          fill: { color: this.colorScheme.primary, transparency: 94 },
          line: { type: 'none' }
        });
        // Right side thin accent bar
        slide.addShape('rect', {
          x: 9.92, y: 0, w: 0.08, h: 5.625,
          fill: { color: this.colorScheme.accent, transparency: 40 },
          line: { type: 'none' }
        });
        // Sub-header horizontal rule
        slide.addShape('rect', {
          x: 0.08, y: 0.55, w: 9.84, h: 0.025,
          fill: { color: this.colorScheme.primary, transparency: 70 },
          line: { type: 'none' }
        });
        break;

      case 'corporate':
        // Corporate: Left bar + top rule + corner box + right tint + sub-header rule + bottom bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.15, h: 5.625,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        // Top accent line
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.08,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        // Bottom right corner box
        slide.addShape('rect', {
          x: 8.5, y: 4.6, w: 1.5, h: 1.025,
          fill: { color: this.colorScheme.primary, transparency: 55 },
          line: { type: 'none' }
        });
        // Right panel faint tint
        slide.addShape('rect', {
          x: 8.0, y: 0.08, w: 2.0, h: 4.52,
          fill: { color: this.colorScheme.primary, transparency: 92 },
          line: { type: 'none' }
        });
        // Sub-header horizontal rule
        slide.addShape('rect', {
          x: 0.18, y: 0.55, w: 9.64, h: 0.025,
          fill: { color: this.colorScheme.primary, transparency: 70 },
          line: { type: 'none' }
        });
        // Bottom accent bar
        slide.addShape('rect', {
          x: 0, y: 5.545, w: 10, h: 0.08,
          fill: { color: this.colorScheme.primary, transparency: 48 },
          line: { type: 'none' }
        });
        break;

      case 'creative':
        // Creative: Top block + right column + bottom bar + left sub-bar + inner rule + column accents
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 1.1,
          fill: { color: this.colorScheme.primary, transparency: 72 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 8.6, y: 0, w: 1.4, h: 5.625,
          fill: { color: this.colorScheme.accent, transparency: 78 },
          line: { type: 'none' }
        });
        // Bold bottom accent bar
        slide.addShape('rect', {
          x: 0, y: 5.47, w: 10, h: 0.155,
          fill: { color: this.colorScheme.primary, transparency: 40 },
          line: { type: 'none' }
        });
        // Left sub-bar (below top block)
        slide.addShape('rect', {
          x: 0, y: 1.1, w: 0.35, h: 4.37,
          fill: { color: this.colorScheme.primary, transparency: 82 },
          line: { type: 'none' }
        });
        // Inner rule under top block
        slide.addShape('rect', {
          x: 0, y: 1.08, w: 8.6, h: 0.04,
          fill: { color: this.colorScheme.primary, transparency: 50 },
          line: { type: 'none' }
        });
        // Small accent blocks in right column
        ([1.5, 2.8, 4.1] as number[]).forEach(y => {
          slide.addShape('rect', {
            x: 8.72, y, w: 0.18, h: 0.1,
            fill: { color: this.colorScheme.accent, transparency: 52 },
            line: { type: 'none' }
          });
        });
        break;

      case 'futuristic':
        // Futuristic: Neon grid + top-right/bottom-left L-brackets + scan lines
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 5.625,
          fill: { color: '#0a0a1a', transparency: 65 },
          line: { type: 'none' }
        });
        // Neon vertical grid lines
        for (let i = 1; i < 10; i++) {
          slide.addShape('line', {
            x: i, y: 0, w: 0, h: 5.625,
            line: { color: '#00ffff', width: 0.5, transparency: 55 }
          });
        }
        // Neon horizontal grid lines
        for (let i = 1; i < 6; i++) {
          slide.addShape('line', {
            x: 0, y: i, w: 10, h: 0,
            line: { color: '#00ffff', width: 0.5, transparency: 55 }
          });
        }
        // Top-right magenta L-bracket
        slide.addShape('rect', {
          x: 8.5, y: 0, w: 1.5, h: 0.06,
          fill: { color: '#ff00ff', transparency: 20 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 9.94, y: 0, w: 0.06, h: 1.5,
          fill: { color: '#ff00ff', transparency: 20 },
          line: { type: 'none' }
        });
        // Bottom-left cyan L-bracket
        slide.addShape('rect', {
          x: 0, y: 5.565, w: 1.5, h: 0.06,
          fill: { color: '#00ffff', transparency: 20 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 4.125, w: 0.06, h: 1.5,
          fill: { color: '#00ffff', transparency: 20 },
          line: { type: 'none' }
        });
        // Scan line effect (faint horizontal highlights)
        ([0.5, 1.5, 2.5, 3.5, 4.5] as number[]).forEach(y => {
          slide.addShape('rect', {
            x: 0, y, w: 10, h: 0.06,
            fill: { color: '#00ffff', transparency: 90 },
            line: { type: 'none' }
          });
        });
        break;

      case 'gradient':
        // Gradient: Three color panels + top/bottom rules + vertical dividers
        slide.addShape('rect', {
          x: 0, y: 0, w: 4.0, h: 5.625,
          fill: { color: this.colorScheme.primary, transparency: 78 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 3.5, y: 0, w: 3.5, h: 5.625,
          fill: { color: this.colorScheme.secondary, transparency: 82 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 6.5, y: 0, w: 3.5, h: 5.625,
          fill: { color: this.colorScheme.accent, transparency: 78 },
          line: { type: 'none' }
        });
        // Top solid rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.07,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        // Bottom solid rule
        slide.addShape('rect', {
          x: 0, y: 5.555, w: 10, h: 0.07,
          fill: { color: this.colorScheme.accent },
          line: { type: 'none' }
        });
        // Vertical dividers between panels
        slide.addShape('rect', {
          x: 3.5, y: 0.07, w: 0.03, h: 5.485,
          fill: { color: this.colorScheme.primary, transparency: 55 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 6.5, y: 0.07, w: 0.03, h: 5.485,
          fill: { color: this.colorScheme.accent, transparency: 55 },
          line: { type: 'none' }
        });
        break;

      case 'vibrant':
        // Vibrant: Three color panels + white overlay + top/bottom rules + junction squares
        slide.addShape('rect', {
          x: 0, y: 0, w: 3.3, h: 5.625,
          fill: { color: '#FF6B6B', transparency: 55 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 3.3, y: 0, w: 3.4, h: 5.625,
          fill: { color: '#4ECDC4', transparency: 55 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 6.7, y: 0, w: 3.3, h: 5.625,
          fill: { color: '#45B7D1', transparency: 55 },
          line: { type: 'none' }
        });
        // Overlay white rectangle (content area)
        slide.addShape('rect', {
          x: 0.3, y: 0.3, w: 9.4, h: 5.025,
          fill: { color: this.colorScheme.background },
          line: { type: 'none' }
        });
        // Top rule inside white overlay
        slide.addShape('rect', {
          x: 0.3, y: 0.3, w: 9.4, h: 0.06,
          fill: { color: '#FF6B6B', transparency: 40 },
          line: { type: 'none' }
        });
        // Bottom rule inside white overlay
        slide.addShape('rect', {
          x: 0.3, y: 5.265, w: 9.4, h: 0.06,
          fill: { color: '#45B7D1', transparency: 40 },
          line: { type: 'none' }
        });
        // Junction accent squares (panel edge markers)
        ([[3.18, 0.3], [3.18, 5.265], [6.64, 0.3], [6.64, 5.265]] as [number,number][]).forEach(([x, y]) => {
          slide.addShape('rect', {
            x, y, w: 0.12, h: 0.06,
            fill: { color: '#4ECDC4', transparency: 28 },
            line: { type: 'none' }
          });
        });
        break;

      case 'minimal':
        // Minimal: Top/bottom rules + left corner accent + right thin rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.05,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.575, w: 10, h: 0.05,
          fill: { color: this.colorScheme.primary, transparency: 60 },
          line: { type: 'none' }
        });
        // Left corner drop (short vertical accent below top rule)
        slide.addShape('rect', {
          x: 0, y: 0.05, w: 0.05, h: 0.5,
          fill: { color: this.colorScheme.primary, transparency: 50 },
          line: { type: 'none' }
        });
        // Right thin rule (mirrored, very subtle)
        slide.addShape('rect', {
          x: 9.95, y: 0.05, w: 0.05, h: 5.525,
          fill: { color: this.colorScheme.primary, transparency: 72 },
          line: { type: 'none' }
        });
        break;

      case 'magazine':
        // Magazine: Top/bottom bars + left/right bars + inner sub-rule + editorial column
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.12,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.505, w: 10, h: 0.12,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        // Left accent bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.08, h: 5.625,
          fill: { color: this.colorScheme.primary },
          line: { type: 'none' }
        });
        // Right accent bar (mirrored, slightly transparent)
        slide.addShape('rect', {
          x: 9.92, y: 0, w: 0.08, h: 5.625,
          fill: { color: this.colorScheme.primary, transparency: 40 },
          line: { type: 'none' }
        });
        // Inner sub-rule just below top bar
        slide.addShape('rect', {
          x: 0.08, y: 0.22, w: 9.84, h: 0.025,
          fill: { color: this.colorScheme.primary, transparency: 55 },
          line: { type: 'none' }
        });
        // Editorial column separator (thin vertical rule)
        slide.addShape('rect', {
          x: 3.5, y: 0.12, w: 0.03, h: 5.385,
          fill: { color: this.colorScheme.primary, transparency: 75 },
          line: { type: 'none' }
        });
        break;

      default:
        // Default: Left bar + top/bottom rules + right bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.08, h: 5.625,
          fill: { color: this.colorScheme.accent },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.535, w: 10, h: 0.09,
          fill: { color: this.colorScheme.primary, transparency: 40 },
          line: { type: 'none' }
        });
        // Top rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.07,
          fill: { color: this.colorScheme.primary, transparency: 40 },
          line: { type: 'none' }
        });
        // Right side thin bar
        slide.addShape('rect', {
          x: 9.92, y: 0, w: 0.08, h: 5.625,
          fill: { color: this.colorScheme.accent, transparency: 50 },
          line: { type: 'none' }
        });
    }
  }

  private addModernHeader(slide: any, title?: string): void {
    if (!title) return;

    const titleColor = this.getTitleColor();
    const textColor = this.isDarkHex(this.colorScheme.background) ? this.colorScheme.text : titleColor;

    const titleStr = String(title);
    const titleLen = titleStr.trim().length;
    const baseHeading = this.templateStyle.fontSizes.heading;
    const headerFontSize = Math.max(
      18,
      titleLen > 90 ? baseHeading - 8 : titleLen > 65 ? baseHeading - 5 : titleLen > 45 ? baseHeading - 2 : baseHeading
    );

    // Different header styles based on template
    switch (this.templateStyle.id) {
      case 'retro':
        // Retro: Polaroid-style frame header
        slide.addShape('roundRect', {
          x: this.MARGIN_X - 0.1, y: this.HEADER_Y - 0.1, w: 9.6, h: this.HEADER_H + 0.2,
          fill: { color: '#FFF8E7', transparency: 55 },
          line: { color: '#FF6B35', width: 3, transparency: 45 }
        });
        break;
        
      case 'luxury':
        // Luxury: Gold underline with small accent rect
        slide.addShape('rect', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H - 0.03, w: 8.0, h: 0.03,
          fill: { color: '#D4AF37', transparency: 40 },
          line: { type: 'none' }
        });
        // Small square accent (replacing triangle)
        slide.addShape('rect', {
          x: this.MARGIN_X + 8.1, y: this.HEADER_Y + this.HEADER_H - 0.1, w: 0.12, h: 0.12,
          fill: { color: '#D4AF37' },
          line: { type: 'none' }
        });
        break;
        
      case 'industrial':
        // Industrial: Metal plate header with square corner marks
        slide.addShape('rect', {
          x: this.MARGIN_X - 0.05, y: this.HEADER_Y - 0.05, w: 9.1, h: this.HEADER_H + 0.1,
          fill: { color: '#374151', transparency: 65 },
          line: { color: '#718096', width: 1, transparency: 45 }
        });
        // Square corner marks (replacing oval rivets)
        [[this.MARGIN_X - 0.06, this.HEADER_Y - 0.06], [this.MARGIN_X + 8.96, this.HEADER_Y - 0.06]].forEach(([x, y]) => {
          slide.addShape('rect', {
            x, y, w: 0.12, h: 0.12,
            fill: { color: '#718096' },
            line: { type: 'none' }
          });
        });
        break;
        
      case 'festival':
        // Festival: Bold color underline under header
        slide.addShape('rect', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H - 0.05, w: 8.8, h: 0.05,
          fill: { color: '#FF6B6B', transparency: 30 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H, w: 5.5, h: 0.04,
          fill: { color: '#4ECDC4', transparency: 40 },
          line: { type: 'none' }
        });
        break;
        
      case 'tech':
        // Tech: Digital frame with binary dots
        slide.addShape('rect', {
          x: this.MARGIN_X - 0.05, y: this.HEADER_Y - 0.05, w: 9.1, h: this.HEADER_H + 0.1,
          fill: { color: '#000000', transparency: 65 },
          line: { color: '#00FF00', width: 1, transparency: 60 }
        });
        // Binary dots
        for (let i = 0; i < 20; i++) {
          const x = this.MARGIN_X + Math.random() * 8.5;
          const y = this.HEADER_Y + Math.random() * this.HEADER_H;
          slide.addShape('rect', {
            x, y, w: 0.08, h: 0.08,
            fill: { color: '#00FF00', transparency: Math.random() * 50 + 30 },
            line: { type: 'none' }
          });
        }
        break;
        
      case 'academic':
        // Academic: Classic underline with book icon
        slide.addShape('line', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H - 0.03, w: 8.5, h: 0,
          fill: { color: '#8B4513', transparency: 40 },
          line: { color: '#8B4513', width: 1, transparency: 40 }
        });
        // Book icon
        slide.addShape('rect', {
          x: this.MARGIN_X + 8.7, y: this.HEADER_Y + 0.1, w: 0.3, h: 0.4,
          fill: { color: '#8B4513', transparency: 60 },
          line: { color: '#8B4513', width: 1, transparency: 45 }
        });
        slide.addShape('line', {
          x: this.MARGIN_X + 8.85, y: this.HEADER_Y + 0.3, w: 0, h: 0.2,
          fill: { color: '#8B4513', transparency: 45 },
          line: { color: '#8B4513', width: 1, transparency: 45 }
        });
        break;
        
      case 'startup':
        // Startup: Bold accent bar with right color block
        slide.addShape('rect', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H - 0.04, w: 8.8, h: 0.04,
          fill: { color: this.colorScheme.accent },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: this.MARGIN_X + 8.5, y: this.HEADER_Y, w: 0.3, h: this.HEADER_H,
          fill: { color: '#FF6B6B', transparency: 40 },
          line: { type: 'none' }
        });
        break;

      case 'medical':
        // Medical: Clean underline with small accent square
        slide.addShape('rect', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H - 0.03, w: 8.0, h: 0.03,
          fill: { color: '#3B82F6', transparency: 30 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: this.MARGIN_X + 8.55, y: this.HEADER_Y + 0.2, w: 0.22, h: 0.22,
          fill: { color: '#EF4444', transparency: 35 },
          line: { type: 'none' }
        });
        break;

      case 'nature':
        // Nature: Green underline + small tick marks
        slide.addShape('rect', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H - 0.03, w: 8.0, h: 0.03,
          fill: { color: '#22C55E', transparency: 30 },
          line: { type: 'none' }
        });
        [8.5, 8.75, 9.0].forEach((x, i) => {
          slide.addShape('rect', {
            x: this.MARGIN_X + x, y: this.HEADER_Y + 0.25 + i * 0.12, w: 0.22, h: 0.06,
            fill: { color: ['#4ADE80', '#22C55E', '#16A34A'][i], transparency: 35 },
            line: { type: 'none' }
          });
        });
        break;

      case 'elegant':
        // Elegant: Gold underline + small square corner accents
        slide.addShape('rect', {
          x: this.MARGIN_X, y: this.HEADER_Y + this.HEADER_H - 0.025, w: 8.8, h: 0.025,
          fill: { color: '#D4AF37', transparency: 30 },
          line: { type: 'none' }
        });
        [[this.MARGIN_X, this.HEADER_Y], [this.MARGIN_X + 8.6, this.HEADER_Y + this.HEADER_H - 0.12]].forEach(([x, y]) => {
          slide.addShape('rect', { x, y, w: 0.12, h: 0.12, fill: { color: '#D4AF37', transparency: 20 }, line: { type: 'none' } });
        });
        break;
        
      default:
        // Default: Accent pill + line combo
        if (this.templateStyle.useShapes) {
          slide.addShape('roundRect', {
            x: this.MARGIN_X,
            y: this.HEADER_Y + 0.06,
            w: 0.22,
            h: this.HEADER_H - 0.1,
            fill: { color: this.colorScheme.accent },
            line: { type: 'none' }
          });
          slide.addShape('rect', {
            x: this.MARGIN_X + 0.34,
            y: this.HEADER_Y + this.HEADER_H,
            w: 8.9,
            h: 0.02,
            fill: { color: this.colorScheme.accent, transparency: 40 },
            line: { type: 'none' }
          });
        }
    }

    const headerX = this.MARGIN_X + (this.templateStyle.useShapes ? 0.35 : 0);
    this.addText(slide, titleStr, {
      x: headerX,
      y: this.HEADER_Y,
      w: 9.4 - headerX,
      h: this.HEADER_H,
      fontSize: headerFontSize,
      bold: true,
      color: textColor,
      fontFace: this.templateStyle.fontFamily,
      wrap: true
    });
  }

  async generate(slidePlan: SlidePlan, outputPath: string, images?: SlideImages): Promise<string> {
    // Set images if provided
    if (images) {
      this.setSlideImages(images);
    }

    // Create pptx instance
    const pptx = new this.PptxGenJS();
    this.pptxgen = pptx;
    pptx.layout = 'LAYOUT_16x9';
    pptx.title = slidePlan.presentationMetadata.title;
    if (this.isRTL) {
      pptx.rtlMode = true;
    }

    // Define master slides with template styling
    this.defineMasterSlides(pptx);

    // Generate each slide
    for (const slide of slidePlan.slides) {
      this.createSlide(pptx, slide, slidePlan.presentationMetadata.theme);
    }

    // Save PPTX
    const finalPath = path.join(this.outputDir, 'final', outputPath);
    await pptx.writeFile({ fileName: finalPath });

    return finalPath;
  }

  private defineMasterSlides(pptx: any): void {
    // Define a master slide with footer
    pptx.defineSlideMaster({
      title: 'MASTER_SLIDE',
      background: { color: this.colorScheme.background },
      objects: [
        // Footer line
        {
          line: {
            x: 0.5,
            y: 5.3,
            w: 9,
            h: 0,
            line: { color: this.colorScheme.accent, width: 2 }
          }
        }
      ]
    });
  }

  private createSlide(pptx: any, slide: SlideDefinition, theme: any): void {
    const pptxSlide = pptx.addSlide();

    switch (slide.layout) {
      case 'title-slide':
        this.createTitleSlide(pptxSlide, slide);
        break;
      case 'section-header':
        this.createSectionHeader(pptxSlide, slide);
        break;
      case 'title-bullets':
        this.createTitleBullets(pptxSlide, slide);
        break;
      case 'title-two-columns':
        this.createTwoColumns(pptxSlide, slide);
        break;
      case 'title-image-text':
        this.createImageTextSlide(pptxSlide, slide);
        break;
      case 'title-cards':
        this.createCards(pptxSlide, slide);
        break;
      case 'quote-slide':
        this.createQuoteSlide(pptxSlide, slide);
        break;
      case 'conclusion':
        this.createConclusion(pptxSlide, slide);
        break;
      case 'thank-you':
        this.createThankYou(pptxSlide, slide);
        break;
      case 'title-chart':
        this.createChartSlide(pptxSlide, slide);
        break;
      case 'title-table':
        this.createTableSlide(pptxSlide, slide);
        break;
      case 'title-timeline':
        this.createTimelineSlide(pptxSlide, slide);
        break;
      case 'title-statistics':
        this.createStatisticsSlide(pptxSlide, slide);
        break;
      case 'title-comparison':
        this.createComparisonSlide(pptxSlide, slide);
        break;
      case 'title-icon-grid':
        this.createIconGridSlide(pptxSlide, slide);
        break;
      default:
        this.createTitleBullets(pptxSlide, slide);
    }

    // Add speaker notes
    if (slide.speakerNotes) {
      pptxSlide.addNotes(slide.speakerNotes);
    }
  }

  // ===== TITLE SLIDE =====
  private createTitleSlide(slide: any, def: SlideDefinition): void {
    // Template-specific title slide backgrounds
    switch (this.templateStyle.id) {
      case 'modern':
        slide.background = { fill: this.colorScheme.primary };
        // Bold left identity panel
        slide.addShape('rect', {
          x: 0, y: 0, w: 3.1, h: 5.625,
          fill: { color: this.colorScheme.accent, transparency: 80 },
          line: { type: 'none' }
        });
        // Bright left edge bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.08, h: 5.625,
          fill: { color: this.colorScheme.accent },
          line: { type: 'none' }
        });
        // Top horizontal rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.06,
          fill: { color: this.colorScheme.accent, transparency: 25 },
          line: { type: 'none' }
        });
        // Metadata zone separator (above author area)
        slide.addShape('rect', {
          x: 3.3, y: 3.95, w: 6.4, h: 0.03,
          fill: { color: this.colorScheme.accent, transparency: 30 },
          line: { type: 'none' }
        });
        // Bottom rule
        slide.addShape('rect', {
          x: 0, y: 5.555, w: 10, h: 0.07,
          fill: { color: this.colorScheme.accent, transparency: 30 },
          line: { type: 'none' }
        });
        break;

      case 'corporate':
        slide.background = { fill: this.colorScheme.primary };
        // Bold left accent bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.5, h: 5.625,
          fill: { color: this.colorScheme.accent },
          line: { type: 'none' }
        });
        // Top thin rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.06,
          fill: { color: this.colorScheme.accent, transparency: 30 },
          line: { type: 'none' }
        });
        // Metadata band at bottom
        slide.addShape('rect', {
          x: 0, y: 4.05, w: 10, h: 1.575,
          fill: { color: this.colorScheme.secondary, transparency: 62 },
          line: { type: 'none' }
        });
        // Separator rule at top of metadata band
        slide.addShape('rect', {
          x: 0.8, y: 4.05, w: 8.7, h: 0.04,
          fill: { color: this.colorScheme.accent, transparency: 20 },
          line: { type: 'none' }
        });
        break;

      case 'creative':
        slide.background = { fill: '#1a1a2e' };
        // Bold top color block
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 1.5,
          fill: { color: '#FF6B6B', transparency: 50 },
          line: { type: 'none' }
        });
        // Right accent column
        slide.addShape('rect', {
          x: 7.6, y: 0, w: 2.4, h: 5.625,
          fill: { color: '#4ECDC4', transparency: 62 },
          line: { type: 'none' }
        });
        // Metadata zone at bottom
        slide.addShape('rect', {
          x: 0, y: 4.1, w: 7.6, h: 1.525,
          fill: { color: '#45B7D1', transparency: 78 },
          line: { type: 'none' }
        });
        // Separator rule
        slide.addShape('rect', {
          x: 0.5, y: 4.1, w: 6.8, h: 0.035,
          fill: { color: '#FF6B6B', transparency: 25 },
          line: { type: 'none' }
        });
        break;

      case 'tech':
        slide.background = { fill: '#0d1117' };
        // Grid lines
        for (let i = 1; i < 10; i++) {
          slide.addShape('line', { x: i, y: 0, w: 0, h: 5.625, line: { color: '#21262d', width: 1 } });
        }
        for (let i = 1; i < 6; i++) {
          slide.addShape('line', { x: 0, y: i, w: 10, h: 0, line: { color: '#21262d', width: 1 } });
        }
        // Bold left accent bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.12, h: 5.625,
          fill: { color: '#58a6ff' },
          line: { type: 'none' }
        });
        // Top bright rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.06,
          fill: { color: '#58a6ff', transparency: 20 },
          line: { type: 'none' }
        });
        // Metadata separator line
        slide.addShape('rect', {
          x: 0.35, y: 4.05, w: 9.3, h: 0.03,
          fill: { color: '#58a6ff', transparency: 30 },
          line: { type: 'none' }
        });
        // Metadata zone
        slide.addShape('rect', {
          x: 0, y: 4.08, w: 10, h: 1.545,
          fill: { color: '#161b22', transparency: 30 },
          line: { type: 'none' }
        });
        // Bottom rule
        slide.addShape('rect', {
          x: 0, y: 5.555, w: 10, h: 0.07,
          fill: { color: '#58a6ff', transparency: 25 },
          line: { type: 'none' }
        });
        break;

      case 'elegant':
        slide.background = { fill: '#12111a' };
        // Outer gold border frame
        slide.addShape('rect', {
          x: 0.25, y: 0.25, w: 9.5, h: 5.125,
          fill: { color: 'transparent' },
          line: { color: '#D4AF37', width: 2 }
        });
        // Inner thinner gold frame
        slide.addShape('rect', {
          x: 0.48, y: 0.48, w: 9.04, h: 4.665,
          fill: { color: 'transparent' },
          line: { color: '#D4AF37', width: 1, transparency: 35 }
        });
        // Metadata separator — gold rule above author area
        slide.addShape('rect', {
          x: 1.5, y: 3.9, w: 7.0, h: 0.03,
          fill: { color: '#D4AF37', transparency: 25 },
          line: { type: 'none' }
        });
        // Short center accent bar above the title
        slide.addShape('rect', {
          x: 4.0, y: 0.85, w: 2.0, h: 0.04,
          fill: { color: '#D4AF37', transparency: 30 },
          line: { type: 'none' }
        });
        break;

      case 'gradient':
        slide.background = { fill: this.colorScheme.primary };
        // Left color wash
        slide.addShape('rect', {
          x: 0, y: 0, w: 4.8, h: 5.625,
          fill: { color: this.colorScheme.accent, transparency: 76 },
          line: { type: 'none' }
        });
        // Right color wash
        slide.addShape('rect', {
          x: 4.3, y: 0, w: 5.7, h: 5.625,
          fill: { color: this.colorScheme.secondary, transparency: 80 },
          line: { type: 'none' }
        });
        // Metadata separator
        slide.addShape('rect', {
          x: 0.7, y: 4.0, w: 8.6, h: 0.035,
          fill: { color: this.colorScheme.accent, transparency: 28 },
          line: { type: 'none' }
        });
        // Top and bottom rules
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.06,
          fill: { color: this.colorScheme.accent, transparency: 25 },
          line: { type: 'none' }
        });
        slide.addShape('rect', {
          x: 0, y: 5.555, w: 10, h: 0.07,
          fill: { color: this.colorScheme.accent, transparency: 30 },
          line: { type: 'none' }
        });
        break;

      default:
        slide.background = { fill: this.colorScheme.primary };
        // Left accent bar
        slide.addShape('rect', {
          x: 0, y: 0, w: 0.1, h: 5.625,
          fill: { color: this.colorScheme.accent },
          line: { type: 'none' }
        });
        // Top rule
        slide.addShape('rect', {
          x: 0, y: 0, w: 10, h: 0.06,
          fill: { color: this.colorScheme.accent, transparency: 25 },
          line: { type: 'none' }
        });
        // Metadata separator
        slide.addShape('rect', {
          x: 0.65, y: 4.0, w: 8.7, h: 0.03,
          fill: { color: this.colorScheme.accent, transparency: 35 },
          line: { type: 'none' }
        });
        // Bottom rule
        slide.addShape('rect', {
          x: 0, y: 5.555, w: 10, h: 0.07,
          fill: { color: this.colorScheme.accent, transparency: 40 },
          line: { type: 'none' }
        });
    }

    // ── Layout config per template ─────────────────────────────
    const tid = this.templateStyle.id;
    const isModern    = tid === 'modern';
    const isTech      = tid === 'tech';
    const isElegant   = tid === 'elegant';
    const isCreative  = tid === 'creative';
    const isCorporate = tid === 'corporate';

    // Content x-start and width (respects left panel for modern)
    // Right margin kept at 0.6" from edge → max right edge = 9.4"
    const cx = isModern ? 3.3 : 0.65;
    const cw = isModern ? 6.05 : 8.7;   // 3.3+6.05=9.35 | 0.65+8.7=9.35
    const textAlign = (isModern || isTech) ? 'left' : 'center';

    // Title starts higher for creative (below top block), lower for elegant (inside frame)
    let ty = isCreative ? 1.75 : (isElegant ? 1.15 : (isTech ? 0.45 : 0.8));

    const titleStr    = def.content.title    ? String(def.content.title)    : '';
    const subtitleStr = def.content.subtitle ? String(def.content.subtitle) : '';
    const authorStr   = def.content.author   ? String(def.content.author)   : '';
    const dateStr     = def.content.date     ? String(def.content.date)     : '';

    // ── Title ──────────────────────────────────────────────────
    if (titleStr) {
      const titleLen = titleStr.trim().length;
      const baseTitle = this.templateStyle.fontSizes.title;
      const titleFontSize = Math.max(
        28,
        titleLen > 90 ? baseTitle - 14 :
        titleLen > 60 ? baseTitle - 8  :
        titleLen > 40 ? baseTitle - 4  : baseTitle
      );
      const titleH = subtitleStr ? 1.65 : 2.1;

      this.addText(slide, titleStr, {
        x: cx, y: ty, w: cw, h: titleH,
        fontSize: titleFontSize,
        bold: true,
        color: this.colorScheme.lightText,
        align: textAlign,
        valign: 'middle',
        wrap: true,
        fontFace: this.templateStyle.fontFamily
      });
      ty += titleH + 0.1;
    }

    // ── Subtitle ───────────────────────────────────────────────
    if (subtitleStr) {
      const subLen = subtitleStr.trim().length;
      const subFontSize = Math.max(15, subLen > 90 ? 16 : subLen > 60 ? 19 : 22);
      this.addText(slide, subtitleStr, {
        x: cx, y: ty, w: cw, h: 0.72,
        fontSize: subFontSize,
        color: this.colorScheme.lightText,
        align: textAlign,
        valign: 'top',
        wrap: true,
        fontFace: this.templateStyle.fontFamily
      });
      ty += 0.82;
    }

    // ── Author ─────────────────────────────────────────────────
    // Fixed near-bottom position regardless of title length
    const metaY = 4.12;
    if (authorStr) {
      this.addText(slide, authorStr, {
        x: cx, y: metaY, w: cw, h: 0.42,
        fontSize: 16,
        bold: false,
        color: this.colorScheme.lightText,
        align: textAlign,
        valign: 'middle',
        wrap: false,
        fontFace: this.templateStyle.fontFamily
      });
    }

    // ── Date / Year ────────────────────────────────────────────
    if (dateStr) {
      this.addText(slide, dateStr, {
        x: cx, y: metaY + 0.48, w: cw, h: 0.34,
        fontSize: 13,
        color: this.colorScheme.lightText,
        align: textAlign,
        valign: 'top',
        wrap: false,
        fontFace: this.templateStyle.fontFamily
      });
    }
  }

  // ===== SECTION HEADER =====
  private createSectionHeader(slide: any, def: SlideDefinition): void {
    slide.background = { fill: this.colorScheme.primary };

    // Decorative line
    if (this.templateStyle.useShapes) {
      slide.addShape('rect', {
        x: 0, y: 2.5, w: 0.2, h: 1.0,
        fill: { color: this.colorScheme.accent },
        line: { type: 'none' }
      });
    }

    // Section number (large background text)
    const sectionNum = def.content.sectionNumber || (def.content as any).number;
    if (sectionNum) {
      this.addText(slide, String(sectionNum), {
        x: 0.5, y: 2.0, w: 2, h: 1.5,
        fontSize: 120,
        bold: true,
        color: '40FFFFFF',
        fontFace: this.templateStyle.fontFamily
      });
    }

    // Section title - try multiple field names
    const sectionTitle = def.content.sectionTitle || (def.content as any).title || (def as any).title;
    if (sectionTitle) {
      const st = String(sectionTitle);
      const stLen = st.trim().length;
      const sectionFontSize = Math.max(28, stLen > 55 ? 30 : stLen > 40 ? 36 : stLen > 28 ? 42 : 48);
      this.addText(slide, sectionTitle, {
        x: 2.8, y: 2.1, w: 6.5, h: 1.35,
        fontSize: sectionFontSize,
        bold: true,
        color: this.colorScheme.lightText,
        fontFace: this.templateStyle.fontFamily,
        wrap: true,
        valign: 'top'
      });

      // Add icon for section if icons are enabled
      if (this.templateStyle.useIcons) {
        const icon = suggestIcon(sectionTitle);
        this.addIconToSlide(slide, icon, 9.2, 2.4, 0.6, this.colorScheme.accent);
      }
    }

    // Section description/subtitle
    const description = (def.content as any).description || def.content.subtitle;
    if (description) {
      this.addText(slide, description, {
        x: 3.0, y: 3.6, w: 6.3, h: 0.6,
        fontSize: 20,
        color: this.colorScheme.lightText,
        fontFace: this.templateStyle.fontFamily,
        italic: true
      });
    }
  }

  // ===== TITLE + BULLETS =====
  private createTitleBullets(slide: any, def: SlideDefinition): void {
    const title = def.content.title || (def as any).title;
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, title);

    const contentY = this.HEADER_Y + this.HEADER_H + 0.22;
    const contentH = 5.47 - contentY;   // extend to near bottom of slide (slide h = 5.625)

    // Bullets with custom styling (density-aware)
    if (def.content.bullets && def.content.bullets.length > 0) {
      const bulletCount = def.content.bullets.length;
      const totalChars = def.content.bullets.reduce((acc, b) => acc + String(b?.text || '').length, 0);
      const avgChars = totalChars / Math.max(1, bulletCount);
      // Three density levels; totalChars catches long text even with few bullets
      const isVeryDense = bulletCount >= 9 || totalChars > 700 || (bulletCount >= 6 && avgChars >= 90);
      const isDense    = bulletCount >= 6 || avgChars >= 70 || totalChars > 400;
      const baseFont   = this.templateStyle.fontSizes.body;
      const fontSize   = isVeryDense
        ? Math.max(10, baseFont - 6)
        : isDense
          ? Math.max(12, baseFont - 3)
          : baseFont;
      const paraSpace  = isVeryDense ? 0 : isDense ? 3 : 5;

      const bulletsArr = def.content.bullets;
      let bulletText: any[];
      if (this.isRTL) {
        // RTL: LibreOffice collapses paragraph-level bullets; manually prepend char + breakLine
        bulletText = [];
        bulletsArr.forEach((b, idx) => {
          bulletText.push({
            text: `\u2022  ${b.text}`,
            options: { rtlMode: true, fontSize, color: this.colorScheme.text, paraSpaceBefore: paraSpace, paraSpaceAfter: 0 }
          });
          if (idx < bulletsArr.length - 1) {
            bulletText.push({ text: '', options: { breakLine: true } });
          }
        });
      } else {
        bulletText = bulletsArr.map(b => ({
          text: b.text,
          options: {
            bullet: { code: this.getBulletCharacter(), indent: 18, hanging: 6 },
            fontSize,
            color: this.colorScheme.text,
            paraSpaceBefore: paraSpace,
            paraSpaceAfter: paraSpace
          }
        }));
      }

      this.addText(slide, bulletText, {
        x: this.MARGIN_X + 0.15,
        y: contentY,
        w: 9.2 - this.MARGIN_X,
        h: contentH,
        fontFace: this.templateStyle.fontFamily,
        valign: 'top'
      });
    } else {
      // Fallback: split speaker notes into bullet sentences
      const notes = String((def as any).speakerNotes || '').trim();
      const fallbackBullets = notes
        ? notes.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 15).slice(0, 5)
        : [];
      if (fallbackBullets.length > 0) {
        const bulletText = fallbackBullets.map(b => ({
          text: b,
          options: {
            bullet: { code: this.getBulletCharacter(), indent: 18, hanging: 6 },
            fontSize: this.templateStyle.fontSizes.body,
            color: this.colorScheme.text,
            paraSpaceBefore: 5,
            paraSpaceAfter: 5
          }
        }));
        this.addText(slide, bulletText, {
          x: this.MARGIN_X + 0.15,
          y: contentY,
          w: 9.2 - this.MARGIN_X,
          h: contentH,
          fontFace: this.templateStyle.fontFamily,
          valign: 'top'
        });
      }
    }

    // Decorative corner accent (rect, no triangle)
    if (this.templateStyle.useShapes) {
      slide.addShape('rect', {
        x: 9.4, y: 5.44, w: 0.6, h: 0.06,
        fill: { color: this.colorScheme.accent, transparency: 55 },
        line: { type: 'none' }
      });
    }
  }

  // ===== TWO COLUMNS =====
  private createTwoColumns(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    // Check if we have column content
    const leftCol = def.content.leftColumn || (def.content as any).left_column;
    const rightCol = def.content.rightColumn || (def.content as any).right_column;

    if (!leftCol && !rightCol) {
      this.addText(slide, '[No column content provided]', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
      return;
    }

    // Divider line
    if (this.templateStyle.useShapes) {
      slide.addShape('rect', {
        x: 4.95, y: 1.25, w: 0.1, h: 4.2,
        fill: { color: this.colorScheme.accent, transparency: 50 },
        line: { type: 'none' }
      });
    }

    // Left column box
    if (this.templateStyle.useShapes) {
      slide.addShape('roundRect', {
        x: 0.4, y: 1.2, w: 4.4, h: 4.3,
        fill: { color: this.colorScheme.background },
        line: { color: this.colorScheme.accent, width: 1 }
      });
    }

    // Right column box
    if (this.templateStyle.useShapes) {
      slide.addShape('roundRect', {
        x: 5.2, y: 1.2, w: 4.4, h: 4.3,
        fill: { color: this.colorScheme.background },
        line: { color: this.colorScheme.accent, width: 1 }
      });
    }

    // Left column content - support multiple field names
    if (leftCol) {
      const leftHeading = leftCol.heading || leftCol.header || leftCol.title;
      if (leftHeading) {
        this.addText(slide, leftHeading, {
          x: 0.55, y: 1.3, w: 4.15, h: 0.35,
          fontSize: 18,
          bold: true,
          color: this.colorScheme.secondary,
          fontFace: this.templateStyle.fontFamily,
          wrap: true
        });
      }

      // Support bullets, items, or text array
      const leftItems = leftCol.bullets || leftCol.items || leftCol.text;
      if (leftItems) {
        const itemsArray = Array.isArray(leftItems) ? leftItems : [leftItems];
        const colTotalChars = itemsArray.reduce((a: number, b: any) => a + String(b).length, 0);
        const colFontSize = colTotalChars > 500 || itemsArray.length >= 7 ? 12 : colTotalChars > 300 || itemsArray.length >= 5 ? 13 : 15;
        let leftBullets: any[];
        if (this.isRTL) {
          leftBullets = [];
          itemsArray.forEach((b: any, idx: number) => {
            leftBullets.push({ text: `\u2022  ${String(b)}`, options: { rtlMode: true, fontSize: colFontSize } });
            if (idx < itemsArray.length - 1) leftBullets.push({ text: '', options: { breakLine: true } });
          });
        } else {
          leftBullets = itemsArray.map((b: any) => ({
            text: String(b),
            options: { bullet: { code: this.getBulletCharacter(), indent: 16, hanging: 6 }, fontSize: colFontSize }
          }));
        }

        this.addText(slide, leftBullets, {
          x: 0.7, y: 1.75, w: 3.9, h: 3.6,
          fontFace: this.templateStyle.fontFamily,
          color: this.colorScheme.text,
          valign: 'top'
        });
      }
    }

    // Right column content - support multiple field names
    if (rightCol) {
      const rightHeading = rightCol.heading || rightCol.header || rightCol.title;
      if (rightHeading) {
        this.addText(slide, rightHeading, {
          x: 5.3, y: 1.3, w: 4.0, h: 0.35,
          fontSize: 18,
          bold: true,
          color: this.colorScheme.secondary,
          fontFace: this.templateStyle.fontFamily,
          wrap: true
        });
      }

      // Support bullets, items, or text array
      const rightItems = rightCol.bullets || rightCol.items || rightCol.text;
      if (rightItems) {
        const itemsArray = Array.isArray(rightItems) ? rightItems : [rightItems];
        const colTotalChars = itemsArray.reduce((a: number, b: any) => a + String(b).length, 0);
        const colFontSize = colTotalChars > 500 || itemsArray.length >= 7 ? 12 : colTotalChars > 300 || itemsArray.length >= 5 ? 13 : 15;
        let rightBullets: any[];
        if (this.isRTL) {
          rightBullets = [];
          itemsArray.forEach((b: any, idx: number) => {
            rightBullets.push({ text: `\u2022  ${String(b)}`, options: { rtlMode: true, fontSize: colFontSize } });
            if (idx < itemsArray.length - 1) rightBullets.push({ text: '', options: { breakLine: true } });
          });
        } else {
          rightBullets = itemsArray.map((b: any) => ({
            text: String(b),
            options: { bullet: { code: this.getBulletCharacter(), indent: 16, hanging: 6 }, fontSize: colFontSize }
          }));
        }

        this.addText(slide, rightBullets, {
          x: 5.45, y: 1.75, w: 3.9, h: 3.6,
          fontFace: this.templateStyle.fontFamily,
          color: this.colorScheme.text,
          valign: 'top'
        });
      }
    }
  }

  // ===== CARDS =====
  private createCards(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    // If no cards, show a message
    if (!def.content.cards || def.content.cards.length === 0) {
      this.addText(slide, '[No card content provided]', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
      return;
    }

    // Cards
    if (def.content.cards && def.content.cards.length > 0) {
      const cardWidth = (9.5 - (def.content.cards.length - 1) * 0.3) / def.content.cards.length;

      const cardFill = this.isDarkHex(this.colorScheme.background) ? '111827' : 'FFFFFF';
      const cardTextColor = this.pickTextColorForFill(cardFill);

      def.content.cards.forEach((card, index) => {
        const x = 0.5 + index * (cardWidth + 0.3);
        const cardColor = index % 2 === 0 ? this.colorScheme.accent : this.colorScheme.secondary;

        // Different card styles based on template
        switch (this.templateStyle.id) {
          case 'tech':
            // Tech: Circuit board cards
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#1A1A1A', transparency: 65 },
              line: { color: '#00FF00', width: 1, transparency: 60 }
            });
            // Circuit pattern on card
            slide.addShape('line', {
              x: x + 0.1, y: 1.5, w: cardWidth - 0.2, h: 0,
              fill: { color: '#00FF00', transparency: 40 },
              line: { color: '#00FF00', width: 1, transparency: 40 }
            });
            // Tech icon
            slide.addShape('rect', {
              x: x + cardWidth/2 - 0.2, y: 1.6, w: 0.4, h: 0.4,
              fill: { color: '#00FF00', transparency: 45 },
              line: { type: 'none' }
            });
            break;
            
          case 'retro':
            // Retro: Tape card with square reel accents
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#FFF8E7', transparency: 65 },
              line: { color: '#FF6B35', width: 2, transparency: 45 }
            });
            // Square reel accents (replacing ovals)
            slide.addShape('rect', {
              x: x + 0.3, y: 1.62, w: 0.36, h: 0.36,
              fill: { color: '#FF6B35', transparency: 55 },
              line: { color: '#FF6B35', width: 1, transparency: 40 }
            });
            slide.addShape('rect', {
              x: x + cardWidth - 0.66, y: 1.62, w: 0.36, h: 0.36,
              fill: { color: '#FF6B35', transparency: 55 },
              line: { color: '#FF6B35', width: 1, transparency: 40 }
            });
            break;

          case 'luxury':
            // Luxury: Gold frame cards with square corner accents
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#FFF8DC', transparency: 65 },
              line: { color: '#D4AF37', width: 2, transparency: 40 }
            });
            // Square corner accents (replacing triangles)
            [[x + 0.05, 1.35], [x + cardWidth - 0.2, 1.35],
             [x + cardWidth - 0.2, 5.05], [x + 0.05, 5.05]].forEach(([cx, cy]) => {
              slide.addShape('rect', {
                x: cx, y: cy, w: 0.15, h: 0.15,
                fill: { color: '#D4AF37', transparency: 50 },
                line: { type: 'none' }
              });
            });
            break;

          case 'industrial':
            // Industrial: Metal plate cards with square corner marks
            slide.addShape('rect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#4A5568', transparency: 55 },
              line: { color: '#718096', width: 1, transparency: 45 }
            });
            // Square corner marks (replacing ovals)
            [[x + 0.08, 1.38], [x + cardWidth - 0.18, 1.38],
             [x + cardWidth - 0.18, 4.98], [x + 0.08, 4.98]].forEach(([bx, by]) => {
              slide.addShape('rect', {
                x: bx, y: by, w: 0.1, h: 0.1,
                fill: { color: '#718096' },
                line: { color: '#1F2937', width: 1 }
              });
            });
            break;

          case 'festival':
            // Festival: Bold color stripe cards (no confetti ovals)
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: cardFill },
              line: { type: 'none' }
            });
            // Layered color top bar
            slide.addShape('rect', {
              x, y: 1.3, w: cardWidth, h: 0.12,
              fill: { color: '#FF6B6B', transparency: 35 },
              line: { type: 'none' }
            });
            slide.addShape('rect', {
              x, y: 1.42, w: cardWidth, h: 0.06,
              fill: { color: '#4ECDC4', transparency: 45 },
              line: { type: 'none' }
            });
            break;
            
          case 'academic':
            // Academic: Notebook paper cards
            slide.addShape('rect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#F8F8F8', transparency: 65 },
              line: { color: '#E0E0E0', width: 1, transparency: 50 }
            });
            // Horizontal lines
            for (let i = 1; i <= 3; i++) {
              slide.addShape('line', {
                x: x + 0.1, y: 1.3 + i * 0.9, w: cardWidth - 0.2, h: 0,
                fill: { color: '#E0E0E0', transparency: 30 },
                line: { color: '#E0E0E0', width: 1, transparency: 30 }
              });
            }
            break;
            
          case 'startup':
            // Startup: Bold accent-top cards (no star)
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: cardFill },
              line: { color: '#FF6B6B', width: 2, transparency: 60 }
            });
            // Bold top accent bar (replacing star)
            slide.addShape('rect', {
              x, y: 1.3, w: cardWidth, h: 0.15,
              fill: { color: '#FF6B6B', transparency: 35 },
              line: { type: 'none' }
            });
            break;
            
          case 'medical':
            // Medical: Cross border cards
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#E8F4FD', transparency: 65 },
              line: { color: '#3B82F6', width: 1, transparency: 40 }
            });
            // Medical cross
            slide.addShape('rect', {
              x: x + cardWidth/2 - 0.15, y: 1.55, w: 0.3, h: 0.08,
              fill: { color: '#3B82F6', transparency: 40 },
              line: { type: 'none' }
            });
            slide.addShape('rect', {
              x: x + cardWidth/2 - 0.04, y: 1.48, w: 0.08, h: 0.22,
              fill: { color: '#3B82F6', transparency: 40 },
              line: { type: 'none' }
            });
            break;
            
          case 'nature':
            // Nature: Green border cards with tick accents (no ellipses)
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#F0FFF4', transparency: 65 },
              line: { color: '#22C55E', width: 1, transparency: 60 }
            });
            // Green top accent bar
            slide.addShape('rect', {
              x, y: 1.3, w: cardWidth, h: 0.1,
              fill: { color: '#22C55E', transparency: 45 },
              line: { type: 'none' }
            });
            break;

          case 'elegant':
            // Elegant: Gold frame cards with square corner accents (no curves)
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: '#FFF8DC', transparency: 65 },
              line: { color: '#D4AF37', width: 1, transparency: 40 }
            });
            // Square corner accents (replacing curves)
            [[x + 0.08, 1.38], [x + cardWidth - 0.18, 1.38],
             [x + cardWidth - 0.18, 4.98], [x + 0.08, 4.98]].forEach(([dx, dy]) => {
              slide.addShape('rect', {
                x: dx, y: dy, w: 0.1, h: 0.1,
                fill: { color: '#D4AF37', transparency: 20 },
                line: { type: 'none' }
              });
            });
            break;
            
          default:
            // Default: Standard cards with shadow
            slide.addShape('roundRect', {
              x, y: 1.3, w: cardWidth, h: 3.8,
              fill: { color: cardFill },
              line: { type: 'none' },
              shadow: {
                type: 'outer',
                angle: 45,
                blur: 8,
                color: '000000',
                opacity: 0.2,
                offset: 4
              }
            });

            // Top accent bar
            slide.addShape('rect', {
              x, y: 1.3, w: cardWidth, h: 0.15,
              fill: { color: cardColor },
              line: { type: 'none' }
            });

            // Icon placeholder (rounded square with number)
            if (this.templateStyle.useIcons) {
              slide.addShape('roundRect', {
                x: x + cardWidth / 2 - 0.25,
                y: 1.65,
                w: 0.5,
                h: 0.5,
                fill: { color: cardColor },
                line: { type: 'none' }
              });

              this.addText(slide, (index + 1).toString(), {
                x: x + cardWidth / 2 - 0.25,
                y: 1.65,
                w: 0.5,
                h: 0.5,
                fontSize: 20,
                bold: true,
                color: 'FFFFFF',
                align: 'center',
                valign: 'middle',
                fontFace: this.templateStyle.fontFamily
              });
            }
        }

        // Card title (position adjusted for different styles)
        const titleY = this.templateStyle.id === 'retro' ? 2.2 : 2.35;
        this.addText(slide, card.title, {
          x: x + 0.1, y: titleY, w: cardWidth - 0.2, h: 0.45,
          fontSize: 16,
          bold: true,
          color: cardTextColor,
          align: 'center',
          fontFace: this.templateStyle.fontFamily,
          wrap: true
        });

        // Card body
        this.addText(slide, card.body, {
          x: x + 0.1, y: 2.9, w: cardWidth - 0.2, h: 2.0,
          fontSize: 13,
          color: cardTextColor,
          align: 'center',
          valign: 'top',
          fontFace: this.templateStyle.fontFamily,
          wrap: true
        });
      });
    }
  }

  // ===== CONCLUSION =====
  private createConclusion(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);

    // Accent box
    if (this.templateStyle.useShapes) {
      slide.addShape('roundRect', {
        x: 0.3, y: 0.3, w: 9.4, h: 5.1,
        fill: { color: this.colorScheme.accent, transparency: 55 },
        line: { color: this.colorScheme.primary, width: 3 }
      });
    }

    // Title
    if (def.content.title) {
      this.addText(slide, def.content.title, {
        x: 0.5, y: 0.5, w: 8.9, h: 0.8,
        fontSize: this.templateStyle.fontSizes.heading,
        bold: true,
        color: this.pickTextColorForFill(this.colorScheme.background),
        fontFace: this.templateStyle.fontFamily
      });
    }

    // Key takeaways with smart icons - support multiple field names
    const takeawaysData = def.content.keyTakeaways || (def.content as any).points;
    if (takeawaysData && takeawaysData.length > 0) {
      const takeawayCount = takeawaysData.length;
      const avgLen = takeawaysData.reduce((acc: number, t: any) => acc + String(t || '').length, 0) / Math.max(1, takeawayCount);
      const isDense = takeawayCount >= 5 || avgLen >= 90;
      const fontSize = Math.max(16, Math.min(22, isDense ? 18 : 20));
      const paraSpace = isDense ? 4 : 6;

      let takeaways: any[];
      if (this.isRTL) {
        takeaways = [];
        takeawaysData.forEach((t: any, idx: number) => {
          takeaways.push({ text: `\u2022  ${t}`, options: { rtlMode: true, fontSize, color: this.colorScheme.text, paraSpaceBefore: paraSpace, paraSpaceAfter: 0 } });
          if (idx < takeawaysData.length - 1) takeaways.push({ text: '', options: { breakLine: true } });
        });
      } else {
        takeaways = takeawaysData.map((t: any) => ({
          text: t,
          options: { bullet: { code: this.getBulletCharacter(), indent: 18, hanging: 6 }, fontSize, color: this.colorScheme.text, paraSpaceBefore: paraSpace, paraSpaceAfter: paraSpace }
        }));
      }

      this.addText(slide, takeaways, {
        x: 0.75, y: 1.35, w: 8.5, h: 4.25,
        fontFace: this.templateStyle.fontFamily,
        valign: 'top'
      });
    } else {
      // Show fallback message if no key takeaways
      this.addText(slide, '[No key takeaways provided]', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
    }
  }

  // ===== THANK YOU =====
  private createThankYou(slide: any, def: SlideDefinition): void {
    const tid = this.templateStyle.id;

    // ── Per-template background (mirrors title slide style) ───
    switch (tid) {
      case 'modern':
        slide.background = { fill: this.colorScheme.primary };
        slide.addShape('rect', { x: 0, y: 0, w: 3.1, h: 5.625, fill: { color: this.colorScheme.accent, transparency: 80 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 0, w: 0.08, h: 5.625, fill: { color: this.colorScheme.accent }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.06, fill: { color: this.colorScheme.accent, transparency: 25 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 5.555, w: 10, h: 0.07, fill: { color: this.colorScheme.accent, transparency: 30 }, line: { type: 'none' } });
        // Horizontal accent rule across the text area
        slide.addShape('rect', { x: 3.3, y: 3.1, w: 6.4, h: 0.04, fill: { color: this.colorScheme.accent, transparency: 28 }, line: { type: 'none' } });
        break;

      case 'corporate':
        slide.background = { fill: this.colorScheme.primary };
        slide.addShape('rect', { x: 0, y: 0, w: 0.5, h: 5.625, fill: { color: this.colorScheme.accent }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.06, fill: { color: this.colorScheme.accent, transparency: 30 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 4.4, w: 10, h: 1.225, fill: { color: this.colorScheme.secondary, transparency: 62 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0.8, y: 4.4, w: 8.7, h: 0.04, fill: { color: this.colorScheme.accent, transparency: 20 }, line: { type: 'none' } });
        break;

      case 'creative':
        slide.background = { fill: '#1a1a2e' };
        slide.addShape('rect', { x: 0, y: 0, w: 10, h: 1.1, fill: { color: '#FF6B6B', transparency: 50 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 7.6, y: 0, w: 2.4, h: 5.625, fill: { color: '#4ECDC4', transparency: 62 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 5.325, w: 10, h: 0.3, fill: { color: '#45B7D1', transparency: 45 }, line: { type: 'none' } });
        // Center accent rule
        slide.addShape('rect', { x: 0.5, y: 3.1, w: 6.8, h: 0.04, fill: { color: '#FF6B6B', transparency: 25 }, line: { type: 'none' } });
        break;

      case 'tech':
        slide.background = { fill: '#0d1117' };
        for (let i = 1; i < 10; i++) slide.addShape('line', { x: i, y: 0, w: 0, h: 5.625, line: { color: '#21262d', width: 1 } });
        for (let i = 1; i < 6; i++) slide.addShape('line', { x: 0, y: i, w: 10, h: 0, line: { color: '#21262d', width: 1 } });
        slide.addShape('rect', { x: 0, y: 0, w: 0.12, h: 5.625, fill: { color: '#58a6ff' }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.06, fill: { color: '#58a6ff', transparency: 20 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 5.555, w: 10, h: 0.07, fill: { color: '#58a6ff', transparency: 25 }, line: { type: 'none' } });
        // Bold center accent rule
        slide.addShape('rect', { x: 0.35, y: 3.1, w: 9.3, h: 0.04, fill: { color: '#58a6ff', transparency: 28 }, line: { type: 'none' } });
        break;

      case 'elegant':
        slide.background = { fill: '#12111a' };
        slide.addShape('rect', { x: 0.25, y: 0.25, w: 9.5, h: 5.125, fill: { color: 'transparent' }, line: { color: '#D4AF37', width: 2 } });
        slide.addShape('rect', { x: 0.48, y: 0.48, w: 9.04, h: 4.665, fill: { color: 'transparent' }, line: { color: '#D4AF37', width: 1, transparency: 35 } });
        // Gold center rule between main text and contact info
        slide.addShape('rect', { x: 2.5, y: 3.1, w: 5.0, h: 0.03, fill: { color: '#D4AF37', transparency: 25 }, line: { type: 'none' } });
        // Short top accent above the message
        slide.addShape('rect', { x: 4.0, y: 1.5, w: 2.0, h: 0.04, fill: { color: '#D4AF37', transparency: 30 }, line: { type: 'none' } });
        break;

      case 'gradient':
        slide.background = { fill: this.colorScheme.primary };
        slide.addShape('rect', { x: 0, y: 0, w: 4.8, h: 5.625, fill: { color: this.colorScheme.accent, transparency: 76 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 4.3, y: 0, w: 5.7, h: 5.625, fill: { color: this.colorScheme.secondary, transparency: 80 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.06, fill: { color: this.colorScheme.accent, transparency: 25 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 5.555, w: 10, h: 0.07, fill: { color: this.colorScheme.accent, transparency: 30 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0.7, y: 3.1, w: 8.6, h: 0.035, fill: { color: this.colorScheme.accent, transparency: 28 }, line: { type: 'none' } });
        break;

      default:
        slide.background = { fill: this.colorScheme.primary };
        slide.addShape('rect', { x: 0, y: 0, w: 0.1, h: 5.625, fill: { color: this.colorScheme.accent }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 0, w: 10, h: 0.06, fill: { color: this.colorScheme.accent, transparency: 25 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0, y: 5.555, w: 10, h: 0.07, fill: { color: this.colorScheme.accent, transparency: 40 }, line: { type: 'none' } });
        slide.addShape('rect', { x: 0.65, y: 3.1, w: 8.7, h: 0.03, fill: { color: this.colorScheme.accent, transparency: 35 }, line: { type: 'none' } });
    }

    // ── Layout config (same logic as title slide) ──────────────
    const isModern   = tid === 'modern';
    const isTech     = tid === 'tech';
    const textAlign  = (isModern || isTech) ? 'left' : 'center';
    const cx = isModern ? 3.3 : 0.65;
    const cw = isModern ? 6.05 : 8.7;   // 3.3+6.05=9.35 | 0.65+8.7=9.35

    // ── Main "Thank You" message ───────────────────────────────
    const thankYouText = def.content.thankYouText || def.content.title || (def as any).title || 'Thank You';
    this.addText(slide, thankYouText, {
      x: cx, y: 1.6, w: cw, h: 1.3,
      fontSize: this.templateStyle.fontSizes.title,
      bold: true,
      color: this.colorScheme.lightText,
      align: textAlign,
      valign: 'middle',
      wrap: true,
      fontFace: this.templateStyle.fontFamily
    });

    // ── Sub-message / closing line ─────────────────────────────
    const subText = def.content.subtitle || (def.content as any).description;
    if (subText) {
      this.addText(slide, String(subText), {
        x: cx, y: 2.98, w: cw, h: 0.55,
        fontSize: 18,
        color: this.colorScheme.lightText,
        align: textAlign,
        valign: 'middle',
        wrap: true,
        fontFace: this.templateStyle.fontFamily
      });
    }

    // ── Contact info ───────────────────────────────────────────
    const contactInfo = def.content.contactInfo || (def.content as any).contact;
    if (contactInfo) {
      this.addText(slide, String(contactInfo), {
        x: cx, y: 3.28, w: cw, h: 0.45,
        fontSize: 15,
        color: this.colorScheme.lightText,
        align: textAlign,
        valign: 'middle',
        wrap: true,
        fontFace: this.templateStyle.fontFamily
      });
    }

    // ── Author / presenter ─────────────────────────────────────
    const authorStr = (def.content as any).author;
    if (authorStr) {
      this.addText(slide, String(authorStr), {
        x: cx, y: 3.78, w: cw, h: 0.38,
        fontSize: 14,
        color: this.colorScheme.lightText,
        align: textAlign,
        valign: 'middle',
        fontFace: this.templateStyle.fontFamily
      });
    }
  }

  // ===== CHART SLIDE =====
  private createChartSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);

    if (this.templateStyle.useShapes) {
      slide.addShape('roundRect', {
        x: 0.35, y: 1.25, w: 9.3, h: 4.25,
        fill: { color: this.colorScheme.accent, transparency: 60 },
        line: { color: this.colorScheme.accent, transparency: 40, width: 1 }
      });
    }

    this.addModernHeader(slide, def.content.title);

    if (def.content.chart) {
      this.addChart(slide, this.pptxgen, def.content.chart);
    } else {
      // Show fallback message if no chart data
      this.addText(slide, '[No chart data provided]', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
    }
  }

  // ===== TABLE SLIDE =====
  private createTableSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    const caption = def.content.table?.caption || '';

    // Layout constants
    const descY = this.HEADER_Y + this.HEADER_H + 0.18;  // just below header
    const captionH = 0.42;
    const tableY = descY + (caption ? captionH + 0.08 : 0.05);
    const tableH = Math.min(3.45, 5.45 - tableY);        // leave bottom margin

    // Description above the table
    if (caption) {
      this.addText(slide, caption, {
        x: this.MARGIN_X,
        y: descY,
        w: 10 - this.MARGIN_X * 2,
        h: captionH,
        fontSize: 14,
        italic: true,
        color: this.colorScheme.secondary,
        fontFace: this.templateStyle.fontFamily,
        align: 'left',
        valign: 'middle',
        wrap: true
      });
    }

    if (def.content.table) {
      const tableData = [
        def.content.table.headers.map(h => ({
          text: h,
          options: {
            bold: true,
            fill: { color: this.colorScheme.primary },
            color: this.colorScheme.lightText
          }
        })),
        ...def.content.table.rows.map(row =>
          row.map((cell, idx) => ({
            text: cell,
            options: {
              fill: { color: idx % 2 === 0 ? 'F8FAFC' : 'FFFFFF' }
            }
          }))
        )
      ];

      slide.addTable(tableData, {
        x: 0.6, y: tableY, w: 8.8, h: tableH,
        fontSize: 13,
        border: { pt: 1, color: this.colorScheme.accent },
        fontFace: this.templateStyle.fontFamily
      });
    } else {
      this.addText(slide, '[No table data provided]', {
        x: 0.6, y: tableY, w: 8.8, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
    }
  }

  // ===== HELPER METHODS =====
  private getBulletCharacter(): string {
    if (this.isRTL) return '2022'; // always circle for RTL — checkmark/arrow look wrong in RTL
    const bulletMap: Record<string, string> = {
      'circle': '2022',
      'square': '25A0',
      'arrow': '27A4',
      'checkmark': '2713'
    };
    return bulletMap[this.templateStyle.bulletStyle] || '2022';
  }

  private getBulletIcon(text: string): string {
    // If icons are enabled, suggest a smart icon based on bullet text
    if (this.templateStyle.useIcons) {
      const icon = suggestIcon(text);
      // Convert emoji to Unicode code point for pptxgenjs (requires 4-digit hex)
      const codePoint = icon.codePointAt(0);
      if (codePoint) {
        const hexCode = codePoint.toString(16).toUpperCase();
        // pptxgenjs requires exactly 4 digits, if longer fall back to default
        if (hexCode.length === 4 || hexCode.length < 4) {
          return hexCode.padStart(4, '0');
        }
      }
    }
    return this.getBulletCharacter();
  }

  private addIconToSlide(slide: any, icon: string, x: number, y: number, size: number = 0.4, color?: string): void {
    if (!this.templateStyle.useIcons) return;

    this.addText(slide, icon, {
      x, y,
      w: size, h: size,
      fontSize: Math.floor(size * 72), // Convert inches to points
      color: color || this.colorScheme.accent,
      align: 'center',
      valign: 'middle',
      fontFace: 'Segoe UI Emoji' // Font that supports emojis
    });
  }

  private addChart(slide: any, pptx: any, chart: ChartContent): void {
    // charts property is on the pptx instance, not the constructor
    const chartTypeMap: Record<string, any> = {
      'bar': pptx.charts.BAR,
      'line': pptx.charts.LINE,
      'pie': pptx.charts.PIE,
      'doughnut': pptx.charts.DOUGHNUT
    };

    const chartType = chartTypeMap[chart.type] || pptx.charts.BAR;

    const chartData = chart.data.datasets.map(ds => ({
      name: ds.name,
      labels: chart.data.labels,
      values: ds.values
    }));

    // Use color scheme colors for chart
    const chartColors = [
      this.colorScheme.primary,
      this.colorScheme.secondary,
      this.colorScheme.accent,
      '10B981',
      'F59E0B'
    ];

    slide.addChart(chartType, chartData, {
      x: 1.0, y: 1.5, w: 8.0, h: 4.0,
      showTitle: !!chart.title,
      title: chart.title,
      showLegend: true,
      legendPos: 'b',
      chartColors: chartColors
    });
  }

  // ===== IMAGE + TEXT =====
  private createImageTextSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    const image = def.content.image;
    const caption = image?.alt || '';

    // Layout constants — description height scales with text length
    const descY = this.HEADER_Y + this.HEADER_H + 0.18;
    const captionH = caption.length > 120 ? Math.min(1.4, 0.42 + Math.ceil(caption.length / 120) * 0.32) : 0.42;
    const imgY = descY + (caption ? captionH + 0.08 : 0.05);
    const imgW = 7.5;
    const imgX = (10 - imgW) / 2;
    const imgH = Math.max(1.2, Math.min(3.45, 5.45 - imgY));  // never collapse below 1.2in

    // Description above the image — auto-shrinks if text overflows the box
    if (caption) {
      const isRtl = /[؀-ۿݐ-ݿ]/.test(caption);
      // Use Arial for Arabic/RTL text — it has full Arabic glyph support in
      // LibreOffice (used for PDF/image export), unlike many template fonts.
      const fontFace = isRtl ? 'Arial' : this.templateStyle.fontFamily;
      this.addText(slide, caption, {
        x: this.MARGIN_X,
        y: descY,
        w: 10 - this.MARGIN_X * 2,
        h: captionH,
        fontSize: 14,
        italic: !isRtl,
        color: this.colorScheme.secondary,
        fontFace,
        align: isRtl ? 'right' : 'left',
        rtlMode: isRtl,
        valign: 'top',
        wrap: true,
        shrinkText: true
      });
    }

    // Image — centered
    let addedImage = false;
    if (image?.path) {
      try {
        const isDataUrl = image.path.startsWith('data:');
        slide.addImage({
          ...(isDataUrl ? { data: image.path } : { path: image.path }),
          x: imgX, y: imgY, w: imgW, h: imgH
        });
        addedImage = true;
      } catch {
        addedImage = false;
      }
    }

    if (!addedImage) {
      if (this.templateStyle.useIcons) {
        const icon = image?.alt ? suggestIcon(image.alt) : '🖼️';
        this.addIconToSlide(slide, icon, 4.75, imgY + imgH / 2 - 0.25, 0.5, this.colorScheme.secondary);
      }
      this.addText(slide, caption || 'Illustration', {
        x: imgX, y: imgY + imgH / 2 - 0.3, w: imgW, h: 0.6,
        fontSize: 16,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily,
        italic: true,
        wrap: true
      });
    }
  }

  // ===== QUOTE SLIDE =====
  private createQuoteSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);

    const quote = (def.content as any).quote;
    const quoteText = quote?.text || def.content.bodyText;
    const attribution = quote?.attribution || def.content.subtitle;

    if (this.templateStyle.useShapes) {
      slide.addShape('roundRect', {
        x: 0.7, y: 1.25, w: 8.6, h: 3.7,
        fill: { color: this.colorScheme.accent, transparency: 60 },
        line: { color: this.colorScheme.accent, transparency: 40, width: 1 }
      });
      slide.addShape('rect', {
        x: 0.7, y: 1.25, w: 0.12, h: 3.7,
        fill: { color: this.colorScheme.primary },
        line: { type: 'none' }
      });
    }

    this.addModernHeader(slide, def.content.title);

    if (quoteText) {
      const words = String(quoteText).trim().split(/\s+/).filter(Boolean);
      const isDense = words.length > 40;
      const quotePanelFill = this.colorScheme.accent;
      const quoteTextColor = this.pickTextColorForFill(quotePanelFill);
      this.addText(slide, `“${quoteText}”`, {
        x: 1.0, y: 1.55, w: 7.9, h: 2.7,
        fontSize: isDense ? 22 : 26,
        italic: true,
        color: quoteTextColor,
        fontFace: this.templateStyle.fontFamily,
        wrap: true,
        valign: 'top'
      });
    } else {
      this.addText(slide, '[No quote text provided]', {
        x: 1.0, y: 2.6, w: 7.9, h: 0.8,
        fontSize: 18,
        italic: true,
        color: this.pickTextColorForFill(this.colorScheme.accent),
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
    }

    if (attribution) {
      const quotePanelFill = this.colorScheme.accent;
      const quoteTextColor = this.pickTextColorForFill(quotePanelFill);
      this.addText(slide, `— ${attribution}`, {
        x: 1.0, y: 4.35, w: 7.9, h: 0.5,
        fontSize: 16,
        color: quoteTextColor,
        fontFace: this.templateStyle.fontFamily,
        align: 'right',
        wrap: true
      });
    }
  }

  // ===== TIMELINE SLIDE =====
  private createTimelineSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    const items = (def.content as any).timeline || (def.content as any).items || [];

    if (!items || items.length === 0) {
      this.addText(slide, '[No timeline items provided]', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
      return;
    }

    const timelineY = 1.5;
    const timelineH = 3.8;
    const itemCount = Math.min(items.length, 6);
    const itemWidth = 8.5 / itemCount;
    const circleSize = 0.3;

    // Draw timeline line
    slide.addShape('rect', {
      x: 0.75, y: timelineY + timelineH / 2 - 0.02, w: 8.5, h: 0.04,
      fill: { color: this.colorScheme.accent },
      line: { type: 'none' }
    });

    items.slice(0, itemCount).forEach((item: any, index: number) => {
      const x = 0.75 + index * itemWidth + itemWidth / 2 - circleSize / 2;
      const centerX = x + circleSize / 2;

      // Timeline node (rounded square)
      slide.addShape('roundRect', {
        x, y: timelineY + timelineH / 2 - circleSize / 2, w: circleSize, h: circleSize,
        fill: { color: index % 2 === 0 ? this.colorScheme.primary : this.colorScheme.secondary },
        line: { type: 'none' }
      });

      // Node number
      this.addText(slide, (index + 1).toString(), {
        x, y: timelineY + timelineH / 2 - circleSize / 2, w: circleSize, h: circleSize,
        fontSize: 12,
        bold: true,
        color: this.colorScheme.lightText,
        align: 'center',
        valign: 'middle',
        fontFace: this.templateStyle.fontFamily
      });

      // Item label (alternating above/below)
      const isAbove = index % 2 === 0;
      const labelY = isAbove ? timelineY + 0.2 : timelineY + timelineH / 2 + 0.5;

      const itemTitle = typeof item === 'string' ? item : (item.title || item.label || item.text || '');
      const itemDescription = typeof item === 'object' ? (item.description || '') : '';

      this.addText(slide, itemTitle, {
        x: centerX - itemWidth / 2, y: labelY, w: itemWidth - 0.1, h: 0.4,
        fontSize: 12,
        bold: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily,
        wrap: true
      });

      if (itemDescription) {
        this.addText(slide, itemDescription, {
          x: centerX - itemWidth / 2, y: labelY + 0.4, w: itemWidth - 0.1, h: 0.8,
          fontSize: 10,
          color: this.colorScheme.text,
          align: 'center',
          fontFace: this.templateStyle.fontFamily,
          wrap: true
        });
      }
    });
  }

  // ===== STATISTICS SLIDE =====
  private createStatisticsSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    const stats = (def.content as any).statistics || (def.content as any).stats || (def.content as any).numbers || [];

    if (!stats || stats.length === 0) {
      this.addText(slide, '[No statistics provided]', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
      return;
    }

    const statCount = Math.min(stats.length, 4);
    const statWidth = 8.5 / statCount;
    const startX = 0.75;

    stats.slice(0, statCount).forEach((stat: any, index: number) => {
      const x = startX + index * statWidth;
      const value = typeof stat === 'object' ? (stat.value || stat.number || '0') : stat;
      const label = typeof stat === 'object' ? (stat.label || stat.title || '') : '';
      const suffix = typeof stat === 'object' ? (stat.suffix || '') : '';

      // Stat box
      if (this.templateStyle.useShapes) {
        slide.addShape('roundRect', {
          x: x + 0.1, y: 1.5, w: statWidth - 0.2, h: 3.6,
          fill: { color: this.colorScheme.background },
          line: { color: this.colorScheme.accent, width: 1 },
          shadow: {
            type: 'outer',
            angle: 45,
            blur: 8,
            color: '000000',
            opacity: 0.15,
            offset: 3
          }
        });
      }

      // Big number
      this.addText(slide, `${value}${suffix}`, {
        x: x + 0.1, y: 1.8, w: statWidth - 0.2, h: 1.5,
        fontSize: 48,
        bold: true,
        color: index % 2 === 0 ? this.colorScheme.primary : this.colorScheme.secondary,
        align: 'center',
        valign: 'middle',
        fontFace: this.templateStyle.fontFamily
      });

      // Label
      if (label) {
        this.addText(slide, label, {
          x: x + 0.1, y: 3.5, w: statWidth - 0.2, h: 1.2,
          fontSize: 14,
          color: this.colorScheme.text,
          align: 'center',
          valign: 'top',
          fontFace: this.templateStyle.fontFamily,
          wrap: true
        });
      }
    });
  }

  // ===== COMPARISON SLIDE =====
  private createComparisonSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    const left = (def.content as any).left || (def.content as any).option1 || (def.content as any).before || {};
    const right = (def.content as any).right || (def.content as any).option2 || (def.content as any).after || {};
    const comparisonType = (def.content as any).type || 'vs';

    const leftTitle = left.title || left.label || 'Option A';
    const rightTitle = right.title || right.label || 'Option B';
    const leftItems = left.items || left.bullets || left.points || [];
    const rightItems = right.items || right.bullets || right.points || [];

    // Left panel
    if (this.templateStyle.useShapes) {
      slide.addShape('roundRect', {
        x: 0.5, y: 1.4, w: 4.2, h: 3.8,
        fill: { color: this.colorScheme.primary, transparency: 60 },
        line: { color: this.colorScheme.primary, width: 1, transparency: 50 }
      });
    }

    this.addText(slide, leftTitle, {
      x: 0.5, y: 1.5, w: 4.2, h: 0.5,
      fontSize: 18,
      bold: true,
      color: this.colorScheme.primary,
      align: 'center',
      fontFace: this.templateStyle.fontFamily
    });

    if (leftItems.length > 0) {
      const leftBullets = leftItems.map((item: any) => ({
        text: typeof item === 'string' ? item : (item.text || String(item)),
        options: { bullet: { code: this.getBulletCharacter(), indent: 14 }, fontSize: 13, ...(this.isRTL ? { rtlMode: true } : {}) }
      }));
      this.addText(slide, leftBullets, {
        x: 0.7, y: 2.1, w: 3.8, h: 2.9,
        fontFace: this.templateStyle.fontFamily,
        color: this.colorScheme.text,
        valign: 'top'
      });
    }

    // VS indicator in center (rounded square)
    slide.addShape('roundRect', {
      x: 4.5, y: 2.8, w: 1.0, h: 1.0,
      fill: { color: this.colorScheme.accent },
      line: { type: 'none' }
    });
    this.addText(slide, comparisonType.toUpperCase(), {
      x: 4.5, y: 2.8, w: 1.0, h: 1.0,
      fontSize: 16,
      bold: true,
      color: this.colorScheme.lightText,
      align: 'center',
      valign: 'middle',
      fontFace: this.templateStyle.fontFamily
    });

    // Right panel
    if (this.templateStyle.useShapes) {
      slide.addShape('roundRect', {
        x: 5.3, y: 1.4, w: 4.2, h: 3.8,
        fill: { color: this.colorScheme.secondary, transparency: 60 },
        line: { color: this.colorScheme.secondary, width: 1, transparency: 50 }
      });
    }

    this.addText(slide, rightTitle, {
      x: 5.3, y: 1.5, w: 4.2, h: 0.5,
      fontSize: 18,
      bold: true,
      color: this.colorScheme.secondary,
      align: 'center',
      fontFace: this.templateStyle.fontFamily
    });

    if (rightItems.length > 0) {
      const rightBullets = rightItems.map((item: any) => ({
        text: typeof item === 'string' ? item : (item.text || String(item)),
        options: { bullet: { code: this.getBulletCharacter(), indent: 14 }, fontSize: 13, ...(this.isRTL ? { rtlMode: true } : {}) }
      }));
      this.addText(slide, rightBullets, {
        x: 5.5, y: 2.1, w: 3.8, h: 2.9,
        fontFace: this.templateStyle.fontFamily,
        color: this.colorScheme.text,
        valign: 'top'
      });
    }
  }

  // ===== ICON GRID SLIDE =====
  private createIconGridSlide(slide: any, def: SlideDefinition): void {
    this.applyBaseBackground(slide);
    this.addModernHeader(slide, def.content.title);

    const features = (def.content as any).features || (def.content as any).items || (def.content as any).icons || [];

    if (!features || features.length === 0) {
      this.addText(slide, '[No features provided]', {
        x: 0.5, y: 2.5, w: 9, h: 1,
        fontSize: 18,
        italic: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily
      });
      return;
    }

    const featureCount = Math.min(features.length, 6);
    const cols = featureCount <= 3 ? featureCount : Math.ceil(featureCount / 2);
    const rows = featureCount <= 3 ? 1 : 2;
    const cellWidth = 8.5 / cols;
    const cellHeight = rows === 1 ? 3.5 : 1.75;
    const startY = 1.5;
    const iconSize = rows === 1 ? 0.8 : 0.5;

    features.slice(0, featureCount).forEach((feature: any, index: number) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = 0.75 + col * cellWidth;
      const y = startY + row * cellHeight;

      const title = typeof feature === 'string' ? feature : (feature.title || feature.label || '');
      const description = typeof feature === 'object' ? (feature.description || feature.text || '') : '';
      const iconText = typeof feature === 'object' && feature.icon ? feature.icon : suggestIcon(title);

      // Icon badge (rounded square)
      if (this.templateStyle.useIcons) {
        slide.addShape('roundRect', {
          x: x + cellWidth / 2 - iconSize / 2, y: y, w: iconSize, h: iconSize,
          fill: { color: index % 2 === 0 ? this.colorScheme.primary : this.colorScheme.secondary },
          line: { type: 'none' }
        });

        // Icon
        this.addText(slide, iconText, {
          x: x + cellWidth / 2 - iconSize / 2, y: y, w: iconSize, h: iconSize,
          fontSize: Math.floor(iconSize * 36),
          color: this.colorScheme.lightText,
          align: 'center',
          valign: 'middle',
          fontFace: 'Segoe UI Emoji'
        });
      }

      // Title
      this.addText(slide, title, {
        x: x, y: y + iconSize + 0.1, w: cellWidth - 0.1, h: 0.4,
        fontSize: 14,
        bold: true,
        color: this.colorScheme.text,
        align: 'center',
        fontFace: this.templateStyle.fontFamily,
        wrap: true
      });

      // Description
      if (description) {
        this.addText(slide, description, {
          x: x, y: y + iconSize + 0.5, w: cellWidth - 0.1, h: cellHeight - iconSize - 0.7,
          fontSize: 11,
          color: this.colorScheme.text,
          align: 'center',
          fontFace: this.templateStyle.fontFamily,
          wrap: true
        });
      }
    });
  }
}

export function createEnhancedPPTXGenerator(outputDir: string, config?: GeneratorConfig): EnhancedPPTXGenerator {
  return new EnhancedPPTXGenerator(outputDir, config);
}
