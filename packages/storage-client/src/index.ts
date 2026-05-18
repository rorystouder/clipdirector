import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadOptions {
  bucket: string;
  key: string;
  data?: Buffer;
  filePath?: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageClientConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  forcePathStyle?: boolean;
}

export class StorageClient {
  private readonly s3: S3Client;

  constructor(config: StorageClientConfig = {}) {
    const region = config.region ?? process.env.AWS_REGION ?? 'us-east-1';
    const accessKeyId = config.accessKeyId ?? process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = config.secretAccessKey ?? process.env.AWS_SECRET_ACCESS_KEY;
    const endpoint = config.endpoint ?? process.env.AWS_S3_ENDPOINT;
    const forcePathStyle =
      config.forcePathStyle ?? process.env.AWS_S3_FORCE_PATH_STYLE === 'true';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('StorageClient requires AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
    }

    const clientConfig: S3ClientConfig = {
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle,
    };
    if (endpoint) clientConfig.endpoint = endpoint;

    this.s3 = new S3Client(clientConfig);
  }

  async upload(opts: UploadOptions): Promise<string> {
    if (!opts.data && !opts.filePath) {
      throw new Error('upload requires either data (Buffer) or filePath');
    }
    if (opts.data && opts.filePath) {
      throw new Error('upload accepts data or filePath, not both');
    }

    const body = opts.data ?? createReadStream(opts.filePath!);
    let contentLength: number | undefined;
    if (opts.filePath) {
      const info = await stat(opts.filePath);
      contentLength = info.size;
    }

    await this.s3.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: opts.key,
        Body: body,
        ContentType: opts.contentType,
        ContentLength: contentLength,
        Metadata: opts.metadata,
      }),
    );

    return `s3://${opts.bucket}/${opts.key}`;
  }

  async download(bucket: string, key: string, localPath: string): Promise<void> {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error(`No body returned for s3://${bucket}/${key}`);
    const stream = result.Body as Readable;
    await pipeline(stream, createWriteStream(localPath));
  }

  async readToBuffer(bucket: string, key: string): Promise<Buffer> {
    const result = await this.s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error(`No body returned for s3://${bucket}/${key}`);
    const stream = result.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getSignedUrl(bucket: string, key: string, expiryHours: number): Promise<string> {
    if (expiryHours <= 0) throw new Error('expiryHours must be positive');
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiryHours * 3600 });
  }

  async delete(bucket: string, key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  getNativeClient(): S3Client {
    return this.s3;
  }
}

// Lazily-constructed singleton for production code that reads env at first use.
let _default: StorageClient | undefined;
export function storageClient(): StorageClient {
  if (!_default) _default = new StorageClient();
  return _default;
}

// Test seam: reset the singleton between tests if needed.
export function _resetDefaultStorageClient(): void {
  _default = undefined;
}

// Exported for downstream consumers that build their own paths.
export { writeFile };
