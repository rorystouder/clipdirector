import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { Redis } from 'ioredis';
import type { EditManifest, OrchestratorJobPayload, RenderJobPayload } from '@clipdirector/shared-types';
import { QUEUE_NAMES } from '@clipdirector/queue-client';
import { StorageClient } from '@clipdirector/storage-client';
import { createLogger } from '@clipdirector/logger';
import { createOrchestratorWorker } from '@clipdirector/orchestrator/worker';
import type { ClaudeClient, ReasoningParams } from '@clipdirector/orchestrator/claude';
import { createRenderWorker } from '@clipdirector/render-worker/worker';
import { createFilesystemMusicSelector } from '@clipdirector/render-worker/music';
import { Worker as BullWorker } from 'bullmq';
import { openDatabase } from '../db.js';
import { createApp } from '../app.js';

const ACCESS = 'e2eaccess';
const SECRET = 'e2esecretvalue';
const INPUT_BUCKET = 'e2e-input';
const OUTPUT_BUCKET = 'e2e-output';
const JWT_SECRET = 'e2e-secret-with-at-least-32-bytes-of-entropy';
const FFMPEG = '/usr/bin/ffmpeg';
const FFPROBE = '/usr/bin/ffprobe';

const VALID_MANIFEST: EditManifest = {
  schemaVersion: '1.0',
  targetDurationSec: 6,
  aspectRatio: '9:16',
  musicMood: 'energetic',
  captionStyle: 'none',
  audioDuckOnSpeech: false,
  clips: [
    { id: 'clip_00', startSec: 0, endSec: 2, transition: 'cut', speed: 1 },
    { id: 'clip_01', startSec: 0, endSec: 2, transition: 'cut', speed: 1 },
  ],
  titleCards: [],
  captions: [],
};

let redisContainer: StartedTestContainer;
let minio: StartedTestContainer;
let redis: Redis;
let storage: StorageClient;
let tmp: string;
let musicRoot: string;
let orchestratorWorker: BullWorker;
let renderWorker: BullWorker;
let app: ReturnType<typeof createApp>;

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

async function makeSyntheticClip(out: string, duration = 3): Promise<void> {
  await runFfmpegRaw([
    '-y',
    '-f', 'lavfi', '-i', `testsrc=duration=${duration}:size=320x240:rate=10`,
    '-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest',
    out,
  ]);
}

async function makeSyntheticMusic(out: string, duration = 30): Promise<void> {
  await runFfmpegRaw([
    '-y',
    '-f', 'lavfi', '-i', `sine=frequency=220:duration=${duration}`,
    '-c:a', 'libmp3lame', '-b:a', '128k',
    out,
  ]);
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
  const minioEndpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  const connection = { host: redisHost, port: redisPort };

  redis = new Redis({ ...connection, maxRetriesPerRequest: null });

  storage = new StorageClient({
    region: 'us-east-1',
    accessKeyId: ACCESS,
    secretAccessKey: SECRET,
    endpoint: minioEndpoint,
    forcePathStyle: true,
  });
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: INPUT_BUCKET }));
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: OUTPUT_BUCKET }));

  tmp = await mkdtemp(path.join(tmpdir(), 'clipdirector-e2e-'));
  musicRoot = path.join(tmp, 'music');
  await mkdir(path.join(musicRoot, 'energetic'), { recursive: true });
  await makeSyntheticMusic(path.join(musicRoot, 'energetic', 'track.mp3'), 30);

  // Build api-gateway Express app sharing the same Redis + storage.
  const { Queue } = await import('bullmq');
  const orchestratorQueue = new Queue<OrchestratorJobPayload>(QUEUE_NAMES.ORCHESTRATOR, {
    connection,
    defaultJobOptions: { attempts: 1, removeOnComplete: { count: 1000 } },
  });
  const renderQueue = new Queue<RenderJobPayload>(QUEUE_NAMES.RENDER, {
    connection,
    defaultJobOptions: { attempts: 1, removeOnComplete: { count: 1000 } },
  });

  app = createApp({
    db: openDatabase(':memory:'),
    redis,
    orchestratorQueue,
    storage,
    logger: createLogger('api-gateway'),
    version: '0.1.0-e2e',
    config: {
      jwtSecret: JWT_SECRET,
      accessTokenTtlMinutes: 15,
      refreshTokenTtlDays: 7,
      inputBucket: INPUT_BUCKET,
      outputBucket: OUTPUT_BUCKET,
      maxClipsPerJob: 12,
      maxPromptLength: 500,
      maxClipBytes: 50 * 1024 * 1024,
      signedUrlExpiryHours: 1,
      authRateLimits: {
        login: { windowMs: 60_000, limit: 10_000 },
        register: { windowMs: 60_000, limit: 10_000 },
        refresh: { windowMs: 60_000, limit: 10_000 },
      },
    },
  });

  // Stub claude — return the valid manifest regardless of params.
  const claudeStub: ClaudeClient = {
    async callReasoning(_params: ReasoningParams) {
      return VALID_MANIFEST;
    },
  };

  // Wire workers (no API keys needed because Claude is stubbed and clips are silent).
  const { createClipDownloader } = await import('@clipdirector/orchestrator/clips/downloader');
  const { createFfmpegFrameSampler } = await import('@clipdirector/orchestrator/clips/frame-sampler');
  orchestratorWorker = createOrchestratorWorker({
    connection,
    concurrency: 1,
    deps: {
      redis,
      renderQueue,
      downloader: createClipDownloader(storage),
      frameSampler: createFfmpegFrameSampler({ ffmpegPath: FFMPEG, ffprobePath: FFPROBE }),
      transcriber: { async transcribeAll(p) { return p.map(() => ''); } },
      claude: claudeStub,
      outputBucket: OUTPUT_BUCKET,
      tempRoot: path.join(tmp, 'orch'),
      logger: createLogger('orchestrator'),
    },
  });

  renderWorker = createRenderWorker({
    connection,
    concurrency: 1,
    deps: {
      redis,
      storage,
      music: createFilesystemMusicSelector({ libraryRoot: musicRoot }),
      ffmpeg: { ffmpegPath: FFMPEG, ffprobePath: FFPROBE },
      outputBucket: OUTPUT_BUCKET,
      tempRoot: path.join(tmp, 'render'),
      logger: createLogger('render-worker'),
    },
  });

  await orchestratorWorker.waitUntilReady();
  await renderWorker.waitUntilReady();
}, 360_000);

afterAll(async () => {
  await orchestratorWorker?.close();
  await renderWorker?.close();
  await rm(tmp, { recursive: true, force: true });
  await redis?.quit();
  await minio?.stop();
  await redisContainer?.stop();
});

async function pollUntilComplete(
  accessToken: string,
  jobId: string,
  timeoutMs = 120_000,
): Promise<{ status: string; outputUrl?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(app).get(`/jobs/${jobId}`).set('Authorization', `Bearer ${accessToken}`);
    if (res.status !== 200) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    if (res.body.status === 'complete' || res.body.status === 'failed') {
      return res.body;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Job ${jobId} did not reach terminal state within ${timeoutMs}ms`);
}

describe('E2E: POST /jobs through completed MP4 (PRD T-12)', () => {
  it('T-12: full pipeline produces a downloadable MP4 from real clip uploads', async () => {
    const reg = await request(app)
      .post('/auth/register')
      .send({ email: 'e2e@example.com', password: 'correct-horse-battery-staple' });
    expect(reg.status).toBe(201);
    const accessToken: string = reg.body.accessToken;

    const clip1 = path.join(tmp, 'e2e-clip-0.mp4');
    const clip2 = path.join(tmp, 'e2e-clip-1.mp4');
    await makeSyntheticClip(clip1, 3);
    await makeSyntheticClip(clip2, 3);
    const clip1Bytes = await readFile(clip1);
    const clip2Bytes = await readFile(clip2);

    const submit = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .field(
        'json',
        JSON.stringify({
          userPrompt: 'snappy 6 second cut',
          platform: 'tiktok',
          musicMood: 'energetic',
          captionStyle: 'none',
        }),
      )
      .attach('clips', clip1Bytes, { filename: 'a.mp4', contentType: 'video/mp4' })
      .attach('clips', clip2Bytes, { filename: 'b.mp4', contentType: 'video/mp4' });

    expect(submit.status).toBe(202);
    const jobId: string = submit.body.jobId;
    expect(jobId).toMatch(/^[0-9a-f-]{36}$/i);

    const terminal = await pollUntilComplete(accessToken, jobId);
    expect(terminal.status).toBe('complete');
    expect(terminal.outputUrl).toMatch(/^s3:\/\/e2e-output\//);

    // GET /jobs/:jobId/download returns a presigned URL that actually serves the MP4.
    const dl = await request(app)
      .get(`/jobs/${jobId}/download`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(dl.status).toBe(200);
    expect(typeof dl.body.url).toBe('string');
    expect(dl.body.url).toMatch(/^http/);

    const fetched = await fetch(dl.body.url);
    expect(fetched.status).toBe(200);
    const buf = Buffer.from(await fetched.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(1000);
    // MP4 files start with ftyp box at offset 4.
    expect(buf.slice(4, 8).toString('ascii')).toMatch(/ftyp/);
  });
});
