// Phase 1 implementation target. See PRD Section 10.
// Will wrap @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner behind a StorageClient class.
// Interface intentionally storage-agnostic so the backend can later swap to MinIO/R2/etc.

export interface UploadOptions {
  bucket: string;
  key: string;
  data?: Buffer;
  filePath?: string;
  contentType: string;
  metadata?: Record<string, string>;
}

export interface StorageClient {
  upload(opts: UploadOptions): Promise<string>;
  download(bucket: string, key: string, localPath: string): Promise<void>;
  getSignedUrl(bucket: string, key: string, expiryHours: number): Promise<string>;
  delete(bucket: string, key: string): Promise<void>;
}
