import axios from 'axios';
import type { JobProvider, JobSearchQuery, NormalizedJob, ProviderSearchResult } from './JobProvider.js';
import { env } from '../../config/env.js';
import pool from '../../config/database.js';
import { markFallback, storeJobsToDb, searchJobsFromDb } from './jobStore.js';

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
    return (await this.searchResult(query)).jobs;
  }

  async searchResult(query: JobSearchQuery): Promise<ProviderSearchResult> {

    if (!this.apiKey) {
      // Fallback to DB
      return this.fallbackResult(query, 'unavailable');
    }

    try {
      const url = `${JOOBLE_ENDPOINT}/${this.apiKey}`;
      const loc = query.location?.trim() || (query.country && /^(?:in|india)$/i.test(query.country) ? 'India' : (query.country ?? ''));
      const body = {
        keywords: query.keywords,
        location: loc,
        page: query.page ?? 1,
      };

      console.log(`[JoobleProvider] searching Jooble keywords="${query.keywords}" location="${loc}" page=${query.page ?? 1}`);
      const resp = await axios.post<{ jobs?: JoobleJob[] }>(url, body, {
        timeout: TIMEOUT_MS,
        headers: { 'Content-Type': 'application/json' },
      });

      const jobs = resp.data?.jobs ?? [];
      const normalized = jobs.map((j) => this.normalize(j)).filter((j): j is NormalizedJob => j !== null);
      console.log(`[JoobleProvider] Jooble returned ${normalized.length} jobs (raw ${jobs.length}) for "${query.keywords}"`);

      // Store to jobs table (best-effort, ignore errors in dev when DB not reachable)
      await storeJobsToDb(normalized).catch(() => {});

      if (!normalized.length) return this.fallbackResult(query, 'empty');
      return { jobs: normalized, status: 'ok' };
    } catch (err) {
      console.warn('[JoobleProvider] Jooble request failed, falling back to DB:', (err as Error).message);
      return this.fallbackResult(query, 'error');
    }
  }

  private async fallbackResult(query: JobSearchQuery, reason: 'empty' | 'error' | 'budgetLimited' | 'unavailable'): Promise<ProviderSearchResult> {
    const jobs = await searchJobsFromDb(query.keywords).then(rows => markFallback(rows, 'jooble')).catch(() => [] as NormalizedJob[]);
    return { jobs, status: jobs.length ? 'fallback' : reason, fallbackReason: reason, ...(['error', 'unavailable'].includes(reason) ? { errorCode: 'PROVIDER_UNAVAILABLE' } : {}) };
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
        // Jooble's `updated` is feed freshness, not the employer's posting date.
        postedAt: null,
        updatedAt: j.updated && Number.isFinite(new Date(String(j.updated)).getTime()) ? new Date(String(j.updated)).toISOString() : null,
        dateSource: 'unknown',
       workMode: j.type && /\b(remote|hybrid|onsite|on-site)\b/i.test(String(j.type)) ? String(j.type).toLowerCase() : null,
       descriptionQuality: 'snippet',
       retrieval: { status: 'live', requestedProvider: 'jooble' },
    };
  }

}

export default JoobleProvider;
