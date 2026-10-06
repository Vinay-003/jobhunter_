import axios from 'axios';
import type { JobAvailability, JobProvider, JobSearchQuery, NormalizedJob, ProviderSearchResult } from './JobProvider.js';
import { env } from '../../config/env.js';
import { stripHtml, storeJobsToDb, searchJobsFromDb, markFallback } from './jobStore.js';
import { reserveDailyCall } from './providerBudgets.js';

/**
 * Adzuna provider — GET job search.
 * https://api.adzuna.com/v1/api/jobs/{country}/search/1?app_id=&app_key=&results_per_page=&what=&where=
 * Env: ADZUNA_APP_ID, ADZUNA_APP_KEY, ADZUNA_COUNTRY (default 'in'),
 *      ADZUNA_RESULTS_PER_PAGE (default 15), ADZUNA_CALL_BUDGET (daily, default 100).
 */

const TIMEOUT_MS = 15000;
const SUPPORTED_COUNTRIES = new Set(['at', 'au', 'be', 'br', 'ca', 'ch', 'de', 'es', 'fr', 'gb', 'in', 'it', 'mx', 'nl', 'nz', 'pl', 'sg', 'us', 'za']);

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
    this.country = String(opts?.country ?? (env as any).ADZUNA_COUNTRY ?? 'in').trim().toLowerCase();
    this.perPage = Number((env as any).ADZUNA_RESULTS_PER_PAGE ?? 15);
    this.budget = Number((env as any).ADZUNA_CALL_BUDGET ?? 100);
  }

  async search(query: JobSearchQuery): Promise<NormalizedJob[]> {
    return (await this.searchResult(query)).jobs;
  }

  async searchResult(query: JobSearchQuery): Promise<ProviderSearchResult> {

    const country = String(query.country ?? this.country).trim().toLowerCase();
    if (!SUPPORTED_COUNTRIES.has(country)) {
      return this.fallbackResult(query, 'error', 'ADZUNA_UNSUPPORTED_COUNTRY');
    }

    if (!this.appId || !this.appKey) {
      console.warn('[AdzunaProvider] no creds — skipping (set ADZUNA_APP_ID/ADZUNA_APP_KEY)');
      return this.fallbackResult(query, 'unavailable');
    }
    if (!(await reserveDailyCall('adzuna', this.budget))) {
      console.warn(`[AdzunaProvider] daily budget ${this.budget} exhausted — skipping`);
      return this.fallbackResult(query, 'budgetLimited');
    }
    try {
      const url = `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${Math.max(1, Math.min(10, query.page ?? 1))}`;
      console.log(`[AdzunaProvider] searching keywords="${query.keywords}" location="${query.location ?? ''}" country=${country} page=${query.page ?? 1}`);
      const resp = await axios.get<{ results?: AdzunaJob[] }>(url, {
        timeout: TIMEOUT_MS,
        headers: { Accept: 'application/json' },
        params: {
          app_id: this.appId,
          app_key: this.appKey,
          'content-type': 'application/json',
          ...(query.sortBy === 'newest' ? { sort_by: 'date', sort_dir: 'down' } : {}),
          results_per_page: Math.max(1, Math.min(50, query.limit ?? this.perPage)),
          what: query.keywords,
          where: query.location ?? '',
          ...(query.daysPosted ? { max_days_old: query.daysPosted } : {}),
        },
      });
      const jobs = (resp.data?.results ?? []).map((j) => this.normalize(j)).filter((j): j is NormalizedJob => j !== null);
      await this.enrichAdzunaJobs(jobs);
      console.log(`[AdzunaProvider] returned ${jobs.length} jobs for "${query.keywords}"`);
      await storeJobsToDb(jobs).catch(() => {});
      if (!jobs.length) return { jobs: [], status: 'empty', fallbackReason: 'empty' };
      return { jobs, status: 'ok' };
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      const errorCode = status ? `ADZUNA_HTTP_${status}` : 'ADZUNA_REQUEST_FAILED';
      console.warn('[AdzunaProvider] request failed, falling back to DB');
      return this.fallbackResult(query, 'error', errorCode);
    }
  }

  private async enrichAdzunaJobs(jobs: NormalizedJob[]): Promise<void> {
    if (!jobs.length) return;
    const enrichOne = async (job: NormalizedJob) => {
      if (!job.url) return;
      try {
        const resp = await axios.get(job.url, {
          timeout: 4000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });
        const html = typeof resp.data === 'string' ? resp.data : '';
        const matches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
        for (const m of matches) {
          try {
            const parsed = JSON.parse(m[1]);
            const add = (v: any) => {
              if (v?.['@type'] === 'JobPosting') return v;
              if (Array.isArray(v?.['@graph'])) return v['@graph'].find((g: any) => g?.['@type'] === 'JobPosting');
              return null;
            };
            const jp = Array.isArray(parsed) ? parsed.map(add).find(Boolean) : add(parsed);
            if (jp) {
              if (jp.description) {
                const fullDesc = stripHtml(jp.description);
                if (fullDesc && fullDesc.length > (job.description?.length ?? 0)) {
                  job.description = fullDesc;
                  job.descriptionQuality = 'full';
                }
              }
              const now = Date.now();
              const nowIso = new Date().toISOString();
              if (jp.validThrough) {
                const exp = Date.parse(jp.validThrough);
                if (Number.isFinite(exp) && exp <= now) {
                  job.availability = {
                    status: 'closed',
                    reason: 'JSON-LD validThrough expired',
                    source: 'adzuna',
                    checkedAt: nowIso
                  };
                } else if (jp.directApply === true) {
                  job.availability = {
                    status: 'open',
                    reason: 'Matching JobPosting has actionable application evidence',
                    source: 'adzuna',
                    checkedAt: nowIso
                  };
                }
              }
              break;
            }
          } catch {}
        }
      } catch {}
    };

    const chunkSize = 5;
    for (let i = 0; i < jobs.length; i += chunkSize) {
      await Promise.all(jobs.slice(i, i + chunkSize).map(enrichOne));
    }
  }

  private async fallbackResult(query: JobSearchQuery, reason: 'empty' | 'error' | 'budgetLimited' | 'unavailable', errorCode?: string): Promise<ProviderSearchResult> {
    const jobs = await searchJobsFromDb(query.keywords).then(rows => markFallback(rows, 'adzuna')).catch(() => [] as NormalizedJob[]);
    return { jobs, status: jobs.length ? 'fallback' : reason, fallbackReason: reason, ...(['error', 'unavailable'].includes(reason) ? { errorCode: errorCode ?? 'PROVIDER_UNAVAILABLE' } : {}) };
  }

  private normalize(j: AdzunaJob): NormalizedJob | null {
    const title = j.title?.trim();
    const company = j.company?.display_name?.trim();
    if (!title || !company) return null;
    const salary =
      j.salary_min != null || j.salary_max != null
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
      postedAt: j.created && Number.isFinite(new Date(j.created).getTime()) ? new Date(j.created).toISOString() : null,
      dateSource: 'posted',
      lastFetchedAt: new Date().toISOString(),
      workMode: null,
      descriptionQuality: j.description ? 'snippet' : 'unknown',
      retrieval: { status: 'live', requestedProvider: 'adzuna' },
    };
  }
}

export default AdzunaProvider;
