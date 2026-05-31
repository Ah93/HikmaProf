import * as fs from 'fs';
import * as path from 'path';
import { SlidePlan, SlideDefinition } from '../schemas/slide-plan';

export interface SlidevConfig {
  theme: string;       // 'seriph' | 'default' | 'apple-basic' | 'penguin' | 'academic'
  colorScheme: string;
  language: string;
}

// Supported themes with their npm package and whether they're dark by default
export const SLIDEV_THEMES: Record<string, { label: string; pkg: string; dark: boolean; description: string }> = {
  seriph:        { label: 'Seriph',       pkg: '@slidev/theme-seriph',       dark: false, description: 'Elegant serif typography, professional feel' },
  default:       { label: 'Clean',        pkg: '@slidev/theme-default',      dark: false, description: 'Clean minimal layout, developer-friendly' },
  'apple-basic': { label: 'Apple Basic',  pkg: '@slidev/theme-apple-basic',  dark: false, description: 'Minimal Apple-inspired design' },
  bricks:        { label: 'Bricks',       pkg: '@slidev/theme-bricks',       dark: true,  description: 'Bold color blocks, high-impact visual style' },
};

// Map color scheme IDs to CSS hex values
const COLOR_PRIMARY: Record<string, string> = {
  blue:    '#3B82F6',
  teal:    '#14B8A6',
  purple:  '#9333EA',
  orange:  '#F97316',
  green:   '#10B981',
  red:     '#EF4444',
  navy:    '#1E3A8A',
  indigo:  '#6366F1',
  rose:    '#F43F5E',
  amber:   '#F59E0B',
  cyan:    '#06B6D4',
  emerald: '#047857',
};

function isRtl(lang: string): boolean {
  return lang === 'ar' || lang === 'ur';
}

function xmlEscape(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function bulletLine(text: string): string {
  return `- ${String(text || '').replace(/\r?\n/g, ' ').trim()}`;
}

function renderSlide(slide: SlideDefinition, rtl: boolean): string {
  const c = slide.content as any;
  const layout = slide.layout;
  const title  = String(c?.title || '').trim();
  const bullets: string[] = Array.isArray(c?.bullets)
    ? c.bullets.map((b: any) => (typeof b === 'string' ? b : b?.text || '')).filter(Boolean)
    : [];
  const imageAlt = String(c?.image?.alt || '').trim();
  const imageUrl = String(c?.image?.url || '').trim();
  const mermaid  = String(c?.mermaid || '').trim();

  const dirStyle = rtl ? ' style="direction:rtl;text-align:right"' : '';

  // ── Cover / Title slide ───────────────────────────────────────────────────
  if (layout === 'title' || layout === 'cover') {
    const subtitle = String(c?.subtitle || c?.description || '').trim();
    return [
      '---',
      'layout: cover',
      'class: text-center',
      '---',
      '',
      `# ${title}`,
      subtitle ? `\n<p class="op70 italic mt-2 text-xl">${xmlEscape(subtitle)}</p>` : '',
    ].filter(l => l !== '').join('\n');
  }

  // ── Section header ────────────────────────────────────────────────────────
  if (layout === 'section-header') {
    const sectionTitle = String(c?.sectionTitle || title).trim();
    return [
      '---',
      'layout: section',
      '---',
      '',
      `# ${sectionTitle}`,
    ].join('\n');
  }

  // ── Mermaid diagram slide ─────────────────────────────────────────────────
  if (mermaid) {
    return [
      '---',
      '---',
      '',
      `# ${title}`,
      '',
      '```mermaid',
      mermaid,
      '```',
    ].join('\n');
  }

  // ── Image + text slide (two-column) ──────────────────────────────────────
  if (layout === 'image-text' || layout === 'image-right' || layout === 'image-left' || imageUrl || imageAlt) {
    const leftContent = imageAlt
      ? `<p class="op80 text-sm leading-relaxed">${xmlEscape(imageAlt)}</p>`
      : bullets.map(bulletLine).join('\n');

    const rightContent = imageUrl
      ? `<img src="${xmlEscape(imageUrl)}" class="h-full w-full object-contain rounded-lg shadow" />`
      : `<div class="h-full flex items-center justify-center rounded-lg bg-gray-100 text-gray-400 text-sm">Image Placeholder</div>`;

    return [
      '---',
      'layout: two-cols',
      'layoutClass: gap-6',
      '---',
      '',
      `# ${title}`,
      '',
      leftContent,
      '',
      '::right::',
      '',
      rightContent,
    ].join('\n');
  }

  // ── Standard bullets slide ────────────────────────────────────────────────
  const bulletsMd = bullets.length
    ? bullets.map(bulletLine).join('\n')
    : '_No content_';

  return [
    '---',
    '---',
    '',
    `<div${dirStyle}>`,
    '',
    `# ${title}`,
    '',
    bulletsMd,
    '',
    '</div>',
  ].join('\n');
}

export function generateSlidevMarkdown(slidePlan: SlidePlan, config: SlidevConfig): string {
  const { theme, colorScheme, language } = config;
  const rtl = isRtl(language);
  const meta   = (slidePlan.presentationMetadata || {}) as any;
  const title  = String(meta.title || 'Presentation').replace(/'/g, "''");
  const primary = COLOR_PRIMARY[colorScheme] || COLOR_PRIMARY.blue;

  // ── Global frontmatter ────────────────────────────────────────────────────
  const frontmatter = [
    '---',
    `theme: ${theme}`,
    `title: '${title}'`,
    'highlighter: shiki',
    'transition: slide-left',
    'mdc: true',
    rtl ? "css: 'unocss'" : null,
    '---',
  ].filter(Boolean).join('\n');

  // ── Global style overrides ────────────────────────────────────────────────
  const globalStyle = [
    '<style>',
    `:root {`,
    `  --slidev-theme-primary: ${primary};`,
    `  --slidev-theme-primary-dark: ${primary}cc;`,
    `}`,
    '.slidev-layout h1 {',
    '  font-size: 1.9em;',
    '  line-height: 1.2;',
    '}',
    '.slidev-layout ul {',
    '  margin-top: 0.8em;',
    '  line-height: 1.75;',
    '  font-size: 1.05em;',
    '}',
    '.slidev-layout li {',
    '  margin-bottom: 0.35em;',
    '}',
    '</style>',
  ].join('\n');

  // ── Render each slide ─────────────────────────────────────────────────────
  const slidesMd = slidePlan.slides.map(s => renderSlide(s, rtl)).join('\n\n---\n\n');

  return [frontmatter, '', globalStyle, '', slidesMd].join('\n');
}

export function saveSlidevFile(
  slidePlan: SlidePlan,
  config: SlidevConfig,
  outputDir: string,
  filename: string
): string {
  fs.mkdirSync(outputDir, { recursive: true });
  const content = generateSlidevMarkdown(slidePlan, config);
  const filePath = path.join(outputDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  console.log(`   Slidev markdown saved: ${filePath}`);
  return filePath;
}
