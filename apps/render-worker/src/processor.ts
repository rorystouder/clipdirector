import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Redis } from 'ioredis';
import type { RenderJobPayload } from '@clipdirector/shared-types';
import { setJobStatus } from '@clipdirector/queue-client';
import { TIMEOUTS, withTimeout } from '@clipdirector/shared-types';
import type { StorageClient } from '@clipdirector/storage-client';
import type { Logger } from '@clipdirector/logger';
import { runRenderPipeline } from './ffmpeg/pipeline.js';
import type { FfmpegConfig } from './ffmpeg/runner.js';
import type { MusicSelector } from './music/selector.js';
import { RenderError } from './errors.js';

export interface RenderDeps {
  redis: Redis;
  storage: StorageClient;
  music: MusicSelector;
  ffmpeg: FfmpegConfig;
  outputBucket: string;
  tempRoot: string;
  fontFile?: string;
  logger: Logger;
}

export interface RenderResult {
  outputUri: string;
  outputBytes: number;
  durationMs: number;
}

function parseS3Uri(uri: string): { bucket: string; key: string } {
  if (!uri.startsWith('s3://')) throw new RenderError('input', `Expected s3:// URI: ${uri}`);
  const rest = uri.slice(5);
  const slash = rest.indexOf('/');
  if (slash <= 0) throw new RenderError('input', `Malformed s3:// URI: ${uri}`);
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}

export async function renderJob(
  payload: RenderJobPayload,
  deps: RenderDeps,
): Promise<RenderResult> {
  const jobTempDir = path.join(deps.tempRoot, payload.jobId);
  const log = deps.logger.child({ jobId: payload.jobId });
  const t0 = Date.now();

  try {
    await setJobStatus(deps.redis, { jobId: payload.jobId, status: 'rendering', progress: 50 });
    await mkdir(jobTempDir, { recursive: true });

    // Download all clips with a per-clip timeout (§11.3).
    const localClipPaths: string[] = [];
    for (let i = 0; i < payload.clipUrls.length; i++) {
      const { bucket, key } = parseS3Uri(payload.clipUrls[i]!);
      const localPath = path.join(jobTempDir, `clip_${String(i).padStart(2, '0')}.mp4`);
      await withTimeout(
        deps.storage.download(bucket, key, localPath),
        TIMEOUTS.clipDownloadMs,
        `clip-download[${i}]`,
      );
      localClipPaths.push(localPath);
    }
    log.info({ count: localClipPaths.length }, 'clips downloaded');
    await setJobStatus(deps.redis, { jobId: payload.jobId, progress: 60 });

    // Pick music
    const musicPath = await deps.music.select(
      payload.manifest.musicMood,
      payload.jobId,
      payload.manifest.targetDurationSec,
    );
    log.info({ mood: payload.manifest.musicMood, musicPath }, 'music selected');

    // Run pipeline under the full-render budget (§11.3).
    const finalMp4 = await withTimeout(
      runRenderPipeline(
        {
          jobId: payload.jobId,
          manifest: payload.manifest,
          localClipPaths,
          workDir: path.join(jobTempDir, 'work'),
          musicPath,
          ...(deps.fontFile ? { fontFile: deps.fontFile } : {}),
        },
        { ffmpeg: deps.ffmpeg },
      ),
      TIMEOUTS.renderPipelineMs,
      'render-pipeline',
    );
    await setJobStatus(deps.redis, { jobId: payload.jobId, progress: 92 });

    // Upload under the output-upload budget (§11.3).
    const { bucket, key } = parseS3Uri(payload.outputBlobPath);
    await setJobStatus(deps.redis, { jobId: payload.jobId, status: 'uploading', progress: 95 });
    const outputUri = await withTimeout(
      deps.storage.upload({
        bucket,
        key,
        filePath: finalMp4,
        contentType: 'video/mp4',
      }),
      TIMEOUTS.outputUploadMs,
      'output-upload',
    );

    const stats = await (await import('node:fs/promises')).stat(finalMp4);

    await setJobStatus(deps.redis, {
      jobId: payload.jobId,
      status: 'complete',
      progress: 100,
      outputUrl: outputUri,
    });
    const durationMs = Date.now() - t0;
    log.info({ outputUri, bytes: stats.size, durationMs }, 'render complete');

    return { outputUri, outputBytes: stats.size, durationMs };
  } finally {
    // ALWAYS clean up — success OR failure.
    await rm(jobTempDir, { recursive: true, force: true });
    log.info({ jobTempDir }, 'temp dir removed');
  }
}
