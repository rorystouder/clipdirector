import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import multer from 'multer';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { OrchestratorJobPayload } from '@clipdirector/shared-types';
import type { StorageClient } from '@clipdirector/storage-client';
import type { Logger } from '@clipdirector/logger';
import type { Db } from './db.js';
import { HttpError } from './errors.js';
import { AuthRepository } from './auth/repository.js';
import { buildAuthRouter } from './auth/routes.js';
import type { AuthRateLimits } from './auth/rate-limit.js';
import { buildJobsRouter } from './jobs/routes.js';
import { buildHealthRouter } from './health/routes.js';

export interface AppDeps {
  db: Db;
  redis: Redis;
  orchestratorQueue: Queue<OrchestratorJobPayload>;
  storage: StorageClient;
  logger: Logger;
  version: string;
  config: {
    jwtSecret: string;
    accessTokenTtlMinutes: number;
    refreshTokenTtlDays: number;
    inputBucket: string;
    outputBucket: string;
    maxClipsPerJob: number;
    maxPromptLength: number;
    maxClipBytes: number;
    signedUrlExpiryHours: number;
    authRateLimits?: AuthRateLimits;
    /**
     * Number of reverse-proxy hops in front of this gateway (e.g. 1 for a
     * single ALB / nginx). Express's `trust proxy` setting; required for
     * `req.ip` (and therefore express-rate-limit's per-IP behavior) to see
     * the real client IP. Set to 0 (default) only for direct-internet
     * deploys; never in production behind a load balancer.
     */
    trustProxy?: number;
  };
}

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Security headers: HSTS, X-Content-Type-Options nosniff, X-Frame-Options DENY,
  // referrer-policy, etc. The default `contentSecurityPolicy` is overly strict
  // for JSON APIs (it adds inline-script blocks that don't apply); disable it.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

  // Behind a reverse proxy, the immediate TCP peer is the LB IP. Without
  // `trust proxy`, every request appears from that single IP and per-IP
  // rate limiters become global throttles. The number = # of proxy hops.
  if (deps.config.trustProxy && deps.config.trustProxy > 0) {
    app.set('trust proxy', deps.config.trustProxy);
  }

  app.use(express.json({ limit: '64kb' }));

  const repo = new AuthRepository(deps.db);

  app.use(
    '/auth',
    buildAuthRouter({
      repo,
      tokens: {
        secret: deps.config.jwtSecret,
        accessTtlMinutes: deps.config.accessTokenTtlMinutes,
        refreshTtlDays: deps.config.refreshTokenTtlDays,
      },
      ...(deps.config.authRateLimits ? { rateLimits: deps.config.authRateLimits } : {}),
    }),
  );

  app.use(
    '/jobs',
    buildJobsRouter({
      redis: deps.redis,
      orchestratorQueue: deps.orchestratorQueue,
      storage: deps.storage,
      jwtSecret: deps.config.jwtSecret,
      inputBucket: deps.config.inputBucket,
      outputBucket: deps.config.outputBucket,
      maxClipsPerJob: deps.config.maxClipsPerJob,
      maxPromptLength: deps.config.maxPromptLength,
      maxClipBytes: deps.config.maxClipBytes,
      signedUrlExpiryHours: deps.config.signedUrlExpiryHours,
    }),
  );

  app.use(
    '/health',
    buildHealthRouter({
      redis: deps.redis,
      orchestratorQueue: deps.orchestratorQueue,
      version: deps.version,
    }),
  );

  app.use((req, res) => {
    res.status(404).json({ code: 'not_found', message: `No route for ${req.method} ${req.path}` });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT' ? 400 : 400;
      return res.status(status).json({ code: `multer_${err.code.toLowerCase()}`, message: err.message });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ code: err.code, message: err.message, details: err.details });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    deps.logger.error({ err: message }, 'Unhandled request error');
    return res.status(500).json({ code: 'internal_error', message: 'Internal error' });
  });

  return app;
}
