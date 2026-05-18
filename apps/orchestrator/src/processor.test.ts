import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type {
  EditManifest,
  OrchestratorJobPayload,
  RenderJobPayload,
} from '@clipdirector/shared-types';
import { QUEUE_NAMES } from '@clipdirector/queue-client';
import { createLogger } from '@clipdirector/logger';
import { ManifestParseError, ManifestValidationError } from './errors.js';
import type { ClaudeClient, ReasoningParams } from './claude/client.js';
import type { ClipDownloader } from './clips/downloader.js';
import type { FrameSampler } from './clips/frame-sampler.js';
import type { Transcriber } from './clips/transcriber.js';
import { processJob } from './processor.js';

const VALID: EditManifest = {
  schemaVersion: '1.0',
  targetDurationSec: 30,
  aspectRatio: '9:16',
  musicMood: 'energetic',
  captionStyle: 'bold_white_shadow',
  audioDuckOnSpeech: true,
  clips: [{ id: 'clip_00', startSec: 0, endSec: 4.5, transition: 'cut', speed: 1 }],
  titleCards: [],
  captions: [],
};

const INVALID: Record<string, unknown> = {
  ...VALID,
  clips: [{ id: 'clip_00', startSec: 5, endSec: 5, transition: 'cut', speed: 1 }],
};

let redisContainer: StartedTestContainer;
let redis: Redis;
let renderQueue: Queue<RenderJobPayload>;
let connection: { host: string; port: number };

const stubbedDownloader: ClipDownloader = {
  async downloadAll(_uris, _tempDir) {
    return ['/dev/null'];
  },
};
const stubbedFrameSampler: FrameSampler = {
  async sampleFrames(_paths) {
    return [
      {
        clipId: 'clip_00',
        clipIndex: 0,
        timestampSec: 0,
        durationSec: 5,
        base64Jpeg: 'aGVsbG8=',
      },
    ];
  },
};
const stubbedTranscriber: Transcriber = {
  async transcribeAll(_paths) {
    return [''];
  },
};

const samplePayload = (jobId: string): OrchestratorJobPayload => ({
  jobId,
  renderJobInput: {
    jobId,
    userId: 'user_abc',
    userPrompt: 'energetic recap',
    platform: 'tiktok',
    clipUrls: ['s3://test/in/clip_00.mp4'],
    musicMood: 'energetic',
    captionStyle: 'bold_white_shadow',
    createdAt: '2026-05-16T12:00:00.000Z',
  },
});

beforeAll(async () => {
  redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  connection = {
    host: redisContainer.getHost(),
    port: redisContainer.getMappedPort(6379),
  };
  redis = new Redis({ ...connection, maxRetriesPerRequest: null });
  renderQueue = new Queue<RenderJobPayload>(QUEUE_NAMES.RENDER, { connection });
}, 180_000);

afterAll(async () => {
  await renderQueue?.close();
  await redis?.quit();
  await redisContainer?.stop();
});

beforeEach(async () => {
  await redis.flushall();
});

async function drainRenderQueue(): Promise<RenderJobPayload[]> {
  const jobs = await renderQueue.getJobs(['waiting', 'delayed', 'paused', 'active', 'completed']);
  return jobs.map((j) => j.data);
}

describe('processJob: Claude retry on manifest validation failure (T-06)', () => {
  it('succeeds in one attempt when Claude returns a valid manifest first', async () => {
    let calls = 0;
    const claude: ClaudeClient = {
      async callReasoning(_params: ReasoningParams) {
        calls += 1;
        return VALID;
      },
    };

    const result = await processJob(samplePayload('job_one'), {
      redis,
      renderQueue,
      downloader: stubbedDownloader,
      frameSampler: stubbedFrameSampler,
      transcriber: stubbedTranscriber,
      claude,
      outputBucket: 'output-bucket',
      tempRoot: '/tmp/orch-test',
      logger: createLogger('orchestrator'),
    });

    expect(result.claudeAttempts).toBe(1);
    expect(calls).toBe(1);
    expect(result.manifest).toEqual(VALID);

    const drained = await drainRenderQueue();
    expect(drained).toHaveLength(1);
    expect(drained[0]?.jobId).toBe('job_one');
    expect(drained[0]?.outputBlobPath).toBe('s3://output-bucket/output/user_abc/job_one/output.mp4');
    expect(drained[0]?.manifest).toEqual(VALID);
  });

  it('T-06: retries exactly once when first manifest fails validation, then succeeds', async () => {
    let calls = 0;
    const receivedParams: ReasoningParams[] = [];
    const claude: ClaudeClient = {
      async callReasoning(params: ReasoningParams) {
        calls += 1;
        receivedParams.push(params);
        if (calls === 1) return INVALID;
        return VALID;
      },
    };

    const result = await processJob(samplePayload('job_retry'), {
      redis,
      renderQueue,
      downloader: stubbedDownloader,
      frameSampler: stubbedFrameSampler,
      transcriber: stubbedTranscriber,
      claude,
      outputBucket: 'output-bucket',
      tempRoot: '/tmp/orch-test',
      logger: createLogger('orchestrator'),
    });

    expect(calls).toBe(2);
    expect(result.claudeAttempts).toBe(2);
    expect(receivedParams[0]?.validationErrors).toBeUndefined();
    expect(receivedParams[1]?.validationErrors).toBeDefined();
    expect(receivedParams[1]?.validationErrors).toMatch(/endSec/);
  });

  it('fails (does NOT retry a third time) when both attempts return an invalid manifest', async () => {
    let calls = 0;
    const claude: ClaudeClient = {
      async callReasoning(_params) {
        calls += 1;
        return INVALID;
      },
    };

    await expect(
      processJob(samplePayload('job_fail'), {
        redis,
        renderQueue,
        downloader: stubbedDownloader,
        frameSampler: stubbedFrameSampler,
        transcriber: stubbedTranscriber,
        claude,
        outputBucket: 'output-bucket',
        tempRoot: '/tmp/orch-test',
        logger: createLogger('orchestrator'),
      }),
    ).rejects.toBeInstanceOf(ManifestValidationError);
    expect(calls).toBe(2);

    const drained = await drainRenderQueue();
    expect(drained).toHaveLength(0);
  });

  it('does NOT retry on ManifestParseError (non-JSON), which is a different failure mode', async () => {
    let calls = 0;
    const claude: ClaudeClient = {
      async callReasoning(_params) {
        calls += 1;
        throw new ManifestParseError('not json', 'this is not json');
      },
    };

    await expect(
      processJob(samplePayload('job_parse_err'), {
        redis,
        renderQueue,
        downloader: stubbedDownloader,
        frameSampler: stubbedFrameSampler,
        transcriber: stubbedTranscriber,
        claude,
        outputBucket: 'output-bucket',
        tempRoot: '/tmp/orch-test',
        logger: createLogger('orchestrator'),
      }),
    ).rejects.toBeInstanceOf(ManifestParseError);
    expect(calls).toBe(1);
  });
});
