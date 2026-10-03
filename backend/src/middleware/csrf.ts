import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { getCorsOrigins } from '../config/env.js';

const COOKIE = 'jobhunter_csrf';
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(req: Request, res: Response) {
  const existing = req.cookies?.[COOKIE];
  const token = typeof existing === 'string' && /^[a-f0-9]{64}$/.test(existing)
    ? existing : crypto.randomBytes(32).toString('hex');
  res.cookie(COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  });
  res.json({ success: true, csrfToken: token });
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    const allowed = getCorsOrigins();
    if (!allowed?.length || !allowed.includes(origin)) {
      return res.status(403).json({ success: false, message: 'Origin not allowed' });
    }
  }
  if (safeMethods.has(req.method.toUpperCase())) return next();

  // Bearer tokens are never ambient browser credentials; cookie-bearing mutations are.
  if (!req.headers.cookie && req.headers.authorization?.startsWith('Bearer ')) return next();
  const cookieToken = req.cookies?.[COOKIE];
  const headerToken = req.headers['x-csrf-token'];
  if (typeof cookieToken !== 'string' || !/^[a-f0-9]{64}$/.test(cookieToken) ||
      typeof headerToken !== 'string' || !/^[a-f0-9]{64}$/.test(headerToken) ||
      !crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken))) {
    return res.status(403).json({ success: false, message: 'CSRF token required' });
  }
  next();
}

export default csrfProtection;
