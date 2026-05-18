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
        await setJobStatus(config.deps.redis, {
          jobId: job.data.jobId,
          status: 'failed',
          errorMessage: message,
        });
        config.deps.logger.error({ jobId: job.data.jobId, err: message }, 'render-worker job failed');
        throw err;
      }
    },
    { connection: config.connection, concurrency: config.concurrency },
  );
}
