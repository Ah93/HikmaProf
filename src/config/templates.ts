// Template configurations for different presentation styles

import { TemplateImageStyle } from '../schemas/image-types';

/**
 * Header style options
 */
export type HeaderStyleType = 'underline' | 'pill' | 'box' | 'gradient' | 'minimal';

/**
 * Shadow style options
 */
export type ShadowStyleType = 'none' | 'soft' | 'hard' | 'elevated' | 'glow';

/**
 * Background pattern options
 */
export type BackgroundPatternType = 'dots' | 'lines' | 'grid' | 'waves' | 'none';

/**
 * Decorative element configuration
 */
export interface DecorativeConfig {
  cornerDecoration: 'geometric' | 'circles' | 'flourishes' | 'squares' | 'dots' | 'none';
  dividerStyle: 'solid' | 'dashed' | 'dots' | 'gradient' | 'none';
  useAccentShapes: boolean;
}

export interface TemplateStyle {
  id: string;
  name: string;
  description: string;
  fontFamily: string;
  fontSizes: {
    title: number;
    heading: number;
    body: number;
    small: number;
  };
  useShapes: boolean;
  useIcons: boolean;
  bulletStyle: 'circle' | 'square' | 'arrow' | 'checkmark';
  layoutStyle: 'modern' | 'corporate' | 'creative' | 'minimal';
  // Enhanced style properties
  headerStyle: HeaderStyleType;
  shadowStyle: ShadowStyleType;
  backgroundPattern: BackgroundPatternType;
  decorativeElements: DecorativeConfig;
  imageStyle: TemplateImageStyle;
}

export interface ColorScheme {
  id: string;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  lightText: string;
}

// Available template styles
export const TEMPLATE_STYLES: Record<string, TemplateStyle> = {
  modern: {
    id: 'modern',
    name: 'Modern',
    description: 'Clean, contemporary design with gradients and shapes',
    fontFamily: 'Calibri',
    fontSizes: {
      title: 44,
      heading: 32,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'circle',
    layoutStyle: 'modern',
    headerStyle: 'pill',
    shadowStyle: 'elevated',
    backgroundPattern: 'dots',
    decorativeElements: {
      cornerDecoration: 'geometric',
      dividerStyle: 'gradient',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'abstract geometric patterns, smooth gradients, modern design',
      illustration: 'clean vector illustration, flat design, modern style',
      icon: 'simple flat icons, modern, geometric',
      negativePrompt: 'vintage, old-fashioned, cluttered, complex patterns',
      preferredTypes: ['background', 'illustration'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  corporate: {
    id: 'corporate',
    name: 'Corporate',
    description: 'Professional business style with clean lines',
    fontFamily: 'Arial',
    fontSizes: {
      title: 40,
      heading: 28,
      body: 18,
      small: 12
    },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'square',
    layoutStyle: 'corporate',
    headerStyle: 'underline',
    shadowStyle: 'none',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'clean professional background, subtle blue and gray tones, business',
      illustration: 'professional business illustration, corporate style, clean',
      icon: 'simple professional icons, business appropriate',
      negativePrompt: 'colorful, playful, casual, informal',
      preferredTypes: ['background'],
      useTitleSlideImages: true,
      useSectionHeaderImages: false,
      useBackgroundPatterns: false
    }
  },
  creative: {
    id: 'creative',
    name: 'Creative',
    description: 'Bold and colorful with dynamic shapes',
    fontFamily: 'Segoe UI',
    fontSizes: {
      title: 48,
      heading: 34,
      body: 22,
      small: 16
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'arrow',
    layoutStyle: 'creative',
    headerStyle: 'gradient',
    shadowStyle: 'hard',
    backgroundPattern: 'dots',
    decorativeElements: {
      cornerDecoration: 'circles',
      dividerStyle: 'dots',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'vibrant colorful abstract background, playful shapes, creative design',
      illustration: 'colorful playful illustration, creative style, bold colors',
      icon: 'colorful playful icons, fun, creative design',
      negativePrompt: 'boring, plain, corporate, muted colors',
      preferredTypes: ['background', 'illustration', 'icon'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  minimal: {
    id: 'minimal',
    name: 'Minimal',
    description: 'Simple and elegant with lots of whitespace',
    fontFamily: 'Helvetica',
    fontSizes: {
      title: 42,
      heading: 30,
      body: 20,
      small: 14
    },
    useShapes: false,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'minimal',
    headerStyle: 'minimal',
    shadowStyle: 'none',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'minimal clean background, subtle, lots of white space',
      illustration: 'minimal line art illustration, simple, clean',
      icon: 'minimal icons, simple lines, clean design',
      negativePrompt: 'busy, cluttered, colorful, complex',
      preferredTypes: ['illustration'],
      useTitleSlideImages: false,
      useSectionHeaderImages: false,
      useBackgroundPatterns: false
    }
  },
  academic: {
    id: 'academic',
    name: 'Academic',
    description: 'Serif fonts, formal layout, muted colors for research presentations',
    fontFamily: 'Georgia',
    fontSizes: {
      title: 40,
      heading: 30,
      body: 20,
      small: 14
    },
    useShapes: false,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'minimal',
    headerStyle: 'underline',
    shadowStyle: 'none',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'subtle academic background, muted colors, professional research style',
      illustration: 'scientific diagram style, academic illustration, clear and informative',
      icon: 'simple academic icons, scholarly symbols',
      negativePrompt: 'flashy, colorful, informal, playful',
      preferredTypes: ['diagram'],
      useTitleSlideImages: false,
      useSectionHeaderImages: false,
      useBackgroundPatterns: false
    }
  },
  tech: {
    id: 'tech',
    name: 'Tech',
    description: 'Monospace headers, neon accents, modern developer aesthetic',
    fontFamily: 'Consolas',
    fontSizes: {
      title: 44,
      heading: 32,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'arrow',
    layoutStyle: 'modern',
    headerStyle: 'box',
    shadowStyle: 'glow',
    backgroundPattern: 'grid',
    decorativeElements: {
      cornerDecoration: 'squares',
      dividerStyle: 'dashed',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'dark tech background with circuit patterns, neon accents, futuristic grid',
      illustration: 'tech illustration, digital style, neon glow effects, dark theme',
      icon: 'tech icons, digital, glowing, neon style',
      negativePrompt: 'vintage, organic, natural, soft, pastel',
      preferredTypes: ['background', 'icon'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  startup: {
    id: 'startup',
    name: 'Startup',
    description: 'Bold, vibrant colors, playful icons, energetic style',
    fontFamily: 'Segoe UI',
    fontSizes: {
      title: 48,
      heading: 34,
      body: 22,
      small: 16
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'checkmark',
    layoutStyle: 'creative',
    headerStyle: 'gradient',
    shadowStyle: 'elevated',
    backgroundPattern: 'dots',
    decorativeElements: {
      cornerDecoration: 'circles',
      dividerStyle: 'dots',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'energetic vibrant background, startup energy, dynamic patterns',
      illustration: 'playful modern illustration, startup style, bold and energetic',
      icon: 'vibrant colorful icons, startup style, energetic',
      negativePrompt: 'boring, corporate, dull, conservative',
      preferredTypes: ['background', 'illustration', 'icon'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  medical: {
    id: 'medical',
    name: 'Medical',
    description: 'Calm blues, professional, minimal icons for healthcare',
    fontFamily: 'Arial',
    fontSizes: {
      title: 40,
      heading: 28,
      body: 18,
      small: 12
    },
    useShapes: false,
    useIcons: false,
    bulletStyle: 'square',
    layoutStyle: 'corporate',
    headerStyle: 'underline',
    shadowStyle: 'soft',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'calm medical background, soft blues and greens, healthcare professional',
      illustration: 'medical illustration, healthcare imagery, professional clinical style',
      icon: 'medical icons, healthcare symbols, clean and professional',
      negativePrompt: 'graphic, disturbing, scary, dark',
      preferredTypes: ['background', 'illustration'],
      useTitleSlideImages: true,
      useSectionHeaderImages: false,
      useBackgroundPatterns: false
    }
  },
  elegant: {
    id: 'elegant',
    name: 'Elegant',
    description: 'Sophisticated serif fonts, gold accents, premium feel',
    fontFamily: 'Times New Roman',
    fontSizes: {
      title: 44,
      heading: 32,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'minimal',
    headerStyle: 'underline',
    shadowStyle: 'soft',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'flourishes',
      dividerStyle: 'gradient',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'elegant sophisticated background, gold cream tones, luxury damask patterns',
      illustration: 'elegant ornamental illustration, sophisticated, premium quality',
      icon: 'elegant decorative icons, premium, sophisticated',
      negativePrompt: 'cheap, gaudy, childish, informal',
      preferredTypes: ['background'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: false
    }
  },
  nature: {
    id: 'nature',
    name: 'Nature',
    description: 'Organic greens, earth tones, rounded corners',
    fontFamily: 'Trebuchet MS',
    fontSizes: {
      title: 42,
      heading: 30,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'circle',
    layoutStyle: 'modern',
    headerStyle: 'pill',
    shadowStyle: 'soft',
    backgroundPattern: 'waves',
    decorativeElements: {
      cornerDecoration: 'dots',
      dividerStyle: 'dots',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'organic nature background, leaves and plants, earth tones, green aesthetic',
      illustration: 'nature illustration, organic shapes, botanical style, earth colors',
      icon: 'nature icons, leaf and plant symbols, organic shapes',
      negativePrompt: 'industrial, urban, artificial, synthetic',
      preferredTypes: ['background', 'illustration'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  retro: {
    id: 'retro',
    name: 'Retro',
    description: 'Vintage fonts, warm colors, nostalgic 80s/90s style',
    fontFamily: 'Courier New',
    fontSizes: {
      title: 42,
      heading: 30,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'square',
    layoutStyle: 'creative',
    headerStyle: 'box',
    shadowStyle: 'hard',
    backgroundPattern: 'lines',
    decorativeElements: {
      cornerDecoration: 'circles',
      dividerStyle: 'dashed',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'retro 80s 90s background, vintage patterns, warm nostalgic colors',
      illustration: 'retro vintage illustration, 80s style, nostalgic design',
      icon: 'retro icons, vintage style, 80s 90s aesthetic',
      negativePrompt: 'modern, minimalist, contemporary, sleek',
      preferredTypes: ['background', 'illustration'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  luxury: {
    id: 'luxury',
    name: 'Luxury',
    description: 'Premium fonts, metallic accents, high-end fashion style',
    fontFamily: 'Playfair Display',
    fontSizes: {
      title: 46,
      heading: 34,
      body: 22,
      small: 16
    },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'minimal',
    headerStyle: 'underline',
    shadowStyle: 'soft',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'flourishes',
      dividerStyle: 'gradient',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'luxury premium background, gold and cream, sophisticated damask patterns',
      illustration: 'high-end fashion illustration, luxury style, premium quality',
      icon: 'luxury icons, premium metallic, elegant symbols',
      negativePrompt: 'cheap, tacky, casual, simple',
      preferredTypes: ['background'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: false
    }
  },
  industrial: {
    id: 'industrial',
    name: 'Industrial',
    description: 'Bold sans-serif, metallic grays, manufacturing style',
    fontFamily: 'Impact',
    fontSizes: {
      title: 44,
      heading: 32,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'square',
    layoutStyle: 'corporate',
    headerStyle: 'box',
    shadowStyle: 'hard',
    backgroundPattern: 'grid',
    decorativeElements: {
      cornerDecoration: 'squares',
      dividerStyle: 'solid',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'industrial metallic background, steel plates, manufacturing aesthetic',
      illustration: 'industrial illustration, machinery, manufacturing style',
      icon: 'industrial icons, tools and machinery, metallic style',
      negativePrompt: 'soft, delicate, organic, natural',
      preferredTypes: ['background', 'icon'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  festival: {
    id: 'festival',
    name: 'Festival',
    description: 'Playful fonts, rainbow colors, celebration style',
    fontFamily: 'Comic Sans MS',
    fontSizes: {
      title: 48,
      heading: 36,
      body: 24,
      small: 18
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'checkmark',
    layoutStyle: 'creative',
    headerStyle: 'gradient',
    shadowStyle: 'hard',
    backgroundPattern: 'dots',
    decorativeElements: {
      cornerDecoration: 'circles',
      dividerStyle: 'dots',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'festival celebration background, confetti, rainbow colors, party atmosphere',
      illustration: 'playful festival illustration, celebration, colorful and fun',
      icon: 'celebration icons, party symbols, colorful festive',
      negativePrompt: 'boring, serious, corporate, muted',
      preferredTypes: ['background', 'illustration', 'icon'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  business: {
    id: 'business',
    name: 'Executive Business',
    description: 'Premium corporate design for C-suite presentations',
    fontFamily: 'Segoe UI',
    fontSizes: {
      title: 42,
      heading: 30,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'square',
    layoutStyle: 'corporate',
    headerStyle: 'underline',
    shadowStyle: 'soft',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'premium executive background, sophisticated business style, subtle navy',
      illustration: 'executive business illustration, premium corporate style',
      icon: 'business icons, executive style, professional',
      negativePrompt: 'casual, colorful, playful, informal',
      preferredTypes: ['background'],
      useTitleSlideImages: true,
      useSectionHeaderImages: false,
      useBackgroundPatterns: false
    }
  },
  magazine: {
    id: 'magazine',
    name: 'Magazine Editorial',
    description: 'Bold typography, editorial layout, magazine-style design',
    fontFamily: 'Georgia',
    fontSizes: {
      title: 54,
      heading: 36,
      body: 22,
      small: 16
    },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'creative',
    headerStyle: 'minimal',
    shadowStyle: 'soft',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'editorial magazine background, bold typography style, dramatic composition',
      illustration: 'magazine editorial illustration, bold artistic style',
      icon: 'editorial icons, magazine style, bold design',
      negativePrompt: 'cluttered, busy, corporate, plain',
      preferredTypes: ['background', 'photo'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: false
    }
  },
  futuristic: {
    id: 'futuristic',
    name: 'Futuristic',
    description: 'Sci-fi inspired, neon accents, cutting-edge technology',
    fontFamily: 'Arial',
    fontSizes: {
      title: 46,
      heading: 32,
      body: 20,
      small: 14
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'arrow',
    layoutStyle: 'modern',
    headerStyle: 'box',
    shadowStyle: 'glow',
    backgroundPattern: 'grid',
    decorativeElements: {
      cornerDecoration: 'squares',
      dividerStyle: 'dashed',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'futuristic sci-fi background, neon lights, holographic patterns, dark theme',
      illustration: 'futuristic sci-fi illustration, neon glow, cutting-edge technology',
      icon: 'futuristic icons, sci-fi style, neon glowing',
      negativePrompt: 'vintage, retro, old-fashioned, organic',
      preferredTypes: ['background', 'icon'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  swiss: {
    id: 'swiss',
    name: 'Swiss Design',
    description: 'Clean grid system, Helvetica, Swiss modernism',
    fontFamily: 'Helvetica',
    fontSizes: {
      title: 48,
      heading: 32,
      body: 20,
      small: 14
    },
    useShapes: false,
    useIcons: false,
    bulletStyle: 'square',
    layoutStyle: 'minimal',
    headerStyle: 'minimal',
    shadowStyle: 'none',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'swiss design clean background, grid system, helvetica style, minimal',
      illustration: 'swiss design illustration, clean geometric, minimal',
      icon: 'swiss design icons, geometric, clean lines',
      negativePrompt: 'decorative, ornate, complex, busy',
      preferredTypes: ['diagram'],
      useTitleSlideImages: false,
      useSectionHeaderImages: false,
      useBackgroundPatterns: false
    }
  },
  architect: {
    id: 'architect',
    name: 'Architect',
    description: 'Precise lines, blueprint style, architectural precision',
    fontFamily: 'Arial',
    fontSizes: {
      title: 44,
      heading: 30,
      body: 18,
      small: 12
    },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'square',
    layoutStyle: 'minimal',
    headerStyle: 'underline',
    shadowStyle: 'none',
    backgroundPattern: 'grid',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'architectural blueprint background, precise lines, technical drawing style',
      illustration: 'architectural illustration, blueprint style, precise technical',
      icon: 'architectural icons, technical symbols, precise',
      negativePrompt: 'organic, soft, colorful, playful',
      preferredTypes: ['background', 'diagram'],
      useTitleSlideImages: true,
      useSectionHeaderImages: false,
      useBackgroundPatterns: true
    }
  },
  storytelling: {
    id: 'storytelling',
    name: 'Storytelling',
    description: 'Narrative-focused, emotional, book-like presentation',
    fontFamily: 'Georgia',
    fontSizes: {
      title: 46,
      heading: 32,
      body: 22,
      small: 16
    },
    useShapes: false,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'minimal',
    headerStyle: 'minimal',
    shadowStyle: 'soft',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'flourishes',
      dividerStyle: 'gradient',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'storytelling book-like background, warm tones, narrative atmosphere',
      illustration: 'storybook illustration, narrative style, emotional',
      icon: 'story icons, book symbols, narrative',
      negativePrompt: 'corporate, technical, cold, impersonal',
      preferredTypes: ['background', 'illustration'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: false
    }
  },
  vibrant: {
    id: 'vibrant',
    name: 'Vibrant Pop',
    description: 'High-energy colors, dynamic gradients, youth-oriented',
    fontFamily: 'Segoe UI',
    fontSizes: {
      title: 50,
      heading: 36,
      body: 24,
      small: 18
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'checkmark',
    layoutStyle: 'creative',
    headerStyle: 'gradient',
    shadowStyle: 'elevated',
    backgroundPattern: 'dots',
    decorativeElements: {
      cornerDecoration: 'circles',
      dividerStyle: 'dots',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'vibrant pop art background, dynamic gradients, high energy colors',
      illustration: 'vibrant pop illustration, bold colors, dynamic shapes',
      icon: 'vibrant colorful icons, pop style, energetic',
      negativePrompt: 'muted, dull, corporate, conservative',
      preferredTypes: ['background', 'illustration', 'icon'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  },
  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    description: 'Black and white, high contrast, timeless elegance',
    fontFamily: 'Helvetica',
    fontSizes: {
      title: 44,
      heading: 30,
      body: 20,
      small: 14
    },
    useShapes: false,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'minimal',
    headerStyle: 'underline',
    shadowStyle: 'none',
    backgroundPattern: 'none',
    decorativeElements: {
      cornerDecoration: 'none',
      dividerStyle: 'solid',
      useAccentShapes: false
    },
    imageStyle: {
      background: 'monochrome black and white background, high contrast, elegant',
      illustration: 'black and white illustration, monochrome, high contrast',
      icon: 'monochrome icons, black and white, simple',
      negativePrompt: 'colorful, vibrant, saturated, busy',
      preferredTypes: ['background', 'illustration'],
      useTitleSlideImages: true,
      useSectionHeaderImages: false,
      useBackgroundPatterns: false
    }
  },
  'dark-neon': {
    id: 'dark-neon',
    name: 'Dark Neon',
    description: 'Black background with neon cyan accents, cyberpunk aesthetic for tech topics',
    fontFamily: 'Consolas',
    fontSizes: { title: 44, heading: 30, body: 18, small: 12 },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'arrow',
    layoutStyle: 'modern',
    headerStyle: 'box',
    shadowStyle: 'glow',
    backgroundPattern: 'grid',
    decorativeElements: { cornerDecoration: 'squares', dividerStyle: 'dashed', useAccentShapes: true },
    imageStyle: {
      background: 'dark cyberpunk background, neon cyan grid lines, black void, electric glow',
      illustration: 'neon glowing illustration, dark theme, cyan and blue electric accents',
      icon: 'neon icon, glowing cyan, dark background, cyberpunk style',
      negativePrompt: 'bright, pastel, organic, natural, warm colors, light background',
      preferredTypes: ['background', 'icon'],
      useTitleSlideImages: true, useSectionHeaderImages: true, useBackgroundPatterns: true
    }
  },
  glassmorphism: {
    id: 'glassmorphism',
    name: 'Glassmorphism',
    description: 'Deep purple gradient with frosted glass card overlays, premium modern UI',
    fontFamily: 'Segoe UI',
    fontSizes: { title: 44, heading: 30, body: 18, small: 12 },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'circle',
    layoutStyle: 'modern',
    headerStyle: 'gradient',
    shadowStyle: 'glow',
    backgroundPattern: 'none',
    decorativeElements: { cornerDecoration: 'circles', dividerStyle: 'gradient', useAccentShapes: true },
    imageStyle: {
      background: 'deep purple gradient background, glassmorphism UI, frosted glass panels, luxury',
      illustration: 'glassmorphism style, purple violet gradient, translucent frosted panels',
      icon: 'frosted glass icon, purple gradient, modern UI style',
      negativePrompt: 'flat, matte, harsh edges, retro, vintage, warm colors',
      preferredTypes: ['background'],
      useTitleSlideImages: true, useSectionHeaderImages: true, useBackgroundPatterns: false
    }
  },
  prestige: {
    id: 'prestige',
    name: 'Prestige',
    description: 'Deep navy with gold bars and serif font — authoritative academic and research style',
    fontFamily: 'Georgia',
    fontSizes: { title: 42, heading: 30, body: 18, small: 12 },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'circle',
    layoutStyle: 'minimal',
    headerStyle: 'underline',
    shadowStyle: 'soft',
    backgroundPattern: 'none',
    decorativeElements: { cornerDecoration: 'none', dividerStyle: 'solid', useAccentShapes: true },
    imageStyle: {
      background: 'dark navy background, gold accent bars, prestigious academic formal style',
      illustration: 'authoritative academic illustration, navy and gold, formal prestigious',
      icon: 'gold icon, navy background, prestigious academic',
      negativePrompt: 'casual, colorful, playful, modern tech, neon',
      preferredTypes: ['background'],
      useTitleSlideImages: true, useSectionHeaderImages: false, useBackgroundPatterns: false
    }
  },
  'split-bold': {
    id: 'split-bold',
    name: 'Split Bold',
    description: 'Bold left color panel with white content area — modern editorial impact',
    fontFamily: 'Segoe UI',
    fontSizes: { title: 44, heading: 30, body: 18, small: 12 },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'arrow',
    layoutStyle: 'creative',
    headerStyle: 'minimal',
    shadowStyle: 'elevated',
    backgroundPattern: 'none',
    decorativeElements: { cornerDecoration: 'none', dividerStyle: 'gradient', useAccentShapes: true },
    imageStyle: {
      background: 'bold split color editorial background, half colored panel, modern clean design',
      illustration: 'modern editorial illustration, bold colors, clean crisp design',
      icon: 'bold modern icon, clean lines, editorial style',
      negativePrompt: 'soft, muted, vintage, retro, organic, blurry',
      preferredTypes: ['background'],
      useTitleSlideImages: true, useSectionHeaderImages: true, useBackgroundPatterns: false
    }
  },
  blueprint: {
    id: 'blueprint',
    name: 'Blueprint',
    description: 'Technical drafting aesthetic — dark navy grid, cyan crosshairs, monospace precision',
    fontFamily: 'Consolas',
    fontSizes: { title: 42, heading: 28, body: 18, small: 12 },
    useShapes: true,
    useIcons: false,
    bulletStyle: 'square',
    layoutStyle: 'corporate',
    headerStyle: 'underline',
    shadowStyle: 'none',
    backgroundPattern: 'grid',
    decorativeElements: { cornerDecoration: 'geometric', dividerStyle: 'solid', useAccentShapes: true },
    imageStyle: {
      background: 'technical blueprint engineering drawing, grid lines, cyan on dark navy, precise',
      illustration: 'technical diagram, engineering schematic, blueprint style, precise lines',
      icon: 'technical line icon, blueprint style, engineering precision',
      negativePrompt: 'colorful, warm, organic, soft, vintage',
      preferredTypes: ['background'],
      useTitleSlideImages: false, useSectionHeaderImages: false, useBackgroundPatterns: true
    }
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    description: 'Northern-lights gradient layers on deep space-dark background',
    fontFamily: 'Segoe UI',
    fontSizes: { title: 44, heading: 30, body: 19, small: 13 },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'circle',
    layoutStyle: 'creative',
    headerStyle: 'gradient',
    shadowStyle: 'glow',
    backgroundPattern: 'none',
    decorativeElements: { cornerDecoration: 'none', dividerStyle: 'gradient', useAccentShapes: true },
    imageStyle: {
      background: 'northern lights aurora borealis, dark sky, teal green purple gradient bands, ethereal glow',
      illustration: 'dreamlike aurora illustration, flowing colors, space, teal and purple',
      icon: 'glowing neon icon, aurora colors, teal purple',
      negativePrompt: 'flat, white background, corporate, technical, hard edges',
      preferredTypes: ['background'],
      useTitleSlideImages: true, useSectionHeaderImages: true, useBackgroundPatterns: false
    }
  },
  gradient: {
    id: 'gradient',
    name: 'Gradient Flow',
    description: 'Smooth gradients, fluid design, modern aesthetics',
    fontFamily: 'Calibri',
    fontSizes: {
      title: 46,
      heading: 32,
      body: 22,
      small: 16
    },
    useShapes: true,
    useIcons: true,
    bulletStyle: 'circle',
    layoutStyle: 'modern',
    headerStyle: 'gradient',
    shadowStyle: 'elevated',
    backgroundPattern: 'waves',
    decorativeElements: {
      cornerDecoration: 'circles',
      dividerStyle: 'gradient',
      useAccentShapes: true
    },
    imageStyle: {
      background: 'smooth gradient flow background, fluid shapes, modern aesthetics',
      illustration: 'gradient style illustration, smooth fluid shapes, modern',
      icon: 'gradient icons, smooth, modern design',
      negativePrompt: 'hard edges, solid colors, blocky, rigid',
      preferredTypes: ['background'],
      useTitleSlideImages: true,
      useSectionHeaderImages: true,
      useBackgroundPatterns: true
    }
  }
};

// Available color schemes
export const COLOR_SCHEMES: Record<string, ColorScheme> = {
  blue: {
    id: 'blue',
    name: 'Professional Blue',
    primary: '3B82F6',
    secondary: '1E40AF',
    accent: '60A5FA',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  teal: {
    id: 'teal',
    name: 'Modern Teal',
    primary: '14B8A6',
    secondary: '0D9488',
    accent: '2DD4BF',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  purple: {
    id: 'purple',
    name: 'Creative Purple',
    primary: '9333EA',
    secondary: '7C3AED',
    accent: 'A855F7',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  orange: {
    id: 'orange',
    name: 'Energetic Orange',
    primary: 'F97316',
    secondary: 'EA580C',
    accent: 'FB923C',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  green: {
    id: 'green',
    name: 'Nature Green',
    primary: '10B981',
    secondary: '059669',
    accent: '34D399',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  red: {
    id: 'red',
    name: 'Bold Red',
    primary: 'EF4444',
    secondary: 'DC2626',
    accent: 'F87171',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  slate: {
    id: 'slate',
    name: 'Professional Slate',
    primary: '475569',
    secondary: '1E293B',
    accent: '64748B',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  navy: {
    id: 'navy',
    name: 'Corporate Navy',
    primary: '1E3A8A',
    secondary: '1E40AF',
    accent: '3B82F6',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  emerald: {
    id: 'emerald',
    name: 'Elegant Emerald',
    primary: '047857',
    secondary: '065F46',
    accent: '10B981',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  dark: {
    id: 'dark',
    name: 'Dark Mode',
    primary: '1F2937',
    secondary: '111827',
    accent: '6366F1',
    background: '111827',
    text: 'E5E7EB',
    lightText: 'FFFFFF'
  },
  'dark-orange': {
    id: 'dark-orange',
    name: 'Dark Orange (Professional)',
    primary: '1F2937',
    secondary: '111827',
    accent: 'F59E0B',
    background: '111827',
    text: 'E5E7EB',
    lightText: 'FFFFFF'
  },
  'dark-teal': {
    id: 'dark-teal',
    name: 'Dark Teal',
    primary: '1F2937',
    secondary: '111827',
    accent: '14B8A6',
    background: '111827',
    text: 'E5E7EB',
    lightText: 'FFFFFF'
  },
  'dark-purple': {
    id: 'dark-purple',
    name: 'Dark Purple',
    primary: '1F2937',
    secondary: '111827',
    accent: 'A855F7',
    background: '111827',
    text: 'E5E7EB',
    lightText: 'FFFFFF'
  },
  'dark-emerald': {
    id: 'dark-emerald',
    name: 'Dark Emerald',
    primary: '1F2937',
    secondary: '111827',
    accent: '10B981',
    background: '111827',
    text: 'E5E7EB',
    lightText: 'FFFFFF'
  },
  'dark-red': {
    id: 'dark-red',
    name: 'Dark Red',
    primary: '1F2937',
    secondary: '111827',
    accent: 'EF4444',
    background: '111827',
    text: 'E5E7EB',
    lightText: 'FFFFFF'
  },
  indigo: {
    id: 'indigo',
    name: 'Deep Indigo',
    primary: '6366F1',
    secondary: '4F46E5',
    accent: '818CF8',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  rose: {
    id: 'rose',
    name: 'Elegant Rose',
    primary: 'F43F5E',
    secondary: 'E11D48',
    accent: 'FB7185',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  amber: {
    id: 'amber',
    name: 'Warm Amber',
    primary: 'F59E0B',
    secondary: 'D97706',
    accent: 'FBBF24',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  cyan: {
    id: 'cyan',
    name: 'Bright Cyan',
    primary: '06B6D4',
    secondary: '0891B2',
    accent: '22D3EE',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  lime: {
    id: 'lime',
    name: 'Fresh Lime',
    primary: '84CC16',
    secondary: '65A30D',
    accent: 'A3E635',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  pink: {
    id: 'pink',
    name: 'Vibrant Pink',
    primary: 'EC4899',
    secondary: 'DB2777',
    accent: 'F472B6',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  gold: {
    id: 'gold',
    name: 'Luxury Gold',
    primary: 'D4AF37',
    secondary: 'B8860B',
    accent: 'FFD700',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  silver: {
    id: 'silver',
    name: 'Premium Silver',
    primary: 'A8A8A8',
    secondary: '808080',
    accent: 'C0C0C0',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset Gradient',
    primary: 'FF6B35',
    secondary: 'F7931E',
    accent: 'FDBB2D',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean Blue',
    primary: '0077BE',
    secondary: '005A8C',
    accent: '00A8E8',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  forest: {
    id: 'forest',
    name: 'Forest Green',
    primary: '2D5016',
    secondary: '1C3511',
    accent: '4A7C2C',
    background: 'FFFFFF',
    text: '1F2937',
    lightText: 'FFFFFF'
  },
  monochrome: {
    id: 'monochrome',
    name: 'Pure Monochrome',
    primary: '000000',
    secondary: '333333',
    accent: '666666',
    background: 'FFFFFF',
    text: '000000',
    lightText: 'FFFFFF'
  }
};

export function getTemplateStyle(styleId: string): TemplateStyle {
  return TEMPLATE_STYLES[styleId] || TEMPLATE_STYLES.modern;
}

export function getColorScheme(schemeId: string): ColorScheme {
  return COLOR_SCHEMES[schemeId] || COLOR_SCHEMES.blue;
}
