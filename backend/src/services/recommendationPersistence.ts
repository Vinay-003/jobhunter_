/** Cache age is bounded so relative posted-date eligibility is periodically reconsidered. */
export function recommendationCacheValid(run: any, ranker: string, profile: string, daysPosted: number, now = new Date(), forceRefresh = false): boolean {
  const completed = new Date(run?.completed_at).getTime();
  const maxAge = Math.min(5 * 60 * 1000, Math.max(1, daysPosted) * 24 * 60 * 60 * 1000 / 4);
  return !forceRefresh && run?.ranker_version === ranker && run?.profile_version === profile
    && Number.isFinite(completed) && now.getTime() >= completed && now.getTime() - completed < maxAge;
}

export function recommendationSnapshot(job: any) {
  return { title:job.title, company:job.company, location:job.location, description:job.description,
    descriptionQuality:job.descriptionQuality ?? 'unknown', url:job.url, salary:job.salary,
    workMode:job.workMode, postedAt:job.postedAt, source:job.source, provenance:job.provenance,
    availability:job.availability, updatedAt:job.updatedAt, firstSeenAt:job.firstSeenAt,
    lastFetchedAt:job.lastFetchedAt, dateSource:job.dateSource, foundByTitles:job.foundByTitles ?? [],
    scoreDetails:job.scoreDetails ?? null };
}

export function recommendationDiagnostics(run: any) {
  const plan=run?.query_plan_json??{};
  return { sources:run?.provider_status_json ?? [], rejectedReasons:plan.rejectedReasons ?? {}, preferences:run?.preferences_snapshot_json??{},
    queries:plan.queries??[],roleDiscovery:plan.roleDiscovery??null,searchRoles:plan.searchRoles??[],timings:plan.timings??{},versions:plan.versions??{},availabilityScope:plan.availabilityScope??null };
}
