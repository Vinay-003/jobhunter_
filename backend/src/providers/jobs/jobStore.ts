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
    .update(`${job.title}|${job.company}|${stripHtml(job.description) ?? ''}`)
    .digest('hex');
}

export function markFallback(jobs: NormalizedJob[], requestedProvider: string): NormalizedJob[] {
  return jobs.map(job => ({ ...job, retrieval: { status: 'fallback', requestedProvider, fallbackSource: job.source } }));
}

/** Numeric provider epochs are seconds unless already in millisecond range. */
export function normalizedPostedAt(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : /^\d{10,13}$/.test(value) ? Number(value) : null;
  const date = new Date(numeric === null ? value : numeric < 1e11 ? numeric * 1000 : numeric);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function canonicalJobUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(ref|source|fbclid|gclid|tracking)$/i.test(key)) url.searchParams.delete(key);
    return url.toString().replace(/\/$/, '');
  } catch { return null; }
}

export function deduplicateJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const byIdentity = new Map<string, NormalizedJob>();
  const bySignature = new Map<string,string>();
  for (const job of jobs) {
    const url = canonicalJobUrl(job.url);
    const signature = [job.title,job.company,job.location].map((text) => String(text ?? '').toLowerCase().replace(/\s+/g,' ').trim()).join('|');
    const signatureKey = job.company && job.location && (job.description?.length ?? 0) > 100 ? `${signature}|${crypto.createHash('sha256').update(stripHtml(job.description) ?? '').digest('hex')}` : '';
    const key = (signatureKey && bySignature.get(signatureKey)) || (url ? `url:${url}` : `${job.source}:${job.externalId}`);
    const existing = byIdentity.get(key);
    if (!existing) { byIdentity.set(key, { ...job, canonicalUrl: url, provenance: [{ source: job.source, externalId: job.externalId }] }); if (signatureKey) bySignature.set(signatureKey,key); continue; }
    const provenance = [...(existing.provenance ?? []), { source: job.source, externalId: job.externalId }];
    const richer = (job.description?.length ?? 0) > (existing.description?.length ?? 0) ? job : existing;
    byIdentity.set(key, { ...richer, provenance, canonicalUrl: url });
  }
  return [...byIdentity.values()];
}

/** Resolve the database key even when a provider already inserted this posting. */
export async function upsertJob(job: NormalizedJob, client: { query: (sql: string, params?: any[]) => Promise<any> } = pool): Promise<string> {
  const result = await client.query(
    `INSERT INTO jobs (source, external_id, title, company, location, description, description_quality, url, salary, work_mode, posted_at, fetched_at, content_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),$12)
     ON CONFLICT (source, external_id) DO UPDATE SET title=EXCLUDED.title, company=EXCLUDED.company,
       location=EXCLUDED.location, description=EXCLUDED.description, description_quality=EXCLUDED.description_quality,
       url=EXCLUDED.url, salary=EXCLUDED.salary, work_mode=EXCLUDED.work_mode,
       posted_at=EXCLUDED.posted_at, fetched_at=now(), content_hash=EXCLUDED.content_hash RETURNING id`,
    [job.source, job.externalId, job.title, job.company || '', job.location, stripHtml(job.description), job.descriptionQuality ?? 'unknown', job.url, job.salary ? JSON.stringify(job.salary) : null, job.workMode, job.postedAt, contentHash(job)],
  );
  if (!result.rows[0]?.id) throw new Error('Job upsert did not return an id');
  return result.rows[0].id;
}

/** Shared upsert for all non-Jooble providers (best-effort, per-row errors ignored). */
export async function storeJobsToDb(jobs: NormalizedJob[]): Promise<void> {
  for (const j of jobs) {
    try {
      await upsertJob(j);
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
