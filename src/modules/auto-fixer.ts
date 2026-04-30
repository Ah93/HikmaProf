// src/modules/auto-fixer.ts

import Anthropic from '@anthropic-ai/sdk';
import { SlidePlan, SlideDefinition } from '../schemas/slide-plan';
import { ValidationReport, SlideValidationReport } from '../schemas/validation-report';
import { PPTXGenerator, createPPTXGenerator } from './pptx-generator';
import { EnhancedPPTXGenerator, createEnhancedPPTXGenerator } from './pptx-generator-enhanced';
import { VisualValidator, createVisualValidator } from './visual-validator';

export interface FixResult {
  success: boolean;
  iterations: number;
  finalPptxPath: string;
  finalReport: ValidationReport;
  fixHistory: FixIteration[];
}

export interface FixIteration {
  iteration: number;
  slidesFixed: string[];
  validationReport: ValidationReport;
}

export class AutoFixer {
  private client: Anthropic;
  private model: string = 'claude-sonnet-4-20250514';
  private pptxGenerator: PPTXGenerator | EnhancedPPTXGenerator;
  private validator: VisualValidator;
  private maxIterations: number;
  private validationConcurrency: number;

  private truncateToWords(text: string, maxWords: number): string {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) return '';
    const words = cleaned.split(' ');
    if (words.length <= maxWords) return cleaned;
    return words.slice(0, maxWords).join(' ') + '…';
  }

  private truncateToChars(text: string, maxChars: number): string {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (cleaned.length <= maxChars) return cleaned;
    return cleaned.slice(0, Math.max(0, maxChars - 1)).trimEnd() + '…';
  }

  private limitBulletPoints(
    bullets: any[] | undefined,
    maxBullets: number,
    maxWordsPerBullet: number
  ): any[] | undefined {
    if (!bullets || !Array.isArray(bullets)) return bullets;

    const trimmed = bullets
      .slice(0, maxBullets)
      .map((b: any) => {
        const text = typeof b === 'string' ? b : (b?.text ?? '');
        const next = {
          ...(typeof b === 'object' && b ? b : {}),
          text: this.truncateToWords(String(text), maxWordsPerBullet)
        };
        if (next.subBullets) delete next.subBullets;
        return next;
      })
      .filter((b: any) => String(b?.text || '').trim().length > 0);

    return trimmed;
  }

  constructor(
    outputDir: string = './output',
    maxIterations: number = 5,
    apiKey?: string,
    validationConcurrency: number = 5,
    generatorConfig?: { templateStyle?: string; colorScheme?: string }
  ) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY
    });

    if (generatorConfig?.templateStyle || generatorConfig?.colorScheme) {
      this.pptxGenerator = createEnhancedPPTXGenerator(outputDir, {
        templateStyle: generatorConfig?.templateStyle || 'modern',
        colorScheme: generatorConfig?.colorScheme || 'blue'
      });
    } else {
      this.pptxGenerator = createPPTXGenerator(outputDir);
    }

    this.validator = createVisualValidator(`${outputDir}/validation`, apiKey);
    this.maxIterations = maxIterations;
    this.validationConcurrency = validationConcurrency;
  }

  async fix(
    slidePlan: SlidePlan,
    validationReport: ValidationReport,
    outputFileName: string
  ): Promise<FixResult> {
    const fixHistory: FixIteration[] = [];
    let currentPlan = JSON.parse(JSON.stringify(slidePlan)); // Deep copy
    let currentReport = validationReport;
    let iteration = 0;

    while (
      currentReport.overallStatus !== 'PASS' &&
      iteration < this.maxIterations
    ) {
      iteration++;
      console.log(`Fix iteration ${iteration}...`);

      // Get problematic slides
      const problemSlides = currentReport.slideReports.filter(
        sr => sr.status === 'FAIL' || sr.status === 'WARNING'
      );

      // Fix each problematic slide
      const fixedSlideIds: string[] = [];

      for (const slideReport of problemSlides) {
        const originalSlide = currentPlan.slides.find(
          (s: SlideDefinition) => s.slideId === slideReport.slideId
        );

        if (!originalSlide) continue;

        // Get AI fix suggestion
        const fixedSlide = await this.getFixedSlide(
          originalSlide,
          slideReport
        );

        // Update plan
        const slideIndex = currentPlan.slides.findIndex(
          (s: SlideDefinition) => s.slideId === slideReport.slideId
        );

        if (slideIndex !== -1) {
          currentPlan.slides[slideIndex] = fixedSlide;
          fixedSlideIds.push(fixedSlide.slideId);
        }
      }

      // Regenerate PPTX
      const pptxPath = await this.pptxGenerator.generate(
        currentPlan,
        `${outputFileName}_v${iteration}.pptx`
      );

      // Re-validate
      try {
        currentReport = await this.validator.validate(pptxPath, this.validationConcurrency);
      } catch (error) {
        console.warn('Validation failed, assuming pass:', error);
        currentReport.overallStatus = 'PASS';
        break;
      }

      fixHistory.push({
        iteration,
        slidesFixed: fixedSlideIds,
        validationReport: currentReport
      });

      console.log(
        `Iteration ${iteration}: ${currentReport.passedSlides}/${currentReport.totalSlides} passed`
      );
    }

    // Generate final PPTX
    const finalPath = await this.pptxGenerator.generate(
      currentPlan,
      outputFileName
    );

    return {
      success: currentReport.overallStatus === 'PASS',
      iterations: iteration,
      finalPptxPath: finalPath,
      finalReport: currentReport,
      fixHistory
    };
  }

  private async getFixedSlide(
    originalSlide: SlideDefinition,
    validationReport: SlideValidationReport
  ): Promise<SlideDefinition> {
    const prompt = this.getFixPrompt(originalSlide, validationReport);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2000,
      messages: [
        { role: 'user', content: prompt }
      ]
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      return originalSlide; // Fallback to original
    }

    try {
      let jsonStr = content.text;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1];

      const fixedSlide: SlideDefinition = JSON.parse(jsonStr);

      // Preserve essential fields
      fixedSlide.slideNumber = originalSlide.slideNumber;
      fixedSlide.slideId = originalSlide.slideId;

      return fixedSlide;
    } catch {
      console.error('Failed to parse fix suggestion, applying automatic fixes');
      return this.applyAutomaticFixes(originalSlide, validationReport);
    }
  }

  private getFixPrompt(
    slide: SlideDefinition,
    report: SlideValidationReport
  ): string {
    return `Fix the following slide that has visual issues.

CURRENT SLIDE (JSON):
${JSON.stringify(slide, null, 2)}

VALIDATION ISSUES FOUND:
${report.issues.map(issue => `
- Type: ${issue.type}
- Severity: ${issue.severity}
- Location: ${issue.location}
- Description: ${issue.description}
- Suggested Fix: ${issue.suggestedFix}
`).join('\n')}

FIX RULES:
1. Prioritize fixing TEXT_OVERFLOW and TEXT_OVERLAP first.
2. Prefer reducing/condensing content over changing layout.
3. Remove sub-bullets if present.
4. If overlap/overflow persists, reduce the number of bullets and shorten each bullet.
5. Hard limits (apply when relevant):
   - Title / Section title: MAX 7 words.
   - Body text: MAX 35 words.
   - Bullets: MAX 5 bullets, MAX 10 words each.
   - Two-column: each column MAX 3 bullets, MAX 8 words each.
   - Cards: MAX 3 cards, title MAX 4 words, body MAX 16 words.
6. Keep the output strictly compatible with SlideDefinition schema.

Return ONLY the FIXED slide definition as raw JSON (no markdown, no code fences, no commentary).`;
  }

  private applyAutomaticFixes(
    slide: SlideDefinition,
    report: SlideValidationReport
  ): SlideDefinition {
    const fixed = JSON.parse(JSON.stringify(slide)) as SlideDefinition;

    const hasHighSeverity = report.issues.some(i => i.severity === 'CRITICAL' || i.severity === 'HIGH');
    const hasOverflowOrOverlap = report.issues.some(i => i.type === 'TEXT_OVERFLOW' || i.type === 'TEXT_OVERLAP');

    const titleWordCap = hasOverflowOrOverlap ? 7 : 8;
    const bulletCountCap = hasHighSeverity ? 4 : 5;
    const bulletWordCap = hasHighSeverity ? 8 : 10;
    const columnBulletCountCap = hasHighSeverity ? 2 : 3;
    const columnBulletWordCap = hasHighSeverity ? 7 : 8;
    const bodyTextWordCap = hasHighSeverity ? 28 : 35;
    const cardCountCap = hasHighSeverity ? 2 : 3;
    const cardTitleWordCap = 4;
    const cardBodyWordCap = hasHighSeverity ? 14 : 16;

    const content: any = fixed.content || (fixed.content = {});

    const extractBulletTexts = (bullets: any[]): string[] => {
      return (bullets || [])
        .map((b: any) => (typeof b === 'string' ? b : (b?.text ?? '')))
        .map((t: any) => String(t).trim())
        .filter((t: string) => t.length > 0);
    };

    const bulletsToCards = (bulletTexts: string[]) => {
      const cards = bulletTexts.slice(0, cardCountCap).map((t: string) => {
        const parts = t.split(/\s*[:\-–]\s*/);
        const title = this.truncateToWords(String(parts[0] || t), cardTitleWordCap);
        const body = this.truncateToWords(String(parts.slice(1).join(' ') || t), cardBodyWordCap);
        return { title, body };
      });
      fixed.layout = 'title-cards';
      content.cards = cards;
      delete content.bullets;
      delete content.leftColumn;
      delete content.rightColumn;
    };

    const maybeUpgradeBulletsToCardsForVisuals = () => {
      if (fixed.layout !== 'title-bullets') return;
      if (!content.bullets || !Array.isArray(content.bullets)) return;

      const bulletTexts = extractBulletTexts(content.bullets);
      if (bulletTexts.length < 2) return;
      if (bulletTexts.length > 4) return;

      const avgWords = bulletTexts.reduce((acc, t) => acc + String(t).split(/\s+/).filter(Boolean).length, 0) / Math.max(1, bulletTexts.length);
      if (avgWords > 10) return;

      bulletsToCards(bulletTexts);
    };

    // If content is dense and causing overflow/overlap, try switching layout before trimming.
    // This keeps meaning while giving more space.
    if (
      hasOverflowOrOverlap &&
      fixed.layout === 'title-bullets' &&
      content.bullets &&
      Array.isArray(content.bullets) &&
      content.bullets.length >= 6
    ) {
      const bulletTexts = extractBulletTexts(content.bullets);

      if (bulletTexts.length >= 6) {
        const mid = Math.ceil(bulletTexts.length / 2);
        fixed.layout = 'title-two-columns';
        content.leftColumn = { bullets: bulletTexts.slice(0, mid) };
        content.rightColumn = { bullets: bulletTexts.slice(mid) };
        delete content.bullets;
      }
    }

    // If we still have overflow/overlap on title-bullets but bullet count is moderate,
    // switching to cards often removes overlap while staying visually engaging.
    if (
      hasOverflowOrOverlap &&
      fixed.layout === 'title-bullets' &&
      content.bullets &&
      Array.isArray(content.bullets)
    ) {
      const bulletTexts = extractBulletTexts(content.bullets);
      if (bulletTexts.length >= 2 && bulletTexts.length <= 4) {
        bulletsToCards(bulletTexts);
      }
    }

    // Even without validation issues, prefer more visual cards when bullets are short.
    // This addresses "choose creative visuals" without inventing data.
    if (!hasOverflowOrOverlap) {
      maybeUpgradeBulletsToCardsForVisuals();
    }

    const trimAllBullets = () => {
      if (content.bullets) {
        content.bullets = this.limitBulletPoints(content.bullets, bulletCountCap, bulletWordCap);
      }
    };

    const trimSingleBullet = (index0: number) => {
      if (!content.bullets || !Array.isArray(content.bullets)) return;
      if (!content.bullets[index0]) return;
      const b = content.bullets[index0];
      const text = typeof b === 'string' ? b : (b?.text ?? '');
      if (typeof b === 'string') {
        content.bullets[index0] = this.truncateToWords(String(text), bulletWordCap);
      } else {
        content.bullets[index0].text = this.truncateToWords(String(text), bulletWordCap);
        if (content.bullets[index0].subBullets) delete content.bullets[index0].subBullets;
      }
    };

    const trimColumn = (col: any) => {
      if (!col || typeof col !== 'object') return;
      if (col.heading) col.heading = this.truncateToWords(String(col.heading), 5);
      if (col.bullets && Array.isArray(col.bullets)) {
        col.bullets = col.bullets
          .slice(0, columnBulletCountCap)
          .map((t: any) => this.truncateToWords(String(t), columnBulletWordCap));
      }
      if (col.text) {
        if (Array.isArray(col.text)) {
          col.text = col.text
            .slice(0, columnBulletCountCap)
            .map((t: any) => this.truncateToWords(String(t), columnBulletWordCap));
        } else {
          col.text = this.truncateToWords(String(col.text), bodyTextWordCap);
        }
      }
    };

    const trimCards = () => {
      if (content.cards && Array.isArray(content.cards)) {
        content.cards = content.cards
          .slice(0, cardCountCap)
          .map((c: any) => ({
            ...c,
            title: this.truncateToWords(String(c?.title ?? ''), cardTitleWordCap),
            body: this.truncateToWords(String(c?.body ?? ''), cardBodyWordCap)
          }))
          .filter((c: any) => String(c?.title || '').trim().length > 0 || String(c?.body || '').trim().length > 0);
      }
    };

    const trimTable = () => {
      if (content.table && typeof content.table === 'object') {
        if (Array.isArray(content.table.headers)) {
          content.table.headers = content.table.headers.slice(0, 6).map((h: any) => this.truncateToWords(String(h), 3));
        }
        if (Array.isArray(content.table.rows)) {
          content.table.rows = content.table.rows.slice(0, 6).map((row: any) => {
            if (!Array.isArray(row)) return row;
            return row.slice(0, 6).map((cell: any) => this.truncateToWords(String(cell), 5));
          });
        }
        if (content.table.caption) content.table.caption = this.truncateToWords(String(content.table.caption), 8);
      }
    };

    const trimChart = () => {
      if (content.chart && typeof content.chart === 'object') {
        if (content.chart.title) content.chart.title = this.truncateToWords(String(content.chart.title), 6);
        if (content.chart.data && Array.isArray(content.chart.data.labels)) {
          content.chart.data.labels = content.chart.data.labels.slice(0, 8).map((l: any) => this.truncateToWords(String(l), 2));
        }
        if (content.chart.data && Array.isArray(content.chart.data.datasets)) {
          content.chart.data.datasets = content.chart.data.datasets.slice(0, 3).map((ds: any) => ({
            ...ds,
            name: this.truncateToWords(String(ds?.name ?? ''), 3),
            values: Array.isArray(ds?.values) ? ds.values.slice(0, 8) : ds?.values
          }));
        }
      }
    };

    let appliedAnyTargetedFix = false;

    for (const issue of report.issues) {
      const loc = String(issue.location || '').toLowerCase();

      let appliedThisIssue = false;

      const applyTargeted = () => {
        // Title / section title
        if (loc.includes('title')) {
          if (content.title) content.title = this.truncateToWords(String(content.title), titleWordCap);
          if (content.sectionTitle) content.sectionTitle = this.truncateToWords(String(content.sectionTitle), titleWordCap);
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Subtitle
        if (loc.includes('subtitle')) {
          if (content.subtitle) content.subtitle = this.truncateToWords(String(content.subtitle), 10);
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Body text
        if (loc.includes('body') || loc.includes('bodytext')) {
          if (content.bodyText) content.bodyText = this.truncateToWords(String(content.bodyText), bodyTextWordCap);
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Footnote
        if (loc.includes('footnote')) {
          if (content.footnote) content.footnote = this.truncateToChars(String(content.footnote), 80);
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Bullets (specific bullet-x or generic bullet)
        const bulletMatch = loc.match(/bullet\s*[-_]?\s*(\d+)/);
        if (bulletMatch) {
          const idx1 = parseInt(bulletMatch[1], 10);
          if (!Number.isNaN(idx1) && idx1 > 0) {
            trimSingleBullet(idx1 - 1);
            appliedAnyTargetedFix = true;
            appliedThisIssue = true;
            return;
          }
        }
        if (loc.includes('bullet')) {
          trimAllBullets();
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Two-column
        if (loc.includes('left') && loc.includes('column')) {
          if (content.leftColumn) trimColumn(content.leftColumn);
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }
        if (loc.includes('right') && loc.includes('column')) {
          if (content.rightColumn) trimColumn(content.rightColumn);
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }
        if (loc.includes('column')) {
          if (content.leftColumn) trimColumn(content.leftColumn);
          if (content.rightColumn) trimColumn(content.rightColumn);
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Cards
        if (loc.includes('card')) {
          trimCards();
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Quote
        if (loc.includes('quote')) {
          if (content.quote && typeof content.quote === 'object') {
            if (content.quote.text) content.quote.text = this.truncateToWords(String(content.quote.text), hasHighSeverity ? 24 : 30);
            if (content.quote.attribution) content.quote.attribution = this.truncateToWords(String(content.quote.attribution), 6);
          }
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Table
        if (loc.includes('table')) {
          trimTable();
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Chart
        if (loc.includes('chart')) {
          trimChart();
          appliedAnyTargetedFix = true;
          appliedThisIssue = true;
          return;
        }

        // Conclusion key takeaways
        if (loc.includes('takeaway') || loc.includes('key')) {
          if (content.keyTakeaways && Array.isArray(content.keyTakeaways)) {
            content.keyTakeaways = content.keyTakeaways
              .slice(0, bulletCountCap)
              .map((t: any) => this.truncateToWords(String(t), bulletWordCap));
            appliedAnyTargetedFix = true;
            appliedThisIssue = true;
            return;
          }
        }
      };

      switch (issue.type) {
        case 'TEXT_OVERFLOW':
        case 'CONTENT_TOO_DENSE':
          applyTargeted();
          break;

        case 'TEXT_OVERLAP':
          applyTargeted();

          // If overlap location is unclear, reduce the most common culprits a bit.
          if (!appliedThisIssue) {
            if (content.bullets) {
              content.bullets = this.limitBulletPoints(content.bullets, hasHighSeverity ? 3 : 4, hasHighSeverity ? 7 : 9);
            }
            if (content.bodyText) {
              content.bodyText = this.truncateToWords(String(content.bodyText), hasHighSeverity ? 22 : 28);
            }
          }
          break;
      }
    }

    // Fallback: if we couldn't map locations (or for high severity), do a conservative global trim.
    if (!appliedAnyTargetedFix && hasOverflowOrOverlap) {
      if (content.title) content.title = this.truncateToWords(String(content.title), titleWordCap);
      if (content.sectionTitle) content.sectionTitle = this.truncateToWords(String(content.sectionTitle), titleWordCap);
      if (content.subtitle) content.subtitle = this.truncateToWords(String(content.subtitle), 10);
      if (content.bodyText) content.bodyText = this.truncateToWords(String(content.bodyText), bodyTextWordCap);
      trimAllBullets();
      if (content.leftColumn) trimColumn(content.leftColumn);
      if (content.rightColumn) trimColumn(content.rightColumn);
      trimCards();
      trimTable();
      trimChart();
    }

    return fixed;
  }
}

export function createAutoFixer(
  outputDir?: string,
  maxIterations?: number,
  apiKey?: string,
  validationConcurrency?: number,
  generatorConfig?: { templateStyle?: string; colorScheme?: string }
): AutoFixer {
  return new AutoFixer(outputDir, maxIterations, apiKey, validationConcurrency, generatorConfig);
}
