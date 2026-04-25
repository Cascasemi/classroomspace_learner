/**
 * Typed domain errors for Phase 3 curriculum + session features.
 * Using class-based errors so callers can narrow with `instanceof`.
 */

export class PremiumRequiredError extends Error {
  readonly code = 'PREMIUM_REQUIRED' as const;
  constructor(message = 'This content requires a premium subscription.') {
    super(message);
    this.name = 'PremiumRequiredError';
  }
}

export class CurriculumNotFoundError extends Error {
  readonly code = 'CURRICULUM_NOT_FOUND' as const;
  constructor(grade: string, courseId: string) {
    super(`Curriculum not found for grade="${grade}" courseId="${courseId}".`);
    this.name = 'CurriculumNotFoundError';
  }
}

export class PdfFetchError extends Error {
  readonly code = 'PDF_FETCH_ERROR' as const;
  constructor(url: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Failed to fetch PDF from "${url}": ${detail}`);
    this.name = 'PdfFetchError';
  }
}

export class PdfParseError extends Error {
  readonly code = 'PDF_PARSE_ERROR' as const;
  constructor(cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`PDF parsing failed: ${detail}`);
    this.name = 'PdfParseError';
  }
}
