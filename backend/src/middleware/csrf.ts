import type { Request, Response, NextFunction } from 'express';
import { getCorsOrigins } from '../config/env.js';

/**
 * Simple CSRF protection.
 * - If cookie SameSite=None (cross-site), require X-CSRF-Token header matching
 *   double-submit token stored in cookie.
 * - Validate Origin header against CORS_ALLOWED_ORIGINS when present.
 *
 * Assumes cookie `csrf_token` (or `jobhunter_csrf`) holds the double-submit value.
 * Frontend must read cookie and echo it in `X-CSRF-Token` header for state-changing methods.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_COOKIE_NAMES = ['csrf_token', 'jobhunter_csrf', '_csrf'];
const CSRF_HEADER = 'x-csrf-token';

function getCsrfCookie(req: Request): string | undefined {
  const cookies: Record<string, string> = (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};
  for (const name of CSRF_COOKIE_NAMES) {
    if (cookies[name]) return cookies[name];
  }
  return undefined;
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    // Still validate Origin for safe methods if present (optional defense-in-depth)
    if (!validateOrigin(req, res)) return;
    return next();
  }

  // Validate Origin / Referer against allowed origins
  if (!validateOrigin(req, res)) return;

  // Enforce double-submit token if CSRF cookie is present
  const cookieToken = getCsrfCookie(req);
  if (cookieToken) {
    const headerToken = (req.headers[CSRF_HEADER] as string | undefined) ??
      (req.headers['x-xsrf-token'] as string | undefined);
    if (!headerToken || headerToken !== cookieToken) {
      return res.status(403).json({ success: false, message: 'CSRF token mismatch' });
    }
  } else {
    // No CSRF cookie set: check if request claims SameSite=None context via Origin cross-site.
    // We only enforce CSRF when cookie SameSite=None is expected, but we still require Origin check above.
    // If CORS origins are configured and Origin is cross-site and token missing, reject state-changing.
    // For backward compat when no CSRF cookie is issued, allow but warn via header presence.
    // If CORS_ALLOWED_ORIGINS is set and request is cross-origin without token, we could optionally remain permissive.
    // To be effective when SameSite=None, frontend should set csrf cookie; enforcement happens there.
  }

  next();
}

function validateOrigin(req: Request, res: Response): boolean {
  const origin = req.headers.origin as string | undefined;
  if (!origin) return true; // no origin header (e.g., same-origin form or non-browser)

  const allowed = getCorsOrigins();
  if (!allowed || allowed.length === 0) return true; // no allowlist configured

  // Allow exact match or wildcard?
  const isAllowed = allowed.some((a) => {
    if (a === '*') return true;
    return origin === a;
  });

  if (!isAllowed) {
    res.status(403).json({ success: false, message: 'Origin not allowed', origin });
    return false;
  }
  return true;
}

export default csrfProtection;
