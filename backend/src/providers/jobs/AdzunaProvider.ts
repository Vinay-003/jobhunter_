import axios from 'axios';
import type { JobProvider, JobSearchQuery, NormalizedJob } from './JobProvider.js';
import { env } from '../../config/env.js';
import { stripHtml, storeJobsToDb, searchJobsFromDb } from './jobStore.js';
import { checkDailyBudget, recordDailyCall } from './providerBudgets.js';

/**
 * Adzuna provider — GET job search.
 * https://api.adzuna.com/v1/api/jobs/{country}/search/1?app_id=&app_key=&results_per_page=&what=&where=
 * Env: ADZUNA_APP_ID, ADZUNA_APP_KEY, ADZUNA_COUNTRY (default 'in'),
 *      ADZUNA_RESULTS_PER_PAGE (default 15), ADZUNA_CALL_BUDGET (daily, default 100).
 */

const TIMEOUT_MS = 15000;

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url?: string;
  created?: string;
  contract_time?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
};

export class AdzunaProvider implements JobProvider {
  private appId: string | undefined;
  private appKey: string | undefined;
  private country: string;
  private perPage: number;
  private budget: number;

  constructor(opts?: { appId?: string; appKey?: string; country?: string }) {
    this.appId = opts?.appId ?? (env as any).ADZUNA_APP_ID;
    this.appKey = opts?.appKey ?? (env as any).ADZUNA_APP_KEY;
    this.country = opts?.country ?? (env as any).ADZUNA_COUNTRY ?? 'in';
    this.perPage = Number((env as any).ADZUNA_RESULTS_PER_PAGE ?? 15);
    this.budget = Number((env as any).ADZUNA_CALL_BUDGET ?? 100);
  }

  async search(query: JobSearchQuery): Promise<NormalizedJob[]> {
    if (!this.appId || !this.appKey) {
      console.warn('[AdzunaProvider] no creds — skipping (set ADZUNA_APP_ID/ADZUNA_APP_KEY)');
      return [];
    }
    if (!(await checkDailyBudget('adzuna', this.budget))) {
      console.warn(`[AdzunaProvider] daily budget ${this.budget} exhausted — skipping`);
      return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
    }
    try {
      const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(this.country)}/search/1`;
      console.log(`[AdzunaProvider] searching keywords="${query.keywords}" location="${query.location ?? ''}" country=${this.country}`);
      const resp = await axios.get<{ results?: AdzunaJob[] }>(url, {
        timeout: TIMEOUT_MS,
        headers: { Accept: 'application/json' },
        params: {
          app_id: this.appId,
          app_key: this.appKey,
          results_per_page: this.perPage,
          what: query.keywords,
          where: query.location ?? '',
          'content-type': 'application/json',
        },
      });
      const jobs = (resp.data?.results ?? []).map((j) => this.normalize(j)).filter((j): j is NormalizedJob => j !== null);
      console.log(`[AdzunaProvider] returned ${jobs.length} jobs for "${query.keywords}"`);
      await recordDailyCall('adzuna');
      await storeJobsToDb(jobs).catch(() => {});
      if (!jobs.length) return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
      return jobs;
    } catch (err) {
      console.warn('[AdzunaProvider] request failed, falling back to DB:', (err as Error).message);
      return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
    }
  }

  private normalize(j: AdzunaJob): NormalizedJob | null {
    const title = j.title?.trim();
    const company = j.company?.display_name?.trim();
    if (!title || !company) return null;
    const salary =
      j.salary_min || j.salary_max
        ? { min: j.salary_min ?? null, max: j.salary_max ?? null, currency: j.salary_currency ?? null }
        : null;
    return {
      source: 'adzuna',
      externalId: String(j.id ?? j.redirect_url ?? `${title}-${company}`).slice(0, 300),
      title,
      company,
      location: j.location?.display_name ?? null,
      description: stripHtml(j.description),
      url: j.redirect_url ?? null,
      salary,
      postedAt: j.created ? new Date(j.created).toISOString() : null,
      workMode: j.contract_time ?? null,
    };
  }
}

export default AdzunaProvider;
