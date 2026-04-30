// src/modules/content-analyzer.ts

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DocumentContent } from '../schemas/document-content';
import { SlidePlan, SlideDefinition, ThemeConfig } from '../schemas/slide-plan';
import { normalizeSlidePlan } from '../utils/json-normalizer';
import { validateSlidePlan, SchemaValidator } from '../utils/schema-validator';
import { SlideImagePrompt, ImageType, TemplateImageStyle } from '../schemas/image-types';
import { TemplateStyle, ColorScheme, getTemplateStyle, getColorScheme } from '../config/templates';

export interface AnalyzeOptions {
  numSlides?: number; // Target number of slides (5-30)
  language?: string;  // Output language code e.g. 'en', 'ar', 'fr'
}

export class ContentAnalyzer {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });
  }

  async analyze(documentContent: DocumentContent, options?: AnalyzeOptions): Promise<SlidePlan> {
    const numSlides = options?.numSlides || 12;
    const language = options?.language || 'en';
    const systemPrompt = this.getSystemPrompt(numSlides, language);
    const userPrompt = this.getUserPrompt(documentContent, numSlides, language);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 8000,
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ]
    });

    // Extract JSON from response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse JSON (handle potential markdown code blocks)
    let jsonStr = content.text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let slidePlan: any;
    try {
      const rawPlan = JSON.parse(jsonStr);
      console.log('✓ Successfully parsed JSON from Claude');

      // Save raw response for debugging
      require('fs').writeFileSync('./output/claude-response-raw.json', JSON.stringify(rawPlan, null, 2));
      console.log('  - Saved raw response to output/claude-response-raw.json');

      // Normalize snake_case to camelCase
      console.log('\n🔄 Normalizing JSON keys...');
      slidePlan = normalizeSlidePlan(rawPlan);

      console.log('  - Normalized keys from snake_case to camelCase');
      console.log(`  - Has presentationMetadata: ${!!slidePlan.presentationMetadata}`);
      console.log(`  - Has slides: ${!!slidePlan.slides}`);
      if (slidePlan.slides) {
        console.log(`  - Number of slides: ${slidePlan.slides.length}`);
      }

      // Save normalized response
      require('fs').writeFileSync('./output/claude-response.json', JSON.stringify(slidePlan, null, 2));
      console.log('  - Saved normalized response to output/claude-response.json');

      // Validate schema
      console.log('\n✅ Validating slide plan schema...');
      const validationResult = validateSlidePlan(slidePlan);

      if (validationResult.errors.length > 0) {
        console.error('\n❌ Schema validation errors:');
        validationResult.errors.forEach(err => {
          console.error(`  - [${err.path}] ${err.message}`);
          if (err.suggestion) {
            console.error(`    💡 ${err.suggestion}`);
          }
        });
      }

      if (validationResult.warnings.length > 0) {
        console.warn('\n⚠️  Schema validation warnings:');
        validationResult.warnings.forEach(warn => {
          console.warn(`  - [${warn.path}] ${warn.message}`);
        });
      }

      if (validationResult.valid) {
        console.log('  ✓ Schema validation passed');
      } else {
        console.warn('  ⚠️  Schema has errors but continuing with normalized data');
      }

    } catch (error) {
      console.error('Failed to parse Claude response as JSON');
      console.error('Response text:', content.text.substring(0, 500));
      throw new Error('Failed to parse slide plan JSON from Claude response');
    }

    // Transform to expected format if needed
    if (!slidePlan.presentationMetadata && (slidePlan.title || slidePlan.metadata)) {
      // Claude returned flat structure, transform to nested
      const metadata = slidePlan.metadata || {};
      const transformed: SlidePlan = {
        presentationMetadata: {
          title: slidePlan.title || metadata.title || 'Untitled',
          theme: slidePlan.theme || metadata.theme || {
            primaryColor: '#1a365d',
            secondaryColor: '#2c5282',
            accentColor: '#3182ce',
            backgroundColor: '#ffffff',
            fontFamily: 'Arial'
          },
          totalSlides: slidePlan.slides?.length || 0,
          generatedAt: new Date().toISOString()
        },
        slides: (slidePlan.slides || []).map((slide: any, index: number) => {
          // Normalize field names (handle snake_case from Claude)
          if (slide.slide_number) slide.slideNumber = slide.slide_number;
          if (slide.speaker_notes) slide.speakerNotes = slide.speaker_notes;
          if (slide.source_section) slide.sourceSection = slide.source_section;

          // Ensure content object exists
          if (!slide.content) slide.content = {};

          // Move title into content if needed
          if (slide.title && !slide.content.title) {
            slide.content.title = slide.title;
          }

          // Move bullets into content if needed
          if (slide.bullets && !slide.content.bullets) {
            // For conclusion slides, bullets should be keyTakeaways
            if (slide.layout === 'conclusion') {
              slide.content.keyTakeaways = Array.isArray(slide.bullets)
                ? slide.bullets.map((b: any) => typeof b === 'string' ? b : b.text)
                : slide.bullets;
            } else {
              slide.content.bullets = slide.bullets;
            }
          }

          // Move other common fields into content
          if (slide.subtitle && !slide.content.subtitle) slide.content.subtitle = slide.subtitle;
          if (slide.author && !slide.content.author) slide.content.author = slide.author;
          if (slide.date && !slide.content.date) slide.content.date = slide.date;
          if (slide.keyTakeaways && !slide.content.keyTakeaways) slide.content.keyTakeaways = slide.keyTakeaways;
          if (slide.sectionTitle && !slide.content.sectionTitle) slide.content.sectionTitle = slide.sectionTitle;
          if (slide.sectionNumber && !slide.content.sectionNumber) slide.content.sectionNumber = slide.sectionNumber;

          // Move layout-specific fields into content
          if (slide.cards && !slide.content.cards) slide.content.cards = slide.cards;
          if (slide.leftColumn && !slide.content.leftColumn) slide.content.leftColumn = slide.leftColumn;
          if (slide.rightColumn && !slide.content.rightColumn) slide.content.rightColumn = slide.rightColumn;
          if (slide.left_column && !slide.content.left_column) slide.content.left_column = slide.left_column;
          if (slide.right_column && !slide.content.right_column) slide.content.right_column = slide.right_column;
          if (slide.points && !slide.content.points) slide.content.points = slide.points;
          if (slide.table && !slide.content.table) slide.content.table = slide.table;
          if (slide.chart && !slide.content.chart) slide.content.chart = slide.chart;

          // Ensure slideId exists
          if (!slide.slideId) {
            slide.slideId = `slide-${String(index + 1).padStart(3, '0')}`;
          }

          // Transform bullets array to bullet point objects if needed
          if (slide.content.bullets && Array.isArray(slide.content.bullets)) {
            slide.content.bullets = slide.content.bullets.map((b: any) =>
              typeof b === 'string' ? { text: b } : b
            );
          }

          return slide;
        })
      };
      slidePlan = transformed;
    }

    // Validate and enrich the plan
    return this.validateAndEnrich(slidePlan, documentContent);
  }

  /**
   * Generate image prompts for slides based on content and template style
   */
  generateImagePrompts(
    slidePlan: SlidePlan,
    templateStyleId: string = 'modern',
    colorSchemeId: string = 'blue'
  ): SlideImagePrompt[] {
    const templateStyle = getTemplateStyle(templateStyleId);
    const colorScheme = getColorScheme(colorSchemeId);
    const prompts: SlideImagePrompt[] = [];

    // Stop words for keyword extraction
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'must', 'this', 'that', 'these',
      'those', 'which', 'what', 'who', 'how', 'when', 'where', 'why'
    ]);

    for (const slide of slidePlan.slides) {
      const slideId = slide.slideId || `slide-${slide.slideNumber}`;
      const content = slide.content as any;
      const layout = slide.layout;

      // Determine what images this slide needs
      const neededImages = this.determineNeededImages(layout, content, templateStyle);

      for (const { type, position, priority } of neededImages) {
        const keywords = this.extractKeywordsFromContent(content, stopWords);
        const prompt = this.buildImagePrompt(content, type, templateStyle, keywords);

        prompts.push({
          slideNumber: slide.slideNumber,
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
   * Determine what images a slide needs based on layout and template
   */
  private determineNeededImages(
    layout: string,
    content: any,
    templateStyle: TemplateStyle
  ): Array<{ type: ImageType; position?: 'background' | 'left' | 'right' | 'center' | 'fullbleed'; priority: number }> {
    const images: Array<{ type: ImageType; position?: 'background' | 'left' | 'right' | 'center' | 'fullbleed'; priority: number }> = [];
    const imageStyle = templateStyle.imageStyle;

    switch (layout) {
      case 'title-slide':
        if (imageStyle?.useTitleSlideImages) {
          images.push({ type: 'background', position: 'fullbleed', priority: 10 });
        }
        break;

      case 'section-header':
        if (imageStyle?.useSectionHeaderImages) {
          images.push({ type: 'background', position: 'fullbleed', priority: 8 });
        }
        break;

      case 'title-image-text':
        if (!content.image?.path) {
          images.push({ type: 'illustration', position: content.image?.position || 'left', priority: 9 });
        }
        break;

      case 'title-cards':
        if (content.cards && content.cards.length > 0 && templateStyle.useIcons) {
          images.push({ type: 'icon', position: 'center', priority: 5 });
        }
        break;

      case 'quote-slide':
        images.push({ type: 'background', position: 'fullbleed', priority: 4 });
        break;

      case 'conclusion':
        images.push({ type: 'background', position: 'fullbleed', priority: 7 });
        break;

      case 'thank-you':
        images.push({ type: 'background', position: 'fullbleed', priority: 6 });
        break;

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
   * Extract keywords from slide content
   */
  private extractKeywordsFromContent(content: any, stopWords: Set<string>): string[] {
    const keywords: string[] = [];

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

    // Extract from bodyText
    if (content.bodyText) {
      const words = String(content.bodyText).toLowerCase().split(/\s+/);
      words.forEach(w => {
        const cleaned = w.replace(/[^a-z0-9]/g, '');
        if (cleaned.length > 4 && !stopWords.has(cleaned)) {
          keywords.push(cleaned);
        }
      });
    }

    // Remove duplicates and limit
    return [...new Set(keywords)].slice(0, 10);
  }

  /**
   * Build an image prompt for a specific slide
   */
  private buildImagePrompt(
    content: any,
    type: ImageType,
    templateStyle: TemplateStyle,
    keywords: string[]
  ): string {
    const title = content.title || '';
    const keywordStr = keywords.slice(0, 5).join(', ');
    const imageStyle = templateStyle.imageStyle;

    // Get style-specific hint
    const styleHint = type === 'background'
      ? imageStyle?.background || ''
      : type === 'illustration'
        ? imageStyle?.illustration || ''
        : imageStyle?.icon || '';

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

    return prompt;
  }

  protected getSystemPrompt(numSlides: number = 12, language: string = 'en'): string {
    const minSlides = Math.max(5, numSlides - 3);
    const maxSlides = Math.min(30, numSlides + 3);
    const languageInstruction = language !== 'en'
      ? `\nLANGUAGE REQUIREMENT (CRITICAL): All slide titles, bullet points, card text, speaker notes, and any other text content MUST be written entirely in the language with code "${language}". Do NOT use English for any visible slide text. Speaker notes must also be in "${language}".`
      : '';
    return `You are an expert presentation designer. Your task is to analyze document content and create a detailed slide plan that will be used to generate a PowerPoint presentation.
${languageInstruction}
CRITICAL JSON FORMATTING RULES - MUST FOLLOW EXACTLY:
1. Use camelCase for ALL field names (NOT snake_case)
2. Field names: slideNumber (not slide_number), speakerNotes (not speaker_notes)
3. Theme colors: primaryColor, secondaryColor, accentColor, backgroundColor (all camelCase)
4. Return EXACT structure shown in schema below - no extra fields, no missing required fields

CONTENT RULES:
1. Each slide should have ONE main idea - don't overcrowd
2. Bullet points: MAXIMUM 6 per slide, each bullet MAXIMUM 15 words
3. Titles: MAXIMUM 8 words
4. Card titles: MAXIMUM 4 words, card body: MAXIMUM 20 words
5. Tables: MAXIMUM 5 rows, 4 columns
6. Use varied layouts - avoid using the same layout consecutively
7. Include detailed speakerNotes for each slide (3-5 sentences explaining the content in a narrative style suitable for narration)
8. Speaker notes should be written as complete, flowing narration that can be read aloud, not as bullet points
9. IMPORTANT: Generate approximately ${numSlides} slides (target: ${minSlides}-${maxSlides} slides)

ACADEMIC STRUCTURE & WRITING STYLE (MUST FOLLOW):
1. Produce a coherent academic narrative: Motivation/Problem -> Gap -> Method -> Results -> Discussion/Implications -> Limitations/Future Work -> Conclusion.
2. Use academically styled phrasing (precise, neutral, evidence-focused). Avoid informal wording.
3. Titles should be specific (no vague titles like "Overview" unless it's the Agenda slide).
4. Bullets must be concrete claims grounded in the provided section digest; avoid filler bullets (e.g., "Introduces the concept").
5. Avoid repetition across slides: do not restate the same bullet idea on multiple slides. If a concept must reappear, refine it (e.g., from method -> ablation -> result).

STRICT DOCUMENT GROUNDING (MUST FOLLOW):
1. Use ONLY information present in the provided document sections/figures/tables.
2. Do NOT introduce outside facts, definitions, examples, or topics not present in the document.
3. Do NOT invent new acronyms/terms. If a term is not present in the provided text excerpts, do not use it.
4. Slide 2 MUST be an Agenda/Overview slide with bullets listing the major section titles from the document.
5. Do NOT create empty slides. For content slides, always provide the required content fields for the chosen layout.
6. For content slides (slides 3..N-2), set slide.sourceSection to the document section id you are summarizing.

VISUAL DESIGN RULES - CRITICAL FOR HIGH-QUALITY PRESENTATIONS:
1. USE APPROPRIATE LAYOUTS - Focus on clear, professional academic presentation structure:
   - If numeric data exists (percentages, counts, comparisons), CREATE A CHART with layout "title-chart"
   - If comparing items/methods/features, use "title-table" or "title-two-columns"
   - For section transitions, use "section-header"
   - For main content, use "title-bullets" with 3-5 well-structured bullet points
   - If FIGURES are available, use "title-image-text" with content.image.path

2. CHART DATA FORMAT (for title-chart layout):
   content.chart = {
     "type": "bar" | "line" | "pie" | "doughnut",
     "data": {
       "labels": ["Label1", "Label2", "Label3"],
       "datasets": [{"name": "Series1", "values": [10, 20, 30]}]
     }
   }

3. TABLE DATA FORMAT (for title-table layout):
   content.table = {
     "headers": ["Column1", "Column2", "Column3"],
     "rows": [["Row1-A", "Row1-B", "Row1-C"], ["Row2-A", "Row2-B", "Row2-C"]]
   }

4. TWO-COLUMNS FORMAT (for comparisons):
   content.leftColumn = {"title": "Option A", "bullets": [{"text": "Point 1"}]}
   content.rightColumn = {"title": "Option B", "bullets": [{"text": "Point 1"}]}

5. SECTION HEADER FORMAT (for major sections):
   content.sectionTitle = "Section Name"
   content.subtitle = "Brief description of what this section covers"

6. Keep slides professional and well-structured: concise bullets, clear sections, data visualization when appropriate!

LAYOUT SELECTION GUIDE (USE THESE LAYOUTS):
- title-slide: Opening slide only (REQUIRED for slide 1)
- section-header: Use to introduce major sections (RECOMMENDED: 2-3 per presentation)
- title-bullets: Main content layout - for explaining concepts, listing points (MOST COMMON: 60-70% of content slides)
- title-two-columns: For comparisons, pros/cons, before/after, contrasting ideas
- title-image-text: When figure/diagram is important and available in document
- title-chart: For data visualization - ONLY when you have actual numeric data
- title-table: For structured data comparison - ONLY when you have tabular data
- conclusion: For key takeaways summary (REQUIRED for second-to-last slide, use 3-5 keyTakeaways)
- thank-you: Final slide (REQUIRED for last slide)

PRESENTATION STRUCTURE (MUST FOLLOW):
1. Slide 1: Title slide (layout: title-slide)
2. Slide 2: Agenda/Overview (layout: title-bullets, list major sections)
3. Section Headers: Use section-header layout to introduce each major section (Introduction, Methods, Results, etc.)
4. Content Slides: Primarily title-bullets (60-70%), with charts/tables/two-columns when data supports it
5. Second-to-last: Conclusion (layout: conclusion, with keyTakeaways array)
6. Last: Thank You / Q&A (layout: thank-you)

TYPICAL ACADEMIC PRESENTATION FLOW:
- Title Slide
- Agenda/Overview
- **Section Header**: Introduction
  - Background slides (title-bullets)
  - Motivation slides (title-bullets)
- **Section Header**: Related Work / Literature Review
  - Related work slides (title-bullets or title-table for comparisons)
- **Section Header**: Methodology
  - Method description slides (title-bullets)
  - Architecture/Approach slides (title-bullets or title-two-columns)
- **Section Header**: Experiments & Results
  - Experimental setup (title-bullets)
  - Results slides (title-chart when numeric data, title-table for comparisons)
- **Section Header**: Discussion
  - Analysis slides (title-bullets)
  - Implications (title-bullets)
- Conclusion (with keyTakeaways)
- Thank You

REQUIRED SECTIONS (must create slides for ALL of these in order):
1. Introduction
2. Background
3. Motivation and Objective
4. Literature Review & Related Work
5. Proposed Methodology or Research Methodology
6. Results
7. Discussion
8. Research Limitations
9. Conclusion

INTELLIGENT LITERATURE REVIEW DETECTION (CRITICAL):
1. Literature Review sections often appear with different names: "Related Work", "Previous Work", "Past Work", "Prior Work", "Background Work", "State of the Art", "Survey", "Related Studies", "Existing Methods", "Existing Approaches", "Related Research", "Prior Research", "Background Research".
2. CRITICAL: Literature Review typically appears AFTER Introduction/Background sections and BEFORE Methodology. Use this positional context to identify it.
3. Look for content that discusses other researchers' work, compares existing approaches, or surveys the field - this IS the literature review regardless of section title.
4. Present literature review as well-structured bullet points that effectively summarize the key findings and comparisons from previous work.

INTELLIGENT METHODOLOGY DETECTION (ENHANCED):
1. Methodology sections often appear with different names: "Method", "Methods", "Methodology", "Research Methodology", "Proposed Methodology", "Our Approach", "Technical Approach", "System Design", "Architecture", "Framework", "Proposed Method", "Algorithm", "Algorithms", "Implementation", "Experimental Setup".
2. CRITICAL: Methodology typically appears AFTER Literature Review and BEFORE Results. Use this positional context.
3. Look for content that describes HOW the research was conducted - this IS the methodology regardless of section title.
4. Always use "title-bullets" layout for methodology sections.
5. Create MAXIMUM 4-5 clear, comprehensive bullet points.
6. Each bullet should be 10-20 words maximum for readability.

RESEARCH LIMITATIONS DETECTION (CRITICAL):
1. Research Limitations sections discuss constraints, boundaries, or weaknesses of the current study.
2. Look for content that mentions limitations, constraints, assumptions, scope, or future work suggestions.
3. Common indicators: "limitations", "constraints", "assumptions", "scope", "future work", "weaknesses", "challenges", "boundaries".
4. Limitations typically appear in Discussion, Conclusion, or dedicated Limitations sections.

ENHANCED CONCLUSION REQUIREMENTS:
1. The Conclusion slide MUST be a comprehensive summary of the entire paper.
2. Include Key Takeaways section with 3-5 bullet points summarizing the main contributions and findings.
3. The conclusion should synthesize: what was done, what was found, and why it matters.

THEME: Choose colors that match the content's domain:
- Academic/Research: Deep blues, grays
- Business: Navy, teal
- Technical: Dark grays, accent colors
- Healthcare: Blues, greens

EXACT SCHEMA TO FOLLOW (camelCase):
{
  "presentationMetadata": {
    "title": "Presentation Title Here",
    "theme": {
      "primaryColor": "#1a365d",
      "secondaryColor": "#2c5282",
      "accentColor": "#3182ce",
      "backgroundColor": "#ffffff",
      "fontFamily": "Arial"
    },
    "totalSlides": 10,
    "generatedAt": "2025-12-10T..."
  },
  "slides": [
    {
      "slideNumber": 1,
      "slideId": "slide-001",
      "layout": "title-slide",
      "content": {
        "title": "Main Title",
        "subtitle": "Subtitle text",
        "author": "Author name",
        "date": "Date"
      },
      "speakerNotes": "Welcome message for presenter",
      "estimatedDuration": 30
    },
    {
      "slideNumber": 2,
      "slideId": "slide-002",
      "layout": "title-bullets",
      "content": {
        "title": "Slide Title",
        "bullets": [
          {"text": "First bullet point"},
          {"text": "Second bullet", "subBullets": ["Sub point"]}
        ]
      },
      "speakerNotes": "Explain the key points"
    },
    {
      "slideNumber": 3,
      "slideId": "slide-003",
      "layout": "title-chart",
      "content": {
        "title": "Performance Results",
        "chart": {
          "type": "bar",
          "data": {
            "labels": ["Method A", "Method B", "Ours"],
            "datasets": [{"name": "Accuracy %", "values": [85, 88, 94]}]
          }
        }
      },
      "speakerNotes": "Our method achieves 94% accuracy"
    },
    {
      "slideNumber": 4,
      "slideId": "slide-004",
      "layout": "title-table",
      "content": {
        "title": "Comparison of Methods",
        "table": {
          "headers": ["Method", "Accuracy", "Speed", "Memory"],
          "rows": [
            ["Baseline", "85%", "Fast", "Low"],
            ["Proposed", "94%", "Medium", "Medium"]
          ]
        }
      },
      "speakerNotes": "Comparing different approaches"
    },
    {
      "slideNumber": 5,
      "slideId": "slide-005",
      "layout": "title-bullets",
      "content": {
        "title": "Key Contributions",
        "bullets": [
          {"text": "Achieved 94% accuracy improvement over baseline methods"},
          {"text": "Reduced training time by 50% through optimized architecture"},
          {"text": "Introduced novel transformer-based attention mechanism"}
        ]
      },
      "speakerNotes": "Our research makes three significant contributions to the field. First, we achieved a 94% accuracy improvement over previous baseline methods. Second, we reduced training time by half through our optimized architecture design. Third, we introduced a novel transformer-based attention mechanism that captures long-range dependencies more effectively."
    },
    {
      "slideNumber": 6,
      "slideId": "slide-006",
      "layout": "title-two-columns",
      "content": {
        "title": "Before vs After",
        "leftColumn": {"title": "Traditional", "bullets": [{"text": "Manual process"}, {"text": "Slow"}]},
        "rightColumn": {"title": "Our Approach", "bullets": [{"text": "Automated"}, {"text": "Fast"}]}
      },
      "speakerNotes": "Comparing traditional vs our approach"
    }
  ]
}

OUTPUT: Return ONLY valid JSON matching the schema above. Use camelCase for ALL keys. No markdown, no explanation, just JSON.
IMPORTANT: Use professional academic layouts! Include:
- 2-3 section-header slides to introduce major sections
- Charts ONLY when numeric data is available (at least 1-2 if data exists)
- Tables ONLY when tabular data is available (at least 1 if data exists)
- title-two-columns for comparisons
- Primarily use title-bullets for main content (60-70% of content slides)`;
  }

  protected buildAcademicDigest(doc: DocumentContent): string {
    const majorSections = doc.sections.filter(s => s.level === 1);

    const classify = (title: string) => {
      const t = String(title || '').toLowerCase();
      if (t.includes('abstract')) return 'Abstract';
      if (t.includes('introduction') || t.includes('background') || t.includes('motivation')) return 'Introduction/Motivation';
      if (t.includes('related') || t.includes('prior') || t.includes('literature')) return 'Related Work';
      if (t.includes('method') || t.includes('approach') || t.includes('model') || t.includes('architecture') || t.includes('framework')) return 'Method';
      if (t.includes('experiment') || t.includes('setup') || t.includes('dataset') || t.includes('data') || t.includes('implementation')) return 'Experimental Setup';
      if (t.includes('result') || t.includes('evaluation') || t.includes('analysis') || t.includes('benchmark')) return 'Results/Analysis';
      if (t.includes('discussion') || t.includes('implication')) return 'Discussion';
      if (t.includes('limitation') || t.includes('future')) return 'Limitations/Future Work';
      if (t.includes('conclusion')) return 'Conclusion';
      return 'Other';
    };

    const pickSignals = (s: any) => {
      const points = (s.keyFindings && s.keyFindings.length)
        ? s.keyFindings
        : (s.bulletPoints && s.bulletPoints.length)
          ? s.bulletPoints
          : String(s.content || '')
              .split(/(?<=[.!?])\s+/)
              .map((x: string) => x.trim())
              .filter(Boolean);

      return points
        .map((x: any) => String(x || '').replace(/\s+/g, ' ').trim())
        .filter((x: string) => x.length >= 35)
        .slice(0, 5);
    };

    const header = [
      `TITLE: ${doc.metadata.title || 'Untitled'}`,
      `AUTHORS: ${(doc.metadata.authors || []).join(', ') || 'Unknown'}`,
      `ABSTRACT (if available): ${String(doc.metadata.abstract || '').slice(0, 900)}`,
      `MAJOR SECTIONS (level=1): ${majorSections.map(s => `[${s.id}] ${s.title}`).join(' | ')}`
    ].join('\n');

    const sectionDigests = doc.sections
      .slice(0, 30)
      .map(s => {
        const role = classify(s.title);
        const signals = pickSignals(s);
        return [
          `SECTION [${s.id}] level=${s.level} role=${role}`,
          `TITLE: ${s.title}`,
          `SIGNALS:`,
          ...signals.map((x: string, i: number) => `${i + 1}. ${x}`)
        ].join('\n');
      })
      .join('\n\n');

    return `${header}\n\nSECTION DIGESTS:\n${sectionDigests}`;
  }

  protected getUserPrompt(doc: DocumentContent, numSlides: number = 12, language: string = 'en'): string {
    // Build full document text to give the LLM complete context
    const fullText = [
      `TITLE: ${doc.metadata.title || 'Untitled'}`,
      `AUTHORS: ${(doc.metadata.authors || []).join(', ') || 'Unknown'}`,
      `ABSTRACT: ${doc.metadata.abstract || ''}`,
      '',
      '=== FULL DOCUMENT TEXT ===',
      ...doc.sections.map(s => [
        `## ${s.title}`,
        s.content || '',
        ...(s.bulletPoints || []),
        ...(s.keyFindings || [])
      ].join('\n')),
      '',
      `=== FIGURES (${doc.figures.length}) ===`,
      ...doc.figures.map(f => `- ${f.id}: ${f.caption} (imagePath: ${f.imagePath})`),
      '',
      `=== TABLES (${doc.tables.length}) ===`,
      ...doc.tables.map(t => `- ${t.id}: ${t.headers?.join(', ') || ''} (rows: ${t.rows?.length || 0})`)
    ].join('\n\n');

    return `You are given the FULL TEXT of a research paper (extracted via pymupdf4llm). Your task is to create a comprehensive slide presentation covering ALL of the following requested sections, in order:

1. Introduction
2. Background
3. Motivation and Objective
4. Literature Review & Related Work
5. Proposed Methodology or Research Methodology
6. Results
7. Discussion
8. Research Limitations
9. Conclusion

IMPORTANT INSTRUCTIONS:
- Create slides for EACH of the 9 sections above, even if the content is brief.
- For sections with minimal content, create concise summary slides.
- Use the full document text below as your ONLY source of information.
- Do NOT invent facts; if a section is not explicitly present, synthesize from related parts of the document.
- Maintain academic tone and precise language.
- Include an Agenda/Overview slide after the title.
- End with Conclusion and Thank You slides.
- Target approximately ${numSlides} slides total.

CRITICAL FOR LITERATURE REVIEW DETECTION:
- Look for sections that discuss previous research, existing methods, or compare approaches - these are your literature review content regardless of the section title.
- Literature review typically appears after Introduction/Background and before Methodology sections.
- Common titles include: "Related Work", "Previous Work", "Past Work", "Prior Work", "Background Work", "State of the Art", "Survey", etc.
- Focus on the CONTENT, not just the title - if it discusses what others have done, it's literature review.
- Present literature review content as clear, well-structured bullet points that effectively summarize previous work and comparisons.

CRITICAL FOR METHODOLOGY DETECTION:
- Look for sections that describe the proposed approach, technical details, algorithms, system architecture, or experimental setup.
- Methodology typically appears after Literature Review and before Results sections.
- Common titles include: "Proposed Methodology", "Research Methodology", "Method", "Methods", "Framework", "Approach", "Our Approach", "Proposed Method", "Technical Approach", "System Design", "Architecture".
- Focus on the CONTENT that explains HOW the research was conducted.
- ALWAYS use "title-bullets" layout for methodology sections - never use two-column layout.
- For sequential steps, present them in numbered order within bullet points.
- Break complex methodologies into multiple slides if needed for clarity.

IMPORTANT METHODOLOGY CONTENT GUIDELINES:
- Create MAXIMUM 4-5 clear, comprehensive bullet points for methodology slides
- Each bullet point should be a complete, well-structured sentence (not fragments)
- Combine related information into single bullets (e.g., all dataset info in one bullet)
- DO NOT include table markup or broken fragments in bullet points
- If tables exist in methodology, use "title-table" layout instead of bullets
- Focus on: (1) Overall Approach/Framework, (2) Dataset/Data Used, (3) Implementation Details, (4) Training/Setup
- Use clear, professional language - avoid technical jargon fragments
- Each bullet should be 10-20 words maximum for readability
- Structure as: "Approach: [clear description]", "Dataset: [details]", "Implementation: [key points]", "Training: [setup]"

CRITICAL FOR RESEARCH LIMITATIONS DETECTION:
- Look for content that discusses constraints, boundaries, weaknesses, or limitations of the current study.
- Limitations typically appear in Discussion, Conclusion, or dedicated Limitations sections.
- Common indicators: "limitations", "constraints", "assumptions", "scope", "future work", "weaknesses", "challenges", "boundaries".
- Extract specific limitations mentioned by the authors about their methodology, dataset, or findings.
- If no explicit limitations section exists, synthesize from the authors' discussion of study boundaries.

${fullText}

Create a comprehensive slide plan with ${numSlides} slides covering all requested sections.${language !== 'en' ? `\nREMINDER: ALL slide text (titles, bullets, notes) must be in language "${language}".` : ''}
Return ONLY the JSON SlidePlan object.`;
  }

  protected validateAndEnrich(plan: SlidePlan, doc: DocumentContent): SlidePlan {
    // First, improve chunking and organization
    plan = this.improveSlideChunking(plan, doc);
    
    // Validate structure
    if (!plan || !plan.slides) {
      console.error('Validation failed:');
      throw new Error('Invalid slide plan structure');
    }

    // Ensure required metadata
    if (!plan.presentationMetadata) {
      plan.presentationMetadata = {
        title: doc.metadata.title || 'Untitled Presentation',
        theme: {
          primaryColor: '#1a365d',
          secondaryColor: '#2c5282',
          accentColor: '#3182ce',
          backgroundColor: '#ffffff',
          fontFamily: 'Arial'
        },
        totalSlides: plan.slides.length,
        generatedAt: new Date().toISOString()
      };
    }

    // Fix conclusion slide - ensure it has meaningful content
    plan.slides = this.fixConclusionSlide(plan, doc);

    return plan;
  }

  protected improveSlideChunking(plan: SlidePlan, doc: DocumentContent): SlidePlan {
    // Deduplicate bullet points across slides
    const allBullets = new Set<string>();
    
    plan.slides.forEach(slide => {
      if (slide.content.bullets && Array.isArray(slide.content.bullets)) {
        // Clean and deduplicate bullets
        slide.content.bullets = slide.content.bullets
          .map(bullet => {
            if (typeof bullet === 'string') return { text: bullet };
            return bullet;
          })
          .filter(bullet => {
            const text = bullet.text?.trim();
            if (!text || text.length < 10) return false; // Remove very short bullets
            if (text.length < 30) return false; // Remove bullets that are too brief
            if (allBullets.has(text)) return false; // Remove duplicates
            allBullets.add(text);
            return true;
          })
          .slice(0, 6); // Limit to 6 bullets max for readability
      }
    });

    // Remove slides with very little content (except title, conclusion, thank-you)
    plan.slides = plan.slides.filter(slide => {
      if (slide.layout === 'title-slide' || slide.layout === 'conclusion' || slide.layout === 'thank-you') return true;
      
      const hasMeaningfulContent = this.hasMeaningfulContentStatic(slide);
      return hasMeaningfulContent;
    });

    // Group similar content and improve organization
    plan.slides = this.organizeSlideContent(plan.slides);

    // Renumber slides
    plan.slides = plan.slides.map((slide, index) => {
      slide.slideNumber = index + 1;
      slide.slideId = `slide-${String(index + 1).padStart(3, '0')}`;

      // Ensure content exists
      if (!slide.content) {
        slide.content = {};
      }

      // Truncate content if too long
      if (slide.content.title && slide.content.title.length > 60) {
        slide.content.title = slide.content.title.slice(0, 57) + '...';
      }

      if (slide.content.bullets) {
        slide.content.bullets = slide.content.bullets.slice(0, 6).map((b: any) => {
          // Handle both string and object formats
          if (typeof b === 'string') {
            return {
              text: b.length > 100 ? b.slice(0, 97) + '...' : b
            };
          } else if (b && b.text) {
            return {
              text: b.text.length > 100 ? b.text.slice(0, 97) + '...' : b.text,
              subBullets: b.subBullets?.slice(0, 3)
            };
          } else {
            return { text: String(b) };
          }
        });
      }

      return slide;
    });

    // ===== Minimal safety: keep slides grounded and non-empty =====
    const normalizeTokens = (text: string) =>
      String(text || '')
        .toLowerCase()
        .match(/[a-z0-9]+/g)
        ?.filter(t => t.length >= 4) || [];

    const stop = new Set([
      'this', 'that', 'with', 'from', 'into', 'over', 'under', 'between',
      'than', 'then', 'also', 'such', 'most', 'more', 'some', 'many',
      'these', 'those', 'their', 'there', 'where', 'which', 'while',
      'using', 'used', 'use', 'based', 'paper', 'study', 'research',
      'results', 'method', 'methods', 'approach', 'model', 'models'
    ]);

    const docText = (
      doc.sections
        .map(s => [
          s.id,
          s.title,
          s.content,
          (s.bulletPoints || []).join(' '),
          (s.keyFindings || []).join(' ')
        ].join(' '))
        .join(' ')
    );

    const docVocab = new Set(normalizeTokens(docText).filter(t => !stop.has(t)));
    const sectionsById = new Map(doc.sections.map(s => [s.id, s] as const));
    const majorSections = doc.sections.filter(s => s.level === 1);

    const truncateWords = (text: string, maxWords: number) => {
      const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) return '';
      const words = cleaned.split(' ');
      if (words.length <= maxWords) return cleaned;
      return words.slice(0, maxWords).join(' ') + '...';
    };

    const bulletsFromSection = (sectionId: string) => {
      const sec = sectionsById.get(sectionId);
      if (!sec) return [];
      const candidates = (sec.bulletPoints && sec.bulletPoints.length)
        ? sec.bulletPoints
        : (sec.keyFindings && sec.keyFindings.length)
          ? sec.keyFindings
          : String(sec.content || '')
              .split(/(?<=[.!?])\s+/)
              .map(s => s.trim())
              .filter(Boolean);

      return candidates
        .slice(0, 6)
        .map(t => ({ text: truncateWords(String(t), 15) }))
        .filter(b => b.text.length > 0);
    };

    const hasMeaningfulContent = (slide: SlideDefinition) => {
      const c: any = slide.content || {};
      if (c.bullets && Array.isArray(c.bullets) && c.bullets.length) return true;
      if (c.cards && Array.isArray(c.cards) && c.cards.some((x: any) => String(x?.title || x?.body || '').trim().length > 0)) return true;
      if (c.bodyText && String(c.bodyText).trim().length > 0) return true;
      if (c.table && c.table.headers && c.table.rows && c.table.rows.length) return true;
      if (c.chart && c.chart.data && c.chart.data.labels && c.chart.data.labels.length) return true;
      if (c.quote && c.quote.text) return true;
      return false;
    };

    const slideText = (slide: SlideDefinition) => {
      const c: any = slide.content || {};
      const parts: string[] = [];
      if (c.title) parts.push(String(c.title));
      if (c.subtitle) parts.push(String(c.subtitle));
      if (c.bodyText) parts.push(String(c.bodyText));
      if (c.sectionTitle) parts.push(String(c.sectionTitle));
      if (c.bullets && Array.isArray(c.bullets)) parts.push(c.bullets.map((b: any) => String(b?.text ?? b)).join(' '));
      if (c.cards && Array.isArray(c.cards)) parts.push(c.cards.map((x: any) => `${x?.title || ''} ${x?.body || ''}`).join(' '));
      if (c.quote?.text) parts.push(String(c.quote.text));
      return parts.join(' ');
    };

    const isLikelyUngrounded = (slide: SlideDefinition) => {
      // Don’t judge title/thank-you/section headers for grounding.
      if (slide.layout === 'title-slide' || slide.layout === 'thank-you' || slide.layout === 'section-header') return false;
      const tokens = normalizeTokens(slideText(slide)).filter(t => !stop.has(t));
      if (tokens.length < 6) return false;
      const hit = tokens.filter(t => docVocab.has(t)).length;
      const ratio = hit / Math.max(1, tokens.length);
      return ratio < 0.3;
    };

    const pickSectionForSlide = (slide: SlideDefinition, slideIndex: number) => {
      if (slide.sourceSection && sectionsById.has(slide.sourceSection)) return slide.sourceSection;
      // Prefer major sections, map roughly by position.
      if (majorSections.length) {
        const idx = Math.max(0, Math.min(majorSections.length - 1, slideIndex - 2));
        return majorSections[idx].id;
      }
      return doc.sections[0]?.id;
    };

    // Force slide 2 to be agenda with bullets from major section titles
    if (plan.slides.length >= 2) {
      const agenda = plan.slides[1];
      agenda.layout = 'title-bullets';
      agenda.content = agenda.content || {};
      agenda.content.title = agenda.content.title || 'Agenda';
      agenda.content.bullets = majorSections
        .slice(0, 8)
        .map(s => ({ text: truncateWords(s.title, 10) }));
    }

    // Fix empty or ungrounded slides by replacing content with section-derived bullets.
    plan.slides = plan.slides.map((slide, idx) => {
      const isContentSlide = idx >= 2 && idx < plan.slides.length - 2;
      if (!isContentSlide) return slide;

      const shouldReplace = !hasMeaningfulContent(slide) || isLikelyUngrounded(slide);
      if (!shouldReplace) return slide;

      const sectionId = pickSectionForSlide(slide, idx);
      if (!sectionId) return slide;
      const sec = sectionsById.get(sectionId);
      const bullets = bulletsFromSection(sectionId);
      slide.layout = 'title-bullets';
      slide.sourceSection = sectionId;
      slide.content = {
        title: truncateWords(sec?.title || 'Key Points', 8),
        bullets: bullets.length ? bullets : [{ text: 'Key point not extracted' }]
      };
      if (!slide.speakerNotes) {
        slide.speakerNotes = `Explain the key points from the document section: ${sec?.title || sectionId}.`;
      }
      return slide;
    });

    // Fix conclusion slide - ensure it has meaningful content
    plan.slides = this.fixConclusionSlide(plan, doc);

    return plan;
  }

  protected organizeSlideContent(slides: SlideDefinition[]): SlideDefinition[] {
    // Group slides by topic and merge similar content
    const organizedSlides: SlideDefinition[] = [];
    const seenTopics = new Set<string>();

    slides.forEach(slide => {
      const title = slide.content.title?.toLowerCase() || '';
      
      // Skip if we've already covered this topic
      if (seenTopics.has(title) && slide.layout !== 'title-slide') {
        return;
      }
      
      // Enhance slide content organization
      if (slide.content.bullets && Array.isArray(slide.content.bullets)) {
        // Group related bullets
        const groupedBullets = this.groupRelatedBullets(slide.content.bullets);
        slide.content.bullets = groupedBullets;
      }
      
      organizedSlides.push(slide);
      seenTopics.add(title);
    });

    return organizedSlides;
  }

  protected groupRelatedBullets(bullets: any[]): any[] {
    // Group bullets by semantic similarity
    const groups: any[][] = [];
    
    bullets.forEach(bullet => {
      const text = bullet.text?.toLowerCase() || '';
      
      // Find existing group or create new one
      let added = false;
      for (const group of groups) {
        const groupText = group[0]?.text?.toLowerCase() || '';
        if (this.areBulletsRelated(text, groupText)) {
          group.push(bullet);
          added = true;
          break;
        }
      }
      
      if (!added) {
        groups.push([bullet]);
      }
    });

    // Take the best bullet from each group to avoid repetition
    return groups.map(group => 
      group.reduce((best, current) => 
        (current.text?.length || 0) > (best.text?.length || 0) ? current : best
      )
    );
  }

  protected areBulletsRelated(text1: string, text2: string): boolean {
    // Simple similarity check - can be enhanced with more sophisticated NLP
    const words1 = text1.split(' ').filter(w => w.length > 3);
    const words2 = text2.split(' ').filter(w => w.length > 3);
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = commonWords.length / Math.max(words1.length, words2.length);
    
    return similarity > 0.4; // 40% similarity threshold
  }

  protected chunkConclusionContent(conclusionParagraph: string): string[] {
    // Split into sentences first
    const sentences = conclusionParagraph.match(/[^.!?]*[.!?]/g) || [];
    const cleanSentences = sentences.map(s => s.trim()).filter(s => s.length > 0);
    
    // If we have 3 or fewer sentences, return them as is
    if (cleanSentences.length <= 3) {
      return cleanSentences;
    }
    
    // For longer conclusions, group related sentences
    const chunks: string[] = [];
    let currentChunk = '';
    
    cleanSentences.forEach(sentence => {
      // If current chunk is empty, start with this sentence
      if (!currentChunk) {
        currentChunk = sentence;
        return;
      }
      
      // If adding this sentence would make chunk too long (>150 chars), start new chunk
      if ((currentChunk + ' ' + sentence).length > 150) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    });
    
    // Add the last chunk if it exists
    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }
    
    // Ensure we have at most 4 chunks for readability
    return chunks.slice(0, 4);
  }

  protected fixConclusionSlide(plan: SlidePlan, doc: DocumentContent): SlideDefinition[] {
    const conclusionSlide = plan.slides.find(s => s.layout === 'conclusion');
    
    // Always generate a comprehensive paragraph conclusion
    const conclusionParagraph = this.generateComprehensiveConclusion(doc);
    
    if (conclusionSlide) {
      // Always override to ensure paragraph format converted to keyTakeaways for schema
      const conclusionParagraph = this.generateComprehensiveConclusion(doc);
      
      // Convert paragraph to well-chunked keyTakeaways array
      const keyTakeaways = this.chunkConclusionContent(conclusionParagraph);
      
      conclusionSlide.content = {
        title: 'Conclusion',
        keyTakeaways: keyTakeaways
      };
      
      if (!conclusionSlide.speakerNotes) {
        conclusionSlide.speakerNotes = 'This conclusion summarizes the key contributions and findings of the research, highlighting its significance and potential impact.';
      }
    } else {
      // Create new conclusion slide if none exists
      const conclusionParagraph = this.generateComprehensiveConclusion(doc);
      
      // Convert paragraph to well-chunked keyTakeaways array
      const keyTakeaways = this.chunkConclusionContent(conclusionParagraph);
      
      const newConclusionSlide: SlideDefinition = {
        slideNumber: plan.slides.length + 1,
        slideId: `slide-${String(plan.slides.length + 1).padStart(3, '0')}`,
        layout: 'conclusion',
        content: {
          title: 'Conclusion',
          keyTakeaways: keyTakeaways
        },
        speakerNotes: 'This conclusion summarizes the key contributions and findings of the research, highlighting its significance and potential impact.',
        estimatedDuration: 90
      };
      
      // Insert before thank-you slide if it exists, otherwise add at end
      const thankYouIndex = plan.slides.findIndex(s => s.layout === 'thank-you');
      if (thankYouIndex > 0) {
        plan.slides.splice(thankYouIndex, 0, newConclusionSlide);
      } else {
        plan.slides.push(newConclusionSlide);
      }
    }
    
    // Remove any completely empty slides (except title, conclusion, and thank-you)
    plan.slides = plan.slides.filter(slide => {
      if (slide.layout === 'title-slide' || slide.layout === 'conclusion' || slide.layout === 'thank-you') return true;
      
      const hasMeaningfulContent = this.hasMeaningfulContentStatic(slide);
      return hasMeaningfulContent;
    });
    
    // Renumber slides
    plan.slides = plan.slides.map((slide, index) => {
      slide.slideNumber = index + 1;
      slide.slideId = `slide-${String(index + 1).padStart(3, '0')}`;
      return slide;
    });
    
    // Update total slides count
    if (plan.presentationMetadata) {
      plan.presentationMetadata.totalSlides = plan.slides.length;
    }
    
    return plan.slides;
  }

  protected hasMeaningfulContentStatic(slide: SlideDefinition): boolean {
    const c: any = slide.content || {};
    if (c.bullets && Array.isArray(c.bullets) && c.bullets.length > 0) return true;
    if (c.keyTakeaways && Array.isArray(c.keyTakeaways) && c.keyTakeaways.length > 0) return true;
    if (c.cards && Array.isArray(c.cards) && c.cards.some((x: any) => String(x?.title || x?.body || '').trim().length > 0)) return true;
    if (c.bodyText && String(c.bodyText).trim().length > 50) return true;
    if (c.table && c.table.headers && c.table.rows && c.table.rows.length) return true;
    if (c.chart && c.chart.data && c.chart.data.labels && c.chart.data.labels.length) return true;
    if (c.quote && c.quote.text) return true;
    return false;
  }

  protected generateComprehensiveConclusion(doc: DocumentContent): string {
    // First, try to extract conclusion directly from document's conclusion section
    const conclusionSection = doc.sections.find(s => 
      s.title.toLowerCase().includes('conclusion') ||
      s.title.toLowerCase().includes('conclusions') ||
      s.title.toLowerCase().includes('summary') ||
      s.title.toLowerCase().includes('discussion')
    );
    
    if (conclusionSection && conclusionSection.content) {
      console.log('Found conclusion section:', conclusionSection.title);
      
      // Clean and format the conclusion content
      const cleanedConclusion = this.cleanSectionContent(conclusionSection.content);
      
      // Extract first few sentences for a brief conclusion
      const sentences = cleanedConclusion.match(/[^.!?]*[.!?]/g) || [];
      if (sentences.length > 0) {
        // Take first 2-3 sentences for a concise conclusion
        const briefConclusion = sentences.slice(0, 3).join(' ').trim();
        
        // Ensure it starts with capital letter and ends with period
        const formattedConclusion = briefConclusion.charAt(0).toUpperCase() + briefConclusion.slice(1);
        if (!formattedConclusion.match(/[.!?]$/)) {
          return formattedConclusion + '.';
        }
        
        console.log('Extracted conclusion from document:', formattedConclusion.substring(0, 200));
        return formattedConclusion;
      }
    }
    
    // Fallback: try to extract from Results section
    const resultsSection = doc.sections.find(s => 
      s.title.toLowerCase().includes('result') ||
      s.title.toLowerCase().includes('results') ||
      s.title.toLowerCase().includes('finding') ||
      s.title.toLowerCase().includes('findings')
    );
    
    if (resultsSection && resultsSection.content) {
      console.log('Found results section:', resultsSection.title);
      
      const cleanedResults = this.cleanSectionContent(resultsSection.content);
      const sentences = cleanedResults.match(/[^.!?]*[.!?]/g) || [];
      
      if (sentences.length > 0) {
        // Take last 2-3 sentences from results as conclusion
        const resultConclusion = sentences.slice(-3).join(' ').trim();
        const formattedConclusion = resultConclusion.charAt(0).toUpperCase() + resultConclusion.slice(1);
        if (!formattedConclusion.match(/[.!?]$/)) {
          return formattedConclusion + '.';
        }
        
        console.log('Extracted conclusion from results section:', formattedConclusion.substring(0, 200));
        return formattedConclusion;
      }
    }
    
    // Fallback: try to extract from abstract if no conclusion section found
    if (doc.metadata.abstract) {
      console.log('No conclusion section found, using abstract as fallback');
      const cleanedAbstract = this.cleanSectionContent(doc.metadata.abstract);
      const sentences = cleanedAbstract.match(/[^.!?]*[.!?]/g) || [];
      
      if (sentences.length > 0) {
        // Take last sentence from abstract as conclusion
        const lastSentence = sentences[sentences.length - 1].trim();
        const formattedConclusion = lastSentence.charAt(0).toUpperCase() + lastSentence.slice(1);
        if (!formattedConclusion.match(/[.!?]$/)) {
          return formattedConclusion + '.';
        }
        return formattedConclusion;
      }
    }
    
    // Final fallback: generic conclusion
    console.log('No conclusion content found, using generic conclusion');
    return 'This research presents significant contributions to the field with promising results and important implications for future work.';
  }

  protected cleanSectionContent(content: string): string {
    return content
      .replace(/\d{3}-\d{3}/g, '') // Remove line numbers like "001-002"
      .replace(/\d{3}/g, '') // Remove standalone line numbers
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\n/g, ' ') // Remove newlines
      .replace(/\t/g, ' ') // Remove tabs
      .replace(/[^\w\s.,!?;:()-]/g, '') // Remove special characters
      .replace(/\s{2,}/g, ' ') // Fix multiple spaces
      .trim();
  }

  protected generateConclusionTakeaways(doc: DocumentContent): string[] {
    const takeaways: string[] = [];
    
    // Clean text helper function
    const cleanText = (text: string): string => {
      return text
        .replace(/\d{3}-\d{3}/g, '') // Remove line numbers like "001-002"
        .replace(/\d{3}/g, '') // Remove standalone line numbers like "445"
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n/g, ' ') // Remove newlines
        .replace(/\t/g, ' ') // Remove tabs
        .replace(/[^\w\s.,!?;:()-]/g, '') // Remove special characters except punctuation
        .replace(/\s{2,}/g, ' ') // Fix multiple spaces
        .trim();
    };
    
    // Extract key findings from sections
    const resultsSections = doc.sections.filter(s => 
      s.title.toLowerCase().includes('result') || 
      s.title.toLowerCase().includes('conclusion') ||
      s.title.toLowerCase().includes('finding')
    );
    
    // Extract from abstract if available - with better cleaning
    if (doc.metadata.abstract) {
      const abstract = cleanText(doc.metadata.abstract);
      console.log('Cleaned abstract:', abstract.substring(0, 200));
      
      // Better sentence splitting - look for actual sentence boundaries
      const sentences = abstract.match(/[^.!?]*[.!?]/g) || [];
      const goodSentences = sentences
        .map(s => s.trim())
        .filter(s => s.length > 30 && s.length < 200) // Reasonable length
        .filter(s => !s.match(/^\d+/)) // Exclude sentences starting with numbers
        .slice(0, 2);
      
      takeaways.push(...goodSentences);
    }
    
    // Extract meaningful content from results/conclusion sections
    resultsSections.forEach(section => {
      const cleanedContent = cleanText(section.content);
      
      // Extract complete sentences from section content
      const sentences = cleanedContent.match(/[^.!?]*[.!?]/g) || [];
      const goodSentences = sentences
        .map(s => s.trim())
        .filter(s => s.length > 25 && s.length < 150)
        .slice(0, 2);
      
      takeaways.push(...goodSentences);
      
      // Also add bullet points if they exist and are meaningful
      if (section.bulletPoints && section.bulletPoints.length > 0) {
        const cleanBullets = section.bulletPoints
          .map(bullet => cleanText(bullet))
          .filter(bullet => bullet.length > 15 && bullet.length < 120)
          .slice(0, 2);
        takeaways.push(...cleanBullets);
      }
    });
    
    // If still no good takeaways, extract from introduction and methodology sections
    if (takeaways.length < 2) {
      const introSections = doc.sections.filter(s => 
        s.title.toLowerCase().includes('introduction') || 
        s.title.toLowerCase().includes('abstract') ||
        s.title.toLowerCase().includes('method')
      );
      
      introSections.forEach(section => {
        const cleanedContent = cleanText(section.content);
        const sentences = cleanedContent.match(/[^.!?]*[.!?]/g) || [];
        const goodSentences = sentences
          .map(s => s.trim())
          .filter(s => s.length > 30 && s.length < 150)
          .slice(0, 1);
        
        takeaways.push(...goodSentences);
      });
    }
    
    // Add high-quality generic conclusions as last resort
    if (takeaways.length === 0) {
      takeaways.push('This research presents a novel approach that demonstrates significant improvements over existing methods.');
      takeaways.push('The proposed methodology shows promising results with practical applications in real-world scenarios.');
      takeaways.push('Future work should focus on enhancing scalability and exploring additional application domains.');
    }
    
    // Remove duplicates and limit to best 3-5 takeaways
    const uniqueTakeaways = [...new Set(takeaways)]
      .filter(t => t.length > 20) // Ensure meaningful length
      .slice(0, 5);
    
    console.log('Generated takeaways:', uniqueTakeaways);
    return uniqueTakeaways;
  }

  /**
   * Generate enhanced, detailed transcripts for all slides.
   * This provides longer narration suitable for video generation.
   */
  async generateEnhancedTranscripts(
    slidePlan: SlidePlan,
    documentContent: DocumentContent
  ): Promise<SlidePlan> {
    console.log('\n🎤 Generating enhanced transcripts for video narration...');

    const systemPrompt = `You are an expert presenter creating detailed narration scripts for video presentations.

Your task is to generate natural, engaging narration for each slide that:
1. Explains the slide content in 4-6 sentences (approximately 60-100 words)
2. Provides context from the research paper
3. Uses clear, conversational language suitable for video narration
4. Connects ideas smoothly and maintains academic tone
5. Avoids phrases like "this slide shows" or "as you can see"
6. Speaks naturally as if presenting to an audience

Focus on explaining WHY the content matters and HOW it connects to the overall research narrative.`;

    const enhancedSlides = await Promise.all(
      slidePlan.slides.map(async (slide, index) => {
        try {
          // Find relevant document section for this slide
          const sectionId = slide.sourceSection || '';
          const section = documentContent.sections.find(s => s.id === sectionId);

          // Build context for this slide
          const slideContext = {
            slideNumber: slide.slideNumber,
            layout: slide.layout,
            title: (slide.content as any)?.title || '',
            content: slide.content,
            currentSpeakerNotes: slide.speakerNotes || '',
            documentSection: section ? {
              title: section.title,
              content: section.content?.substring(0, 1500) // First 1500 chars
            } : null,
            documentMetadata: {
              title: documentContent.metadata.title,
              abstract: documentContent.metadata.abstract?.substring(0, 500)
            }
          };

          const userPrompt = `Generate detailed narration (4-6 sentences, 60-100 words) for this presentation slide:

Slide ${slide.slideNumber}: ${(slide.content as any)?.title || 'Untitled'}
Layout: ${slide.layout}

Slide Content:
${JSON.stringify(slide.content, null, 2)}

${section ? `
Document Section Context:
Title: ${section.title}
Content: ${section.content?.substring(0, 1500)}
` : ''}

Research Paper: ${documentContent.metadata.title}
${documentContent.metadata.abstract ? `Abstract: ${documentContent.metadata.abstract.substring(0, 500)}` : ''}

Generate engaging, natural narration that:
- Explains the slide content clearly and completely
- Provides context from the research
- Uses conversational yet academic tone
- Flows naturally for video presentation
- Is 4-6 sentences (60-100 words)

Output ONLY the narration text, no metadata or formatting.`;

          const response = await this.client.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
          });

          const content = response.content[0];
          if (content.type === 'text') {
            const enhancedNarration = content.text.trim();
            console.log(`  ✓ Slide ${slide.slideNumber}: Generated ${enhancedNarration.split(' ').length} words`);

            return {
              ...slide,
              speakerNotes: enhancedNarration
            };
          }

          return slide;
        } catch (error) {
          console.warn(`  ⚠️  Failed to enhance transcript for slide ${slide.slideNumber}, using original`);
          return slide;
        }
      })
    );

    console.log('  ✓ Enhanced transcripts generated for all slides\n');

    return {
      ...slidePlan,
      slides: enhancedSlides
    };
  }
}

/**
 * Gemini-based Content Analyzer for NotebookLM-style quality
 * Enhanced with two-stage generation approach inspired by blog post patterns
 */
export class GeminiContentAnalyzer extends ContentAnalyzer {
  private geminiClient: GoogleGenerativeAI;
  private geminiModel: string = 'gemini-2.5-flash'; // Use Gemini 2.5 Flash (free tier compatible)

  constructor(apiKey?: string) {
    super(apiKey); // Still initialize Claude for transcript generation if needed
    const geminiKey = apiKey || process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY is required when using Gemini provider');
    }
    this.geminiClient = new GoogleGenerativeAI(geminiKey);
  }

  /**
   * Two-stage approach: First generate outline, then detailed content
   * This produces higher quality, more coherent presentations
   */
  async analyze(documentContent: DocumentContent, options?: AnalyzeOptions): Promise<SlidePlan> {
    const numSlides = options?.numSlides || 12;
    const language = options?.language || 'en';
    console.log('🤖 Using Gemini 2.5 Flash for slide generation...');
    console.log(`📋 Target: ${numSlides} slides`);
    console.log('📋 Stage 1: Generating presentation outline...');

    // Stage 1: Generate outline first
    const outline = await this.generateOutline(documentContent, numSlides, language);
    console.log(`  ✓ Generated outline with ${outline.sections.length} sections`);

    // Stage 2: Generate detailed slides from outline
    console.log('📝 Stage 2: Generating detailed slide content...');
    const slidePlan = await this.generateDetailedSlides(documentContent, outline, numSlides, language);

    return this.validateAndEnrich(slidePlan, documentContent);
  }

  /**
   * Helper to retry API calls with exponential backoff
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelayMs: number = 10000
  ): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;
        if (error.status === 429 && attempt < maxRetries) {
          // Extract retry delay from error if available
          const retryMatch = error.message?.match(/retry in (\d+(?:\.\d+)?)/i);
          const suggestedDelay = retryMatch ? parseFloat(retryMatch[1]) * 1000 : 0;
          const delay = Math.max(suggestedDelay, baseDelayMs * Math.pow(2, attempt));
          console.log(`  ⏳ Rate limited. Waiting ${Math.round(delay/1000)}s before retry ${attempt + 1}/${maxRetries}...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
    throw lastError;
  }

  /**
   * Stage 1: Generate a high-level presentation outline
   */
  private async generateOutline(documentContent: DocumentContent, numSlides: number = 12, language: string = 'en'): Promise<{
    title: string;
    sections: Array<{ name: string; keyPoints: string[]; suggestedLayout: string }>;
  }> {
    const model = this.geminiClient.getGenerativeModel({
      model: this.geminiModel,
      generationConfig: {
        temperature: 0.5,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    });

    // Calculate target sections based on numSlides (accounting for title, agenda, conclusion, thank you)
    const targetSections = Math.max(5, numSlides - 4);

    const languageInstruction = language !== 'en' ? `\nLANGUAGE: All output text (section names, key points) MUST be written in language "${language}".\n` : '';
    const outlinePrompt = `You are an expert presentation designer. Analyze this document and create a high-level presentation outline.${languageInstruction}

DOCUMENT TITLE: ${documentContent.metadata.title}
AUTHORS: ${documentContent.metadata.authors.join(', ') || 'Unknown'}

ABSTRACT:
${documentContent.metadata.abstract || 'No abstract available'}

DOCUMENT SECTIONS:
${documentContent.sections.slice(0, 20).map(s => `- ${s.title}: ${s.content?.substring(0, 300)}...`).join('\n')}

Create a presentation outline with approximately ${targetSections} logical content sections (total presentation will be ${numSlides} slides). For each section, identify:
1. Section name (clear, concise)
2. 3-5 key points to cover
3. Suggested slide layout (title-bullets, title-two-columns, title-cards, title-chart, title-table, title-image-text, quote-slide)

Return JSON in this exact format:
{
  "title": "Presentation title",
  "sections": [
    {
      "name": "Section name",
      "keyPoints": ["Point 1", "Point 2", "Point 3"],
      "suggestedLayout": "title-bullets"
    }
  ]
}

Focus on creating a coherent narrative flow. Include:
- Opening (title slide)
- Agenda/Overview
- Main content sections following document structure
- Key findings/results
- Conclusion
- Thank you/Q&A`;

    const result = await this.withRetry(async () => {
      return await model.generateContent(outlinePrompt);
    });
    const response = await result.response;
    let text = response.text();

    // Parse JSON
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      text = jsonMatch[1];
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      console.warn('  ⚠️ Failed to parse outline, using fallback');
      return {
        title: documentContent.metadata.title || 'Presentation',
        sections: [
          { name: 'Introduction', keyPoints: ['Overview of the topic'], suggestedLayout: 'title-bullets' },
          { name: 'Main Content', keyPoints: ['Key information'], suggestedLayout: 'title-bullets' },
          { name: 'Conclusion', keyPoints: ['Summary'], suggestedLayout: 'conclusion' }
        ]
      };
    }
  }

  /**
   * Stage 2: Generate detailed slides from the outline
   */
  private async generateDetailedSlides(
    documentContent: DocumentContent,
    outline: { title: string; sections: Array<{ name: string; keyPoints: string[]; suggestedLayout: string }> },
    numSlides: number = 12,
    language: string = 'en'
  ): Promise<SlidePlan> {
    const model = this.geminiClient.getGenerativeModel({
      model: this.geminiModel,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 8192,
        responseMimeType: "application/json",
      },
    });

    const systemPrompt = this.getGeminiSystemPrompt(numSlides, language);
    const userPrompt = this.getGeminiUserPrompt(documentContent, outline);

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const result = await this.withRetry(async () => {
      return await model.generateContent(fullPrompt);
    });
    const response = await result.response;
    let text = response.text();

    // Parse JSON from response
    let jsonStr = text;
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    let slidePlan: any;
    try {
      const rawPlan = JSON.parse(jsonStr);
      console.log('  ✓ Successfully parsed detailed slides from Gemini');

      // Save raw response for debugging
      require('fs').writeFileSync('./output/gemini-response-raw.json', JSON.stringify(rawPlan, null, 2));
      console.log('  - Saved raw response to output/gemini-response-raw.json');

      // Normalize snake_case to camelCase
      console.log('\n🔄 Normalizing JSON keys...');
      slidePlan = normalizeSlidePlan(rawPlan);

      console.log('  - Normalized keys from snake_case to camelCase');
      console.log(`  - Has presentationMetadata: ${!!slidePlan.presentationMetadata}`);
      console.log(`  - Has slides: ${!!slidePlan.slides}`);
      if (slidePlan.slides) {
        console.log(`  - Number of slides: ${slidePlan.slides.length}`);
      }

      // Save normalized response
      require('fs').writeFileSync('./output/gemini-response.json', JSON.stringify(slidePlan, null, 2));
      console.log('  - Saved normalized response to output/gemini-response.json');

      // Validate schema
      console.log('\n✅ Validating slide plan schema...');
      const validationResult = validateSlidePlan(slidePlan);

      if (validationResult.errors.length > 0) {
        console.error('\n❌ Schema validation errors:');
        validationResult.errors.forEach(err => {
          console.error(`  - [${err.path}] ${err.message}`);
          if (err.suggestion) {
            console.error(`    💡 ${err.suggestion}`);
          }
        });
      }

      if (validationResult.warnings.length > 0) {
        console.warn('\n⚠️  Schema validation warnings:');
        validationResult.warnings.forEach(warn => {
          console.warn(`  - [${warn.path}] ${warn.message}`);
        });
      }

      if (validationResult.valid) {
        console.log('  ✓ Schema validation passed');
      } else {
        console.warn('  ⚠️  Schema has errors but continuing with normalized data');
      }

    } catch (error) {
      console.error('Failed to parse Gemini response as JSON');
      console.error('Response text:', text.substring(0, 500));
      throw new Error('Failed to parse slide plan JSON from Gemini response');
    }

    // Transform to expected format if needed (same logic as Claude analyzer)
    if (!slidePlan.presentationMetadata && (slidePlan.title || slidePlan.metadata)) {
      const metadata = slidePlan.metadata || {};
      const transformed: SlidePlan = {
        presentationMetadata: {
          title: slidePlan.title || metadata.title || 'Untitled',
          theme: slidePlan.theme || metadata.theme || {
            primaryColor: '#1a365d',
            secondaryColor: '#2c5282',
            accentColor: '#3182ce',
            backgroundColor: '#ffffff',
            fontFamily: 'Arial'
          },
          totalSlides: slidePlan.slides?.length || 0,
          generatedAt: new Date().toISOString()
        },
        slides: (slidePlan.slides || []).map((slide: any, index: number) => {
          // Normalize field names (handle snake_case from Gemini)
          if (slide.slide_number) slide.slideNumber = slide.slide_number;
          if (slide.speaker_notes) slide.speakerNotes = slide.speaker_notes;
          if (slide.source_section) slide.sourceSection = slide.source_section;

          // Ensure content object exists
          if (!slide.content) slide.content = {};

          // Move title into content if needed
          if (slide.title && !slide.content.title) {
            slide.content.title = slide.title;
          }

          // Move bullets into content if needed
          if (slide.bullets && !slide.content.bullets) {
            // For conclusion slides, bullets should be keyTakeaways
            if (slide.layout === 'conclusion') {
              slide.content.keyTakeaways = Array.isArray(slide.bullets)
                ? slide.bullets.map((b: any) => typeof b === 'string' ? b : b.text)
                : slide.bullets;
            } else {
              slide.content.bullets = slide.bullets;
            }
          }

          // Move other common fields into content
          if (slide.subtitle && !slide.content.subtitle) slide.content.subtitle = slide.subtitle;
          if (slide.author && !slide.content.author) slide.content.author = slide.author;
          if (slide.date && !slide.content.date) slide.content.date = slide.date;
          if (slide.keyTakeaways && !slide.content.keyTakeaways) slide.content.keyTakeaways = slide.keyTakeaways;
          if (slide.sectionTitle && !slide.content.sectionTitle) slide.content.sectionTitle = slide.sectionTitle;
          if (slide.sectionNumber && !slide.content.sectionNumber) slide.content.sectionNumber = slide.sectionNumber;

          // Move layout-specific fields into content
          if (slide.cards && !slide.content.cards) slide.content.cards = slide.cards;
          if (slide.leftColumn && !slide.content.leftColumn) slide.content.leftColumn = slide.leftColumn;
          if (slide.rightColumn && !slide.content.rightColumn) slide.content.rightColumn = slide.rightColumn;
          if (slide.left_column && !slide.content.left_column) slide.content.left_column = slide.left_column;
          if (slide.right_column && !slide.content.right_column) slide.content.right_column = slide.right_column;
          if (slide.points && !slide.content.points) slide.content.points = slide.points;
          if (slide.table && !slide.content.table) slide.content.table = slide.table;
          if (slide.chart && !slide.content.chart) slide.content.chart = slide.chart;

          // Ensure slideId exists
          if (!slide.slideId) {
            slide.slideId = `slide-${String(index + 1).padStart(3, '0')}`;
          }

          // Transform bullets array to bullet point objects if needed
          if (slide.content.bullets && Array.isArray(slide.content.bullets)) {
            slide.content.bullets = slide.content.bullets.map((b: any) =>
              typeof b === 'string' ? { text: b } : b
            );
          }

          return slide;
        })
      };
      slidePlan = transformed;
    }

    // Validate and enrich the plan
    return this.validateAndEnrich(slidePlan, documentContent);
  }

  /**
   * Enhanced system prompt specifically optimized for Gemini 2.5 Pro
   */
  private getGeminiSystemPrompt(numSlides: number = 12, language: string = 'en'): string {
    const minSlides = Math.max(5, numSlides - 2);
    const maxSlides = Math.min(30, numSlides + 2);
    const languageInstruction = language !== 'en'
      ? `\nLANGUAGE REQUIREMENT (CRITICAL): All slide titles, bullet points, card text, speaker notes, and any other text content MUST be written entirely in the language with code "${language}". Do NOT use English for any visible slide text.\n`
      : '';
    return `You are a world-class presentation designer creating professional, visually engaging presentations.
${languageInstruction}
TARGET SLIDE COUNT: Generate approximately ${numSlides} slides (${minSlides}-${maxSlides} is acceptable).

CRITICAL RULES FOR HIGH-QUALITY OUTPUT:

1. VISUAL DESIGN PRINCIPLES:
   - Each slide should have ONE clear message
   - Use white space effectively - don't overcrowd
   - Use section headers to organize content into logical sections
   - Include visual layouts (charts, tables, two-columns) when data supports it
   - Maximum 4-5 bullet points per slide, each concise and informative
   - Titles should be impactful and under 8 words

2. CONTENT QUALITY:
   - Every bullet must be a concrete, actionable insight
   - Avoid vague statements like "discusses the topic" or "provides overview"
   - Use specific data, metrics, and findings from the document
   - Speaker notes should be detailed (3-5 sentences) explaining the slide
   - When you see numbers/percentages, CREATE A CHART!
   - When comparing options/methods, use TABLE or TWO-COLUMNS!
   - For key metrics/features, use CARDS layout!

3. LAYOUT VARIETY (use each appropriately - MUST use variety!):
   - title-slide: Opening only
   - title-bullets: Key points, lists (max 5 bullets) - DON'T OVERUSE THIS
   - title-two-columns: Comparisons, pros/cons, before/after
   - title-cards: 2-4 key metrics, features, or concepts (USE THIS MORE!)
   - title-chart: Data visualization (ALWAYS provide chart data!)
   - title-table: Structured comparisons (ALWAYS provide table data!)
   - title-image-text: When visuals enhance understanding
   - section-header: Introduce new major sections
   - quote-slide: Impactful quotes or findings
   - conclusion: 3-5 key takeaways
   - thank-you: Final slide

4. NARRATIVE FLOW:
   - Start with compelling hook/problem statement
   - Build logical progression through content
   - End with strong conclusion and clear takeaways
   - Each slide should connect to the next

5. JSON FORMAT (camelCase only):
{
  "presentationMetadata": {
    "title": "Title",
    "theme": {
      "primaryColor": "#1a365d",
      "secondaryColor": "#2c5282",
      "accentColor": "#3182ce",
      "backgroundColor": "#ffffff",
      "fontFamily": "Arial"
    },
    "totalSlides": ${numSlides},
    "generatedAt": "ISO date"
  },
  "slides": [
    {
      "slideNumber": 1,
      "slideId": "slide-001",
      "layout": "title-slide",
      "content": {
        "title": "Main Title",
        "subtitle": "Subtitle",
        "author": "Author",
        "date": "Date"
      },
      "speakerNotes": "Detailed notes for presenter",
      "estimatedDuration": 30
    }
  ]
}

Return ONLY valid JSON. No markdown, no explanation.`;
  }

  /**
   * Enhanced user prompt with outline context
   */
  private getGeminiUserPrompt(
    documentContent: DocumentContent,
    outline: { title: string; sections: Array<{ name: string; keyPoints: string[]; suggestedLayout: string }> }
  ): string {
    const digest = this.buildAcademicDigest(documentContent);

    return `Create a detailed slide plan based on this outline and document.

PRESENTATION OUTLINE:
Title: ${outline.title}
Sections:
${outline.sections.map((s, i) => `${i + 1}. ${s.name} (${s.suggestedLayout})
   - ${s.keyPoints.join('\n   - ')}`).join('\n')}

DOCUMENT CONTENT:
${digest}

FIGURES AVAILABLE: ${documentContent.figures.length}
${documentContent.figures.slice(0, 10).map(f => `- ${f.id}: ${f.caption}`).join('\n')}

TABLES AVAILABLE: ${documentContent.tables.length}
${documentContent.tables.slice(0, 5).map(t => `- ${t.id}: ${t.headers.join(', ')}`).join('\n')}

REQUIREMENTS:
1. Follow the target slide count from the system prompt
2. Slide 1: Title slide with document title, authors, date
3. Slide 2: Agenda with major sections
4. Slides 3-N: Content following outline, using suggested layouts
5. Second-to-last: Conclusion with key takeaways
6. Last: Thank You / Q&A

PROFESSIONAL LAYOUT REQUIREMENTS:
- Include 2-3 "section-header" slides to introduce major sections (Introduction, Methods, Results, Discussion, Conclusion)
- Include charts ONLY when numeric data is available (title-chart layout with actual data)
- Include tables ONLY when tabular data is available (title-table layout with actual data)
- Use "title-two-columns" for comparisons, contrasts, before/after scenarios
- Use "title-bullets" as the primary content layout (60-70% of content slides)
- Ensure each section has clear organization with appropriate headers

For CHART slides, provide:
content.chart = {"type": "bar|line|pie", "data": {"labels": [...], "datasets": [{"name": "...", "values": [...]}]}}

For TABLE slides, provide:
content.table = {"headers": [...], "rows": [[...], [...]]}

For CARDS slides, provide:
content.cards = [{"title": "...", "body": "..."}, ...]

Generate the complete SlidePlan JSON now.`;
  }

  /**
   * Generate enhanced transcripts using Gemini for natural narration
   */
  async generateEnhancedTranscripts(
    slidePlan: SlidePlan,
    documentContent: DocumentContent
  ): Promise<SlidePlan> {
    console.log('\n🎤 Generating enhanced transcripts with Gemini 2.5 Flash (NotebookLM-style)...');

    const systemPrompt = `You are an expert presenter creating detailed narration scripts for video presentations, inspired by Google's NotebookLM podcast-style delivery.

NARRATION STYLE GUIDELINES:
1. Length: 4-6 sentences (60-100 words) per slide
2. Tone: Conversational yet professional, like explaining to a curious colleague
3. Structure: Hook → Explain → Connect to bigger picture
4. AVOID: "This slide shows...", "As you can see...", "Let me explain..."
5. USE: Direct statements, insights, transitions like "What's fascinating here is...", "This leads us to..."
6. Include relevant context from the research
7. End each narration with a smooth transition to the next topic

Focus on the WHY - why does this matter? What's the insight? How does it connect?`;

    const model = this.geminiClient.getGenerativeModel({
      model: this.geminiModel,
      generationConfig: {
        temperature: 0.85,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 400,
      },
    });

    // Process slides sequentially to respect rate limits (free tier: 5 req/min)
    const enhancedSlides: SlideDefinition[] = [];
    for (let index = 0; index < slidePlan.slides.length; index++) {
      const slide = slidePlan.slides[index];
      try {
        // Find relevant document section for this slide
        const sectionId = slide.sourceSection || '';
        const section = documentContent.sections.find(s => s.id === sectionId);

        const userPrompt = `Generate detailed narration (4-6 sentences, 60-100 words) for this presentation slide:

Slide ${slide.slideNumber}: ${(slide.content as any)?.title || 'Untitled'}
Layout: ${slide.layout}

Slide Content:
${JSON.stringify(slide.content, null, 2)}

${section ? `
Document Section Context:
Title: ${section.title}
Content: ${section.content?.substring(0, 1500)}
` : ''}

Research Paper: ${documentContent.metadata.title}
${documentContent.metadata.abstract ? `Abstract: ${documentContent.metadata.abstract.substring(0, 500)}` : ''}

Generate engaging, natural narration that:
- Explains the slide content clearly and completely
- Provides context from the research
- Uses conversational yet academic tone
- Flows naturally for video presentation
- Is 4-6 sentences (60-100 words)

Output ONLY the narration text, no metadata or formatting.`;

        const result = await this.withRetry(async () => {
          return await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
        });
        const response = await result.response;
        const enhancedNarration = response.text().trim();

        console.log(`  ✓ Slide ${slide.slideNumber}: Generated ${enhancedNarration.split(' ').length} words`);

        enhancedSlides.push({
          ...slide,
          speakerNotes: enhancedNarration
        });

        // Add delay between requests to respect rate limits (free tier: 5 req/min)
        if (index < slidePlan.slides.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 15000)); // 15s between requests
        }
      } catch (error) {
        console.warn(`  ⚠️  Failed to enhance transcript for slide ${slide.slideNumber}, using original`);
        enhancedSlides.push(slide);
      }
    }

    console.log('  ✓ Enhanced transcripts generated for all slides with Gemini\n');

    return {
      ...slidePlan,
      slides: enhancedSlides
    };
  }
}

/**
 * DeepSeek Content Analyzer
 * Uses DeepSeek's OpenAI-compatible API
 * Standalone class that doesn't require Anthropic API key
 */
export class DeepSeekContentAnalyzer {
  private deepseekApiKey: string;
  private deepseekBaseUrl: string = 'https://api.deepseek.com';
  private deepseekModel: string = 'deepseek-chat';

  constructor(apiKey?: string) {
    const key = apiKey || process.env.DEEPSEEK_API_KEY;
    if (!key) {
      throw new Error('DEEPSEEK_API_KEY is required when using DeepSeek provider');
    }
    this.deepseekApiKey = key;
  }

  // Copy the helper methods from ContentAnalyzer that we need
  protected getSystemPrompt(language: string = 'en'): string {
    const languageInstruction = language !== 'en'
      ? `\nLANGUAGE REQUIREMENT (CRITICAL): All slide titles, bullet points, key takeaways, speaker notes, and ALL other text content MUST be written entirely in the language with code "${language}". Do NOT use English for any visible slide text.\n`
      : '';
    return `You are an expert academic presentation designer.
Your ONLY job is to output a single valid JSON object — no markdown fences, no explanation, nothing else.
${languageInstruction}

YOU MUST PRODUCE EXACTLY 15 SLIDES IN THIS EXACT ORDER. NO MORE, NO LESS.

SLIDE POSITIONS AND LAYOUTS (FIXED — DO NOT CHANGE):
  Slide  1 → layout: "title-slide"     — Title, authors, year
  Slide  2 → layout: "title-bullets"   — Agenda / Presentation Overview (list the 12 sections below as bullets)
  Slide  3 → layout: "title-bullets"   — Introduction
  Slide  4 → layout: "title-bullets"   — Background
  Slide  5 → layout: "title-bullets"   — Problem Statement
  Slide  6 → layout: "title-bullets"   — Research Objectives / Research Mission
  Slide  7 → layout: "title-bullets"   — Research Scope
  Slide  8 → layout: "title-bullets"   — Research Questions (maximum 3 questions)
  Slide  9 → layout: "title-bullets"   — Literature Review
  Slide 10 → layout: "title-bullets"   — Methodology / Research Methods / Architecture Design
  Slide 11 → layout: "title-bullets"   — Results / Findings / Experimental Results
  Slide 12 → layout: "title-bullets"   — Discussion
  Slide 13 → layout: "title-bullets"   — Research Limitations
  Slide 14 → layout: "conclusion"      — Conclusion and Future Work (use keyTakeaways array, 4-5 items)
  Slide 15 → layout: "thank-you"       — Thank You / Any Questions

CONTENT RULES:
- Slides 3-13: provide "title" (specific, ≤ 8 words) + "bullets" array (4-5 items, each 12-20 words)
- Slide 14: provide "title" + "keyTakeaways" array (4-5 strings)
- Slide 15: provide "thankYouText" and "contactInfo" (can be empty strings)
- Use ONLY information from the document sections supplied in the user message
- Slide titles must be DESCRIPTIVE — not just "Introduction" but e.g. "Challenges Driving This Research"

SLIDE-SPECIFIC REFINEMENT RULES:
- Slide 5 (Problem Statement): Bullets must be assertive statements starting with phrases like
  "Existing systems fail to...", "Current approaches lack...", "The gap in..." or "No prior work addresses..."
  — make the problem concrete and urgent.
- Slide 6 (Research Objectives): Every bullet must be an infinitive phrase starting with "To " —
  e.g. "To investigate...", "To propose...", "To evaluate...", "To design..."
- Slide 7 (Research Scope): Bullets must bound the research clearly using phrases like
  "This study focuses on...", "The research covers...", "Excluded from this study...", "The scope is limited to..."
- Slide 8 (Research Questions): Provide EXACTLY 2-3 numbered research questions formatted as
  "RQ1: How does...?", "RQ2: What is...?", "RQ3: Does...?" — derive these directly from the document.

SPEAKER NOTES (every slide):
- 3-5 complete narrative sentences suitable for reading aloud as video narration
- Must explain the slide's content naturally, as if presenting to an audience

REQUIRED JSON SCHEMA (follow exactly):
{
  "presentationMetadata": {
    "title": "...",
    "theme": {
      "primaryColor": "#1a365d",
      "secondaryColor": "#2c5282",
      "accentColor": "#3182ce",
      "backgroundColor": "#ffffff",
      "fontFamily": "Arial"
    },
    "totalSlides": 15,
    "generatedAt": "2024-01-01T00:00:00Z"
  },
  "slides": [
    {
      "slideNumber": 1,
      "slideId": "slide-001",
      "layout": "title-slide",
      "content": { "title": "...", "subtitle": "...", "author": "...", "date": "..." },
      "speakerNotes": "...",
      "estimatedDuration": 30
    }
  ]
}

Return ONLY valid JSON. No markdown, no explanation.`;
  }

  protected getUserPrompt(documentContent: DocumentContent, language: string = 'en'): string {
    const cs = documentContent.classifiedSections || {};
    const meta = documentContent.metadata;

    // Helper: format a bucket's content — fall back to the raw sections if bucket is empty
    const bucket = (text: string | undefined, fallbackTitle: string): string => {
      if (text && text.trim().length > 40) return text.trim().substring(0, 900);
      // If the classifier found nothing, pull any section whose title loosely matches
      const fallback = documentContent.sections.find(s =>
        s.title.toLowerCase().includes(fallbackTitle.toLowerCase())
      );
      return fallback ? fallback.content.trim().substring(0, 900) : '(Not found in document — synthesise from abstract/context)';
    };

    return `DOCUMENT METADATA:
Title   : ${meta.title}
Authors : ${meta.authors?.join(', ') || 'Unknown'}
Year    : ${new Date().getFullYear()}
Abstract: ${(meta.abstract || '').substring(0, 600)}

EXTRACTED SECTION CONTENT (use this text verbatim as the source for each slide):

[SLIDE 3 — Introduction]
${bucket(cs.introduction, 'introduction')}

[SLIDE 4 — Background]
${bucket(cs.background, 'background')}

[SLIDE 5 — Problem Statement]
${bucket(cs.problemStatement, 'problem')}

[SLIDE 6 — Research Objectives / Research Mission]
${bucket(cs.researchObjectives, 'objective')}

[SLIDE 7 — Research Scope]
${bucket(cs.researchScope, 'scope')}

[SLIDE 8 — Research Questions]
${bucket(cs.researchQuestions, 'research question')}

[SLIDE 9 — Literature Review]
${bucket(cs.literatureReview, 'literature')}

[SLIDE 10 — Methodology / Research Methods / Architecture Design]
${bucket(cs.methodology, 'method')}

[SLIDE 11 — Results / Findings / Experimental Results]
${bucket(cs.results, 'result')}

[SLIDE 12 — Discussion]
${bucket(cs.discussion, 'discussion')}

[SLIDE 13 — Research Limitations]
${bucket(cs.limitations, 'limitation')}

[SLIDE 14 — Conclusion and Future Work]
${bucket(cs.conclusion, 'conclusion')}

TASK:
Generate EXACTLY 15 slides following the fixed structure from the system prompt.
- Slide 1   : title-slide  — use the document Title, Authors, and Year above
- Slide 2   : title-bullets — Agenda listing all 12 content sections: Introduction, Background, Problem Statement, Research Objectives, Research Scope, Research Questions, Literature Review, Methodology, Results, Discussion, Research Limitations, Conclusion & Future Work
- Slides 3-13: title-bullets — use the matching [SLIDE N] section content above for bullet points
- Slide 14  : conclusion    — use the [SLIDE 14] content for keyTakeaways (4-5 items)
- Slide 15  : thank-you     — "Thank You — Any Questions?"

IMPORTANT per-slide rules:
- Slide 5 bullets: assertive problem statements ("Existing systems fail to...", "Current approaches lack...")
- Slide 6 bullets: infinitive objectives ("To investigate...", "To propose...", "To evaluate...")
- Slide 7 bullets: bounding scope statements ("This study focuses on...", "The research covers...")
- Slide 8 bullets: exactly 2-3 numbered research questions ("RQ1: How does...?", "RQ2: What is...?")
- All other slides 3-4, 9-13: concrete, specific points from the supplied text (12-20 words each)

Speaker notes must be 3-5 narrative sentences per slide, suitable for reading aloud.
${language !== 'en' ? `\nFINAL REMINDER: ALL text in the JSON (titles, bullets, notes, everything) must be in language "${language}".` : ''}
Return ONLY the JSON object.`;
  }

  // Stub for generateEnhancedTranscripts - DeepSeek will use speaker notes as-is
  async generateEnhancedTranscripts(slidePlan: SlidePlan, documentContent: DocumentContent): Promise<SlidePlan> {
    console.log('📝 Using speaker notes as transcripts (DeepSeek mode)');
    return slidePlan;
  }

  async analyze(documentContent: DocumentContent, options?: AnalyzeOptions): Promise<SlidePlan> {
    console.log('🤖 Using DeepSeek Chat for slide generation...');
    console.log('📋 Fixed structure: 15 slides');

    const language = options?.language || 'en';
    const systemPrompt = this.getSystemPrompt(language);
    const userPrompt = this.getUserPrompt(documentContent, language);

    try {
      const response = await fetch(`${this.deepseekBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.deepseekApiKey}`
        },
        body: JSON.stringify({
          model: this.deepseekModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_tokens: 8000,
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`DeepSeek API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in DeepSeek response');
      }

      // Parse JSON from response
      let jsonStr = content;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }

      let slidePlan: any;
      try {
        const rawPlan = JSON.parse(jsonStr);
        console.log('✓ Successfully parsed JSON from DeepSeek');

        // Save raw response for debugging
        require('fs').writeFileSync('./output/deepseek-response-raw.json', JSON.stringify(rawPlan, null, 2));

        // Normalize snake_case to camelCase
        slidePlan = normalizeSlidePlan(rawPlan);

        // Validate schema
        const validationResult = validateSlidePlan(slidePlan);
        if (!validationResult.valid) {
          console.warn('⚠️ Slide plan validation warnings:', validationResult.errors);
        }

        return slidePlan;
      } catch (parseError) {
        console.error('Failed to parse DeepSeek response:', parseError);
        console.error('Raw response:', content.substring(0, 500));
        throw new Error('Failed to parse slide plan from DeepSeek response');
      }
    } catch (error) {
      console.error('DeepSeek API error:', error);
      throw error;
    }
  }
}

export function createContentAnalyzer(apiKey?: string): ContentAnalyzer | GeminiContentAnalyzer | DeepSeekContentAnalyzer {
  const provider = process.env.AI_PROVIDER?.toLowerCase() || 'claude';

  if (provider === 'gemini') {
    console.log('🤖 Using Gemini 2.5 Flash (two-stage generation)');
    return new GeminiContentAnalyzer(apiKey || process.env.GEMINI_API_KEY);
  } else if (provider === 'deepseek') {
    console.log('🤖 Using DeepSeek Chat');
    return new DeepSeekContentAnalyzer(apiKey || process.env.DEEPSEEK_API_KEY);
  } else {
    console.log('🤖 Using Claude AI');
    return new ContentAnalyzer(apiKey || process.env.ANTHROPIC_API_KEY);
  }
}
