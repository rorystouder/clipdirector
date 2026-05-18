import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Worker, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';
import type {
  JobStatusRecord,
  OrchestratorJobPayload,
  RenderJobInput,
} from '@clipdirector/shared-types';
import {
  QUEUE_NAMES,
  createOrchestratorQueue,
  createRenderQueue,
  getJobStatus,
  getJobStatusTtlSeconds,
  getRedisConnection,
  setJobStatus,
} from './index.js';

let redisContainer: StartedTestContainer;
let host: string;
let port: number;
let redis: Redis;

beforeAll(async () => {
  redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  host = redisContainer.getHost();
  port = redisContainer.getMappedPort(6379);
  redis = new Redis({ host, port, maxRetriesPerRequest: null });
}, 120_000);

afterAll(async () => {
  await redis?.quit();
  await redisContainer?.stop();
});

beforeEach(async () => {
  await redis.flushall();
});

const sampleJobInput = (jobId: string): RenderJobInput => ({
  jobId,
  userId: 'user_42',
  userPrompt: 'energetic recap for socials',
  platform: 'tiktok',
  clipUrls: ['s3://in/clip_00.mp4', 's3://in/clip_01.mp4'],
  musicMood: 'energetic',
  captionStyle: 'bold_white_shadow',
  createdAt: '2026-05-16T12:00:00.000Z',
});

describe('queue: enqueue + dequeue round trip', () => {
  it('orchestrator queue preserves the exact typed payload', async () => {
    const queue = createOrchestratorQueue(getRedisConnection({ host, port }));
    const events = new QueueEvents(QUEUE_NAMES.ORCHESTRATOR, { connection: { host, port } });
    await events.waitUntilReady();

    const payload: OrchestratorJobPayload = {
      jobId: 'job_001',
      renderJobInput: sampleJobInput('job_001'),
    };

    const received: OrchestratorJobPayload[] = [];
    const worker = new Worker<OrchestratorJobPayload>(
      QUEUE_NAMES.ORCHESTRATOR,
      async (job) => {
        received.push(job.data);
        return 'ok';
      },
      { connection: { host, port } },
    );
    await worker.waitUntilReady();

    const job = await queue.add('process-job', payload);
    const completed = new Promise<void>((resolve) => events.on('completed', () => resolve()));
    await completed;

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(payload);
    expect(received[0]?.renderJobInput.clipUrls).toEqual(payload.renderJobInput.clipUrls);
    expect(job.id).toBeDefined();

    await worker.close();
    await events.close();
    await queue.close();
  });

  it('render queue is wired with retry+backoff defaults', async () => {
    const queue = createRenderQueue(getRedisConnection({ host, port }));
    const job = await queue.add('render-job', {
      jobId: 'job_002',
      manifest: {
        schemaVersion: '1.0',
        targetDurationSec: 30,
        aspectRatio: '9:16',
        musicMood: 'energetic',
        captionStyle: 'bold_white_shadow',
        audioDuckOnSpeech: true,
        clips: [
          { id: 'clip_00', startSec: 0, endSec: 5, transition: 'cut', speed: 1 },
        ],
        titleCards: [],
        captions: [],
      },
      clipUrls: ['s3://in/clip_00.mp4'],
      outputBlobPath: 'output/user_42/job_002/output.mp4',
    });

    expect(job.opts.attempts).toBe(2);
    expect(job.opts.backoff).toEqual({ type: 'fixed', delay: 10000 });
    await queue.close();
  });
});

describe('JobStatusRecord storage', () => {
  it('roundtrips a full record and coerces progress back to a Number', async () => {
    const record: JobStatusRecord = {
      jobId: 'job_status_001',
      userId: 'user_42',
      status: 'rendering',
      progress: 65,
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:00:00.000Z',
    };

    await setJobStatus(redis, record);
    const after = await getJobStatus(redis, 'job_status_001');

    expect(after).not.toBeNull();
    expect(after?.progress).toBe(65);
    expect(typeof after?.progress).toBe('number');
    expect(after?.status).toBe('rendering');
    expect(after?.jobId).toBe('job_status_001');
  });

  it('does not store undefined optional fields as the literal string "undefined"', async () => {
    await setJobStatus(redis, {
      jobId: 'job_no_opts',
      userId: 'user_42',
      status: 'queued',
      progress: 0,
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:00:00.000Z',
    });

    const raw = await redis.hgetall('job:job_no_opts');
    expect(raw.outputUrl).toBeUndefined();
    expect(raw.errorMessage).toBeUndefined();

    const parsed = await getJobStatus(redis, 'job_no_opts');
    expect(parsed?.outputUrl).toBeUndefined();
    expect(parsed?.errorMessage).toBeUndefined();
  });

  it('partial update preserves untouched fields (merge semantics)', async () => {
    await setJobStatus(redis, {
      jobId: 'job_merge',
      userId: 'user_42',
      status: 'queued',
      progress: 0,
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:00:00.000Z',
    });

    await setJobStatus(redis, { jobId: 'job_merge', status: 'rendering', progress: 45 });

    const after = await getJobStatus(redis, 'job_merge');
    expect(after?.userId).toBe('user_42');
    expect(after?.status).toBe('rendering');
    expect(after?.progress).toBe(45);
    expect(after?.createdAt).toBe('2026-05-16T12:00:00.000Z');
  });

  it('returns null for a missing jobId', async () => {
    const missing = await getJobStatus(redis, 'does_not_exist');
    expect(missing).toBeNull();
  });

  it('refreshes a 7-day TTL on every write', async () => {
    await setJobStatus(redis, {
      jobId: 'job_ttl',
      userId: 'user_42',
      status: 'queued',
      progress: 0,
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:00:00.000Z',
    });

    const ttl = await getJobStatusTtlSeconds(redis, 'job_ttl');
    const sevenDays = 60 * 60 * 24 * 7;
    expect(ttl).toBeGreaterThan(sevenDays - 60);
    expect(ttl).toBeLessThanOrEqual(sevenDays);
  });

  it('updates updatedAt to a fresh ISO timestamp on each write', async () => {
    await setJobStatus(redis, {
      jobId: 'job_ts',
      userId: 'user_42',
      status: 'queued',
      progress: 0,
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:00:00.000Z',
    });
    const first = (await getJobStatus(redis, 'job_ts'))?.updatedAt;
    await new Promise((r) => setTimeout(r, 50));
    await setJobStatus(redis, { jobId: 'job_ts', progress: 10 });
    const second = (await getJobStatus(redis, 'job_ts'))?.updatedAt;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(() => new Date(second!).toISOString()).not.toThrow();
  });
});
