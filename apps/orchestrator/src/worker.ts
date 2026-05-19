import { Worker, type ConnectionOptions } from 'bullmq';
import { setJobStatus, QUEUE_NAMES } from '@clipdirector/queue-client';
import type { OrchestratorJobPayload } from '@clipdirector/shared-types';
import { processJob, type ProcessorDeps } from './processor.js';

export interface OrchestratorWorkerConfig {
  connection: ConnectionOptions;
  concurrency: number;
  deps: ProcessorDeps;
}

export function createOrchestratorWorker(
  config: OrchestratorWorkerConfig,
): Worker<OrchestratorJobPayload> {
  return new Worker<OrchestratorJobPayload>(
    QUEUE_NAMES.ORCHESTRATOR,
    async (job) => {
      try {
        const result = await processJob(job.data, config.deps);
        return { manifest: result.manifest, claudeAttempts: result.claudeAttempts };
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
          isFinalAttempt ? 'Orchestrator job failed (no retries left)' : 'Orchestrator job attempt failed, will retry',
        );
        throw err;
      }
    },
    { connection: config.connection, concurrency: config.concurrency },
  );
}
