import crypto from 'node:crypto';
import pool from '../../config/database.js';
import type { NormalizedJob } from './JobProvider.js';

/** Strip HTML tags/entities for ranking text + storage. */
export function stripHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  return String(html)
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(?:p|div|h[1-6]|li|ul|ol|section|article|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n(?:\s*\n)* */g, '\n')
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
  const normalized = (text: unknown) => String(text ?? '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
  const comparable = (job: NormalizedJob) => normalized(stripHtml(job.description));
  for (const job of jobs) {
    const url = canonicalJobUrl(job.url);
    const signature = [job.title,job.company,job.location].map((text) => String(text ?? '').toLowerCase().replace(/\s+/g,' ').trim()).join('|');
    const signatureKey = job.company && job.location && (job.description?.length ?? 0) > 100 ? `${signature}|${crypto.createHash('sha256').update(stripHtml(job.description) ?? '').digest('hex')}` : '';
    const overlapping = [...byIdentity.entries()].find(([, prior]) => {
      if (normalized(prior.title) !== normalized(job.title) || normalized(prior.company) !== normalized(job.company) || normalized(prior.location) !== normalized(job.location) || !normalized(job.location)) return false;
      const a = comparable(prior), b = comparable(job);
      return a.length >= 100 && b.length >= 100 && (a.includes(b) || b.includes(a));
    })?.[0];
    const key = (signatureKey && bySignature.get(signatureKey)) || overlapping || (url ? `url:${url}` : `${job.source}:${job.externalId}`);
    const existing = byIdentity.get(key);
    if (!existing) { byIdentity.set(key, { ...job, canonicalUrl: url, provenance: [{ source: job.source, externalId: job.externalId }] }); if (signatureKey) bySignature.set(signatureKey,key); continue; }
    const provenance = [...(existing.provenance ?? []), { source: job.source, externalId: job.externalId }];
    const richer = (job.description?.length ?? 0) > (existing.description?.length ?? 0) ? job : existing;
    byIdentity.set(key, { ...richer, provenance: [...new Map(provenance.map(p => [`${p.source}:${p.externalId}`, p])).values()], foundByTitles: [...new Set([...(existing.foundByTitles ?? []), ...(job.foundByTitles ?? [])])], canonicalUrl: canonicalJobUrl(richer.url) });
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

/** Batch upsert jobs and return a map of `${source}:${externalId}` -> id in 1-2 queries. */
export async function upsertJobsBatch(
  jobs: NormalizedJob[],
  client: { query: (sql: string, params?: any[]) => Promise<any> } = pool,
): Promise<Map<string, string>> {
  const idMap = new Map<string, string>();
  if (!jobs.length) return idMap;

  // Deduplicate by source:externalId within the batch to avoid ON CONFLICT duplicate key error
  const uniqueJobs = new Map<string, NormalizedJob>();
  for (const job of jobs) {
    uniqueJobs.set(`${job.source}:${job.externalId}`, job);
  }
  const jobList = [...uniqueJobs.values()];

  // Chunk into batches of 25 (12 parameters per job * 25 = 300 parameters, well under Postgres limit)
  const CHUNK_SIZE = 25;
  for (let c = 0; c < jobList.length; c += CHUNK_SIZE) {
    const chunk = jobList.slice(c, c + CHUNK_SIZE);
    const valuePlaceholders: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    for (const job of chunk) {
      valuePlaceholders.push(`($${pIdx},$${pIdx+1},$${pIdx+2},$${pIdx+3},$${pIdx+4},$${pIdx+5},$${pIdx+6},$${pIdx+7},$${pIdx+8},$${pIdx+9},$${pIdx+10},now(),$${pIdx+11})`);
      params.push(
        job.source,
        job.externalId,
        job.title,
        job.company || '',
        job.location,
        stripHtml(job.description),
        job.descriptionQuality ?? 'unknown',
        job.url,
        job.salary ? JSON.stringify(job.salary) : null,
        job.workMode,
        job.postedAt,
        contentHash(job)
      );
      pIdx += 12;
    }

    const sql = `
      INSERT INTO jobs (source, external_id, title, company, location, description, description_quality, url, salary, work_mode, posted_at, fetched_at, content_hash)
      VALUES ${valuePlaceholders.join(', ')}
      ON CONFLICT (source, external_id) DO UPDATE SET
        title = EXCLUDED.title,
        company = EXCLUDED.company,
        location = EXCLUDED.location,
        description = EXCLUDED.description,
        description_quality = EXCLUDED.description_quality,
        url = EXCLUDED.url,
        salary = EXCLUDED.salary,
        work_mode = EXCLUDED.work_mode,
        posted_at = EXCLUDED.posted_at,
        fetched_at = now(),
        content_hash = EXCLUDED.content_hash
      RETURNING id, source, external_id
    `;

    const result = await client.query(sql, params);
    for (const row of result.rows) {
      idMap.set(`${row.source}:${row.external_id}`, row.id);
    }
  }

  return idMap;
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
    description: string | null; description_quality: 'full' | 'snippet' | 'unknown' | null; url: string | null; salary: unknown;
    posted_at: string | null; work_mode: string | null; fetched_at?: string;
  }>(
    `SELECT source, external_id, title, company, location, description, description_quality, url, salary, posted_at, work_mode, fetched_at
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
    descriptionQuality: r.description_quality ?? 'unknown',
    url: r.url,
    salary: r.salary,
    postedAt: r.source === 'jooble' ? null : r.posted_at,
    updatedAt: r.source === 'jooble' ? r.posted_at : null,
    dateSource: r.source === 'jooble' ? 'updated' : r.posted_at ? 'posted' : 'unknown',
    lastFetchedAt: r.fetched_at ?? null,
    workMode: r.work_mode,
  }));
}

export default { stripHtml, contentHash, storeJobsToDb, searchJobsFromDb };
