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
import { buildAuthLimiter, DEFAULT_AUTH_RATE_LIMITS, type AuthRateLimits } from './rate-limit.js';

const credentialsSchema = z.object({
  email: z.string().email().max(254).transform((s) => s.toLowerCase()),
  password: z.string().min(12).max(256),
});

const refreshSchema = z.object({ refreshToken: z.string().min(32) });

export interface AuthRouterDeps {
  repo: AuthRepository;
  tokens: TokenConfig;
  rateLimits?: AuthRateLimits;
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
  const limits = deps.rateLimits ?? DEFAULT_AUTH_RATE_LIMITS;
  const registerLimiter = buildAuthLimiter(limits.register);
  const loginLimiter = buildAuthLimiter(limits.login);
  const refreshLimiter = buildAuthLimiter(limits.refresh);

  router.post('/register', registerLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

  router.post('/login', loginLimiter, async (req: Request, res: Response, next: NextFunction) => {
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

  router.post('/refresh', refreshLimiter, (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = refreshSchema.safeParse(req.body);
      if (!parsed.success) return next(new UnauthorizedError('Invalid refresh token'));

      const hash = hashRefreshToken(parsed.data.refreshToken);
      const row = deps.repo.findRefreshByHash(hash);
      if (!row) return next(new UnauthorizedError('Invalid refresh token'));

      // Theft detection: a refresh-token rotation chain only revokes the
      // PREVIOUS token. If the previous token is presented again, it's
      // either (a) the legitimate client replaying after a network blip
      // — possible but rare since the rotated pair was already saved
      // client-side; or (b) the original token was captured and the
      // attacker is racing the client. We can't distinguish, so we
      // treat it as theft: revoke EVERY refresh token for the user.
      // The legitimate client will get 401 on next request and have to
      // re-authenticate — a one-time pain. The attacker is fully
      // de-credentialed.
      if (row.revoked_at) {
        deps.repo.revokeAllForUser(row.user_id);
        return next(new UnauthorizedError('Refresh token revoked'));
      }

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
