import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis, type RedisOptions } from 'ioredis';
import type { JobStatusRecord, OrchestratorJobPayload, RenderJobPayload } from '@clipdirector/shared-types';

export const QUEUE_NAMES = {
  ORCHESTRATOR: 'orchestrator-queue',
  RENDER: 'render-queue',
  DEAD_LETTER: 'dead-letter-queue',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const SEVEN_DAYS_SECONDS = 60 * 60 * 24 * 7;

export interface RedisConnectionOverrides {
  host?: string;
  port?: number;
  password?: string;
}

export function getRedisConnection(overrides: RedisConnectionOverrides = {}): ConnectionOptions {
  const host = overrides.host ?? process.env.REDIS_HOST ?? 'localhost';
  const port = overrides.port ?? Number(process.env.REDIS_PORT ?? 6379);
  const password = overrides.password ?? process.env.REDIS_PASSWORD;
  return {
    host,
    port,
    ...(password ? { password } : {}),
    maxRetriesPerRequest: null,
  };
}

export function createRedisClient(overrides: RedisConnectionOverrides = {}): Redis {
  const conn = getRedisConnection(overrides) as RedisOptions;
  return new Redis(conn);
}

export function createOrchestratorQueue(connection?: ConnectionOptions): Queue<OrchestratorJobPayload> {
  return new Queue<OrchestratorJobPayload>(QUEUE_NAMES.ORCHESTRATOR, {
    connection: connection ?? getRedisConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: false,
    },
  });
}

export function createRenderQueue(connection?: ConnectionOptions): Queue<RenderJobPayload> {
  return new Queue<RenderJobPayload>(QUEUE_NAMES.RENDER, {
    connection: connection ?? getRedisConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 10000 },
      removeOnComplete: { count: 50 },
      removeOnFail: false,
    },
  });
}

const jobStatusKey = (jobId: string): string => `job:${jobId}`;

export async function setJobStatus(
  redis: Redis,
  partial: Partial<JobStatusRecord> & Pick<JobStatusRecord, 'jobId'>,
): Promise<JobStatusRecord> {
  const key = jobStatusKey(partial.jobId);
  const now = new Date().toISOString();
  const fields: Record<string, string> = { updatedAt: now };

  for (const [k, v] of Object.entries(partial)) {
    if (v === undefined || v === null) continue;
    fields[k] = typeof v === 'string' ? v : String(v);
  }

  await redis.hset(key, fields);
  await redis.expire(key, SEVEN_DAYS_SECONDS);

  const after = await getJobStatus(redis, partial.jobId);
  if (!after) throw new Error(`Job status missing immediately after write: ${partial.jobId}`);
  return after;
}

export async function getJobStatus(redis: Redis, jobId: string): Promise<JobStatusRecord | null> {
  const data = await redis.hgetall(jobStatusKey(jobId));
  if (!data || Object.keys(data).length === 0 || !data.jobId) return null;
  return parseRecord(data);
}

function parseRecord(data: Record<string, string>): JobStatusRecord {
  const record: JobStatusRecord = {
    jobId: data.jobId!,
    userId: data.userId ?? '',
    status: (data.status ?? 'queued') as JobStatusRecord['status'],
    progress: data.progress !== undefined ? Number(data.progress) : 0,
    createdAt: data.createdAt ?? '',
    updatedAt: data.updatedAt ?? '',
  };
  if (data.outputUrl) record.outputUrl = data.outputUrl;
  if (data.errorMessage) record.errorMessage = data.errorMessage;
  return record;
}

export async function getJobStatusTtlSeconds(redis: Redis, jobId: string): Promise<number> {
  return redis.ttl(jobStatusKey(jobId));
}
