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
        await setJobStatus(config.deps.redis, {
          jobId: job.data.jobId,
          status: 'failed',
          errorMessage: message,
        });
        config.deps.logger.error({ jobId: job.data.jobId, err: message }, 'Orchestrator job failed');
        throw err;
      }
    },
    { connection: config.connection, concurrency: config.concurrency },
  );
}
