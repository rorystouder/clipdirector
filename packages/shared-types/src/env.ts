import { z } from 'zod';

export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  AWS_S3_INPUT_BUCKET: z.string().min(1),
  AWS_S3_OUTPUT_BUCKET: z.string().min(1),
  AWS_S3_ENDPOINT: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  AWS_S3_FORCE_PATH_STYLE: z
    .union([z.string(), z.boolean()])
    .transform((v) => v === true || v === 'true')
    .default(false),
});

export const apiGatewayEnvSchema = baseEnvSchema.extend({
  API_PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  DATABASE_FILE: z.string().min(1).default('./data/clipdirector.db'),
  MAX_CLIPS_PER_JOB: z.coerce.number().int().positive().default(12),
  MAX_RAW_FOOTAGE_MINUTES: z.coerce.number().int().positive().default(5),
  MAX_PROMPT_LENGTH: z.coerce.number().int().positive().default(500),
  MAX_CLIP_BYTES: z.coerce.number().int().positive().default(500 * 1024 * 1024),
  INPUT_BLOB_TTL_HOURS: z.coerce.number().int().positive().default(2),
  OUTPUT_BLOB_TTL_DAYS: z.coerce.number().int().positive().default(7),
  JOB_STATUS_TTL_DAYS: z.coerce.number().int().positive().default(7),
  // Number of reverse-proxy hops in front of the gateway. 0 = direct
  // internet; 1 = single LB/nginx; 2 = nested CDN→LB; etc. Required for
  // express-rate-limit to see the real client IP. Set in production.
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
});

export const orchestratorEnvSchema = baseEnvSchema.extend({
  ANTHROPIC_API_KEY: z.string().startsWith('sk-ant-', 'ANTHROPIC_API_KEY must start with sk-ant-'),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),
  ANTHROPIC_MAX_TOKENS: z.coerce.number().int().positive().default(2000),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY required for Whisper'),
  // Orchestrator needs ffmpeg + ffprobe for frame sampling and audio-stream
  // probing. Hardcoded paths previously bypassed validateEnv, breaking on
  // any host where ffmpeg lives outside /usr/bin (Alpine, custom builds).
  FFMPEG_PATH: z.string().default('/usr/bin/ffmpeg'),
  FFPROBE_PATH: z.string().default('/usr/bin/ffprobe'),
});

export const renderWorkerEnvSchema = baseEnvSchema.extend({
  FFMPEG_PATH: z.string().default('/usr/bin/ffmpeg'),
  FFPROBE_PATH: z.string().default('/usr/bin/ffprobe'),
  RENDER_TEMP_DIR: z.string().default('/tmp/clipdirector'),
  MUSIC_LIBRARY_PATH: z.string().min(1),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type ApiGatewayEnv = z.infer<typeof apiGatewayEnvSchema>;
export type OrchestratorEnv = z.infer<typeof orchestratorEnvSchema>;
export type RenderWorkerEnv = z.infer<typeof renderWorkerEnvSchema>;

export function validateEnv<S extends z.ZodTypeAny>(
  schema: S,
  source: NodeJS.ProcessEnv = process.env,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  return result.data;
}
