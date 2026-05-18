import type { z } from 'zod';

export class ManifestParseError extends Error {
  readonly raw: string;
  constructor(message: string, raw: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = 'ManifestParseError';
    this.raw = raw;
  }
}

export class ManifestValidationError extends Error {
  readonly issues: z.ZodIssue[];
  readonly raw: unknown;
  constructor(message: string, issues: z.ZodIssue[], raw: unknown) {
    super(message);
    this.name = 'ManifestValidationError';
    this.issues = issues;
    this.raw = raw;
  }

  formatIssuesForPrompt(): string {
    if (this.issues.length === 0) return this.message;
    return this.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
  }
}

export class TranscriptionError extends Error {
  readonly clipIndex: number;
  constructor(message: string, clipIndex: number) {
    super(message);
    this.name = 'TranscriptionError';
    this.clipIndex = clipIndex;
  }
}

export class FrameSamplingError extends Error {
  readonly clipPath: string;
  constructor(message: string, clipPath: string) {
    super(message);
    this.name = 'FrameSamplingError';
    this.clipPath = clipPath;
  }
}
