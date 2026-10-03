import axios from 'axios';
import type { JobProvider, JobSearchQuery, NormalizedJob } from './JobProvider.js';
import { env } from '../../config/env.js';
import pool from '../../config/database.js';
import { markFallback, storeJobsToDb } from './jobStore.js';

/**
 * Jooble provider — axios POST to Jooble, with env key handling, timeout, fallback to DB,
 * store to jobs table, normalized mapping.
 */

const JOOBLE_ENDPOINT = 'https://jooble.org/api';
const TIMEOUT_MS = 10000;

type JoobleJob = {
  title?: string;
  company?: string;
  location?: string;
  snippet?: string;
  link?: string;
  salary?: string;
  type?: string;
  updated?: string;
  id?: string | number;
};

export class JoobleProvider implements JobProvider {
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? env.JOOBLE_API_KEY;
  }

  async search(query: JobSearchQuery): Promise<NormalizedJob[]> {
    if (!this.apiKey) {
      // Fallback to DB
      return this.fallbackFromDb(query);
    }

    try {
      const url = `${JOOBLE_ENDPOINT}/${this.apiKey}`;
      const body = {
        keywords: query.keywords,
        location: query.location ?? '',
        page: query.page ?? 1,
      };

      console.log(`[JoobleProvider] searching Jooble keywords="${query.keywords}" location="${query.location ?? ''}" page=${query.page ?? 1}`);
      const resp = await axios.post<{ jobs?: JoobleJob[] }>(url, body, {
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      });

      const jobs = resp.data?.jobs ?? [];
      const normalized = jobs.map((j) => this.normalize(j)).filter((j): j is NormalizedJob => j !== null);
      console.log(`[JoobleProvider] Jooble returned ${normalized.length} jobs (raw ${jobs.length}) for "${query.keywords}"`);

      // Store to jobs table (best-effort, ignore errors in dev when DB not reachable)
      await storeJobsToDb(normalized).catch(() => {});

      if (normalized.length === 0) {
        console.warn(`[JoobleProvider] Jooble empty for "${query.keywords}" — fallback to DB cache`);
        const fallback = await this.fallbackFromDb(query).catch(() => [] as NormalizedJob[]);
        console.log(`[JoobleProvider] DB fallback returned ${fallback.length} jobs for "${query.keywords}"`);
        return fallback.length ? fallback : normalized;
      }

      return normalized;
    } catch (err) {
      console.warn('[JoobleProvider] Jooble request failed, falling back to DB:', (err as Error).message);
      const fallback = await this.fallbackFromDb(query).catch(() => [] as NormalizedJob[]);
      console.log(`[JoobleProvider] DB fallback after error returned ${fallback.length} jobs for "${query.keywords}"`);
      return fallback;
    }
  }

  private normalize(j: JoobleJob): NormalizedJob | null {
    if (!j.title || !j.company) return null;
    const title = String(j.title).trim();
    const company = String(j.company).trim();
    if (!title || !company) return null;
    const externalId = String(j.id ?? j.link ?? `${title}-${company}`).slice(0, 300);
    return {
      source: 'jooble',
      externalId,
      title,
      company,
      location: j.location ? String(j.location) : null,
      description: j.snippet ? String(j.snippet) : null,
      url: j.link ? String(j.link) : null,
      salary: j.salary ? { raw: String(j.salary) } : null,
       postedAt: j.updated && Number.isFinite(new Date(String(j.updated)).getTime()) ? new Date(String(j.updated)).toISOString() : null,
       workMode: j.type && /\b(remote|hybrid|onsite|on-site)\b/i.test(String(j.type)) ? String(j.type).toLowerCase() : null,
       descriptionQuality: 'snippet',
       retrieval: { status: 'live', requestedProvider: 'jooble' },
    };
  }

  private async fallbackFromDb(query: JobSearchQuery): Promise<NormalizedJob[]> {
    // Simple ILIKE search on title/description
    const kw = query.keywords.trim();
    if (!kw) return [];
    const like = `%${kw.split(/\s+/).join('%')}%`;
    const { rows } = await pool.query<{
      source: string; external_id: string; title: string; company: string; location: string | null;
      description: string | null; url: string | null; salary: unknown;
      posted_at: string | null; work_mode: string | null;
    }>(
      `SELECT source, external_id, title, company, location, description, url, salary, posted_at, work_mode
       FROM jobs WHERE title ILIKE $1 OR description ILIKE $1 ORDER BY fetched_at DESC LIMIT 20`,
      [like],
    );
    return markFallback(rows.map((r) => ({
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
    })), 'jooble');
  }
}

export default JoobleProvider;
