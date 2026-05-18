import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type {
  EditManifest,
  OrchestratorJobPayload,
  RenderJobPayload,
} from '@clipdirector/shared-types';
import { QUEUE_NAMES, setJobStatus } from '@clipdirector/queue-client';
import { StorageClient } from '@clipdirector/storage-client';
import { createLogger } from '@clipdirector/logger';
import type { ClaudeClient, ReasoningParams } from '../claude/client.js';
import type { Transcriber } from '../clips/transcriber.js';
import { createClipDownloader } from '../clips/downloader.js';
import { createFfmpegFrameSampler } from '../clips/frame-sampler.js';
import { processJob } from '../processor.js';

const ACCESS = 'orchaccess';
const SECRET = 'orchsecret-very-long';
const INPUT_BUCKET = 'orch-input';
const OUTPUT_BUCKET = 'orch-output';

const VALID_MANIFEST: EditManifest = {
  schemaVersion: '1.0',
  targetDurationSec: 15,
  aspectRatio: '9:16',
  musicMood: 'energetic',
  captionStyle: 'bold_white_shadow',
  audioDuckOnSpeech: true,
  clips: [{ id: 'clip_00', startSec: 0, endSec: 2.5, transition: 'cut', speed: 1 }],
  titleCards: [],
  captions: [],
};

let redisContainer: StartedTestContainer;
let minio: StartedTestContainer;
let redis: Redis;
let renderQueue: Queue<RenderJobPayload>;
let storage: StorageClient;
let tmp: string;
let clipS3Uri: string;

const passThroughTranscriber: Transcriber = {
  async transcribeAll(paths) {
    return paths.map(() => '');
  },
};

async function generateTestMp4(outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=3:size=320x240:rate=10',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      outputPath,
    ];
    const proc = spawn('/usr/bin/ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const errChunks: Buffer[] = [];
    proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg test-mp4 generation failed: ${Buffer.concat(errChunks).toString().slice(0, 400)}`));
        return;
      }
      resolve();
    });
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
  const minioEndpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;

  redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null });
  renderQueue = new Queue<RenderJobPayload>(QUEUE_NAMES.RENDER, {
    connection: { host: redisHost, port: redisPort },
  });

  storage = new StorageClient({
    region: 'us-east-1',
    accessKeyId: ACCESS,
    secretAccessKey: SECRET,
    endpoint: minioEndpoint,
    forcePathStyle: true,
  });
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: INPUT_BUCKET }));
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: OUTPUT_BUCKET }));

  tmp = await mkdtemp(path.join(tmpdir(), 'clipdirector-orch-int-'));
  const localMp4 = path.join(tmp, 'sample.mp4');
  await generateTestMp4(localMp4);
  const data = await readFile(localMp4);
  await storage.upload({
    bucket: INPUT_BUCKET,
    key: 'input/user_abc/job_t04/clip_00.mp4',
    data,
    contentType: 'video/mp4',
  });
  clipS3Uri = `s3://${INPUT_BUCKET}/input/user_abc/job_t04/clip_00.mp4`;
}, 300_000);

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
  await renderQueue?.close();
  await redis?.quit();
  await minio?.stop();
  await redisContainer?.stop();
});

beforeEach(async () => {
  await redis.flushall();
});

describe('Orchestrator: full pipeline (PRD T-04)', () => {
  it('T-04: picks up a payload, downloads + samples + transcribes, calls Claude with images, enqueues render', async () => {
    const observed: ReasoningParams[] = [];
    const claudeStub: ClaudeClient = {
      async callReasoning(params: ReasoningParams) {
        observed.push(params);
        return VALID_MANIFEST;
      },
    };

    const payload: OrchestratorJobPayload = {
      jobId: 'job_t04',
      renderJobInput: {
        jobId: 'job_t04',
        userId: 'user_abc',
        userPrompt: 'snappy 15-second cut',
        platform: 'tiktok',
        clipUrls: [clipS3Uri],
        musicMood: 'energetic',
        captionStyle: 'bold_white_shadow',
        createdAt: '2026-05-16T12:00:00.000Z',
      },
    };

    await setJobStatus(redis, {
      jobId: payload.jobId,
      userId: payload.renderJobInput.userId,
      status: 'queued',
      progress: 0,
      createdAt: payload.renderJobInput.createdAt,
      updatedAt: payload.renderJobInput.createdAt,
    });

    const orchTempRoot = path.join(tmp, 'work');
    const result = await processJob(payload, {
      redis,
      renderQueue,
      downloader: createClipDownloader(storage),
      frameSampler: createFfmpegFrameSampler({
        ffmpegPath: '/usr/bin/ffmpeg',
        ffprobePath: '/usr/bin/ffprobe',
      }),
      transcriber: passThroughTranscriber,
      claude: claudeStub,
      outputBucket: OUTPUT_BUCKET,
      tempRoot: orchTempRoot,
      logger: createLogger('orchestrator'),
    });

    // Claude received frame samples generated from a real 3-second clip (3s / 3s interval => 1 frame).
    expect(observed).toHaveLength(1);
    expect(observed[0]?.frameSamples.length).toBeGreaterThanOrEqual(1);
    expect(observed[0]?.frameSamples[0]?.clipId).toBe('clip_00');
    expect(observed[0]?.frameSamples[0]?.base64Jpeg.length).toBeGreaterThan(100);
    expect(observed[0]?.clipCount).toBe(1);
    expect(observed[0]?.transcripts).toEqual(['']);

    // Render queue receives the manifest plus original clip URIs + output blob path.
    const drained = await renderQueue.getJobs(['waiting', 'delayed', 'paused', 'active', 'completed']);
    expect(drained).toHaveLength(1);
    const enqueued = drained[0]?.data;
    expect(enqueued?.jobId).toBe('job_t04');
    expect(enqueued?.clipUrls).toEqual([clipS3Uri]);
    expect(enqueued?.outputBlobPath).toBe(`s3://${OUTPUT_BUCKET}/output/user_abc/job_t04/output.mp4`);
    expect(enqueued?.manifest).toEqual(VALID_MANIFEST);

    expect(result.claudeAttempts).toBe(1);

    // Status was advanced through the pipeline.
    const status = await redis.hgetall(`job:${payload.jobId}`);
    expect(status.status).toBe('rendering');

    // Temp dir for this job was cleaned up.
    const jobDirExists = await rm(path.join(orchTempRoot, payload.jobId), { recursive: true })
      .then(() => false)
      .catch(() => true);
    expect(jobDirExists).toBe(true);
  });
});
