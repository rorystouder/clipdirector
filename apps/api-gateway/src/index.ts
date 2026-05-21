import { createLogger } from '@clipdirector/logger';
import { apiGatewayEnvSchema, validateEnv } from '@clipdirector/shared-types';
import { createOrchestratorQueue, createRedisClient, createRenderQueue, getRedisConnection } from '@clipdirector/queue-client';
import { StorageClient } from '@clipdirector/storage-client';
import { createApp } from './app.js';
import { openDatabase } from './db.js';
import { createDlqProcessor } from './dlq/processor.js';

const log = createLogger('api-gateway');

async function main(): Promise<void> {
  const env = validateEnv(apiGatewayEnvSchema);

  const db = openDatabase(env.DATABASE_FILE);
  const redis = createRedisClient();
  const orchestratorQueue = createOrchestratorQueue(getRedisConnection());
  const renderQueue = createRenderQueue(getRedisConnection());
  const storage = new StorageClient();

  const dlq = createDlqProcessor({
    redis,
    queues: [orchestratorQueue, renderQueue],
    logger: log,
  });
  dlq.start();

  const app = createApp({
    db,
    redis,
    orchestratorQueue,
    storage,
    logger: log,
    version: '0.1.0',
    config: {
      jwtSecret: env.JWT_SECRET,
      accessTokenTtlMinutes: env.ACCESS_TOKEN_TTL_MINUTES,
      refreshTokenTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
      inputBucket: env.AWS_S3_INPUT_BUCKET,
      outputBucket: env.AWS_S3_OUTPUT_BUCKET,
      maxClipsPerJob: env.MAX_CLIPS_PER_JOB,
      maxPromptLength: env.MAX_PROMPT_LENGTH,
      maxClipBytes: env.MAX_CLIP_BYTES,
      signedUrlExpiryHours: 1,
      trustProxy: env.TRUST_PROXY_HOPS,
    },
  });

  const server = app.listen(env.API_PORT, () => {
    log.info({ port: env.API_PORT }, 'api-gateway listening');
  });

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    dlq.stop();
    server.close();
    await orchestratorQueue.close();
    await renderQueue.close();
    await redis.quit();
    db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((err) => {
  log.fatal({ err: (err as Error).message }, 'api-gateway failed to start');
  process.exit(1);
});
