import { v4 as uuid } from 'uuid';
import type { Db } from '../db.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export class AuthRepository {
  constructor(private readonly db: Db) {}

  createUser(email: string, passwordHash: string): UserRow {
    const id = uuid();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, email, passwordHash, now, now);
    return { id, email, password_hash: passwordHash, created_at: now, updated_at: now };
  }

  findUserByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  findUserById(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  storeRefreshToken(userId: string, tokenHash: string, expiresAt: string): RefreshTokenRow {
    const id = uuid();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
      )
      .run(id, userId, tokenHash, expiresAt, now);
    return { id, user_id: userId, token_hash: tokenHash, expires_at: expiresAt, revoked_at: null, created_at: now };
  }

  findRefreshByHash(tokenHash: string): RefreshTokenRow | undefined {
    return this.db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(tokenHash) as
      | RefreshTokenRow
      | undefined;
  }

  revokeRefreshById(id: string): void {
    this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), id);
  }

  revokeAllForUser(userId: string): void {
    this.db
      .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(new Date().toISOString(), userId);
  }
}
