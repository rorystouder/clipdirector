import { Router, type Request, type Response } from 'express';
import type { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export interface HealthRouterDeps {
  redis: Redis;
  orchestratorQueue: Queue;
  version: string;
}

export function buildHealthRouter(deps: HealthRouterDeps): Router {
  const router = Router();

  router.get('/', async (_req: Request, res: Response) => {
    const checks: Record<string, unknown> = {};
    let overall: 'ok' | 'degraded' | 'unhealthy' = 'ok';

    const t0 = Date.now();
    try {
      const pong = await deps.redis.ping();
      checks.redis = { status: pong === 'PONG' ? 'ok' : 'degraded', latencyMs: Date.now() - t0 };
      if (pong !== 'PONG') overall = 'degraded';
    } catch (err) {
      checks.redis = { status: 'unhealthy', error: (err as Error).message };
      overall = 'unhealthy';
    }

    try {
      const counts = await deps.orchestratorQueue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      checks.orchestratorQueue = counts;
    } catch (err) {
      checks.orchestratorQueue = { status: 'unhealthy', error: (err as Error).message };
      overall = overall === 'unhealthy' ? 'unhealthy' : 'degraded';
    }

    const httpStatus = overall === 'unhealthy' ? 503 : 200;
    return res.status(httpStatus).json({ status: overall, version: deps.version, checks });
  });

  return router;
}
