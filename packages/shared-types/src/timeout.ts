export class TimeoutError extends Error {
  readonly label: string;
  readonly ms: number;
  constructor(label: string, ms: number) {
    super(`Operation "${label}" timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.label = label;
    this.ms = ms;
  }
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export const TIMEOUTS = {
  clipDownloadMs: 60_000,
  frameSamplingMs: 120_000,
  transcriptionMs: 180_000,
  claudeApiMs: 60_000,
  manifestValidationMs: 5_000,
  renderPipelineMs: 300_000,
  outputUploadMs: 120_000,
  totalJobMs: 600_000,
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;
