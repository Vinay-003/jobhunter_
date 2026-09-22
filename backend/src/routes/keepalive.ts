// src/routes/keepalive.ts — Public, no-auth endpoint to keep Supabase active
// Any request here touches the DB (INSERT into keepalive_pings) which counts
// as activity for Supabase's 7-day inactivity pause detection.
// Cloudflare Worker cron can hit GET/POST /keepalive, /api/keepalive, /api/v1/keepalive
// All methods/paths are public — optional KEEPALIVE_TOKEN check if env is set.

import { Router } from 'express';
import pool from '../config/database.js';

const router = Router();

// Optional token protection: set KEEPALIVE_TOKEN in env to require
// header x-keepalive-token or ?token= . If not set, endpoint is fully public.
function checkToken(req: any, res: any): boolean {
  const expected = process.env.KEEPALIVE_TOKEN;
  if (!expected) return true; // open
  const got =
    (req.headers['x-keepalive-token'] as string) ||
    (req.headers['x-cron-secret'] as string) ||
    (req.query?.token as string) ||
    (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '');
  if (got !== expected) {
    res.status(401).json({ success: false, message: 'Invalid keepalive token' });
    return false;
  }
  return true;
}

async function handlePing(req: any, res: any) {
  const start = Date.now();
  if (!checkToken(req, res)) return;

  const ip =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    (req.socket?.remoteAddress as string) ||
    'unknown';
  const source =
    (req.query?.source as string) ||
    (req.headers['x-keepalive-source'] as string) ||
    (req.headers['x-cron-source'] as string) ||
    'cron';
  const userAgent = (req.headers['user-agent'] as string) || null;
  const method = req.method;

  try {
    // Primary: INSERT into keepalive_pings — this is the activity that keeps Supabase alive
    let pingRow: any = null;
    try {
      const r = await pool.query(
        `INSERT INTO keepalive_pings (source, ip, method, user_agent)
         VALUES ($1, $2, $3, $4)
         RETURNING id, pinged_at, source`,
        [source, ip, method, userAgent]
      );
      pingRow = r.rows[0];
    } catch (e: any) {
      // Fallback if table doesn't exist yet (migration not run) — still count as DB activity via SELECT 1
      if (e.code === '42P01') {
        // undefined_table
        console.warn('[keepalive] table keepalive_pings missing — running fallback SELECT 1. Run migration 005_keepalive.sql!');
        await pool.query('SELECT 1');
        return res.json({
          success: true,
          message: 'DB ping OK (fallback SELECT 1) — run migration 005_keepalive.sql to enable persistent pings',
          fallback: true,
          latency_ms: Date.now() - start,
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      }
      throw e;
    }

    // Best-effort prune: keep table minimal — you asked to not fill space
    // After each INSERT, keep only latest 5 rows ( ~1KB total) — still shows recent activity for debugging
    // Change LIMIT 5 -> LIMIT 1 for truly empty-ish, or DELETE immediately for 0 rows (still counts as activity)
    // Fire-and-forget, don't block response
    pool
      .query(`DELETE FROM keepalive_pings WHERE pinged_at < NOW() - INTERVAL '7 days'`)
      .catch(() => {});
    // Cap to 5 newest — minimal storage, prevents unbounded growth (was 1000)
    pool
      .query(
        `DELETE FROM keepalive_pings WHERE id NOT IN (SELECT id FROM keepalive_pings ORDER BY pinged_at DESC LIMIT 5)`
      )
      .catch(() => {});

    // Stats for response (best-effort)
    let total: number | null = null;
    let recent: any[] = [];
    try {
      const c = await pool.query(`SELECT COUNT(*)::int AS count FROM keepalive_pings`);
      total = c.rows[0].count;
      const r = await pool.query(
        `SELECT id, pinged_at, source, ip, method FROM keepalive_pings ORDER BY pinged_at DESC LIMIT 5`
      );
      recent = r.rows;
    } catch {}

    res.json({
      success: true,
      message: 'Supabase keepalive ping recorded',
      ping: pingRow,
      latency_ms: Date.now() - start,
      total_pings: total,
      recent,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  } catch (err: any) {
    console.error('[keepalive] error:', err);
    res.status(500).json({
      success: false,
      message: 'Keepalive ping failed',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
}

// Support all methods — cron can use GET or POST
router.get('/', handlePing);
router.post('/', handlePing);
router.put('/', handlePing);
router.get('/ping', handlePing);
router.post('/ping', handlePing);
router.get('/health', handlePing);
router.head('/', (req, res) => {
  // lightweight HEAD for uptime monitors
  if (!checkToken(req, res)) return;
  res.status(200).end();
});

export default router;
