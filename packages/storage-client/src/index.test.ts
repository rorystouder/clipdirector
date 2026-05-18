import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { StorageClient } from './index.js';

const ACCESS_KEY = 'testaccess';
const SECRET_KEY = 'testsecretvalue';
const BUCKET = 'clipdirector-test';

let minio: StartedTestContainer;
let endpoint: string;
let client: StorageClient;
let tmp: string;

beforeAll(async () => {
  minio = await new GenericContainer('minio/minio:latest')
    .withEnvironment({
      MINIO_ROOT_USER: ACCESS_KEY,
      MINIO_ROOT_PASSWORD: SECRET_KEY,
    })
    .withCommand(['server', '/data'])
    .withExposedPorts(9000)
    .start();

  endpoint = `http://${minio.getHost()}:${minio.getMappedPort(9000)}`;

  client = new StorageClient({
    region: 'us-east-1',
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
    endpoint,
    forcePathStyle: true,
  });

  await client.getNativeClient().send(new CreateBucketCommand({ Bucket: BUCKET }));

  tmp = await mkdtemp(path.join(tmpdir(), 'clipdirector-storage-test-'));
}, 180_000);

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
  await minio?.stop();
});

beforeEach(() => {
  // Test isolation: keys are unique per test, no shared state to reset.
});

describe('StorageClient construction', () => {
  it('throws if AWS credentials are missing', () => {
    expect(
      () =>
        new StorageClient({
          accessKeyId: '',
          secretAccessKey: SECRET_KEY,
          region: 'us-east-1',
        }),
    ).toThrow(/AWS_ACCESS_KEY_ID/);
  });
});

describe('upload + read roundtrip', () => {
  it('uploads a Buffer and reads back the exact bytes', async () => {
    const key = 'roundtrip/buffer.bin';
    const payload = Buffer.from('hello clipdirector — bytes test 🎬'.repeat(8), 'utf-8');

    const uri = await client.upload({
      bucket: BUCKET,
      key,
      data: payload,
      contentType: 'application/octet-stream',
    });
    expect(uri).toBe(`s3://${BUCKET}/${key}`);

    const got = await client.readToBuffer(BUCKET, key);
    expect(got.equals(payload)).toBe(true);
  });

  it('uploads a filePath and reads back the exact bytes', async () => {
    const key = 'roundtrip/file.bin';
    const local = path.join(tmp, 'upload.bin');
    const payload = Buffer.from('clip data from disk', 'utf-8');
    await writeFile(local, payload);

    await client.upload({
      bucket: BUCKET,
      key,
      filePath: local,
      contentType: 'application/octet-stream',
    });

    const got = await client.readToBuffer(BUCKET, key);
    expect(got.equals(payload)).toBe(true);
  });

  it('rejects upload with neither data nor filePath', async () => {
    await expect(
      client.upload({ bucket: BUCKET, key: 'bad/no-source', contentType: 'application/octet-stream' }),
    ).rejects.toThrow(/data .* filePath/);
  });

  it('rejects upload with both data and filePath', async () => {
    const local = path.join(tmp, 'either.bin');
    await writeFile(local, 'x');
    await expect(
      client.upload({
        bucket: BUCKET,
        key: 'bad/both',
        data: Buffer.from('y'),
        filePath: local,
        contentType: 'application/octet-stream',
      }),
    ).rejects.toThrow(/not both/);
  });
});

describe('download to local path', () => {
  it('writes downloaded bytes to disk matching the source exactly', async () => {
    const key = 'download/payload.bin';
    const payload = Buffer.from('download payload', 'utf-8');

    await client.upload({
      bucket: BUCKET,
      key,
      data: payload,
      contentType: 'application/octet-stream',
    });

    const dest = path.join(tmp, 'downloaded.bin');
    await client.download(BUCKET, key, dest);

    const onDisk = await readFile(dest);
    expect(onDisk.equals(payload)).toBe(true);
  });
});

describe('signed URLs', () => {
  it('returns a URL that actually serves the object via plain HTTP GET', async () => {
    const key = 'signed/file.txt';
    const payload = Buffer.from('signed-url payload', 'utf-8');

    await client.upload({
      bucket: BUCKET,
      key,
      data: payload,
      contentType: 'text/plain',
    });

    const url = await client.getSignedUrl(BUCKET, key, 1);
    expect(url).toMatch(/^http/);

    const res = await fetch(url);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe(payload.toString('utf-8'));
  });

  it('throws when expiryHours is zero or negative', async () => {
    await expect(client.getSignedUrl(BUCKET, 'whatever', 0)).rejects.toThrow(/positive/);
    await expect(client.getSignedUrl(BUCKET, 'whatever', -3)).rejects.toThrow(/positive/);
  });
});

describe('delete', () => {
  it('removes the object so subsequent reads fail', async () => {
    const key = 'delete/me.bin';
    await client.upload({
      bucket: BUCKET,
      key,
      data: Buffer.from('temp'),
      contentType: 'application/octet-stream',
    });
    await client.delete(BUCKET, key);

    await expect(client.readToBuffer(BUCKET, key)).rejects.toThrow();
  });
});
