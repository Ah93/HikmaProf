/**
 * Icon Library Configuration
 * Maps semantic icon names to Unicode emoji characters
 */

export interface IconDefinition {
  emoji: string;
  label: string;
  category: string;
}

// Icon categories
export type IconCategory =
  | 'actions'
  | 'communication'
  | 'education'
  | 'business'
  | 'technology'
  | 'science'
  | 'status'
  | 'media'
  | 'navigation'
  | 'symbols';

// Comprehensive icon library
export const ICON_LIBRARY: Record<string, IconDefinition> = {
  // Actions
  'checkmark': { emoji: '✓', label: 'Checkmark', category: 'actions' },
  'cross': { emoji: '✗', label: 'Cross', category: 'actions' },
  'plus': { emoji: '+', label: 'Plus', category: 'actions' },
  'minus': { emoji: '-', label: 'Minus', category: 'actions' },
  'arrow-right': { emoji: '→', label: 'Arrow Right', category: 'actions' },
  'arrow-left': { emoji: '←', label: 'Arrow Left', category: 'actions' },
  'arrow-up': { emoji: '↑', label: 'Arrow Up', category: 'actions' },
  'arrow-down': { emoji: '↓', label: 'Arrow Down', category: 'actions' },
  'star': { emoji: '★', label: 'Star', category: 'actions' },
  'heart': { emoji: '♥', label: 'Heart', category: 'actions' },

  // Communication
  'mail': { emoji: '✉', label: 'Mail', category: 'communication' },
  'phone': { emoji: '☎', label: 'Phone', category: 'communication' },
  'chat': { emoji: '💬', label: 'Chat', category: 'communication' },
  'megaphone': { emoji: '📣', label: 'Megaphone', category: 'communication' },

  // Education
  'book': { emoji: '📖', label: 'Book', category: 'education' },
  'pencil': { emoji: '✏', label: 'Pencil', category: 'education' },
  'graduate': { emoji: '🎓', label: 'Graduate Cap', category: 'education' },
  'lightbulb': { emoji: '💡', label: 'Lightbulb', category: 'education' },
  'brain': { emoji: '🧠', label: 'Brain', category: 'education' },

  // Business
  'briefcase': { emoji: '💼', label: 'Briefcase', category: 'business' },
  'chart-up': { emoji: '📈', label: 'Chart Increasing', category: 'business' },
  'chart-down': { emoji: '📉', label: 'Chart Decreasing', category: 'business' },
  'money': { emoji: '💰', label: 'Money Bag', category: 'business' },
  'target': { emoji: '🎯', label: 'Target', category: 'business' },
  'calendar': { emoji: '📅', label: 'Calendar', category: 'business' },
  'clock': { emoji: '⏰', label: 'Clock', category: 'business' },
  'handshake': { emoji: '🤝', label: 'Handshake', category: 'business' },

  // Technology
  'computer': { emoji: '💻', label: 'Computer', category: 'technology' },
  'mobile': { emoji: '📱', label: 'Mobile Phone', category: 'technology' },
  'database': { emoji: '🗄', label: 'Database', category: 'technology' },
  'gear': { emoji: '⚙', label: 'Gear', category: 'technology' },
  'cpu': { emoji: '🖥', label: 'CPU', category: 'technology' },
  'cloud': { emoji: '☁', label: 'Cloud', category: 'technology' },
  'lock': { emoji: '🔒', label: 'Lock', category: 'technology' },
  'unlock': { emoji: '🔓', label: 'Unlock', category: 'technology' },
  'key': { emoji: '🔑', label: 'Key', category: 'technology' },
  'wifi': { emoji: '📶', label: 'WiFi', category: 'technology' },

  // Science
  'microscope': { emoji: '🔬', label: 'Microscope', category: 'science' },
  'telescope': { emoji: '🔭', label: 'Telescope', category: 'science' },
  'atom': { emoji: '⚛', label: 'Atom', category: 'science' },
  'dna': { emoji: '🧬', label: 'DNA', category: 'science' },
  'magnet': { emoji: '🧲', label: 'Magnet', category: 'science' },

  // Status
  'warning': { emoji: '⚠', label: 'Warning', category: 'status' },
  'error': { emoji: '❌', label: 'Error', category: 'status' },
  'info': { emoji: 'ℹ', label: 'Information', category: 'status' },
  'success': { emoji: '✅', label: 'Success', category: 'status' },
  'question': { emoji: '❓', label: 'Question', category: 'status' },
  'exclamation': { emoji: '❗', label: 'Exclamation', category: 'status' },

  // Media
  'camera': { emoji: '📷', label: 'Camera', category: 'media' },
  'video': { emoji: '🎥', label: 'Video', category: 'media' },
  'music': { emoji: '🎵', label: 'Music', category: 'media' },
  'image': { emoji: '🖼', label: 'Image', category: 'media' },

  // Navigation
  'home': { emoji: '🏠', label: 'Home', category: 'navigation' },
  'menu': { emoji: '☰', label: 'Menu', category: 'navigation' },
  'search': { emoji: '🔍', label: 'Search', category: 'navigation' },
  'location': { emoji: '📍', label: 'Location', category: 'navigation' },
  'globe': { emoji: '🌍', label: 'Globe', category: 'navigation' },

  // Symbols
  'circle': { emoji: '●', label: 'Circle', category: 'symbols' },
  'square': { emoji: '■', label: 'Square', category: 'symbols' },
  'triangle': { emoji: '▲', label: 'Triangle', category: 'symbols' },
  'diamond': { emoji: '◆', label: 'Diamond', category: 'symbols' },
  'bullet': { emoji: '•', label: 'Bullet', category: 'symbols' },
};

// Helper function to get icon by name
export function getIcon(name: string): string {
  const icon = ICON_LIBRARY[name];
  return icon ? icon.emoji : name;
}

// Helper function to get icons by category
export function getIconsByCategory(category: IconCategory): Record<string, IconDefinition> {
  return Object.fromEntries(
    Object.entries(ICON_LIBRARY).filter(([_, icon]) => icon.category === category)
  );
}

// Smart icon suggestion based on keywords
export function suggestIcon(text: string): string {
  const lowerText = text.toLowerCase();

  // Keywords mapping
  const keywordMap: Record<string, string> = {
    'introduction': 'arrow-right',
    'overview': 'globe',
    'background': 'book',
    'objective': 'target',
    'goal': 'target',
    'method': 'gear',
    'methodology': 'gear',
    'approach': 'lightbulb',
    'result': 'chart-up',
    'results': 'chart-up',
    'finding': 'search',
    'findings': 'search',
    'conclusion': 'checkmark',
    'summary': 'briefcase',
    'recommendation': 'star',
    'future': 'telescope',
    'challenge': 'warning',
    'problem': 'question',
    'solution': 'lightbulb',
    'data': 'database',
    'analysis': 'chart-up',
    'implementation': 'gear',
    'timeline': 'calendar',
    'schedule': 'clock',
    'team': 'handshake',
    'collaboration': 'handshake',
    'technology': 'computer',
    'system': 'cpu',
    'architecture': 'cpu',
    'security': 'lock',
    'performance': 'chart-up',
    'testing': 'checkmark',
    'deployment': 'cloud',
    'reference': 'book',
    'thank': 'heart',
    'question': 'question',
  };

  // Check for keyword matches
  for (const [keyword, iconName] of Object.entries(keywordMap)) {
    if (lowerText.includes(keyword)) {
      return getIcon(iconName);
    }
  }

  // Default icons based on slide type patterns
  if (lowerText.match(/^\d+\./)) return getIcon('circle');
  if (lowerText.includes('?')) return getIcon('question');
  if (lowerText.includes('!')) return getIcon('exclamation');

  return getIcon('bullet');
}
