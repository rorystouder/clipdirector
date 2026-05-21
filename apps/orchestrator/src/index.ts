import { createLogger } from '@clipdirector/logger';
import { orchestratorEnvSchema, validateEnv } from '@clipdirector/shared-types';
import {
  createRedisClient,
  createRenderQueue,
  getRedisConnection,
} from '@clipdirector/queue-client';
import { StorageClient } from '@clipdirector/storage-client';
import { createClaudeClient } from './claude/client.js';
import { createClipDownloader } from './clips/downloader.js';
import { createFfmpegFrameSampler } from './clips/frame-sampler.js';
import { createOpenAiTranscriber } from './clips/transcriber.js';
import { createOrchestratorWorker } from './worker.js';

const log = createLogger('orchestrator');

async function main(): Promise<void> {
  const env = validateEnv(orchestratorEnvSchema);

  const redis = createRedisClient();
  const renderQueue = createRenderQueue(getRedisConnection());
  const storage = new StorageClient();

  const claude = createClaudeClient({
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.ANTHROPIC_MODEL,
    maxTokens: env.ANTHROPIC_MAX_TOKENS,
  });
  const downloader = createClipDownloader(storage);
  const frameSampler = createFfmpegFrameSampler({
    ffmpegPath: env.FFMPEG_PATH,
    ffprobePath: env.FFPROBE_PATH,
  });
  const transcriber = createOpenAiTranscriber({
    apiKey: env.OPENAI_API_KEY,
    ffmpegPath: env.FFMPEG_PATH,
    ffprobePath: env.FFPROBE_PATH,
  });

  const worker = createOrchestratorWorker({
    connection: getRedisConnection(),
    concurrency: 4,
    deps: {
      redis,
      renderQueue,
      downloader,
      frameSampler,
      transcriber,
      claude,
      outputBucket: env.AWS_S3_OUTPUT_BUCKET,
      tempRoot: '/tmp/clipdirector',
      logger: log,
    },
  });

  log.info({ concurrency: 4 }, 'orchestrator worker started');

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await worker.close();
    await renderQueue.close();
    await redis.quit();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((err) => {
  log.fatal({ err: (err as Error).message }, 'orchestrator failed to start');
  process.exit(1);
});
