import axios from 'axios';
import type { JobProvider, JobSearchQuery, NormalizedJob } from './JobProvider.js';
import { env } from '../../config/env.js';
import { stripHtml, storeJobsToDb, searchJobsFromDb } from './jobStore.js';
import { checkDailyBudget, recordDailyCall } from './providerBudgets.js';

/**
 * Remotive provider — public API, no key.
 * GET https://remotive.com/api/remote-jobs?search=&limit=
 * Legal: link back to the Remotive job URL (stored as url) and mention Remotive
 * as the source (stored as source='remotive'). Remotive asks for max ~4
 * calls/day, enforced via REMOTIVE_DAILY_BUDGET (default 4).
 */

const TIMEOUT_MS = 15000;

type RemotiveJob = {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
};

export class RemotiveProvider implements JobProvider {
  private budget: number;
  private limit: number;

  constructor() {
    this.budget = Number((env as any).REMOTIVE_DAILY_BUDGET ?? 4);
    this.limit = 15;
  }

  async search(query: JobSearchQuery): Promise<NormalizedJob[]> {
    if (!(await checkDailyBudget('remotive', this.budget))) {
      console.warn(`[RemotiveProvider] daily budget ${this.budget} exhausted — skipping`);
      return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
    }
    try {
      console.log(`[RemotiveProvider] searching "${query.keywords}"`);
      const resp = await axios.get<{ jobs?: RemotiveJob[] }>('https://remotive.com/api/remote-jobs', {
        timeout: TIMEOUT_MS,
        headers: { Accept: 'application/json' },
        params: { search: query.keywords, limit: this.limit },
      });
      const jobs = (resp.data?.jobs ?? []).map((j) => this.normalize(j)).filter((j): j is NormalizedJob => j !== null);
      console.log(`[RemotiveProvider] returned ${jobs.length} jobs for "${query.keywords}"`);
      await recordDailyCall('remotive');
      await storeJobsToDb(jobs).catch(() => {});
      if (!jobs.length) return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
      return jobs;
    } catch (err) {
      console.warn('[RemotiveProvider] request failed, falling back to DB:', (err as Error).message);
      return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
    }
  }

  private normalize(j: RemotiveJob): NormalizedJob | null {
    const title = j.title?.trim();
    const company = j.company_name?.trim();
    if (!title || !company) return null;
    return {
      source: 'remotive',
      externalId: String(j.id ?? j.url ?? `${title}-${company}`).slice(0, 300),
      title,
      company,
      location: j.candidate_required_location ?? 'Remote',
      description: stripHtml(j.description),
      url: j.url ?? null,
      salary: j.salary ? { raw: j.salary } : null,
      postedAt: j.publication_date ? new Date(j.publication_date).toISOString() : null,
      workMode: j.job_type ?? 'remote',
    };
  }
}

export default RemotiveProvider;
