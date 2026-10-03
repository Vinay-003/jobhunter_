import { z } from 'zod';

/** Public, synthetic examples only. Real judgments belong in a consented private dataset. */
export const LABEL_SCHEMA_VERSION = 1;
export const RankingLabelSchema = z.object({
  schemaVersion: z.literal(1),
  candidateId: z.string().min(1),
  employerId: z.string().min(1),
  jobId: z.string().min(1),
  /** Shared requisition ID across feeds; duplicate postings must use the same value. */
  groupId: z.string().min(1),
  eligibility: z.enum(['eligible', 'ineligible', 'unknown']),
  relevance: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.null()]),
  skillEvidence: z.enum(['supported', 'partial', 'unsupported', 'unknown']),
  responsibilitySupport: z.enum(['supported', 'partial', 'unsupported', 'unknown']),
  score: z.number().finite().min(0).max(100),
}).strict().superRefine((row, ctx) => {
  if (row.eligibility !== 'eligible' && row.relevance !== null) {
    ctx.addIssue({ code: 'custom', path: ['relevance'], message: 'Relevance is judged only for eligible jobs' });
  }
});
export type RankingLabel = z.infer<typeof RankingLabelSchema>;

export function parseLabelJsonl(text: string): RankingLabel[] {
  return text.split(/\r?\n/).flatMap((line, index) => {
    if (!line.trim()) return [];
    try { return [RankingLabelSchema.parse(JSON.parse(line))]; }
    catch (error) { throw new Error(`Invalid label JSONL line ${index + 1}: ${String(error)}`); }
  });
}

export type EvaluationRow = RankingLabel;
export type Metric = { value: number | null; numerator: number; denominator: number };
const ratio = (numerator: number, denominator: number): Metric => ({ numerator, denominator, value: denominator ? numerator / denominator : null });
const identity = (row: EvaluationRow) => `${row.candidateId}\u0000${row.groupId}`;

/** One judgment per candidate/requisition; duplicates must agree on all labels. Highest score wins. */
export function groupDuplicateCandidates(rows: EvaluationRow[]): EvaluationRow[] {
  const grouped = new Map<string, EvaluationRow>();
  for (const input of rows) {
    const row = RankingLabelSchema.parse(input);
    const key = identity(row);
    const prior = grouped.get(key);
    if (prior) {
      if (prior.employerId !== row.employerId || prior.eligibility !== row.eligibility || prior.relevance !== row.relevance || prior.skillEvidence !== row.skillEvidence || prior.responsibilitySupport !== row.responsibilitySupport) {
        throw new Error(`Conflicting duplicate labels for candidate/group ${key}`);
      }
      if (prior.score > row.score || (prior.score === row.score && prior.jobId.localeCompare(row.jobId) <= 0)) continue;
    }
    grouped.set(key, row);
  }
  return [...grouped.values()];
}

/** Candidate AND employer disjointness prevents resume variants and company-specific openings leaking across splits. */
export function assertDisjointSplit(train: EvaluationRow[], test: EvaluationRow[]): void {
  const candidates = new Set(train.map(r => r.candidateId));
  const employers = new Set(train.map(r => r.employerId));
  for (const row of test) {
    if (candidates.has(row.candidateId) || employers.has(row.employerId)) throw new Error('Candidate/employer leakage across train/test split');
  }
}

export function evaluateRanking(rows: EvaluationRow[], k: number, binCount = 10) {
  if (!Number.isSafeInteger(k) || k < 1 || !Number.isSafeInteger(binCount) || binCount < 1) throw new Error('k and binCount must be positive integers');
  const unique = groupDuplicateCandidates(rows);
  const byCandidate = new Map<string, EvaluationRow[]>();
  for (const row of unique) byCandidate.set(row.candidateId, [...(byCandidate.get(row.candidateId) ?? []), row]);
  const sorted = [...byCandidate.values()].map(group => group.sort((a, b) => b.score - a.score || a.groupId.localeCompare(b.groupId) || a.jobId.localeCompare(b.jobId)));
  const top = sorted.flatMap(group => group.slice(0, k));
  const judged = top.filter(row => row.eligibility === 'ineligible' || row.eligibility === 'eligible' && row.relevance !== null);
  const positives = unique.filter(row => row.eligibility === 'eligible' && row.relevance !== null && row.relevance > 0);
  const hits = judged.filter(row => row.eligibility === 'eligible' && row.relevance !== null && row.relevance > 0).length;
  const ineligible = top.filter(row => row.eligibility === 'ineligible').length;
  const dcg = (list: EvaluationRow[]) => list.reduce((sum, row, index) => sum + (row.eligibility === 'eligible' && row.relevance !== null ? (2 ** row.relevance - 1) / Math.log2(index + 2) : 0), 0);
  const ndcg = sorted.map(group => {
    // Unknown labels cannot be assigned zero relevance: omit them from NDCG queries.
    if (group.some(row => row.eligibility === 'unknown' || row.relevance === null && row.eligibility === 'eligible')) return null;
    const ideal = [...group].sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
    const maximum = dcg(ideal.slice(0, k));
    return maximum ? dcg(group.slice(0, k)) / maximum : null;
  }).filter((value): value is number => value !== null);
  const bins = Array.from({ length: binCount }, (_, index) => ({ lower: index / binCount, upper: (index + 1) / binCount, count: 0, meanScore: null as number | null, positiveRate: null as number | null }));
  // Scores are fit indices, not probabilities; ECE is diagnostic only under an explicitly chosen binary target.
  const calibrationRows = unique.filter(row => row.eligibility === 'eligible' && row.relevance !== null);
  const sums = bins.map(() => ({ score: 0, positive: 0 }));
  for (const row of calibrationRows) {
    const i = Math.min(binCount - 1, Math.floor(row.score / 100 * binCount));
    bins[i].count++;
    sums[i].score += row.score / 100;
    sums[i].positive += Number((row.relevance ?? 0) > 0);
  }
  bins.forEach((bin, i) => {
    if (bin.count) { bin.meanScore = sums[i].score / bin.count; bin.positiveRate = sums[i].positive / bin.count; }
  });
  const ece = calibrationRows.length ? bins.reduce((sum, bin) => sum + bin.count / calibrationRows.length * Math.abs((bin.meanScore ?? 0) - (bin.positiveRate ?? 0)), 0) : null;
  return { schemaVersion: LABEL_SCHEMA_VERSION, k, candidates: sorted.length, uniqueJobs: unique.length, precisionAtK: ratio(hits, judged.length), recallAtK: ratio(hits, positives.length), ndcgAtK: ndcg.length ? ndcg.reduce((a, b) => a + b, 0) / ndcg.length : null, ndcgQueries: ndcg.length, explicitIneligibleAtK: ratio(ineligible, top.length), calibration: { target: 'eligible and relevance > 0', bins, ece, count: calibrationRows.length } };
}
