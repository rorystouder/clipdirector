import { Worker, type ConnectionOptions } from 'bullmq';
import { QUEUE_NAMES, setJobStatus } from '@clipdirector/queue-client';
import type { RenderJobPayload } from '@clipdirector/shared-types';
import { renderJob, type RenderDeps } from './processor.js';

export interface RenderWorkerConfig {
  connection: ConnectionOptions;
  concurrency: number;
  deps: RenderDeps;
}

export function createRenderWorker(config: RenderWorkerConfig): Worker<RenderJobPayload> {
  return new Worker<RenderJobPayload>(
    QUEUE_NAMES.RENDER,
    async (job) => {
      try {
        const result = await renderJob(job.data, config.deps);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const maxAttempts = job.opts.attempts ?? 1;
        const isFinalAttempt = job.attemptsMade + 1 >= maxAttempts;
        if (isFinalAttempt) {
          await setJobStatus(config.deps.redis, {
            jobId: job.data.jobId,
            status: 'failed',
            errorMessage: message,
          });
        }
        config.deps.logger.error(
          { jobId: job.data.jobId, attempt: job.attemptsMade + 1, maxAttempts, err: message },
          isFinalAttempt ? 'render-worker job failed (no retries left)' : 'render-worker attempt failed, will retry',
        );
        throw err;
      }
    },
    { connection: config.connection, concurrency: config.concurrency },
  );
}
