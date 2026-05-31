// src/modules/pptx-generator.ts

import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import { SlidePlan, SlideDefinition, LayoutType, ChartContent } from '../schemas/slide-plan';

// Import will be dynamic after extraction
let pptxgen: any;

export class PPTXGenerator {
  private templates: Map<LayoutType, HandlebarsTemplateDelegate>;
  private outputDir: string;
  private slidesDir: string;

  private getBulletOptions(fontSize: number, color?: string): any {
    return {
      bullet: { code: '2022', indent: 18, hanging: 6 },
      fontSize,
      color: color || '333333',
      paraSpaceBefore: 4,
      paraSpaceAfter: 4
    };
  }

  private sanitizeColor(color: string | undefined): string {
    if (!color) return '000000';
    return color.replace('#', '');
  }

  constructor(outputDir: string = './output') {
    this.outputDir = outputDir;
    this.slidesDir = path.join(outputDir, 'slides');
    this.templates = new Map();

    // Ensure directories exist
    fs.mkdirSync(this.slidesDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'final'), { recursive: true });

    // Load templates
    this.loadTemplates();
  }

  private loadTemplates(): void {
    const templateDir = path.join(__dirname, '../templates/slide-layouts');
    const layouts: LayoutType[] = [
      'title-slide', 'section-header', 'title-bullets',
      'title-two-columns', 'title-image-text', 'title-chart',
      'title-table', 'title-cards', 'quote-slide',
      'conclusion', 'thank-you'
    ];

    for (const layout of layouts) {
      const templatePath = path.join(templateDir, `${layout}.html`);
      if (fs.existsSync(templatePath)) {
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        this.templates.set(layout, Handlebars.compile(templateSource));
      }
    }
  }

  async generate(slidePlan: SlidePlan, outputPath: string): Promise<string> {
    // Dynamic import
    pptxgen = require('pptxgenjs');

    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';
    pptx.title = slidePlan.presentationMetadata.title;

    // Generate each slide using fallback method (since html2pptx needs to be extracted)
    for (const slide of slidePlan.slides) {
      this.createSlide(pptx, slide, slidePlan.presentationMetadata.theme);
    }

    // Save PPTX
    const finalPath = path.join(this.outputDir, 'final', outputPath);
    await pptx.writeFile({ fileName: finalPath });

    return finalPath;
  }

  private createSlide(pptx: any, slide: SlideDefinition, theme: SlidePlan['presentationMetadata']['theme']): void {
    const pptxSlide = pptx.addSlide();

    switch (slide.layout) {
      case 'title-slide':
        this.createTitleSlide(pptxSlide, slide, theme);
        break;
      case 'section-header':
        this.createSectionHeader(pptxSlide, slide, theme);
        break;
      case 'title-bullets':
        this.createTitleBullets(pptxSlide, slide, theme);
        break;
      case 'title-two-columns':
        this.createTwoColumns(pptxSlide, slide, theme);
        break;
      case 'title-cards':
        this.createCards(pptxSlide, slide, theme);
        break;
      case 'conclusion':
        this.createConclusion(pptxSlide, slide, theme);
        break;
      case 'thank-you':
        this.createThankYou(pptxSlide, slide, theme);
        break;
      case 'title-chart':
        this.createChartSlide(pptxSlide, slide, theme);
        break;
      case 'title-table':
        this.createTableSlide(pptxSlide, slide, theme);
        break;
      default:
        this.createTitleBullets(pptxSlide, slide, theme);
    }

    // Add speaker notes
    if (slide.speakerNotes) {
      pptxSlide.addNotes(slide.speakerNotes);
    }
  }

  private createTitleSlide(slide: any, def: SlideDefinition, theme: any): void {
    slide.background = { fill: theme.primaryColor };

    if (def.content.title) {
      slide.addText(def.content.title, {
        x: 0.5, y: 1.5, w: 9, h: 1.5,
        fontSize: 44, bold: true, color: 'FFFFFF',
        align: 'center', fontFace: theme.fontFamily
      });
    }

    if (def.content.subtitle) {
      slide.addText(def.content.subtitle, {
        x: 0.5, y: 3.2, w: 9, h: 0.6,
        fontSize: 24, color: 'FFFFFF',
        align: 'center', fontFace: theme.fontFamily
      });
    }

    if (def.content.author) {
      slide.addText(def.content.author, {
        x: 0.5, y: 4.5, w: 9, h: 0.4,
        fontSize: 18, color: 'FFFFFF',
        align: 'center', fontFace: theme.fontFamily
      });
    }

    if (def.content.date) {
      slide.addText(def.content.date, {
        x: 0.5, y: 5.0, w: 9, h: 0.3,
        fontSize: 14, color: 'FFFFFF',
        align: 'center', fontFace: theme.fontFamily
      });
    }
  }

  private createSectionHeader(slide: any, def: SlideDefinition, theme: any): void {
    slide.background = { fill: theme.primaryColor };

    if (def.content.sectionNumber) {
      slide.addText(def.content.sectionNumber, {
        x: 0.5, y: 2.0, w: 2, h: 1.5,
        fontSize: 120, bold: true, color: '40FFFFFF',
        fontFace: theme.fontFamily
      });
    }

    if (def.content.sectionTitle) {
      slide.addText(def.content.sectionTitle, {
        x: 3.0, y: 2.2, w: 6.5, h: 1.2,
        fontSize: 48, bold: true, color: 'FFFFFF',
        fontFace: theme.fontFamily
      });
    }
  }

  private createTitleBullets(slide: any, def: SlideDefinition, theme: any): void {
    if (def.content.title) {
      slide.addText(def.content.title, {
        x: 0.5, y: 0.5, w: 9, h: 0.8,
        fontSize: 32, bold: true, color: this.sanitizeColor(theme.primaryColor),
        fontFace: theme.fontFamily || 'Arial'
      });
    }

    if (def.content.bullets && def.content.bullets.length > 0) {
      const bulletText = def.content.bullets.map(b => ({
        text: b.text,
        options: this.getBulletOptions(20, '333333')
      }));

      slide.addText(bulletText, {
        x: 0.75, y: 1.5, w: 8.5, h: 4.0,
        fontFace: theme.fontFamily
      });
    }
  }

  private createTwoColumns(slide: any, def: SlideDefinition, theme: any): void {
    if (def.content.title) {
      slide.addText(def.content.title, {
        x: 0.5, y: 0.5, w: 9, h: 0.7,
        fontSize: 28, bold: true, color: this.sanitizeColor(theme.primaryColor),
        fontFace: theme.fontFamily
      });
    }

    // Left column
    if (def.content.leftColumn) {
      if (def.content.leftColumn.heading) {
        slide.addText(def.content.leftColumn.heading, {
          x: 0.5, y: 1.4, w: 4.25, h: 0.4,
          fontSize: 18, bold: true, color: this.sanitizeColor(theme.secondaryColor),
          fontFace: theme.fontFamily
        });
      }

      // Handle bullets array
      if (def.content.leftColumn.bullets) {
        const leftBullets = def.content.leftColumn.bullets.map(b => ({
          text: b,
          options: this.getBulletOptions(16, this.sanitizeColor(theme.textColor) || '333333')
        }));

        slide.addText(leftBullets, {
          x: 0.65, y: 1.9, w: 4.0, h: 3.5,
          fontFace: theme.fontFamily
        });
      }
      // Handle text array (convert to bullets)
      else if (def.content.leftColumn.text) {
        const textArray = Array.isArray(def.content.leftColumn.text)
          ? def.content.leftColumn.text
          : [def.content.leftColumn.text];

        const leftBullets = textArray.map(t => ({
          text: String(t),
          options: this.getBulletOptions(16, this.sanitizeColor(theme.textColor) || '333333')
        }));

        slide.addText(leftBullets, {
          x: 0.65, y: 1.9, w: 4.0, h: 3.5,
          fontFace: theme.fontFamily
        });
      }
    }

    // Right column
    if (def.content.rightColumn) {
      if (def.content.rightColumn.heading) {
        slide.addText(def.content.rightColumn.heading, {
          x: 5.25, y: 1.4, w: 4.25, h: 0.4,
          fontSize: 18, bold: true, color: this.sanitizeColor(theme.secondaryColor),
          fontFace: theme.fontFamily
        });
      }

      // Handle bullets array
      if (def.content.rightColumn.bullets) {
        const rightBullets = def.content.rightColumn.bullets.map(b => ({
          text: b,
          options: this.getBulletOptions(16, this.sanitizeColor(theme.textColor) || '333333')
        }));

        slide.addText(rightBullets, {
          x: 5.4, y: 1.9, w: 4.0, h: 3.5,
          fontFace: theme.fontFamily
        });
      }
      // Handle text array (convert to bullets)
      else if (def.content.rightColumn.text) {
        const textArray = Array.isArray(def.content.rightColumn.text)
          ? def.content.rightColumn.text
          : [def.content.rightColumn.text];

        const rightBullets = textArray.map(t => ({
          text: String(t),
          options: this.getBulletOptions(16, this.sanitizeColor(theme.textColor) || '333333')
        }));

        slide.addText(rightBullets, {
          x: 5.4, y: 1.9, w: 4.0, h: 3.5,
          fontFace: theme.fontFamily
        });
      }
    }
  }

  private createCards(slide: any, def: SlideDefinition, theme: any): void {
    if (def.content.title) {
      slide.addText(def.content.title, {
        x: 0.5, y: 0.5, w: 9, h: 0.7,
        fontSize: 28, bold: true, color: this.sanitizeColor(theme.primaryColor),
        fontFace: theme.fontFamily
      });
    }

    if (def.content.cards && def.content.cards.length > 0) {
      const cardWidth = (9.5 - (def.content.cards.length - 1) * 0.3) / def.content.cards.length;
      def.content.cards.forEach((card, index) => {
        const x = 0.5 + index * (cardWidth + 0.3);

        // Card background (if shapes are available)
        try {
          const PptxGenJS = require('pptxgenjs');
          slide.addShape(PptxGenJS.shapes.RECTANGLE, {
            x, y: 1.5, w: cardWidth, h: 3.5,
            fill: { color: 'F8FAFC' },
            line: { color: this.sanitizeColor(theme.accentColor), width: 3 }
          });
        } catch (e) {
          // Skip shape if not available
        }

        // Card title
        slide.addText(card.title, {
          x, y: 1.7, w: cardWidth, h: 0.5,
          fontSize: 18, bold: true, color: this.sanitizeColor(theme.primaryColor),
          align: 'center', fontFace: theme.fontFamily
        });

        // Card body
        slide.addText(card.body, {
          x, y: 2.4, w: cardWidth, h: 2.4,
          fontSize: 14, color: '555555',
          align: 'center', valign: 'middle', fontFace: theme.fontFamily
        });
      });
    }
  }

  private createConclusion(slide: any, def: SlideDefinition, theme: any): void {
    if (def.content.title) {
      slide.addText(def.content.title, {
        x: 0.5, y: 0.5, w: 9, h: 0.8,
        fontSize: 32, bold: true, color: this.sanitizeColor(theme.primaryColor),
        fontFace: theme.fontFamily
      });
    }

    if (def.content.keyTakeaways && def.content.keyTakeaways.length > 0) {
      const takeaways = def.content.keyTakeaways.map(t => ({
        text: t,
        options: this.getBulletOptions(22, '333333')
      }));

      slide.addText(takeaways, {
        x: 0.75, y: 1.6, w: 8.5, h: 4.0,
        fontFace: theme.fontFamily
      });
    }
  }

  private createThankYou(slide: any, def: SlideDefinition, theme: any): void {
    slide.background = { fill: theme.primaryColor };

    if (def.content.thankYouText) {
      slide.addText(def.content.thankYouText, {
        x: 0.5, y: 2.0, w: 9, h: 1.2,
        fontSize: 48, bold: true, color: 'FFFFFF',
        align: 'center', fontFace: theme.fontFamily
      });
    }

    if (def.content.contactInfo) {
      slide.addText(def.content.contactInfo, {
        x: 0.5, y: 3.5, w: 9, h: 0.6,
        fontSize: 18, color: 'FFFFFF',
        align: 'center', fontFace: theme.fontFamily
      });
    }
  }

  private createChartSlide(slide: any, def: SlideDefinition, theme: any): void {
    if (def.content.title) {
      slide.addText(def.content.title, {
        x: 0.5, y: 0.5, w: 9, h: 0.7,
        fontSize: 28, bold: true, color: this.sanitizeColor(theme.primaryColor),
        fontFace: theme.fontFamily
      });
    }

    if (def.content.chart) {
      this.addChart(slide, pptxgen, def.content.chart);
    }
  }

  private createTableSlide(slide: any, def: SlideDefinition, theme: any): void {
    if (def.content.title) {
      slide.addText(def.content.title, {
        x: 0.5, y: 0.5, w: 9, h: 0.7,
        fontSize: 28, bold: true, color: this.sanitizeColor(theme.primaryColor),
        fontFace: theme.fontFamily
      });
    }

    if (def.content.table) {
      const tableData = [
        def.content.table.headers,
        ...def.content.table.rows
      ];

      slide.addTable(tableData, {
        x: 0.5, y: 1.5, w: 9, h: 4.0,
        fontSize: 14,
        border: { pt: 1, color: '888888' },
        fill: { color: 'F8FAFC' },
        fontFace: theme.fontFamily
      });
    }
  }

  private addChart(slide: any, pptx: any, chart: ChartContent): void {
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

    slide.addChart(chartType, chartData, {
      x: 1.0, y: 1.5, w: 8.0, h: 4.0,
      showTitle: !!chart.title,
      title: chart.title,
      showLegend: true,
      legendPos: 'b',
      chartColors: ['4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5']
    });
  }
}

export function createPPTXGenerator(outputDir?: string): PPTXGenerator {
  return new PPTXGenerator(outputDir);
}
