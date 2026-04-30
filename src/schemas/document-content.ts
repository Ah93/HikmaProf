// src/schemas/document-content.ts

/**
 * The 13 content buckets that map directly onto the fixed 15-slide structure.
 * Slides 1, 2, 15 are always Title, Agenda, Thank You (no bucket needed).
 *
 * Slide  3  → introduction
 * Slide  4  → background
 * Slide  5  → problemStatement
 * Slide  6  → researchObjectives
 * Slide  7  → researchScope
 * Slide  8  → researchQuestions
 * Slide  9  → literatureReview
 * Slide 10  → methodology
 * Slide 11  → results
 * Slide 12  → discussion
 * Slide 13  → limitations
 * Slide 14  → conclusion
 */
export interface ClassifiedSections {
  introduction?: string;        // Slide  3
  background?: string;          // Slide  4
  problemStatement?: string;    // Slide  5
  researchObjectives?: string;  // Slide  6
  researchScope?: string;       // Slide  7
  researchQuestions?: string;   // Slide  8  — max 3 questions
  literatureReview?: string;    // Slide  9
  methodology?: string;         // Slide 10
  results?: string;             // Slide 11
  discussion?: string;          // Slide 12
  limitations?: string;         // Slide 13
  conclusion?: string;          // Slide 14
}

export interface DocumentContent {
  metadata: {
    title: string;
    authors: string[];
    abstract?: string;
    keywords?: string[];
    sourceFile: string;
    sourceFormat: 'pdf' | 'docx' | 'tex';
    extractedAt: string;
  };
  sections: Section[];
  figures: Figure[];
  tables: TableData[];
  references?: Reference[];
  /** Pre-classified content mapped to each of the 9 required presentation sections */
  classifiedSections?: ClassifiedSections;
}

export interface Section {
  id: string;                    // e.g., 'section-1', 'section-2-1'
  level: number;                 // 1 = main section, 2 = subsection
  title: string;
  content: string;               // Main text content (plain text)
  bulletPoints?: string[];       // Extracted bullet points if any
  keyFindings?: string[];        // Important findings/conclusions
  relatedFigures?: string[];     // IDs of related figures
  relatedTables?: string[];      // IDs of related tables
  wordCount: number;
}

export interface Figure {
  id: string;
  caption: string;
  imagePath: string;             // Path to extracted image
  pageNumber?: number;
  relatedSection?: string;
}

export interface TableData {
  id: string;
  caption?: string;
  headers: string[];
  rows: string[][];
  relatedSection?: string;
}

export interface Reference {
  id: string;
  authors: string[];
  title: string;
  year?: string;
  source?: string;
}
