// src/config/shape-presets.ts
// Professional shape configurations for enhanced slide visuals

/**
 * Shape type definitions
 */
export type ShapeType = 'rect' | 'roundRect' | 'ellipse' | 'triangle' | 'line' | 'curve' | 'star' | 'oval';

/**
 * Position on slide
 */
export type ShapePosition = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'center' | 'top' | 'bottom' | 'left' | 'right';

/**
 * Shape configuration
 */
export interface ShapeConfig {
  type: ShapeType;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: {
    color: string;
    transparency?: number;
  };
  line?: {
    type?: 'none' | 'solid' | 'dashed';
    color?: string;
    width?: number;
    transparency?: number;
  };
  shadow?: {
    type: 'outer' | 'inner';
    blur: number;
    offset: number;
    angle: number;
    color: string;
    opacity: number;
  };
  rotate?: number;
}

/**
 * Corner decoration preset
 */
export interface CornerDecoration {
  id: string;
  name: string;
  shapes: ShapeConfig[];
  positions: ShapePosition[];
}

/**
 * Header accent style
 */
export interface HeaderAccent {
  id: string;
  name: string;
  type: 'underline' | 'pill' | 'box' | 'gradient' | 'minimal';
  shapes: ShapeConfig[];
}

/**
 * Card shadow preset
 */
export interface CardShadow {
  id: string;
  name: string;
  shadow?: ShapeConfig['shadow'];
  border?: ShapeConfig['line'];
}

/**
 * Divider style preset
 */
export interface DividerStyle {
  id: string;
  name: string;
  shapes: ShapeConfig[];
  orientation: 'horizontal' | 'vertical';
}

/**
 * Corner decoration presets
 */
export const CORNER_DECORATIONS: Record<string, CornerDecoration> = {
  geometric: {
    id: 'geometric',
    name: 'Accent Corner Bars',
    shapes: [
      {
        type: 'rect',
        x: 0, y: 0, w: 0.06, h: 0.9,
        fill: { color: 'accent', transparency: 30 },
        line: { type: 'none' }
      },
      {
        type: 'rect',
        x: 0, y: 0, w: 0.9, h: 0.06,
        fill: { color: 'accent', transparency: 55 },
        line: { type: 'none' }
      }
    ],
    positions: ['topLeft', 'bottomRight']
  },

  circles: {
    id: 'circles',
    name: 'Corner Bracket Lines',
    shapes: [
      {
        type: 'rect',
        x: 0, y: 0, w: 0.06, h: 0.7,
        fill: { color: 'primary', transparency: 55 },
        line: { type: 'none' }
      },
      {
        type: 'rect',
        x: 0, y: 0, w: 0.7, h: 0.04,
        fill: { color: 'accent', transparency: 60 },
        line: { type: 'none' }
      }
    ],
    positions: ['topRight', 'bottomLeft']
  },

  flourishes: {
    id: 'flourishes',
    name: 'Elegant Corner Lines',
    shapes: [
      {
        type: 'rect',
        x: 0, y: 0, w: 0.5, h: 0.03,
        fill: { color: 'accent', transparency: 45 },
        line: { type: 'none' }
      },
      {
        type: 'rect',
        x: 0, y: 0, w: 0.03, h: 0.5,
        fill: { color: 'secondary', transparency: 55 },
        line: { type: 'none' }
      }
    ],
    positions: ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']
  },

  squares: {
    id: 'squares',
    name: 'Stacked Squares',
    shapes: [
      {
        type: 'rect',
        x: 0, y: 0, w: 0.6, h: 0.6,
        fill: { color: 'primary', transparency: 88 },
        line: { type: 'none' },
        rotate: 15
      },
      {
        type: 'rect',
        x: 0.1, y: 0.1, w: 0.5, h: 0.5,
        fill: { color: 'accent', transparency: 85 },
        line: { type: 'none' },
        rotate: -10
      }
    ],
    positions: ['topRight', 'bottomLeft']
  },

  dots: {
    id: 'dots',
    name: 'Grid Tick Pattern',
    shapes: [
      { type: 'rect', x: 0, y: 0, w: 0.12, h: 0.03, fill: { color: 'accent', transparency: 65 }, line: { type: 'none' } },
      { type: 'rect', x: 0.2, y: 0, w: 0.12, h: 0.03, fill: { color: 'accent', transparency: 70 }, line: { type: 'none' } },
      { type: 'rect', x: 0.4, y: 0, w: 0.12, h: 0.03, fill: { color: 'accent', transparency: 75 }, line: { type: 'none' } },
      { type: 'rect', x: 0, y: 0.2, w: 0.12, h: 0.03, fill: { color: 'accent', transparency: 70 }, line: { type: 'none' } },
      { type: 'rect', x: 0.2, y: 0.2, w: 0.12, h: 0.03, fill: { color: 'accent', transparency: 75 }, line: { type: 'none' } },
      { type: 'rect', x: 0, y: 0.4, w: 0.12, h: 0.03, fill: { color: 'accent', transparency: 75 }, line: { type: 'none' } }
    ],
    positions: ['topRight', 'bottomLeft']
  },

  none: {
    id: 'none',
    name: 'No Decoration',
    shapes: [],
    positions: []
  }
};

/**
 * Header accent presets
 */
export const HEADER_ACCENTS: Record<string, HeaderAccent> = {
  underline: {
    id: 'underline',
    name: 'Simple Underline',
    type: 'underline',
    shapes: [
      {
        type: 'rect',
        x: 0.6, y: 1.23, w: 8.8, h: 0.03,
        fill: { color: 'accent', transparency: 50 },
        line: { type: 'none' }
      }
    ]
  },

  pill: {
    id: 'pill',
    name: 'Accent Pill',
    type: 'pill',
    shapes: [
      {
        type: 'roundRect',
        x: 0.6, y: 0.34, w: 0.22, h: 0.85,
        fill: { color: 'accent' },
        line: { type: 'none' }
      }
    ]
  },

  box: {
    id: 'box',
    name: 'Title Box',
    type: 'box',
    shapes: [
      {
        type: 'roundRect',
        x: 0.5, y: 0.25, w: 9.0, h: 1.0,
        fill: { color: 'primary', transparency: 92 },
        line: { color: 'accent', width: 1, transparency: 60 }
      }
    ]
  },

  gradient: {
    id: 'gradient',
    name: 'Gradient Bar',
    type: 'gradient',
    shapes: [
      {
        type: 'rect',
        x: 0, y: 0.25, w: 0.1, h: 1.0,
        fill: { color: 'primary' },
        line: { type: 'none' }
      },
      {
        type: 'rect',
        x: 0.1, y: 0.25, w: 0.1, h: 1.0,
        fill: { color: 'primary', transparency: 30 },
        line: { type: 'none' }
      },
      {
        type: 'rect',
        x: 0.2, y: 0.25, w: 0.1, h: 1.0,
        fill: { color: 'primary', transparency: 60 },
        line: { type: 'none' }
      },
      {
        type: 'rect',
        x: 0.3, y: 0.25, w: 0.1, h: 1.0,
        fill: { color: 'primary', transparency: 85 },
        line: { type: 'none' }
      }
    ]
  },

  minimal: {
    id: 'minimal',
    name: 'Minimal (No accent)',
    type: 'minimal',
    shapes: []
  }
};

/**
 * Card shadow presets
 */
export const CARD_SHADOWS: Record<string, CardShadow> = {
  soft: {
    id: 'soft',
    name: 'Soft Shadow',
    shadow: {
      type: 'outer',
      blur: 12,
      offset: 4,
      angle: 45,
      color: '000000',
      opacity: 0.15
    }
  },

  elevated: {
    id: 'elevated',
    name: 'Elevated',
    shadow: {
      type: 'outer',
      blur: 20,
      offset: 8,
      angle: 45,
      color: '000000',
      opacity: 0.2
    }
  },

  hard: {
    id: 'hard',
    name: 'Hard Shadow',
    shadow: {
      type: 'outer',
      blur: 2,
      offset: 3,
      angle: 45,
      color: '000000',
      opacity: 0.25
    }
  },

  glow: {
    id: 'glow',
    name: 'Glow Effect',
    shadow: {
      type: 'outer',
      blur: 15,
      offset: 0,
      angle: 0,
      color: 'accent', // Will be replaced with actual color
      opacity: 0.3
    }
  },

  bordered: {
    id: 'bordered',
    name: 'Bordered (No Shadow)',
    border: {
      type: 'solid',
      color: 'accent',
      width: 1,
      transparency: 50
    }
  },

  none: {
    id: 'none',
    name: 'No Shadow',
    shadow: undefined
  }
};

/**
 * Divider style presets
 */
export const DIVIDER_STYLES: Record<string, DividerStyle> = {
  solid: {
    id: 'solid',
    name: 'Solid Line',
    orientation: 'vertical',
    shapes: [
      {
        type: 'rect',
        x: 4.95, y: 1.25, w: 0.1, h: 4.2,
        fill: { color: 'accent', transparency: 50 },
        line: { type: 'none' }
      }
    ]
  },

  dashed: {
    id: 'dashed',
    name: 'Dashed Line',
    orientation: 'vertical',
    shapes: [
      { type: 'rect', x: 4.95, y: 1.3, w: 0.08, h: 0.4, fill: { color: 'accent', transparency: 60 }, line: { type: 'none' } },
      { type: 'rect', x: 4.95, y: 1.9, w: 0.08, h: 0.4, fill: { color: 'accent', transparency: 60 }, line: { type: 'none' } },
      { type: 'rect', x: 4.95, y: 2.5, w: 0.08, h: 0.4, fill: { color: 'accent', transparency: 60 }, line: { type: 'none' } },
      { type: 'rect', x: 4.95, y: 3.1, w: 0.08, h: 0.4, fill: { color: 'accent', transparency: 60 }, line: { type: 'none' } },
      { type: 'rect', x: 4.95, y: 3.7, w: 0.08, h: 0.4, fill: { color: 'accent', transparency: 60 }, line: { type: 'none' } },
      { type: 'rect', x: 4.95, y: 4.3, w: 0.08, h: 0.4, fill: { color: 'accent', transparency: 60 }, line: { type: 'none' } },
      { type: 'rect', x: 4.95, y: 4.9, w: 0.08, h: 0.4, fill: { color: 'accent', transparency: 60 }, line: { type: 'none' } }
    ]
  },

  dots: {
    id: 'dots',
    name: 'Tick Divider',
    orientation: 'vertical',
    shapes: [
      { type: 'rect', x: 4.93, y: 1.5, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.93, y: 2.0, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.93, y: 2.5, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.93, y: 3.0, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.93, y: 3.5, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.93, y: 4.0, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.93, y: 4.5, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.93, y: 5.0, w: 0.09, h: 0.22, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } }
    ]
  },

  gradient: {
    id: 'gradient',
    name: 'Gradient Fade',
    orientation: 'vertical',
    shapes: [
      { type: 'rect', x: 4.9, y: 1.3, w: 0.15, h: 0.8, fill: { color: 'accent', transparency: 30 }, line: { type: 'none' } },
      { type: 'rect', x: 4.9, y: 2.1, w: 0.15, h: 1.4, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.9, y: 3.5, w: 0.15, h: 1.4, fill: { color: 'accent', transparency: 50 }, line: { type: 'none' } },
      { type: 'rect', x: 4.9, y: 4.9, w: 0.15, h: 0.5, fill: { color: 'accent', transparency: 30 }, line: { type: 'none' } }
    ]
  },

  none: {
    id: 'none',
    name: 'No Divider',
    orientation: 'vertical',
    shapes: []
  }
};

/**
 * Background pattern presets
 */
export const BACKGROUND_PATTERNS: Record<string, ShapeConfig[]> = {
  dots: [
    // Subtle horizontal tick marks (no circles)
    ...Array.from({ length: 20 }, (_, i) => ({
      type: 'rect' as const,
      x: (i % 5) * 2,
      y: Math.floor(i / 5) * 1.3,
      w: 0.1,
      h: 0.03,
      fill: { color: 'accent', transparency: 88 },
      line: { type: 'none' as const }
    }))
  ],

  lines: [
    // Subtle diagonal lines
    ...Array.from({ length: 8 }, (_, i) => ({
      type: 'line' as const,
      x: i * 1.4,
      y: 0,
      w: 1,
      h: 5.6,
      fill: { color: 'accent', transparency: 95 },
      line: { color: 'accent', width: 1, transparency: 92 },
      rotate: 15
    }))
  ],

  grid: [
    // Subtle grid pattern
    ...Array.from({ length: 10 }, (_, i) => ({
      type: 'line' as const,
      x: 0,
      y: i * 0.56,
      w: 10,
      h: 0,
      fill: { color: 'accent', transparency: 95 },
      line: { color: 'accent', width: 0.5, transparency: 92 }
    })),
    ...Array.from({ length: 10 }, (_, i) => ({
      type: 'line' as const,
      x: i,
      y: 0,
      w: 0,
      h: 5.6,
      fill: { color: 'accent', transparency: 95 },
      line: { color: 'accent', width: 0.5, transparency: 92 }
    }))
  ],

  waves: [
    // Decorative wave at bottom
    {
      type: 'curve' as const,
      x: 0,
      y: 4.8,
      w: 10,
      h: 0.8,
      fill: { color: 'accent', transparency: 92 },
      line: { type: 'none' as const }
    }
  ],

  none: []
};

/**
 * Get shape config with resolved colors
 */
export function resolveShapeColors(
  shape: ShapeConfig,
  colorScheme: { primary: string; secondary: string; accent: string; background: string }
): ShapeConfig {
  const resolved = { ...shape };

  if (resolved.fill) {
    resolved.fill = { ...resolved.fill };
    if (resolved.fill.color === 'primary') resolved.fill.color = colorScheme.primary;
    else if (resolved.fill.color === 'secondary') resolved.fill.color = colorScheme.secondary;
    else if (resolved.fill.color === 'accent') resolved.fill.color = colorScheme.accent;
    else if (resolved.fill.color === 'background') resolved.fill.color = colorScheme.background;
  }

  if (resolved.line && resolved.line.color) {
    resolved.line = { ...resolved.line };
    if (resolved.line.color === 'primary') resolved.line.color = colorScheme.primary;
    else if (resolved.line.color === 'secondary') resolved.line.color = colorScheme.secondary;
    else if (resolved.line.color === 'accent') resolved.line.color = colorScheme.accent;
    else if (resolved.line.color === 'background') resolved.line.color = colorScheme.background;
  }

  if (resolved.shadow && resolved.shadow.color) {
    resolved.shadow = { ...resolved.shadow };
    if (resolved.shadow.color === 'accent') resolved.shadow.color = colorScheme.accent;
  }

  return resolved;
}

/**
 * Get corner decoration for a position
 */
export function getCornerDecorationShapes(
  decorationId: string,
  position: ShapePosition,
  slideWidth: number = 10,
  slideHeight: number = 5.6
): ShapeConfig[] {
  const decoration = CORNER_DECORATIONS[decorationId];
  if (!decoration || !decoration.positions.includes(position)) return [];

  return decoration.shapes.map(shape => {
    const adjusted = { ...shape };

    switch (position) {
      case 'topLeft':
        // Already positioned at origin
        break;
      case 'topRight':
        adjusted.x = slideWidth - shape.w - shape.x;
        break;
      case 'bottomLeft':
        adjusted.y = slideHeight - shape.h - shape.y;
        break;
      case 'bottomRight':
        adjusted.x = slideWidth - shape.w - shape.x;
        adjusted.y = slideHeight - shape.h - shape.y;
        break;
    }

    return adjusted;
  });
}

/**
 * Get recommended presets for a template style
 */
export function getPresetsForStyle(styleId: string): {
  cornerDecoration: string;
  headerAccent: string;
  cardShadow: string;
  dividerStyle: string;
  backgroundPattern: string;
} {
  switch (styleId) {
    case 'modern':
      return {
        cornerDecoration: 'none',
        headerAccent: 'pill',
        cardShadow: 'elevated',
        dividerStyle: 'gradient',
        backgroundPattern: 'none'
      };

    case 'corporate':
    case 'business':
      return {
        cornerDecoration: 'none',
        headerAccent: 'underline',
        cardShadow: 'bordered',
        dividerStyle: 'solid',
        backgroundPattern: 'none'
      };

    case 'creative':
    case 'startup':
    case 'vibrant':
      return {
        cornerDecoration: 'none',
        headerAccent: 'gradient',
        cardShadow: 'elevated',
        dividerStyle: 'solid',
        backgroundPattern: 'none'
      };

    case 'minimal':
    case 'swiss':
    case 'architect':
      return {
        cornerDecoration: 'none',
        headerAccent: 'minimal',
        cardShadow: 'none',
        dividerStyle: 'solid',
        backgroundPattern: 'none'
      };

    case 'tech':
    case 'futuristic':
      return {
        cornerDecoration: 'squares',
        headerAccent: 'box',
        cardShadow: 'glow',
        dividerStyle: 'dashed',
        backgroundPattern: 'grid'
      };

    case 'elegant':
    case 'luxury':
    case 'storytelling':
      return {
        cornerDecoration: 'flourishes',
        headerAccent: 'underline',
        cardShadow: 'soft',
        dividerStyle: 'gradient',
        backgroundPattern: 'none'
      };

    case 'nature':
      return {
        cornerDecoration: 'none',
        headerAccent: 'pill',
        cardShadow: 'soft',
        dividerStyle: 'solid',
        backgroundPattern: 'none'
      };

    case 'retro':
    case 'festival':
      return {
        cornerDecoration: 'none',
        headerAccent: 'box',
        cardShadow: 'hard',
        dividerStyle: 'dashed',
        backgroundPattern: 'lines'
      };

    default:
      return {
        cornerDecoration: 'none',
        headerAccent: 'pill',
        cardShadow: 'soft',
        dividerStyle: 'solid',
        backgroundPattern: 'none'
      };
  }
}
