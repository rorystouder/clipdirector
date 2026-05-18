import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { Redis } from 'ioredis';
import type { EditManifest, RenderJobPayload } from '@clipdirector/shared-types';
import { StorageClient } from '@clipdirector/storage-client';
import { createLogger } from '@clipdirector/logger';
import { renderJob } from '../processor.js';
import { createFilesystemMusicSelector } from '../music/selector.js';
import { probeDurationSec, probeHasVideo } from '../ffmpeg/runner.js';
import { RenderError } from '../errors.js';

const ACCESS = 'rwaccess';
const SECRET = 'rwsecret-very-long-string';
const INPUT_BUCKET = 'rw-input';
const OUTPUT_BUCKET = 'rw-output';

const FFMPEG = '/usr/bin/ffmpeg';
const FFPROBE = '/usr/bin/ffprobe';

let redisContainer: StartedTestContainer;
let minio: StartedTestContainer;
let redis: Redis;
let storage: StorageClient;
let tmp: string;
let musicRoot: string;
let clipS3Uri: string;
let secondClipS3Uri: string;

async function runFfmpegRaw(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const errChunks: Buffer[] = [];
    proc.stderr.on('data', (c: Buffer) => errChunks.push(c));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg failed: ${Buffer.concat(errChunks).toString().slice(-400)}`));
        return;
      }
      resolve();
    });
  });
}

async function makeSyntheticClip(out: string, duration = 3, withTone = true): Promise<void> {
  const args = ['-y', '-f', 'lavfi', '-i', `testsrc=duration=${duration}:size=320x240:rate=10`];
  if (withTone) {
    args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${duration}`);
  }
  args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p');
  if (withTone) args.push('-c:a', 'aac', '-shortest');
  args.push(out);
  await runFfmpegRaw(args);
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

  const minioEndpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;
  redis = new Redis({
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
    maxRetriesPerRequest: null,
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

  tmp = await mkdtemp(path.join(tmpdir(), 'clipdirector-rw-test-'));

  // Synthetic clips
  const localClip1 = path.join(tmp, 'clip0.mp4');
  const localClip2 = path.join(tmp, 'clip1.mp4');
  await makeSyntheticClip(localClip1, 3, true);
  await makeSyntheticClip(localClip2, 3, true);

  await storage.upload({
    bucket: INPUT_BUCKET,
    key: 'in/clip_00.mp4',
    data: await readFile(localClip1),
    contentType: 'video/mp4',
  });
  await storage.upload({
    bucket: INPUT_BUCKET,
    key: 'in/clip_01.mp4',
    data: await readFile(localClip2),
    contentType: 'video/mp4',
  });
  clipS3Uri = `s3://${INPUT_BUCKET}/in/clip_00.mp4`;
  secondClipS3Uri = `s3://${INPUT_BUCKET}/in/clip_01.mp4`;

  // Synthetic music library (energetic mood track)
  musicRoot = path.join(tmp, 'music');
  await mkdir(path.join(musicRoot, 'energetic'), { recursive: true });
  await makeSyntheticMusic(path.join(musicRoot, 'energetic', 'track_001.mp3'), 30);
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

function manifest(overrides: Partial<EditManifest> = {}): EditManifest {
  return {
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
    ...overrides,
  };
}

function payload(jobId: string, m: EditManifest, urls: string[]): RenderJobPayload {
  return {
    jobId,
    manifest: m,
    clipUrls: urls,
    outputBlobPath: `s3://${OUTPUT_BUCKET}/out/${jobId}.mp4`,
  };
}

const tempRoot = () => path.join(tmp, 'render-temp');

function deps(): Parameters<typeof renderJob>[1] {
  return {
    redis,
    storage,
    music: createFilesystemMusicSelector({ libraryRoot: musicRoot }),
    ffmpeg: { ffmpegPath: FFMPEG, ffprobePath: FFPROBE },
    outputBucket: OUTPUT_BUCKET,
    tempRoot: tempRoot(),
    logger: createLogger('render-worker'),
  };
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

describe('renderJob (PRD T-08, T-09, T-10)', () => {
  it('T-08: produces a valid MP4 from a test manifest + sample clips', async () => {
    const jobId = 't08';
    const result = await renderJob(payload(jobId, manifest(), [clipS3Uri, secondClipS3Uri]), deps());

    expect(result.outputUri).toBe(`s3://${OUTPUT_BUCKET}/out/${jobId}.mp4`);
    expect(result.outputBytes).toBeGreaterThan(1000);

    // Download the uploaded MP4 and ffprobe-verify it is a real, playable video.
    const downloaded = path.join(tmp, `${jobId}-downloaded.mp4`);
    await storage.download(OUTPUT_BUCKET, `out/${jobId}.mp4`, downloaded);
    const downStat = await stat(downloaded);
    expect(downStat.size).toBeGreaterThan(1000);

    expect(await probeHasVideo({ ffmpegPath: FFMPEG, ffprobePath: FFPROBE }, downloaded)).toBe(true);
    const duration = await probeDurationSec({ ffmpegPath: FFMPEG, ffprobePath: FFPROBE }, downloaded);
    // Two trimmed clips of 2s each -> ~4s total, allow tolerance.
    expect(duration).toBeGreaterThan(3.2);
    expect(duration).toBeLessThan(5.5);

    // Redis status reflects completion.
    const status = await redis.hgetall(`job:${jobId}`);
    expect(status.status).toBe('complete');
    expect(status.progress).toBe('100');
    expect(status.outputUrl).toBe(result.outputUri);
  });

  it('T-09: temp directory is removed after a successful render', async () => {
    const jobId = 't09';
    await renderJob(payload(jobId, manifest(), [clipS3Uri, secondClipS3Uri]), deps());

    const jobTempDir = path.join(tempRoot(), jobId);
    expect(await exists(jobTempDir)).toBe(false);
  });

  it('T-10: temp directory is removed even when the job fails mid-pipeline', async () => {
    const jobId = 't10';
    const badPayload = payload(jobId, manifest(), [`s3://${INPUT_BUCKET}/does/not/exist.mp4`]);
    badPayload.manifest.clips = [
      { id: 'clip_00', startSec: 0, endSec: 2, transition: 'cut', speed: 1 },
    ];

    await expect(renderJob(badPayload, deps())).rejects.toThrow();

    const jobTempDir = path.join(tempRoot(), jobId);
    expect(await exists(jobTempDir)).toBe(false);

    // Status was NOT set to complete; pipeline failed before upload.
    const status = await redis.hgetall(`job:${jobId}`);
    expect(status.status).not.toBe('complete');
  });

  it('rejects a job that references an unknown clip index in the manifest', async () => {
    const jobId = 'bad-idx';
    const bad = manifest({
      clips: [{ id: 'clip_07', startSec: 0, endSec: 1, transition: 'cut', speed: 1 }],
    });
    await expect(renderJob(payload(jobId, bad, [clipS3Uri]), deps())).rejects.toBeInstanceOf(RenderError);

    const jobTempDir = path.join(tempRoot(), jobId);
    expect(await exists(jobTempDir)).toBe(false);
  });
});
