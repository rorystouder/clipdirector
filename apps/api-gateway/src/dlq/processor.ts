import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { setJobStatus, getJobStatus } from '@clipdirector/queue-client';
import type { Logger } from '@clipdirector/logger';

export interface DlqDeps {
  redis: Redis;
  queues: Queue[];
  logger: Logger;
  intervalMs?: number;
  maxFailedAgeMs?: number;
}

export interface DlqProcessor {
  start(): void;
  stop(): void;
  runOnce(): Promise<{ markedFailed: number; pruned: number }>;
}

export function createDlqProcessor(deps: DlqDeps): DlqProcessor {
  const intervalMs = deps.intervalMs ?? 10 * 60 * 1000;
  const maxFailedAgeMs = deps.maxFailedAgeMs ?? 48 * 60 * 60 * 1000;
  let handle: ReturnType<typeof setInterval> | undefined;

  async function runOnce(): Promise<{ markedFailed: number; pruned: number }> {
    let markedFailed = 0;
    let pruned = 0;
    const now = Date.now();

    for (const queue of deps.queues) {
      const failed = await queue.getFailed(0, 999);
      for (const job of failed) {
        const payload = job.data as { jobId?: string } | undefined;
        const jobId = payload?.jobId;
        const reason = job.failedReason ?? 'unknown';
        const finishedOn = job.finishedOn ?? now;

        if (jobId) {
          const existing = await getJobStatus(deps.redis, jobId);
          if (!existing || existing.status !== 'failed') {
            await setJobStatus(deps.redis, {
              jobId,
              status: 'failed',
              errorMessage: reason,
            });
            markedFailed += 1;
            deps.logger.error(
              { jobId, queue: queue.name, reason, attempts: job.attemptsMade },
              'DLQ marked job failed',
            );
          }
        }

        if (now - finishedOn > maxFailedAgeMs) {
          await job.remove();
          pruned += 1;
          deps.logger.info({ jobId, queue: queue.name }, 'DLQ pruned old failed job');
        }
      }
    }

    return { markedFailed, pruned };
  }

  return {
    runOnce,
    start(): void {
      if (handle) return;
      handle = setInterval(() => {
        runOnce().catch((err) => {
          deps.logger.error({ err: (err as Error).message }, 'DLQ tick failed');
        });
      }, intervalMs);
    },
    stop(): void {
      if (handle) {
        clearInterval(handle);
        handle = undefined;
      }
    },
  };
}
