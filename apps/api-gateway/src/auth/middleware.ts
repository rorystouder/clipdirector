import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../errors.js';
import { verifyAccessToken, type AccessTokenClaims } from './tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

export interface RequireAuthDeps {
  jwtSecret: string;
}

export function requireAuth(deps: RequireAuthDeps) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('authorization') ?? req.header('Authorization');
    if (!header || !header.toLowerCase().startsWith('bearer ')) {
      return next(new UnauthorizedError('Missing Bearer token'));
    }
    const token = header.slice(7).trim();
    if (!token) return next(new UnauthorizedError('Empty Bearer token'));

    try {
      const claims: AccessTokenClaims = verifyAccessToken(token, deps.jwtSecret);
      req.user = { id: claims.sub, email: claims.email };
      return next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid token';
      return next(new UnauthorizedError(msg));
    }
  };
}
