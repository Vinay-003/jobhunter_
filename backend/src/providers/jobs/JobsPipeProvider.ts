import axios from 'axios';
import type { JobProvider, JobSearchQuery, NormalizedJob } from './JobProvider.js';
import { env } from '../../config/env.js';
import { stripHtml, storeJobsToDb, searchJobsFromDb } from './jobStore.js';
import { getMonthlyCredits, recordMonthlyCredits } from './providerBudgets.js';

/**
 * JobsPipe provider — unified 30+ source API (Greenhouse, Lever, Ashby,
 * LinkedIn, Indeed, ...). POST https://api.jobspipe.dev/v1/jobs/search
 * with Bearer key. Billing is per job returned (1 credit/job), so we issue
 * ONE call per recommendation run with a tight limit and enforce
 * JOBSPIPE_MONTHLY_BUDGET (default 1000, = free tier).
 * Env: JOBSPIPE_API_KEY, JOBSPIPE_COUNTRY (default 'IN'),
 *      JOBSPIPE_LIMIT (default 15), JOBSPIPE_MONTHLY_BUDGET (default 1000).
 */

const TIMEOUT_MS = 20000;

type JobsPipeJob = {
  id?: string;
  job_title?: string;
  company?: string | { name?: string; display_name?: string };
  location?: string;
  short_location?: string;
  description?: string;
  url?: string;
  final_url?: string;
  date_posted?: string;
  seniority?: string;
  employment_statuses?: string[];
  remote?: boolean;
  min_annual_salary?: number | null;
  max_annual_salary?: number | null;
  salary_currency?: string | null;
};

export class JobsPipeProvider implements JobProvider {
  private apiKey: string | undefined;
  private country: string;
  private limit: number;
  private monthlyBudget: number;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? (env as any).JOBSPIPE_API_KEY;
    this.country = (env as any).JOBSPIPE_COUNTRY ?? 'IN';
    this.limit = Number((env as any).JOBSPIPE_LIMIT ?? 15);
    this.monthlyBudget = Number((env as any).JOBSPIPE_MONTHLY_BUDGET ?? 1000);
  }

  async search(query: JobSearchQuery): Promise<NormalizedJob[]> {
    if (!this.apiKey) {
      console.warn('[JobsPipeProvider] no key — skipping (set JOBSPIPE_API_KEY)');
      return [];
    }
    const used = await getMonthlyCredits('jobspipe');
    if (used + this.limit > this.monthlyBudget) {
      console.warn(`[JobsPipeProvider] monthly budget ${this.monthlyBudget} nearly exhausted (used ${used}) — skipping`);
      return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
    }
    try {
      // Primary role term as title filter; top skill terms as description terms.
      const words = query.keywords.split(/\s+/).filter(Boolean);
      const body: Record<string, unknown> = {
        job_title_or: [words.slice(0, 3).join(' ') || query.keywords],
        limit: this.limit,
        posted_at_max_age_days: 30,
      };
      if (this.country) body.job_country_code_or = [this.country.toUpperCase()];
      if (words.length > 3) body.description_or = words.slice(3, 6);
      console.log(`[JobsPipeProvider] searching title="${body.job_title_or}" country=${this.country} limit=${this.limit}`);
      const resp = await axios.post<{ data?: JobsPipeJob[]; metadata?: { credits_charged?: number } }>(
        'https://api.jobspipe.dev/v1/jobs/search',
        body,
        { timeout: TIMEOUT_MS, headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' } },
      );
      const jobs = (resp.data?.data ?? []).map((j) => this.normalize(j)).filter((j): j is NormalizedJob => j !== null);
      const charged = resp.data?.metadata?.credits_charged ?? jobs.length;
      console.log(`[JobsPipeProvider] returned ${jobs.length} jobs (credits ${charged}) for "${query.keywords}"`);
      await recordMonthlyCredits('jobspipe', charged);
      await storeJobsToDb(jobs).catch(() => {});
      if (!jobs.length) return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
      return jobs;
    } catch (err) {
      console.warn('[JobsPipeProvider] request failed, falling back to DB:', (err as Error).message);
      return searchJobsFromDb(query.keywords).catch(() => [] as NormalizedJob[]);
    }
  }

  private companyName(c: JobsPipeJob['company']): string {
    if (!c) return '';
    if (typeof c === 'string') return c.trim();
    return (c.name ?? c.display_name ?? '').trim();
  }

  private normalize(j: JobsPipeJob): NormalizedJob | null {
    const title = j.job_title?.trim();
    const company = this.companyName(j.company);
    if (!title || !company) return null;
    const salary =
      j.min_annual_salary || j.max_annual_salary
        ? { min: j.min_annual_salary ?? null, max: j.max_annual_salary ?? null, currency: j.salary_currency ?? null }
        : null;
    return {
      source: 'jobspipe',
      externalId: String(j.id ?? j.url ?? `${title}-${company}`).slice(0, 300),
      title,
      company,
      location: j.location ?? j.short_location ?? null,
      description: stripHtml(j.description),
      url: j.final_url ?? j.url ?? null,
      salary,
      postedAt: j.date_posted ? new Date(j.date_posted).toISOString() : null,
      workMode: j.remote ? 'remote' : (j.employment_statuses?.[0] ?? j.seniority ?? null),
    };
  }
}

export default JobsPipeProvider;
