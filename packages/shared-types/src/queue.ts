import type { EditManifest } from './manifest.js';
import type { RenderJobInput } from './job.js';

export interface OrchestratorJobPayload {
  jobId: string;
  renderJobInput: RenderJobInput;
}

export interface RenderJobPayload {
  jobId: string;
  manifest: EditManifest;
  clipUrls: string[];
  outputBlobPath: string;
}
