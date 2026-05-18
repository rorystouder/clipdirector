import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { ConflictError, UnauthorizedError, ValidationError } from '../errors.js';
import type { AuthRepository } from './repository.js';
import { hashPassword, verifyPassword } from './passwords.js';
import {
  generateRefreshTokenRaw,
  hashRefreshToken,
  refreshExpiryIso,
  signAccessToken,
  type TokenConfig,
} from './tokens.js';
import { requireAuth } from './middleware.js';

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(256),
});

const refreshSchema = z.object({ refreshToken: z.string().min(32) });

export interface AuthRouterDeps {
  repo: AuthRepository;
  tokens: TokenConfig;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

function issueTokens(userId: string, email: string, deps: AuthRouterDeps): TokenPair {
  const accessToken = signAccessToken(userId, email, deps.tokens);
  const raw = generateRefreshTokenRaw();
  const hash = hashRefreshToken(raw);
  const expiresAt = refreshExpiryIso(deps.tokens.refreshTtlDays);
  deps.repo.storeRefreshToken(userId, hash, expiresAt);
  return {
    accessToken,
    refreshToken: raw,
    expiresInSec: deps.tokens.accessTtlMinutes * 60,
  };
}

export function buildAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();

  router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError('Invalid credentials', parsed.error.issues));

      if (deps.repo.findUserByEmail(parsed.data.email)) {
        return next(new ConflictError('Email already registered'));
      }

      const hash = await hashPassword(parsed.data.password);
      const user = deps.repo.createUser(parsed.data.email, hash);
      const tokens = issueTokens(user.id, user.email, deps);

      return res.status(201).json({
        user: { id: user.id, email: user.email },
        ...tokens,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) return next(new UnauthorizedError('Invalid email or password'));

      const user = deps.repo.findUserByEmail(parsed.data.email);
      if (!user) return next(new UnauthorizedError('Invalid email or password'));

      const ok = await verifyPassword(user.password_hash, parsed.data.password);
      if (!ok) return next(new UnauthorizedError('Invalid email or password'));

      const tokens = issueTokens(user.id, user.email, deps);
      return res.status(200).json({
        user: { id: user.id, email: user.email },
        ...tokens,
      });
    } catch (err) {
      return next(err);
    }
  });

  router.post('/refresh', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) return next(new UnauthorizedError('Invalid refresh token'));

      const hash = hashRefreshToken(parsed.data.refreshToken);
      const row = deps.repo.findRefreshByHash(hash);
      if (!row) return next(new UnauthorizedError('Invalid refresh token'));
      if (row.revoked_at) return next(new UnauthorizedError('Refresh token revoked'));
      if (new Date(row.expires_at).getTime() <= Date.now()) {
        return next(new UnauthorizedError('Refresh token expired'));
      }

      const user = deps.repo.findUserById(row.user_id);
      if (!user) return next(new UnauthorizedError('Invalid refresh token'));

      // Rotate: revoke old, issue new pair
      deps.repo.revokeRefreshById(row.id);
      const tokens = issueTokens(user.id, user.email, deps);

      return res.status(200).json(tokens);
    } catch (err) {
      return next(err);
    }
  });

  router.post('/logout', (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) return next(new ValidationError('refreshToken required'));

      const hash = hashRefreshToken(parsed.data.refreshToken);
      const row = deps.repo.findRefreshByHash(hash);
      if (row && !row.revoked_at) deps.repo.revokeRefreshById(row.id);

      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  router.get('/me', requireAuth({ jwtSecret: deps.tokens.secret }), (req: Request, res: Response) => {
    return res.status(200).json({ user: req.user });
  });

  return router;
}
