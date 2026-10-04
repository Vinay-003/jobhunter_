/* eslint-disable @typescript-eslint/no-explicit-any */
export type ReportJob = Record<string, any>;

const text = (value: unknown):string => typeof value === 'string' ? value : value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const list = (value: unknown) => Array.isArray(value) ? [...new Set(value.map(text).filter(Boolean))] : [];

/** Build a deliberately evidence-only report. It never invents reasoning or probabilities. */
export function buildMatchReport(input: {
  jobs: ReportJob[]; resumeFileName?: string; runId?: string | null; run?: any;
  roleDiscovery?: any; scope?: 'loaded' | 'all'; total?: number; filteredCount?: number;
}) {
  const run = input.run ?? {};
  const scope = input.scope ?? 'loaded';
  const scopeText = scope === 'loaded' ? `Scope: loaded filtered ${input.filteredCount ?? input.jobs.length} of ${input.total ?? input.jobs.length}` : `Scope: all (${input.jobs.length} jobs)`;
  const lines = ['# JobHunter match report', '', scopeText, `Resume: ${input.resumeFileName || 'Unknown'}`];
  if (input.runId) lines.push(`Run: ${input.runId}`);
  if (run.version != null) lines.push(`Version: ${text(run.version)}`);
  if (run.model != null) lines.push(`Model: ${text(run.model)}`);
  lines.push(`Versions: ${text(run.versions) || 'unavailable'}`);
  lines.push(`Applied search preferences: ${text(run.preferences) || 'unavailable'}`);
  lines.push(`Provider statuses: ${text(run.sources) || 'unavailable'}`);
  lines.push(`Excluded results: ${text(run.rejectedReasons) || 'unavailable'}`);
  const discovery = input.roleDiscovery;
  if (discovery) {
    lines.push(`Role discovery: ${text(discovery.source) || 'unknown'}${discovery.model ? ` · ${text(discovery.model)}` : ''}${discovery.version ? ` · ${text(discovery.version)}` : ''}`);
    for (const role of Array.isArray(discovery.roles) ? discovery.roles : []) {
      lines.push(`- Role: ${text(role.title)}`);
      if (role.reason) lines.push(`  Reason: ${text(role.reason)}`);
      for (const evidence of list(role.evidence)) lines.push(`  Evidence: ${evidence}`);
    }
  }
  if (Array.isArray(run.queries)) lines.push('', `Queries: ${JSON.stringify(run.queries)}`);
  if (run.timings) lines.push(`Timings: ${JSON.stringify(run.timings)}`);
  for (const [index, job] of input.jobs.entries()) {
    const scoreValue = job.fitScore ?? job.matchScore;
    const score = Number.isFinite(scoreValue) ? scoreValue : null;
    lines.push('', `## ${index + 1}. ${text(job.title) || 'Untitled role'}`);
    lines.push(`- Company: ${text(job.company) || 'Not listed'}`, `- Location: ${text(job.location) || 'Not listed'}`, `- Score: ${score == null ? 'unknown (not returned)' : `${score}/100`} (fit score, not hiring probability)`);
    lines.push(`- Source: ${text(job.source) || 'Unavailable'}`, `- URL: ${text(job.link ?? job.url) || 'Unavailable'}`);
    lines.push(`- Provenance: ${text(job.provenance) || 'Unavailable'}`);
    lines.push(`- Confidence: ${text(job.confidence) || 'Unavailable'}; evidence quality, not hiring probability`);
    lines.push(`- Semantic status: ${text(job.scoreDetails?.semanticStatus) || 'Unavailable'}`);
    lines.push(`- Found by titles: ${list(job.foundByTitles).join(', ') || 'Unavailable'}`);
    lines.push(`- Dates: posted ${text(job.postedAt) || 'unknown'}; updated ${text(job.updatedAt ?? job.updated) || 'unknown'}; first seen ${text(job.firstSeenAt) || 'unknown'}; last fetched ${text(job.lastFetchedAt) || 'unknown'}; date source ${text(job.dateSource) || 'unknown'}`);
    const availability = job.availability;
    lines.push(`- Availability: ${text(availability?.status) || 'unknown'}${availability?.reason ? ` — ${text(availability.reason)}` : ''}${availability?.checkedAt ? ` (checked ${text(availability.checkedAt)})` : ''}`);
    if (job.eligibility) lines.push(`- Eligibility: ${text(job.eligibility.status) || 'unknown'}${list(job.eligibility.reasons).length ? ` — ${list(job.eligibility.reasons).join('; ')}` : ''}`);
    const details = job.scoreDetails ?? {};
    const componentKeys = new Set<string>();
    if (Array.isArray(details.components)) for (const component of details.components) { const key = text(component.key ?? component.label); componentKeys.add(key); lines.push(`- Score component: ${text(component.label ?? component.key)} ${text(component.points)}/${text(component.maxPoints)}${component.reason ? ` — ${text(component.reason)}` : ''}`); }
    if (Array.isArray(job.breakdown)) for (const item of job.breakdown) if (!componentKeys.has(text(item.label))) lines.push(`- Score component: ${text(item.label)} ${text(item.value)}`);
    if (details.seniorityPenalty != null) lines.push(`- Seniority penalty: -${text(details.seniorityPenalty)} points`);
    if (details.scoreCap != null) lines.push(`- Score cap: ${text(details.scoreCap)}${list(details.scoreCapReasons).length ? ` — ${list(details.scoreCapReasons).join('; ')}` : ''}`);
    const awarded = Array.isArray(details.components) ? details.components.reduce((sum: number, x: any) => sum + (Number(x.points) || 0), 0) : null;
    if (awarded != null) lines.push(`- Score arithmetic: components ${awarded}${details.seniorityPenalty ? ` - penalty ${text(details.seniorityPenalty)}` : ''}${details.scoreCap != null ? `, capped at ${text(details.scoreCap)}` : ''}; final ${score == null ? 'unknown' : score}`);
    lines.push(`- Matched canonical skills: ${list(job.matchedSkills).join(', ') || 'none returned'}`);
    lines.push(`- Skill evidence: ${Array.isArray(details.skillEvidence) ? details.skillEvidence.map((x: any) => `${text(x.skill)} (${text(x.source) || 'unknown'})`).join('; ') || 'none returned' : 'none returned'}`);
    lines.push(`- Requirements not evidenced in resume: ${list(job.missingSkills).join(', ') || 'none returned (not proof that every qualification is met)'}`);
    if(job.descriptionQuality!=='full') lines.push('- Incomplete provider excerpt: omitted qualifications cannot be verified.');
    if (Array.isArray(details.responsibilityMatches)) for (const item of details.responsibilityMatches) lines.push(`- Responsibility evidence: ${text(item.responsibility)} -> ${text(item.evidence) || 'no evidence returned'}${typeof item.similarity === 'number' ? ` (semantic similarity ${item.similarity})` : ''}`);
    lines.push(`- Provider text (${job.descriptionQuality === 'full' ? 'full' : 'excerpt/unknown'}):`);
    lines.push(text(job.description ?? job.snippet) || '[No retained provider text]');
    if (list(job.recommendationReasons).length || list(job.evidence).length) lines.push(`- Returned evidence: ${[...list(job.recommendationReasons), ...list(job.evidence)].join('; ')}`);
  }
  return lines.join('\n');
}
