import jwt, { type JwtPayload } from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';

/**
 * Issuer / audience for HS256 access tokens. If `JWT_SECRET` is ever reused
 * for another signed thing (webhook signer, internal RPC), iss+aud prevent
 * cross-purpose token confusion. Defense-in-depth — security audit L5.
 */
export const JWT_ISSUER = 'clipdirector-api';
export const JWT_AUDIENCE = 'clipdirector-app';

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  email: string;
}

export interface TokenConfig {
  secret: string;
  accessTtlMinutes: number;
  refreshTtlDays: number;
}

export function signAccessToken(userId: string, email: string, cfg: TokenConfig): string {
  return jwt.sign({ email }, cfg.secret, {
    subject: userId,
    expiresIn: `${cfg.accessTtlMinutes}m`,
    algorithm: 'HS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenClaims {
  const decoded = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  });
  if (typeof decoded === 'string' || !decoded.sub || typeof decoded.sub !== 'string') {
    throw new Error('Malformed token claims');
  }
  const email = (decoded as JwtPayload).email;
  if (typeof email !== 'string') throw new Error('Malformed token claims');
  return { ...(decoded as JwtPayload), sub: decoded.sub, email };
}

export function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString('hex');
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function refreshExpiryIso(refreshTtlDays: number, now: Date = new Date()): string {
  return new Date(now.getTime() + refreshTtlDays * 24 * 60 * 60 * 1000).toISOString();
}
