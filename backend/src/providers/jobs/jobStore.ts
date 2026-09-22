import crypto from 'node:crypto';
import pool from '../../config/database.js';
import type { NormalizedJob } from './JobProvider.js';

/** Strip HTML tags/entities for ranking text + storage. */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 8000) || null;
}

export function contentHash(job: NormalizedJob): string {
  return crypto
    .createHash('sha256')
    .update(`${job.source}|${job.externalId}|${job.title}|${job.company}`)
    .digest('hex');
}

/** Shared upsert for all non-Jooble providers (best-effort, per-row errors ignored). */
export async function storeJobsToDb(jobs: NormalizedJob[]): Promise<void> {
  for (const j of jobs) {
    const hash = contentHash(j);
    try {
      await pool.query(
        `INSERT INTO jobs (source, external_id, title, company, location, description, url, salary, work_mode, posted_at, content_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (source, external_id) DO UPDATE SET
           title = EXCLUDED.title,
           company = EXCLUDED.company,
           location = EXCLUDED.location,
           description = EXCLUDED.description,
           url = EXCLUDED.url,
           salary = EXCLUDED.salary,
           work_mode = EXCLUDED.work_mode,
           posted_at = EXCLUDED.posted_at,
           content_hash = EXCLUDED.content_hash,
           fetched_at = now()`,
        [
          j.source,
          j.externalId,
          j.title,
          j.company,
          j.location,
          j.description,
          j.url,
          j.salary ? JSON.stringify(j.salary) : null,
          j.workMode,
          j.postedAt,
          hash,
        ],
      );
    } catch {
      // ignore per-row errors
    }
  }
}

/** Generic DB fallback: keyword search across all sources (used when a provider API fails). */
export async function searchJobsFromDb(keywords: string, limit = 20): Promise<NormalizedJob[]> {
  const kw = keywords.trim();
  if (!kw) return [];
  const like = `%${kw.split(/\s+/).join('%')}%`;
  const { rows } = await pool.query<{
    source: string; external_id: string; title: string; company: string; location: string | null;
    description: string | null; url: string | null; salary: unknown;
    posted_at: string | null; work_mode: string | null;
  }>(
    `SELECT source, external_id, title, company, location, description, url, salary, posted_at, work_mode
     FROM jobs WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY fetched_at DESC LIMIT $2`,
    [like, limit],
  );
  return rows.map((r) => ({
    source: r.source,
    externalId: r.external_id,
    title: r.title,
    company: r.company,
    location: r.location,
    description: r.description,
    url: r.url,
    salary: r.salary,
    postedAt: r.posted_at,
    workMode: r.work_mode,
  }));
}

export default { stripHtml, contentHash, storeJobsToDb, searchJobsFromDb };
