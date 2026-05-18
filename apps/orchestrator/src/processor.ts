import path from 'node:path';
import { rm } from 'node:fs/promises';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type {
  EditManifest,
  OrchestratorJobPayload,
  RenderJobPayload,
} from '@clipdirector/shared-types';
import { setJobStatus } from '@clipdirector/queue-client';
import type { Logger } from '@clipdirector/logger';
import { ManifestValidationError } from './errors.js';
import { validateManifest } from './manifest/validator.js';
import type { ClaudeClient } from './claude/client.js';
import type { ClipDownloader } from './clips/downloader.js';
import type { FrameSampler } from './clips/frame-sampler.js';
import type { Transcriber } from './clips/transcriber.js';

export interface ProcessorDeps {
  redis: Redis;
  renderQueue: Queue<RenderJobPayload>;
  downloader: ClipDownloader;
  frameSampler: FrameSampler;
  transcriber: Transcriber;
  claude: ClaudeClient;
  outputBucket: string;
  tempRoot: string;
  logger: Logger;
}

export interface ProcessJobResult {
  manifest: EditManifest;
  outputBlobPath: string;
  claudeAttempts: number;
}

export async function processJob(
  payload: OrchestratorJobPayload,
  deps: ProcessorDeps,
): Promise<ProcessJobResult> {
  const { jobId, renderJobInput } = payload;
  const jobTempDir = path.join(deps.tempRoot, jobId);
  const log = deps.logger.child({ jobId });

  try {
    await setJobStatus(deps.redis, { jobId, status: 'sampling', progress: 10 });

    const localClipPaths = await deps.downloader.downloadAll(renderJobInput.clipUrls, jobTempDir);
    log.info({ clipCount: localClipPaths.length }, 'Clips downloaded');

    const frameSamples = await deps.frameSampler.sampleFrames(localClipPaths);
    log.info({ frameCount: frameSamples.length }, 'Frames sampled');

    const transcripts = await deps.transcriber.transcribeAll(localClipPaths);
    log.info({ transcriptedClips: transcripts.filter((t) => t.length > 0).length }, 'Transcription complete');

    await setJobStatus(deps.redis, { jobId, status: 'reasoning', progress: 30 });

    const { manifest, attempts } = await callClaudeWithRetry({
      claude: deps.claude,
      params: {
        renderJobInput,
        frameSamples,
        transcripts,
        clipCount: localClipPaths.length,
      },
      log,
    });

    await setJobStatus(deps.redis, { jobId, status: 'rendering', progress: 45 });

    const outputBlobPath = `output/${renderJobInput.userId}/${jobId}/output.mp4`;
    const renderPayload: RenderJobPayload = {
      jobId,
      manifest,
      clipUrls: renderJobInput.clipUrls,
      outputBlobPath: `s3://${deps.outputBucket}/${outputBlobPath}`,
    };
    await deps.renderQueue.add('render-job', renderPayload);
    log.info({ outputBlobPath }, 'Render job enqueued');

    return { manifest, outputBlobPath, claudeAttempts: attempts };
  } finally {
    await rm(jobTempDir, { recursive: true, force: true });
  }
}

interface RetryArgs {
  claude: ClaudeClient;
  params: Parameters<ClaudeClient['callReasoning']>[0];
  log: Logger;
}

async function callClaudeWithRetry(
  args: RetryArgs,
): Promise<{ manifest: EditManifest; attempts: number }> {
  const firstRaw = await args.claude.callReasoning(args.params);
  try {
    return { manifest: validateManifest(firstRaw), attempts: 1 };
  } catch (err) {
    if (!(err instanceof ManifestValidationError)) throw err;
    args.log.warn(
      { issues: err.issues.length, raw: err.raw },
      'Manifest validation failed on first Claude response; retrying once with errors appended',
    );

    const retryRaw = await args.claude.callReasoning({
      ...args.params,
      validationErrors: err.formatIssuesForPrompt(),
    });

    return { manifest: validateManifest(retryRaw), attempts: 2 };
  }
}
