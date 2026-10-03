import type { NormalizedJob } from './JobProvider.js';

export type RetrievalStep = { provider: string; keywords: string; location: string; page: number };
/** Only Jooble and Adzuna expose documented numbered search pages here. */
export const providerCapabilities: Record<string, { pages: number; locations: boolean }> = {
  jooble: { pages: 3, locations: true }, adzuna: { pages: 3, locations: true },
  jobspipe: { pages: 3, locations: false }, remotive: { pages: 1, locations: false },
  arbeitnow: { pages: 1, locations: false },
};

export function retrievalPlan(providers: string[], locations: string[], queries: string[], target = 50): RetrievalStep[] {
  const places = [...new Set(locations.filter(Boolean))].slice(0, 3);
  if (!places.length) places.push('');
  const terms = queries.filter(Boolean).slice(0, 4);
  const groups: RetrievalStep[][] = [];
  // Rotate location/page before adding more keyword variants; avoid duplicate global calls.
  for (const provider of providers) {
    const capability = providerCapabilities[provider];
    if (!capability) continue;
    const maxPages = Math.min(capability.pages, Math.max(1, Math.ceil(target / 15)));
    const selectedPlaces = capability.locations ? places : [''];
    const selectedTerms = provider === 'jooble' ? terms : terms.slice(0, 1);
    const steps: RetrievalStep[] = [];
    for (let page = 1; page <= maxPages; page++) for (const keywords of selectedTerms)
      for (const location of selectedPlaces) steps.push({ provider, keywords, location, page });
    groups.push(steps);
  }
  const result: RetrievalStep[] = [];
  for (let i = 0; result.length < 18 && groups.some(group => group[i]); i++)
    for (const group of groups) if (group[i] && result.length < 18) result.push(group[i]);
  return result;
}

export function sourceEnvelope(provider: string, jobs: NormalizedJob[], cacheHit: boolean, failure?: 'error' | 'budgetLimited') {
  const fallback = jobs.some(j => j.retrieval?.status === 'fallback' || j.source !== provider);
  return { provider, status: failure ?? (fallback ? 'fallback' : cacheHit ? 'cached' : jobs.length ? 'ok' : 'empty'),
    cacheHit, fetchedCount: jobs.length, ...(fallback ? { fallbackSource: [...new Set(jobs.map(j => j.source))] } : {}) };
}
