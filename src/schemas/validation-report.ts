// src/schemas/validation-report.ts

export type IssueType =
  | 'TEXT_OVERFLOW'
  | 'TEXT_OVERLAP'
  | 'CONTRAST_ISSUE'
  | 'ALIGNMENT_ERROR'
  | 'CONTENT_TOO_DENSE'
  | 'IMAGE_QUALITY'
  | 'EMPTY_SPACE';

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type Status = 'PASS' | 'FAIL' | 'WARNING';

export interface ValidationReport {
  timestamp: string;
  pptxFile: string;
  totalSlides: number;
  passedSlides: number;
  failedSlides: number;
  warningSlides: number;
  overallStatus: Status;
  slideReports: SlideValidationReport[];
}

export interface SlideValidationReport {
  slideNumber: number;
  slideId: string;
  status: Status;
  issues: ValidationIssue[];
  imagePath: string;
}

export interface ValidationIssue {
  type: IssueType;
  severity: Severity;
  description: string;
  location: string;           // e.g., 'title', 'bullet-3', 'image'
  suggestedFix: string;
  boundingBox?: {             // Optional coordinates
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
