export class RenderError extends Error {
  readonly step: string;
  readonly stderr?: string;
  constructor(step: string, message: string, stderr?: string) {
    super(`[${step}] ${message}`);
    this.name = 'RenderError';
    this.step = step;
    if (stderr) this.stderr = stderr;
  }
}

export class MusicLibraryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MusicLibraryError';
  }
}
