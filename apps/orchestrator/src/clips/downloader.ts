import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import type { StorageClient } from '@clipdirector/storage-client';

export interface ClipDownloader {
  downloadAll(clipUris: string[], jobTempDir: string): Promise<string[]>;
}

export function createClipDownloader(storage: StorageClient): ClipDownloader {
  return {
    async downloadAll(clipUris: string[], jobTempDir: string): Promise<string[]> {
      await mkdir(jobTempDir, { recursive: true });
      const localPaths: string[] = [];
      for (const [index, uri] of clipUris.entries()) {
        const { bucket, key } = parseS3Uri(uri);
        const localPath = path.join(jobTempDir, `clip_${String(index).padStart(2, '0')}.mp4`);
        await storage.download(bucket, key, localPath);
        localPaths.push(localPath);
      }
      return localPaths;
    },
  };
}

export function parseS3Uri(uri: string): { bucket: string; key: string } {
  if (!uri.startsWith('s3://')) {
    throw new Error(`Expected s3:// URI, got: ${uri}`);
  }
  const rest = uri.slice(5);
  const slash = rest.indexOf('/');
  if (slash <= 0) throw new Error(`Malformed s3:// URI: ${uri}`);
  return { bucket: rest.slice(0, slash), key: rest.slice(slash + 1) };
}
