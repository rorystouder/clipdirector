import { createLogger } from '@clipdirector/logger';
import { renderWorkerEnvSchema, validateEnv } from '@clipdirector/shared-types';
import { createRedisClient, getRedisConnection } from '@clipdirector/queue-client';
import { StorageClient } from '@clipdirector/storage-client';
import { createFilesystemMusicSelector } from './music/selector.js';
import { createRenderWorker } from './worker.js';

const log = createLogger('render-worker');

async function main(): Promise<void> {
  const env = validateEnv(renderWorkerEnvSchema);

  const redis = createRedisClient();
  const storage = new StorageClient();

  const music = createFilesystemMusicSelector({ libraryRoot: env.MUSIC_LIBRARY_PATH });

  const worker = createRenderWorker({
    connection: getRedisConnection(),
    concurrency: 2,
    deps: {
      redis,
      storage,
      music,
      ffmpeg: { ffmpegPath: env.FFMPEG_PATH, ffprobePath: env.FFPROBE_PATH },
      // Was: `process.env.AWS_S3_OUTPUT_BUCKET ?? 'clipdirector-output'` —
      // bypassed validateEnv and the hardcoded fallback meant a misconfigured
      // host would silently write to the wrong bucket. Now sourced from the
      // validated baseEnvSchema (z.string().min(1) — boot fails loud if unset).
      outputBucket: env.AWS_S3_OUTPUT_BUCKET,
      tempRoot: env.RENDER_TEMP_DIR,
      logger: log,
    },
  });

  log.info({ concurrency: 2 }, 'render-worker started');

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await worker.close();
    await redis.quit();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((err) => {
  log.fatal({ err: (err as Error).message }, 'render-worker failed to start');
  process.exit(1);
});
