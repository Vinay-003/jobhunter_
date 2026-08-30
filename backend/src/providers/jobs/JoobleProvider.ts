import axios from 'axios';
import crypto from 'node:crypto';
import type { JobProvider, JobSearchQuery, NormalizedJob } from './JobProvider.js';
import { env } from '../../config/env.js';
import pool from '../../config/database.js';

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

      const resp = await axios.post<{ jobs?: JoobleJob[] }>(url, body, {
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      });

      const jobs = resp.data?.jobs ?? [];
      const normalized = jobs.map((j) => this.normalize(j)).filter((j): j is NormalizedJob => j !== null);

      // Store to jobs table (best-effort, ignore errors in dev when DB not reachable)
      await this.storeToDb(normalized).catch(() => {});

      if (normalized.length === 0) {
        // fallback to DB if Jooble returned empty
        const fallback = await this.fallbackFromDb(query).catch(() => [] as NormalizedJob[]);
        return fallback.length ? fallback : normalized;
      }

      return normalized;
    } catch (err) {
      console.warn('[JoobleProvider] Jooble request failed, falling back to DB:', (err as Error).message);
      const fallback = await this.fallbackFromDb(query).catch(() => [] as NormalizedJob[]);
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
      postedAt: j.updated ? new Date(String(j.updated)).toISOString() : null,
      workMode: j.type ? String(j.type) : null,
    };
  }

  private contentHash(job: NormalizedJob): string {
    return crypto
      .createHash('sha256')
      .update(`${job.source}|${job.externalId}|${job.title}|${job.company}`)
      .digest('hex');
  }

  private async storeToDb(jobs: NormalizedJob[]): Promise<void> {
    for (const j of jobs) {
      const hash = this.contentHash(j);
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
}

export default JoobleProvider;
