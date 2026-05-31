// src/schemas/slide-plan.ts

export type LayoutType =
  | 'title-slide'
  | 'section-header'
  | 'title-bullets'
  | 'title-two-columns'
  | 'title-image-text'
  | 'title-chart'
  | 'title-table'
  | 'title-cards'
  | 'quote-slide'
  | 'conclusion'
  | 'thank-you'
  | 'title-timeline'
  | 'title-statistics'
  | 'title-comparison'
  | 'title-icon-grid';

export interface SlidePlan {
  presentationMetadata: {
    title: string;
    theme: ThemeConfig;
    totalSlides: number;
    generatedAt: string;
  };
  slides: SlideDefinition[];
}

export interface ThemeConfig {
  primaryColor: string;      // Hex color, e.g., "#1a365d"
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  fontFamily: string;        // Web-safe font
  headingFont?: string;
}

export interface SlideDefinition {
  slideNumber: number;
  slideId: string;
  layout: LayoutType;
  sourceSection?: string;    // Reference to document section ID
  content: SlideContent;
  speakerNotes?: string;
  estimatedDuration?: number; // Seconds
}

export interface SlideContent {
  // Title slide
  title?: string;
  subtitle?: string;
  author?: string;
  date?: string;

  // Content slides
  bullets?: BulletPoint[];

  // Two columns
  leftColumn?: ColumnContent;
  rightColumn?: ColumnContent;

  // Image + text
  image?: ImageContent;
  bodyText?: string;

  // Chart
  chart?: ChartContent;

  // Table
  table?: TableContent;

  // Cards
  cards?: CardContent[];

  // Quote
  quote?: QuoteContent;

  // Section header
  sectionTitle?: string;
  sectionNumber?: string;

  // Conclusion
  keyTakeaways?: string[];

  // Thank you
  thankYouText?: string;
  contactInfo?: string;

  // Common
  footnote?: string;
}

export interface BulletPoint {
  text: string;
  subBullets?: string[];
}

export interface ColumnContent {
  heading?: string;
  bullets?: string[];
  text?: string | string[];  // Can be single string or array of strings
}

export interface ImageContent {
  path: string;
  alt: string;
  position: 'left' | 'right' | 'center';
}

export interface ChartContent {
  type: 'bar' | 'line' | 'pie' | 'doughnut';
  title?: string;
  data: {
    labels: string[];
    datasets: {
      name: string;
      values: number[];
    }[];
  };
}

export interface TableContent {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface CardContent {
  title: string;
  body: string;
  icon?: string;
}

export interface QuoteContent {
  text: string;
  attribution: string;
}
