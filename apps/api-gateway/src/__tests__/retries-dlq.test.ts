import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { OrchestratorJobPayload, RenderJobPayload } from '@clipdirector/shared-types';
import { QUEUE_NAMES, getJobStatus, setJobStatus } from '@clipdirector/queue-client';
import { TimeoutError } from '@clipdirector/shared-types';
import { StorageClient } from '@clipdirector/storage-client';
import { createLogger } from '@clipdirector/logger';
import { createOrchestratorWorker } from '@clipdirector/orchestrator/worker';
import type { ClaudeClient } from '@clipdirector/orchestrator/claude';
import { createRenderWorker } from '@clipdirector/render-worker/worker';
import { createFilesystemMusicSelector } from '@clipdirector/render-worker/music';
import { createDlqProcessor } from '../dlq/processor.js';

const ACCESS = 'rdaccess';
const SECRET = 'rdsecretvalue';
const INPUT_BUCKET = 'rd-input';
const OUTPUT_BUCKET = 'rd-output';
const FFMPEG = '/usr/bin/ffmpeg';
const FFPROBE = '/usr/bin/ffprobe';

let redisContainer: StartedTestContainer;
let minio: StartedTestContainer;
let redis: Redis;
let storage: StorageClient;
let tmp: string;
let musicRoot: string;
let connection: { host: string; port: number };

async function runFfmpegRaw(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const err: Buffer[] = [];
    proc.stderr.on('data', (c: Buffer) => err.push(c));
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(Buffer.concat(err).toString().slice(-400))),
    );
  });
}

beforeAll(async () => {
  redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  minio = await new GenericContainer('minio/minio:latest')
    .withEnvironment({ MINIO_ROOT_USER: ACCESS, MINIO_ROOT_PASSWORD: SECRET })
    .withCommand(['server', '/data'])
    .withExposedPorts(9000)
    .start();

  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);
  connection = { host: redisHost, port: redisPort };
  redis = new Redis({ ...connection, maxRetriesPerRequest: null });

  const minioEndpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  storage = new StorageClient({
    region: 'us-east-1',
    accessKeyId: ACCESS,
    secretAccessKey: SECRET,
    endpoint: minioEndpoint,
    forcePathStyle: true,
  });
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: INPUT_BUCKET }));
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: OUTPUT_BUCKET }));

  tmp = await mkdtemp(path.join(tmpdir(), 'clipdirector-retry-'));
  musicRoot = path.join(tmp, 'music');
  await mkdir(path.join(musicRoot, 'energetic'), { recursive: true });
  await runFfmpegRaw([
    '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=220:duration=10',
    '-c:a', 'libmp3lame', '-b:a', '128k',
    path.join(musicRoot, 'energetic', 'track.mp3'),
  ]);
}, 300_000);

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
  await redis?.quit();
  await minio?.stop();
  await redisContainer?.stop();
});

beforeEach(async () => {
  await redis.flushall();
});

function waitForFailed(jobId: string, timeoutMs = 30_000): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = async (): Promise<void> => {
      const rec = await getJobStatus(redis, jobId);
      if (rec?.status === 'failed') {
        resolve(rec.errorMessage ?? '');
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error(`Job ${jobId} did not reach 'failed' within ${timeoutMs}ms`));
        return;
      }
      setTimeout(tick, 150);
    };
    void tick();
  });
}

describe('Retry + DLQ (PRD T-13, T-14)', () => {
  it('T-13: Claude timeout retries 3 times then marks the job failed', async () => {
    const queue = new Queue<OrchestratorJobPayload>(QUEUE_NAMES.ORCHESTRATOR, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'fixed', delay: 100 },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    });
    const renderQueue = new Queue<RenderJobPayload>(QUEUE_NAMES.RENDER, { connection });

    let calls = 0;
    const claudeAlwaysTimesOut: ClaudeClient = {
      async callReasoning() {
        calls += 1;
        throw new TimeoutError('claude-api', 60_000);
      },
    };

    const { createClipDownloader } = await import('@clipdirector/orchestrator/clips/downloader');
    const { createFfmpegFrameSampler } = await import('@clipdirector/orchestrator/clips/frame-sampler');

    // Upload a fake clip so the orchestrator can download something before hitting Claude.
    const clip = path.join(tmp, 't13-clip.mp4');
    await runFfmpegRaw([
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=160x120:rate=10',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      clip,
    ]);
    await storage.upload({
      bucket: INPUT_BUCKET,
      key: 't13/clip_00.mp4',
      data: await readFile(clip),
      contentType: 'video/mp4',
    });

    const worker = createOrchestratorWorker({
      connection,
      concurrency: 1,
      deps: {
        redis,
        renderQueue,
        downloader: createClipDownloader(storage),
        frameSampler: createFfmpegFrameSampler({ ffmpegPath: FFMPEG, ffprobePath: FFPROBE }),
        transcriber: { async transcribeAll(p) { return p.map(() => ''); } },
        claude: claudeAlwaysTimesOut,
        outputBucket: OUTPUT_BUCKET,
        tempRoot: path.join(tmp, 'orch'),
        logger: createLogger('orchestrator'),
      },
    });
    await worker.waitUntilReady();

    const dlq = createDlqProcessor({
      redis,
      queues: [queue, renderQueue],
      logger: createLogger('api-gateway'),
      intervalMs: 200,
    });
    dlq.start();

    const jobId = 't13';
    await setJobStatus(redis, {
      jobId,
      userId: 'u1',
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await queue.add('process-job', {
      jobId,
      renderJobInput: {
        jobId,
        userId: 'u1',
        userPrompt: 'retry test',
        platform: 'tiktok',
        clipUrls: [`s3://${INPUT_BUCKET}/t13/clip_00.mp4`],
        musicMood: 'none',
        captionStyle: 'none',
        createdAt: new Date().toISOString(),
      },
    });

    const errorMessage = await waitForFailed(jobId, 30_000);
    expect(calls).toBe(3);
    expect(errorMessage.toLowerCase()).toMatch(/timeout|timed out/);

    dlq.stop();
    await worker.close();
    await queue.close();
    await renderQueue.close();
  });

  it('T-14: FFmpeg error retries 2 times then marks the render job failed', async () => {
    const renderQueue = new Queue<RenderJobPayload>(QUEUE_NAMES.RENDER, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 100 },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    });

    // Upload a deliberately corrupt "mp4" — random bytes that ffmpeg will reject.
    const corrupt = path.join(tmp, 't14-corrupt.bin');
    await writeFile(corrupt, Buffer.from('this is not a video file, ffmpeg should reject it'));
    await storage.upload({
      bucket: INPUT_BUCKET,
      key: 't14/clip_00.mp4',
      data: await readFile(corrupt),
      contentType: 'video/mp4',
    });

    const worker = createRenderWorker({
      connection,
      concurrency: 1,
      deps: {
        redis,
        storage,
        music: createFilesystemMusicSelector({ libraryRoot: musicRoot }),
        ffmpeg: { ffmpegPath: FFMPEG, ffprobePath: FFPROBE },
        outputBucket: OUTPUT_BUCKET,
        tempRoot: path.join(tmp, 'render-t14'),
        logger: createLogger('render-worker'),
      },
    });
    await worker.waitUntilReady();

    const dlq = createDlqProcessor({
      redis,
      queues: [renderQueue],
      logger: createLogger('api-gateway'),
      intervalMs: 200,
    });
    dlq.start();

    const jobId = 't14';
    await setJobStatus(redis, {
      jobId,
      userId: 'u1',
      status: 'queued',
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await renderQueue.add('render-job', {
      jobId,
      manifest: {
        schemaVersion: '1.0',
        targetDurationSec: 6,
        aspectRatio: '9:16',
        musicMood: 'energetic',
        captionStyle: 'none',
        audioDuckOnSpeech: false,
        clips: [{ id: 'clip_00', startSec: 0, endSec: 1, transition: 'cut', speed: 1 }],
        titleCards: [],
        captions: [],
      },
      clipUrls: [`s3://${INPUT_BUCKET}/t14/clip_00.mp4`],
      outputBlobPath: `s3://${OUTPUT_BUCKET}/out/t14.mp4`,
    });

    const errorMessage = await waitForFailed(jobId, 30_000);
    expect(errorMessage.length).toBeGreaterThan(0);

    dlq.stop();
    await worker.close();
    await renderQueue.close();
  });
});
