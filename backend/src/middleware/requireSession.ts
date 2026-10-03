import type { Request, Response, NextFunction } from 'express';
import { extractToken, verifySession } from '../modules/auth/session.js';

/** V1 only accepts revocable opaque sessions; legacy JWTs never authorize V1. */
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }
  try {
    const session = await verifySession(token);
    if (!session) return res.status(401).json({ success: false, message: 'Invalid or expired session' });
    (req as any).user = { id: session.user_id };
    (req as any).session = session;
    next();
  } catch (error) { next(error); }
}

export default requireSession;
