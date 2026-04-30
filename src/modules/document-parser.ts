// src/modules/document-parser.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import pdf from 'pdf-parse';
import { DocumentContent, Section, Figure, TableData, Reference, ClassifiedSections } from '../schemas/document-content';

const execPromise = promisify(exec);

export class DocumentParser {
  private outputDir: string;

  constructor(outputDir: string = './output/parsed') {
    this.outputDir = outputDir;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  async parse(filePath: string): Promise<DocumentContent> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return this.parsePDF(filePath);
      case '.docx':
        return this.parseDOCX(filePath);
      case '.tex':
        return this.parseLaTeX(filePath);
      default:
        throw new Error(`Unsupported format: ${ext}`);
    }
  }

  private async parsePDF(filePath: string): Promise<DocumentContent> {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);

    // Extract images using pdftoppm (if available)
    const imageDir = path.join(this.outputDir, 'images');
    fs.mkdirSync(imageDir, { recursive: true });

    try {
      await execPromise(
        `pdftoppm -png "${filePath}" "${imageDir}/page"`
      );
    } catch (error) {
      console.warn('pdftoppm not available, skipping image extraction');
    }

    console.log('Raw PDF text length:', data.text.length);
    console.log('First 500 chars:', data.text.substring(0, 500));
    
    const structured = this.structureContent(data.text, filePath, 'pdf');
    console.log('Extracted sections count:', structured.sections.length);
    
    // If no sections were found, use fallback content chunking
    if (structured.sections.length === 0) {
      console.log('No sections found, using fallback content chunking...');
      return this.fallbackContentChunking(data.text, filePath, 'pdf');
    }
    
    return structured;
  }

  private async parseDOCX(filePath: string): Promise<DocumentContent> {
    const mdPath = path.join(this.outputDir, 'content.md');
    const mediaDir = path.join(this.outputDir, 'media');

    try {
      // Convert to markdown with media extraction
      await execPromise(
        `pandoc "${filePath}" -o "${mdPath}" --extract-media="${mediaDir}"`
      );

      const markdown = fs.readFileSync(mdPath, 'utf-8');
      return this.parseMarkdown(markdown, filePath, 'docx', mediaDir);
    } catch (error) {
      throw new Error(`Failed to parse DOCX: ${error}`);
    }
  }

  private async parseLaTeX(filePath: string): Promise<DocumentContent> {
    const mdPath = path.join(this.outputDir, 'content.md');

    try {
      await execPromise(
        `pandoc "${filePath}" -o "${mdPath}" --from=latex`
      );

      const markdown = fs.readFileSync(mdPath, 'utf-8');
      return this.parseMarkdown(markdown, filePath, 'tex');
    } catch (error) {
      throw new Error(`Failed to parse LaTeX: ${error}`);
    }
  }

  private structureContent(
    rawText: string,
    sourceFile: string,
    format: 'pdf' | 'docx' | 'tex'
  ): DocumentContent {
    // Parse sections by detecting headers
    const sections = this.extractSections(rawText);
    const metadata = this.extractMetadata(rawText, sections);

    const classifiedSections = this.classifySections(sections, rawText);

    return {
      metadata: {
        title: metadata.title || 'Untitled',
        authors: metadata.authors || [],
        abstract: metadata.abstract,
        keywords: metadata.keywords,
        sourceFile,
        sourceFormat: format,
        extractedAt: new Date().toISOString()
      },
      sections,
      figures: [],
      tables: [],
      references: this.extractReferences(rawText),
      classifiedSections
    };
  }

  private parseMarkdown(
    markdown: string,
    sourceFile: string,
    format: 'docx' | 'tex',
    mediaDir?: string
  ): DocumentContent {
    const sections = this.extractSectionsFromMarkdown(markdown);
    const metadata = this.extractMetadataFromMarkdown(markdown);
    const figures = mediaDir ? this.extractFigures(markdown, mediaDir) : [];
    const tables = this.extractTables(markdown);

    return {
      metadata: {
        title: metadata.title || 'Untitled',
        authors: metadata.authors || [],
        abstract: metadata.abstract,
        keywords: metadata.keywords,
        sourceFile,
        sourceFormat: format,
        extractedAt: new Date().toISOString()
      },
      sections,
      figures,
      tables,
      references: this.extractReferences(markdown)
    };
  }

  private extractSections(text: string): Section[] {
    const sections: Section[] = [];

    // Split by likely section boundaries
    const lines = text.split('\n');
    let currentSection: Partial<Section> | null = null;
    let sectionIndex = 0;

    for (const line of lines) {
      const headerMatch = this.matchHeader(line);

      if (headerMatch) {
        // Save previous section
        if (currentSection && currentSection.content) {
          sections.push(this.finalizeSection(currentSection, sectionIndex));
          sectionIndex++;
        }

        // Start new section
        currentSection = {
          id: `section-${sectionIndex + 1}`,
          level: headerMatch.level,
          title: headerMatch.title,
          content: ''
        };
      } else if (currentSection) {
        currentSection.content += line + '\n';
      }
    }

    // Don't forget the last section
    if (currentSection && currentSection.content) {
      sections.push(this.finalizeSection(currentSection, sectionIndex));
    }

    return sections;
  }

  private matchHeader(line: string): { level: number; title: string } | null {
    const cleanLine = line.trim();
    if (!cleanLine) return null;

    // 1. Markdown headers (e.g., "## Title")
    const mdMatch = cleanLine.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      return { level: mdMatch[1].length, title: mdMatch[2].trim() };
    }

    // 2. Common academic sections (expanded list with more variations)
    const commonSections = [
      'ABSTRACT', 'INTRODUCTION', 'BACKGROUND', 'RELATED WORK', 
      'LITERATURE REVIEW', 'METHODOLOGY', 'METHODS', 'APPROACH', 
      'EXPERIMENTS', 'EXPERIMENTAL SETUP', 'RESULTS', 'ANALYSIS',
      'DISCUSSION', 'CONCLUSION', 'CONCLUSIONS', 'FUTURE WORK', 
      'REFERENCES', 'BIBLIOGRAPHY', 'ACKNOWLEDGMENTS', 'APPENDIX',
      'MOTIVATION', 'PROBLEM STATEMENT', 'OBJECTIVES', 'CONTRIBUTIONS',
      'EVALUATION', 'IMPLEMENTATION', 'DATASET', 'MATERIALS', 'PROCEDURE'
    ];
    
    // Check for exact matches (case-insensitive, allowing colons/periods)
    const normalizedLine = cleanLine.toUpperCase().replace(/[:.]/g, '').trim();
    if (commonSections.includes(normalizedLine)) {
      return { level: 1, title: cleanLine };
    }

    // 3. Numbered sections (more flexible patterns)
    // 3a. Standard numbering: "1. Title" or "1 Title"
    const numMatch = cleanLine.match(/^(\d+)\.?\s+([A-Z0-9].{2,150})$/);
    if (numMatch) {
      const title = numMatch[2].trim();
      // Exclude list items (usually shorter and end with lowercase)
      if (title.length > 10 && title[0] === title[0].toUpperCase()) {
        return { level: 1, title: title };
      }
    }

    // 3b. Subsections: "1.1 Title" or "1.1. Title"
    const subMatch = cleanLine.match(/^(\d+(?:\.\d+)*)\.?\s+([A-Z0-9].{2,150})$/);
    if (subMatch) {
      const level = subMatch[1].split('.').length;
      const title = subMatch[2].trim();
      if (title.length > 8) {
        return { level: Math.min(level, 4), title: title };
      }
    }

    // 3c. Roman Numerals: "I. Introduction" or "II. Background"
    const romanMatch = cleanLine.match(/^([IVX]+)\.?\s+([A-Z0-9].{2,150})$/);
    if (romanMatch) {
      return { level: 1, title: romanMatch[2].trim() };
    }

    // 4. All Caps Headers (more relaxed)
    if (/^[A-Z][A-Z0-9\s\-:]{5,80}$/.test(cleanLine) && 
        !cleanLine.includes('  ') && 
        cleanLine.split(' ').length >= 2 &&
        cleanLine.split(' ').length <= 8) {
      return { level: 1, title: cleanLine };
    }

    // 5. Title Case headers (common in many documents)
    if (/^[A-Z][a-zA-Z\s\-:]{8,80}$/.test(cleanLine) &&
        cleanLine.split(' ').length >= 2 &&
        cleanLine.split(' ').length <= 10 &&
        !cleanLine.endsWith('.') &&
        !cleanLine.toLowerCase().includes('the') &&
        !cleanLine.toLowerCase().includes('this')) {
      return { level: 2, title: cleanLine };
    }

    return null;
  }

  private finalizeSection(section: Partial<Section>, index: number): Section {
    const content = (section.content || '').trim();
    const bulletPoints = this.extractBulletPoints(content);

    return {
      id: section.id || `section-${index + 1}`,
      level: section.level || 1,
      title: section.title || `Section ${index + 1}`,
      content,
      bulletPoints: bulletPoints.length > 0 ? bulletPoints : undefined,
      wordCount: content.split(/\s+/).filter(w => w.length > 0).length
    };
  }

  private extractBulletPoints(content: string): string[] {
    const bullets: string[] = [];
    const patterns = [
      /^[-•*]\s+(.+)$/gm,
      /^\d+\)\s+(.+)$/gm,
      /^[a-z]\)\s+(.+)$/gm
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        bullets.push(match[1].trim());
      }
    }

    return bullets;
  }

  private extractMetadata(text: string, sections: Section[]): Partial<DocumentContent['metadata']> {
    // Try to find title from first section or prominent text
    let title = 'Untitled Document';
    if (sections.length > 0) {
      title = sections[0].title;
    }

    // Extract authors (common patterns)
    const authorPatterns = [
      /Author[s]?:\s*(.+)/i,
      /By:\s*(.+)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)(?:\s*,\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+))*$/m
    ];

    let authors: string[] = [];
    for (const pattern of authorPatterns) {
      const match = text.match(pattern);
      if (match) {
        authors = match[1].split(/,|and/).map(a => a.trim()).filter(a => a.length > 0);
        break;
      }
    }

    // Extract abstract
    const abstractMatch = text.match(/abstract[:\s]*\n?([\s\S]{50,1000}?)(?=\n\n|\n[A-Z])/i);
    const abstract = abstractMatch ? abstractMatch[1].trim() : undefined;

    return { title, authors, abstract };
  }

  private extractMetadataFromMarkdown(markdown: string): Partial<DocumentContent['metadata']> {
    // YAML frontmatter parsing
    const frontmatterMatch = markdown.match(/^---\n([\s\S]*?)\n---/);

    if (frontmatterMatch) {
      const yaml = frontmatterMatch[1];
      const titleMatch = yaml.match(/title:\s*["']?(.+?)["']?\s*$/m);
      const authorMatch = yaml.match(/author:\s*(.+)/m);

      return {
        title: titleMatch ? titleMatch[1] : 'Untitled',
        authors: authorMatch ? [authorMatch[1]] : []
      };
    }

    // Fall back to first H1 as title
    const h1Match = markdown.match(/^#\s+(.+)$/m);
    return {
      title: h1Match ? h1Match[1] : 'Untitled Document',
      authors: []
    };
  }

  private extractSectionsFromMarkdown(markdown: string): Section[] {
    const sections: Section[] = [];
    const headerRegex = /^(#{1,6})\s+(.+)$/gm;

    let lastIndex = 0;
    let lastSection: Partial<Section> | null = null;
    let match;
    let sectionIndex = 0;

    while ((match = headerRegex.exec(markdown)) !== null) {
      // Save previous section
      if (lastSection) {
        lastSection.content = markdown.slice(lastIndex, match.index).trim();
        sections.push(this.finalizeSection(lastSection, sectionIndex - 1));
      }

      lastSection = {
        id: `section-${sectionIndex + 1}`,
        level: match[1].length,
        title: match[2].trim()
      };

      lastIndex = match.index + match[0].length;
      sectionIndex++;
    }

    // Last section
    if (lastSection) {
      lastSection.content = markdown.slice(lastIndex).trim();
      sections.push(this.finalizeSection(lastSection, sectionIndex - 1));
    }

    return sections;
  }

  private extractFigures(markdown: string, mediaDir: string): Figure[] {
    const figures: Figure[] = [];
    const imgRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

    let match;
    let figIndex = 0;

    while ((match = imgRegex.exec(markdown)) !== null) {
      figures.push({
        id: `figure-${figIndex + 1}`,
        caption: match[1] || `Figure ${figIndex + 1}`,
        imagePath: path.join(mediaDir, match[2])
      });
      figIndex++;
    }

    return figures;
  }

  private extractTables(markdown: string): TableData[] {
    const tables: TableData[] = [];
    // Markdown table pattern
    const tableRegex = /\|(.+)\|\n\|[-:\s|]+\|\n((?:\|.+\|\n?)+)/g;

    let match;
    let tableIndex = 0;

    while ((match = tableRegex.exec(markdown)) !== null) {
      const headerRow = match[1].split('|').map(h => h.trim()).filter(h => h);
      const bodyRows = match[2].trim().split('\n').map(row =>
        row.split('|').map(cell => cell.trim()).filter(cell => cell)
      );

      tables.push({
        id: `table-${tableIndex + 1}`,
        headers: headerRow,
        rows: bodyRows
      });
      tableIndex++;
    }

    return tables;
  }

  private extractReferences(text: string): Reference[] {
    // This is a simplified reference extraction
    const references: Reference[] = [];
    const refSection = text.match(/references?\s*\n([\s\S]+?)(?=\n\n\n|\n[A-Z]|$)/i);

    if (refSection) {
      const refLines = refSection[1].split(/\n(?=\[|\d+\.)/);
      refLines.forEach((ref, index) => {
        if (ref.trim().length > 10) {
          references.push({
            id: `ref-${index + 1}`,
            authors: [],
            title: ref.trim().slice(0, 200)
          });
        }
      });
    }

    return references;
  }

  private fallbackContentChunking(
    rawText: string,
    sourceFile: string,
    format: 'pdf' | 'docx' | 'tex'
  ): DocumentContent {
    console.log('Using fallback content chunking...');
    
    // Clean and prepare text
    const cleanedText = rawText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Extract metadata first
    const metadata = this.extractMetadata(cleanedText, []);

    // Split text into reasonable chunks (approximately 300-500 words each)
    const words = cleanedText.split(' ');
    const chunkSize = 400; // words per chunk
    const sections: Section[] = [];

    // Create sections from chunks
    for (let i = 0; i < words.length; i += chunkSize) {
      const chunkWords = words.slice(i, Math.min(i + chunkSize, words.length));
      const chunkText = chunkWords.join(' ').trim();
      
      if (chunkText.length > 100) { // Only include substantial chunks
        const sectionNum = Math.floor(i / chunkSize) + 1;
        sections.push({
          id: `section-${sectionNum}`,
          level: 1,
          title: `Section ${sectionNum}${sectionNum === 1 ? ': Introduction' : sectionNum === Math.ceil(words.length / chunkSize) ? ': Conclusion' : ''}`,
          content: chunkText,
          wordCount: chunkWords.length,
          bulletPoints: this.extractBulletPoints(chunkText)
        });
      }
    }

    // Try to identify logical breaks for better section titles
    this.improveSectionTitles(sections, cleanedText);

    console.log(`Created ${sections.length} sections using fallback chunking`);

    const classifiedSections = this.classifySections(sections, cleanedText);

    return {
      metadata: {
        title: metadata.title || 'Document Analysis',
        authors: metadata.authors || [],
        abstract: metadata.abstract,
        keywords: metadata.keywords,
        sourceFile,
        sourceFormat: format,
        extractedAt: new Date().toISOString()
      },
      sections,
      figures: [],
      tables: [],
      references: this.extractReferences(cleanedText),
      classifiedSections
    };
  }

  /**
   * Maps raw extracted sections into the 9 fixed slide content buckets.
   * Tries title-based matching first, then falls back to keyword scanning of content.
   * Merges multiple matching sub-sections into one block (up to 900 chars each).
   */
  private classifySections(sections: Section[], fullRawText: string): ClassifiedSections {
    const LIMIT = 900; // chars per bucket – enough for DeepSeek to work from

    const rules: Array<{
      key: keyof ClassifiedSections;
      titlePatterns: RegExp;
      contentPatterns: RegExp;
    }> = [
      {
        key: 'introduction',
        titlePatterns: /\bintroduction\b/i,
        contentPatterns: /\bintroduc\w*\b|\boverall\b|\bpresents?\b|\baims?\b|\bpurpose\b/i
      },
      {
        key: 'background',
        titlePatterns: /\bbackground\b|\bpreliminar\w*\b|\bfoundation\w*\b|\bprerequisite\w*\b/i,
        contentPatterns: /\bbackground\b|\bfundamental\w*\b|\bprecursor\w*\b|\btheoretical\b|\bprinciples?\b/i
      },
      {
        key: 'problemStatement',
        titlePatterns: /\bproblem\s+statement\b|\bproblem\s+formulation\b|\bproblem\b|\bchallenge\w*\b|\bmotivation\b|\bresearch\s+problem\b|\bgap\b/i,
        contentPatterns: /\bproblem\b|\bchallenge\b|\bgap\b|\bissue\b|\black\s+of\b|\binsufficient\b|\bno\s+existing\b|\bunresolved\b|\bneed\s+for\b/i
      },
      {
        key: 'researchObjectives',
        titlePatterns: /\bresearch\s+objective\w*\b|\bobjective\w*\b|\bgoal\w*\b|\baim\w*\b|\bpurpose\w*\b|\bresearch\s+mission\b|\bcontribution\w*\b/i,
        contentPatterns: /\bobj(?:ective)?\w*\b|\bto\s+(?:investigate|develop|propose|evaluate|analyze|design|implement|improve|address)\b|\bgoal\b|\baim\s+(?:is|to|of)\b/i
      },
      {
        key: 'researchScope',
        titlePatterns: /\bscope\b|\bscope\s+of\b|\bdelimitation\w*\b|\bboundary\b|\bboundaries\b|\bstudy\s+scope\b|\bscope\s+and\s+limitation\w*\b/i,
        contentPatterns: /\bscope\b|\bbound\w*\b|\bfocus\w*\s+on\b|\blimited\s+to\b|\bconfin\w*\s+to\b|\bthis\s+(?:study|work|research)\s+(?:focuses|covers|addresses|examines)\b/i
      },
      {
        key: 'researchQuestions',
        titlePatterns: /\bresearch\s+question\w*\b|\bRQ\d?\b|\bguiding\s+question\w*\b|\bstudy\s+question\w*\b/i,
        contentPatterns: /\bRQ\d\b|\bresearch\s+question\b|\bhow\s+(?:does|can|do|is)\b|\bwhat\s+(?:is|are|factors)\b|\bdoes\s+\w+\s+(?:affect|improve|impact)\b/i
      },
      {
        key: 'literatureReview',
        titlePatterns: /\bliterature\b|\brelated\s+work\b|\bprior\s+work\b|\bprevious\s+work\b|\bstate[\s\-]of[\s\-]the[\s\-]art\b|\bsurvey\b|\brelated\s+stud\w*\b|\bexisting\s+(methods?|approaches?|work)\b/i,
        contentPatterns: /\breviewed?\b|\bcited?\b|\bproposed\s+by\b|\bprevious\s+(studies|research|work)\b|\bexisting\b/i
      },
      {
        key: 'methodology',
        titlePatterns: /\b(research\s+)?method\w*\b|\bapproach\b|\bproposed\b|\barchitecture\b|\bframework\b|\bdesign\b|\balgorithm\b|\bimplementation\b|\bexperimental\s+setup\b|\bsystem\s+design\b/i,
        contentPatterns: /\bmethod\w*\b|\bmodel\b|\barchitecture\b|\btraining\b|\balgorithm\b|\bpipeline\b|\bimplemented\b/i
      },
      {
        key: 'results',
        titlePatterns: /\bresults?\b|\bfindings?\b|\bexperiment\w*\b|\bevaluation\b|\bperformance\b|\bbenchmark\w*\b|\boutcome\w*\b/i,
        contentPatterns: /\baccuracy\b|\bprecision\b|\brecall\b|\bf1\b|\bperformance\b|\bscore\b|\bimprove\w*\b|\boutperform\w*\b/i
      },
      {
        key: 'discussion',
        titlePatterns: /\bdiscussion\b|\banalysis\b|\binterpretation\b|\bimplication\w*\b|\binsight\w*\b/i,
        contentPatterns: /\bsuggests?\b|\bindicates?\b|\bimplies?\b|\bthis\s+shows?\b|\bwhereas\b|\bhowever\b|\bcompar\w*\b/i
      },
      {
        key: 'limitations',
        titlePatterns: /\blimitation\w*\b|\bconstraint\w*\b|\bthreats?\b|\bweakness\w*\b|\bassumption\w*\b/i,
        contentPatterns: /\blimit\w*\b|\bconstraint\w*\b|\bnot\s+\w*\bconsidered\b|\bscope\s+of\s+the\s+study\b/i
      },
      {
        key: 'conclusion',
        titlePatterns: /\bconclusion\w*\b|\bsummary\b|\bfuture\s+work\b|\bclosing\b|\boutlook\b/i,
        contentPatterns: /\bconclude\w*\b|\bsummariz\w*\b|\bin\s+this\s+(paper|study|work)\b|\bfuture\s+(work|research|direction)\b/i
      }
    ];

    const classified: ClassifiedSections = {};

    for (const rule of rules) {
      // Collect content from all sections that match by title
      const titleMatches = sections.filter(s => rule.titlePatterns.test(s.title));

      if (titleMatches.length > 0) {
        classified[rule.key] = titleMatches
          .map(s => s.content.trim())
          .join('\n\n')
          .substring(0, LIMIT);
        continue;
      }

      // Fallback: scan content of every section for domain keywords
      const contentMatches = sections.filter(
        s => !s.title.match(/abstract|reference|bibliograph|appendix|acknowledgment|keyword/i) &&
             rule.contentPatterns.test(s.content)
      );

      if (contentMatches.length > 0) {
        classified[rule.key] = contentMatches
          .map(s => s.content.trim())
          .join('\n\n')
          .substring(0, LIMIT);
        continue;
      }

      // Final fallback: scan the raw text for the keyword and grab the surrounding paragraph
      const keywordMatch = fullRawText.match(
        new RegExp(`(?:^|\\n)(?:${rule.titlePatterns.source})[^\\n]*\\n([\\s\\S]{50,${LIMIT}})`, 'i')
      );
      if (keywordMatch) {
        classified[rule.key] = keywordMatch[1].trim().substring(0, LIMIT);
      }
    }

    console.log('📂 Classified sections:', Object.keys(classified).join(', ') || 'none');
    return classified;
  }

  private improveSectionTitles(sections: Section[], fullText: string): void {
    // Look for common section patterns in the full text
    const patterns = [
      { name: 'Introduction', regex: /introduction|background|overview/i },
      { name: 'Methodology', regex: /method|approach|procedure|technique/i },
      { name: 'Results', regex: /result|finding|outcome|performance/i },
      { name: 'Discussion', regex: /discussion|analysis|interpretation/i },
      { name: 'Conclusion', regex: /conclusion|summary|future/i }
    ];

    sections.forEach((section, index) => {
      // Check if section content matches any pattern
      const content = section.content.toLowerCase();
      
      for (const pattern of patterns) {
        if (pattern.regex.test(content) && !sections.some(s => s.title.includes(pattern.name))) {
          section.title = `Section ${index + 1}: ${pattern.name}`;
          break;
        }
      }
    });
  }
}

// Export singleton factory
export function createDocumentParser(outputDir?: string): DocumentParser {
  return new DocumentParser(outputDir);
}
