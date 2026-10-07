export type NormalizedJob = {
  id?: string;
  source: string;
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  url: string | null;
  salary: unknown | null;
  postedAt: string | null;
  updatedAt?: string | null;
  firstSeenAt?: string | null;
  lastFetchedAt?: string | null;
  dateSource?: 'posted' | 'updated' | 'unknown' | string;
  workMode: string | null;
  descriptionQuality?: 'full' | 'snippet' | 'unknown';
  provenance?: Array<{ source: string; externalId: string }>;
  canonicalUrl?: string | null;
  fetchedAt?: string;
  foundByTitles?: string[];
  /** Retrieval origin is separate from canonical posting source; DB fallback may have the same source. */
  retrieval?: { status: 'live' | 'fallback'; requestedProvider: string; fallbackSource?: string };
  availability?: JobAvailability;
  providerSkills?: string[];
};

export type JobAvailability = { status: 'open' | 'closed' | 'unknown'; checkedAt: string | null; reason: string; source: string };

export type JobSearchQuery = {
  keywords: string;
  location?: string;
  page?: number;
  /** Opaque cursor only when a provider explicitly supports one; do not infer from page. */
  cursor?: string;
  /** Candidate level ('junior' | 'mid' | ...) — providers with a seniority filter use it. */
  seniorityHint?: string | null;
  daysPosted?: number;
  country?: string;
  limit?: number;
  sortBy?: 'match' | 'newest';
  includeUnknownDates?: boolean;
  verifiedOpenOnly?: boolean;
};

export type ProviderSearchResult = {
  jobs: NormalizedJob[];
  status: 'ok' | 'empty' | 'fallback' | 'error' | 'budgetLimited' | 'unavailable';
  /** Why a fallback was used, even if its jobs array is empty. */
  fallbackReason?: 'empty' | 'error' | 'budgetLimited' | 'unavailable';
  nextCursor?: string | null;
  errorCode?: string;
};

export interface JobProvider {
  search(query: JobSearchQuery): Promise<NormalizedJob[]>;
  searchResult(query: JobSearchQuery): Promise<ProviderSearchResult>;
}
