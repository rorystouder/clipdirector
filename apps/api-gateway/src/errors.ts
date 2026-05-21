export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  /** Always serialized as `string[]` so typed clients (Android kotlinx-serialization)
   *  can decode it. ZodIssue[] -> string[] conversion happens in ValidationError. */
  readonly details?: string[];
  constructor(status: number, code: string, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

interface ZodIssueLike {
  path: Array<string | number>;
  message: string;
}

function isZodIssueArray(value: unknown): value is ZodIssueLike[] {
  return (
    Array.isArray(value) &&
    value.every(
      (v) =>
        v !== null &&
        typeof v === 'object' &&
        Array.isArray((v as ZodIssueLike).path) &&
        typeof (v as ZodIssueLike).message === 'string',
    )
  );
}

/**
 * Validation errors flatten ZodIssue[] into ["path.to.field: message", ...]
 * strings so the response envelope is always `{ code, message, details?: string[] }`.
 *
 * Pre-flatten: Android (kotlinx-serialization, List<String>?) silently failed
 * to decode `details` as an object array and fell back to a generic
 * "Request failed: 400" — losing the field-level diagnostic.
 */
export class ValidationError extends HttpError {
  constructor(message: string, details?: string[] | ZodIssueLike[]) {
    super(400, 'validation_error', message, normalizeValidationDetails(details));
  }
}

function normalizeValidationDetails(
  details: string[] | ZodIssueLike[] | undefined,
): string[] | undefined {
  if (details === undefined) return undefined;
  if (isZodIssueArray(details)) {
    return details.map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    });
  }
  // Already a string[]; trust the caller.
  return details as string[];
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, 'unauthorized', message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, 'not_found', message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, 'conflict', message);
  }
}
