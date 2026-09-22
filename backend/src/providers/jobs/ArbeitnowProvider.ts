import axios from 'axios';
import type { JobProvider, JobSearchQuery, NormalizedJob } from './JobProvider.js';
import { env } from '../../config/env.js';
import { stripHtml, storeJobsToDb, searchJobsFromDb } from './jobStore.js';

/**
 * Arbeitnow provider — public API, no key.
 * GET https://www.arbeitnow.com/api/job-board-api returns a full dump (~250
 * recent jobs, mostly Germany-based). No server-side search, so we filter
 * locally by keyword overlap and cache the filtered result for
 * ARBEITNOW_CACHE_HOURS (default 12) via job_search_cache.
 */

const TIMEOUT_MS = 20000;
const MAX_RETURN = 15;

type ArbeitnowJob = {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  location?: string;
  created_at?: string;
  job_types?: string[];
};

export class ArbeitnowProvider implements JobProvider {
  async search(query: JobSearchQuery): Promise<NormalizedJob[]> {
    try {
      console.log(`[ArbeitnowProvider] fetching dump, filtering by "${query.keywords}"`);
      const resp = await axios.get<{ data?: ArbeitnowJob[] }>('https://www.arbeitnow.com/api/job-board-api', {
        timeout: TIMEOUT_MS,
        headers: { Accept: 'application/json' },
      });
      const all = resp.data?.data ?? [];
      const terms = query.keywords.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const scored = all
        .map((j) => ({ job: j, hits: this.countHits(j, terms) }))
        .filter((s) => s.hits > 0)
        .sort((a, b) => b.hits - a.hits)
        .slice(0, MAX_RETURN);
      const jobs = scored.map((s) => this.normalize(s.job)).filter((j): j is NormalizedJob => j !== null);
      console.log(`[ArbeitnowProvider] dump=${all.length} relevant=${jobs.length} for "${query.keywords}"`);
      await storeJobsToDb(jobs).catch(() => {});
      if (!jobs.length) return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
      return jobs;
    } catch (err) {
      console.warn('[ArbeitnowProvider] request failed, falling back to DB:', (err as Error).message);
      return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
    }
  }

  private countHits(j: ArbeitnowJob, terms: string[]): number {
    const hay = `${j.title ?? ''} ${stripHtml(j.description) ?? ''}`.toLowerCase();
    let hits = 0;
    for (const t of terms) {
      if (hay.includes(t)) hits += t.length > 5 ? 2 : 1;
    }
    return hits;
  }

  private normalize(j: ArbeitnowJob): NormalizedJob | null {
    const title = j.title?.trim();
    const company = j.company_name?.trim();
    if (!title || !company) return null;
    return {
      source: 'arbeitnow',
      externalId: String(j.slug ?? j.url ?? `${title}-${company}`).slice(0, 300),
      title,
      company,
      location: j.location ?? (j.remote ? 'Remote' : null),
      description: stripHtml(j.description),
      url: j.url ?? null,
      salary: null,
      postedAt: j.created_at ? new Date(j.created_at).toISOString() : null,
      workMode: j.remote ? 'remote' : (j.job_types?.[0] ?? null),
    };
  }
}

export function arbeitnowCacheHours(): number {
  return Number((env as any).ARBEITNOW_CACHE_HOURS ?? 12);
}

export default ArbeitnowProvider;
