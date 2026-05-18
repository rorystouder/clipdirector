import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import request from 'supertest';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import type { Express } from 'express';
import type { OrchestratorJobPayload } from '@clipdirector/shared-types';
import { QUEUE_NAMES, setJobStatus } from '@clipdirector/queue-client';
import { StorageClient } from '@clipdirector/storage-client';
import { createLogger } from '@clipdirector/logger';
import { openDatabase } from '../db.js';
import { createApp } from '../app.js';

const ACCESS_KEY = 'testaccess';
const SECRET_KEY = 'testsecretvalue';
const INPUT_BUCKET = 'clipdirector-input-test';
const OUTPUT_BUCKET = 'clipdirector-output-test';
const JWT_SECRET = 'test-secret-with-at-least-32-bytes-of-entropy';

let redisContainer: StartedTestContainer;
let minio: StartedTestContainer;
let redis: Redis;
let queue: Queue<OrchestratorJobPayload>;
let storage: StorageClient;
let app: Express;

beforeAll(async () => {
  redisContainer = await new GenericContainer('redis:7-alpine').withExposedPorts(6379).start();
  minio = await new GenericContainer('minio/minio:latest')
    .withEnvironment({ MINIO_ROOT_USER: ACCESS_KEY, MINIO_ROOT_PASSWORD: SECRET_KEY })
    .withCommand(['server', '/data'])
    .withExposedPorts(9000)
    .start();

  const redisHost = redisContainer.getHost();
  const redisPort = redisContainer.getMappedPort(6379);
  const minioEndpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;

  redis = new Redis({ host: redisHost, port: redisPort, maxRetriesPerRequest: null });

  storage = new StorageClient({
    region: 'us-east-1',
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    endpoint: minioEndpoint,
    forcePathStyle: true,
  });
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: INPUT_BUCKET }));
  await storage.getNativeClient().send(new CreateBucketCommand({ Bucket: OUTPUT_BUCKET }));

  queue = new Queue<OrchestratorJobPayload>(QUEUE_NAMES.ORCHESTRATOR, {
    connection: { host: redisHost, port: redisPort },
  });

  app = createApp({
    db: openDatabase(':memory:'),
    redis,
    orchestratorQueue: queue,
    storage,
    logger: createLogger('api-gateway'),
    version: '0.1.0-test',
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
    },
  });
}, 240_000);

afterAll(async () => {
  await queue?.close();
  await redis?.quit();
  await minio?.stop();
  await redisContainer?.stop();
});

beforeEach(async () => {
  await redis.flushall();
});

async function register(email: string, password: string): Promise<{ accessToken: string; refreshToken: string; userId: string }> {
  const res = await request(app).post('/auth/register').send({ email, password });
  expect(res.status).toBe(201);
  return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken, userId: res.body.user.id };
}

const validJobJson = JSON.stringify({
  userPrompt: 'energetic recap for socials',
  platform: 'tiktok',
  musicMood: 'energetic',
  captionStyle: 'bold_white_shadow',
});

describe('Auth — register', () => {
  it('registers a user and returns access + refresh tokens', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'alice@example.com', password: 'correct-horse-battery-staple' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alice@example.com');
    expect(typeof res.body.accessToken).toBe('string');
    expect(res.body.accessToken.split('.')).toHaveLength(3);
    expect(typeof res.body.refreshToken).toBe('string');
    expect(res.body.refreshToken.length).toBeGreaterThanOrEqual(64);
    expect(res.body.expiresInSec).toBe(15 * 60);
  });

  it('rejects duplicate email with 409 (not 200 or 500)', async () => {
    await register('dup@example.com', 'correct-horse-battery-staple');
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'dup@example.com', password: 'another-strong-passphrase' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('conflict');
  });

  it('rejects passwords shorter than 12 chars with 400', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ email: 'short@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('validation_error');
  });

  it('normalizes email to lowercase', async () => {
    const reg = await request(app)
      .post('/auth/register')
      .send({ email: 'Mixed@Example.COM', password: 'correct-horse-battery-staple' });
    expect(reg.status).toBe(201);
    expect(reg.body.user.email).toBe('mixed@example.com');

    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'mixed@example.com', password: 'correct-horse-battery-staple' });
    expect(login.status).toBe(200);
  });
});

describe('Auth — login', () => {
  it('returns 200 + tokens on correct password', async () => {
    await register('login@example.com', 'correct-horse-battery-staple');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'correct-horse-battery-staple' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('returns 401 (not 404) on unknown email — must not leak existence', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'ghost@example.com', password: 'correct-horse-battery-staple' });
    expect(res.status).toBe(401);
  });

  it('returns 401 on wrong password', async () => {
    await register('wrongpw@example.com', 'correct-horse-battery-staple');
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'wrongpw@example.com', password: 'wrong-but-also-very-long' });
    expect(res.status).toBe(401);
  });
});

describe('Auth — /me + middleware', () => {
  it('returns 401 without an Authorization header', async () => {
    const res = await request(app).get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 for malformed bearer tokens', async () => {
    const res = await request(app).get('/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('returns 401 for a token signed with the wrong secret', async () => {
    const { default: jwt } = await import('jsonwebtoken');
    const bad = jwt.sign({ email: 'a@b.com' }, 'different-secret-32-bytes-of-stuff!', {
      subject: 'fake',
      algorithm: 'HS256',
    });
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  it('returns 200 + user with a valid token', async () => {
    const { accessToken } = await register('me@example.com', 'correct-horse-battery-staple');
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });
});

describe('Auth — refresh + logout', () => {
  it('issues a new pair and rotates: old refresh becomes unusable', async () => {
    const { refreshToken } = await register('rot@example.com', 'correct-horse-battery-staple');

    const first = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(refreshToken);

    const replay = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const { refreshToken } = await register('logout@example.com', 'correct-horse-battery-staple');
    const out = await request(app).post('/auth/logout').send({ refreshToken });
    expect(out.status).toBe(204);

    const after = await request(app).post('/auth/refresh').send({ refreshToken });
    expect(after.status).toBe(401);
  });
});

describe('Jobs — POST /jobs (PRD T-01, T-02, T-03)', () => {
  const fakeVideoBuf = Buffer.from('fake-video-bytes');

  it('T-01: valid 3-clip upload returns 202 + jobId, and status appears in Redis', async () => {
    const { accessToken, userId } = await register('t01@example.com', 'correct-horse-battery-staple');

    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('json', validJobJson)
      .attach('clips', fakeVideoBuf, { filename: 'a.mp4', contentType: 'video/mp4' })
      .attach('clips', fakeVideoBuf, { filename: 'b.mp4', contentType: 'video/mp4' })
      .attach('clips', fakeVideoBuf, { filename: 'c.mp4', contentType: 'video/mp4' });

    expect(res.status).toBe(202);
    expect(res.body.jobId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(res.body.status).toBe('queued');

    const stored = await redis.hgetall(`job:${res.body.jobId}`);
    expect(stored.userId).toBe(userId);
    expect(stored.status).toBe('queued');
  });

  it('T-02: 13 clips returns 400', async () => {
    const { accessToken } = await register('t02@example.com', 'correct-horse-battery-staple');
    let req2 = request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('json', validJobJson);
    for (let i = 0; i < 13; i++) {
      req2 = req2.attach('clips', fakeVideoBuf, { filename: `c${i}.mp4`, contentType: 'video/mp4' });
    }
    const res = await req2;
    expect(res.status).toBe(400);
  });

  it('T-03: non-video MIME returns 400', async () => {
    const { accessToken } = await register('t03@example.com', 'correct-horse-battery-staple');
    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('json', validJobJson)
      .attach('clips', Buffer.from('not a video'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
  });

  it('rejects POST /jobs without an Authorization header (401)', async () => {
    const res = await request(app)
      .post('/jobs')
      .field('json', validJobJson)
      .attach('clips', fakeVideoBuf, { filename: 'a.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(401);
  });

  it('rejects missing json field with 400', async () => {
    const { accessToken } = await register('nojson@example.com', 'correct-horse-battery-staple');
    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .attach('clips', fakeVideoBuf, { filename: 'a.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON in the json field with 400', async () => {
    const { accessToken } = await register('badjson@example.com', 'correct-horse-battery-staple');
    const res = await request(app)
      .post('/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('json', '{this is not valid json')
      .attach('clips', fakeVideoBuf, { filename: 'a.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });
});

describe('Jobs — GET /jobs/:id (PRD T-11)', () => {
  it('returns the JobStatusRecord including progress as a number', async () => {
    const { accessToken, userId } = await register('t11@example.com', 'correct-horse-battery-staple');

    await setJobStatus(redis, {
      jobId: 'job_t11',
      userId,
      status: 'rendering',
      progress: 55,
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:00:00.000Z',
    });

    const res = await request(app)
      .get('/jobs/job_t11')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rendering');
    expect(res.body.progress).toBe(55);
    expect(typeof res.body.progress).toBe('number');
  });

  it("returns 403 when fetching another user's job", async () => {
    const alice = await register('alice2@example.com', 'correct-horse-battery-staple');
    const bob = await register('bob2@example.com', 'correct-horse-battery-staple');

    await setJobStatus(redis, {
      jobId: 'job_alice',
      userId: alice.userId,
      status: 'queued',
      progress: 0,
      createdAt: '2026-05-16T12:00:00.000Z',
      updatedAt: '2026-05-16T12:00:00.000Z',
    });

    const res = await request(app)
      .get('/jobs/job_alice')
      .set('Authorization', `Bearer ${bob.accessToken}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown jobId', async () => {
    const { accessToken } = await register('miss@example.com', 'correct-horse-battery-staple');
    const res = await request(app)
      .get('/jobs/does_not_exist')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(404);
  });
});

describe('Health', () => {
  it('returns 200 + status:ok when Redis is reachable', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.redis.status).toBe('ok');
    expect(res.body.version).toBe('0.1.0-test');
  });
});
