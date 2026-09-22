import crypto from 'node:crypto';
import pool from '../../config/database.js';

/**
 * Daily/monthly quota guard for metered job providers.
 * Uses external_api_usage with date-suffixed provider keys, e.g.
 *   remotive:2026-09-22  (resets automatically each day)
 *   jobspipe:2026-09     (monthly credit tracking)
 * Jooble keeps its legacy 'jooble' key untouched.
 */

function dayKey(name: string): string {
  return `${name}:${new Date().toISOString().slice(0, 10)}`;
}

function monthKey(name: string): string {
  return `${name}:${new Date().toISOString().slice(0, 7)}`;
}

async function getCount(key: string): Promise<number> {
  try {
    const r = await pool.query('SELECT request_count FROM external_api_usage WHERE provider=$1', [key]);
    return r.rows[0]?.request_count ?? 0;
  } catch {
    return 0;
  }
}

/** True if another call is allowed under the daily limit. */
export async function checkDailyBudget(name: string, limit: number): Promise<boolean> {
  if (!limit || limit <= 0) return true;
  const used = await getCount(dayKey(name));
  return used < limit;
}

export async function recordDailyCall(name: string): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO external_api_usage (id, provider, request_count, last_called_at) VALUES ($1,$2,1,now()) ON CONFLICT (provider) DO UPDATE SET request_count=external_api_usage.request_count+1, last_called_at=now()',
      [crypto.randomUUID(), dayKey(name)],
    );
  } catch {
    // tracking is best-effort
  }
}

/** Monthly credit tracking (JobsPipe bills per job returned). */
export async function getMonthlyCredits(name: string): Promise<number> {
  return getCount(monthKey(name));
}

export async function recordMonthlyCredits(name: string, credits: number): Promise<void> {
  if (!credits || credits <= 0) return;
  try {
    await pool.query(
      'INSERT INTO external_api_usage (id, provider, request_count, last_called_at) VALUES ($1,$2,$3,now()) ON CONFLICT (provider) DO UPDATE SET request_count=external_api_usage.request_count+$3, last_called_at=now()',
      [crypto.randomUUID(), monthKey(name), Math.round(credits)],
    );
  } catch {
    // tracking is best-effort
  }
}

export default { checkDailyBudget, recordDailyCall, getMonthlyCredits, recordMonthlyCredits };
