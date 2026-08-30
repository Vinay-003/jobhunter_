import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import pool from '../../config/database.js';
import { env } from '../../config/env.js';

/**
 * Opaque session handling.
 * - generate token (crypto.randomBytes 32 -> hex 64 chars)
 * - hash with SHA256
 * - create sessions table row (expires 7 days)
 * - verify via hash lookup, logout, logoutAll
 * - middleware authenticateSession (checks cookie 'jobhunter_session' or Authorization Bearer fallback)
 */

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || env.SESSION_COOKIE_NAME || 'jobhunter_session';
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || env.SESSION_TTL_DAYS || 7);

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 64 chars
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type SessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
};

export async function createSession(userId: string, userAgent?: string): Promise<{ token: string; session: SessionRow }> {
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const userAgentHash = userAgent ? crypto.createHash('sha256').update(userAgent).digest('hex') : null;

  const { rows } = await pool.query<SessionRow>(
    `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, token_hash, expires_at, revoked_at, last_used_at`,
    [userId, tokenHash, expiresAt, userAgentHash],
  );
  return { token, session: rows[0] };
}

export async function verifySession(token: string): Promise<SessionRow | null> {
  const tokenHash = hashToken(token);
  const { rows } = await pool.query<SessionRow>(
    `SELECT id, user_id, token_hash, expires_at, revoked_at, last_used_at
     FROM sessions WHERE token_hash = $1 LIMIT 1`,
    [tokenHash],
  );
  const row = rows[0] ?? null;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

export async function logout(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const { rowCount } = await pool.query(
    `UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash],
  );
  return (rowCount ?? 0) > 0;
}

export async function logoutAll(userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
  return rowCount ?? 0;
}

function extractToken(req: Request): string | null {
  // 1) cookie
  const cookies: Record<string, string> | undefined = (req as unknown as { cookies?: Record<string, string> }).cookies;
  if (cookies && cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  // also try parsing raw header if cookie-parser not applied
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const m = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;\\s]+)`));
    if (m) return decodeURIComponent(m[1]);
  }
  // 2) Authorization Bearer fallback
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return null;
}

export async function authenticateSession(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const session = await verifySession(token);
  if (!session) {
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }

  // Attach user to req
  // Fetch user email for convenience
  let email: string | undefined;
  try {
    const { rows } = await pool.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [session.user_id]);
    email = rows[0]?.email;
  } catch {
    // ignore
  }

  (req as unknown as { user: { id: string; email?: string } }).user = {
    id: session.user_id,
    ...(email ? { email } : {}),
  };
  // Also set legacy numeric? keep string uuid
  (req as unknown as { session: SessionRow }).session = session;

  // Update last_used_at asynchronously (fire-and-forget)
  pool.query('UPDATE sessions SET last_used_at = now() WHERE id = $1', [session.id]).catch(() => {});

  next();
}

export function setSessionCookie(res: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' as const : 'lax' as const,
    maxAge: TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    secure: isProd,
    sameSite: isProd ? 'none' as const : 'lax' as const,
  });
}

export default {
  generateToken,
  hashToken,
  createSession,
  verifySession,
  logout,
  logoutAll,
  authenticateSession,
  setSessionCookie,
  clearSessionCookie,
};
