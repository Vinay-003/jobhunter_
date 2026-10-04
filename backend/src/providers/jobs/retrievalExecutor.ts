import type { RetrievalStep } from './retrievalPlan.js';

export type RetrievalOutcome = { nextCursor?: string | null };
export type RetrievalResult = { step: RetrievalStep; ok: boolean; nextCursor?: string | null; error?: string };
export type RetrievalExecutorOptions = { globalConcurrency?: number; perProviderConcurrency?: number; maxCalls?: number; /** accepted for compatibility; callbacks own cancellation */ timeoutMs?: number };

const safeError = (error: unknown) => {
  const code = error instanceof Error ? error.message : 'PROVIDER_UNAVAILABLE';
  return /^(TIMEOUT|PROVIDER_[A-Z_]+|BUDGET_[A-Z_]+|ALL_[A-Z_]+)$/.test(code) ? code : 'PROVIDER_UNAVAILABLE';
};

/** Bounded wave scheduler. It does not race/cancel callbacks: provider adapters own network timeouts. */
export async function executeRetrieval(
  steps: RetrievalStep[],
  run: (step: RetrievalStep, cursor?: string, signal?: AbortSignal) => Promise<RetrievalOutcome>,
  options: RetrievalExecutorOptions = {},
): Promise<RetrievalResult[]> {
  const global = Math.max(1, options.globalConcurrency ?? 4);
  const perProvider = Math.max(1, options.perProviderConcurrency ?? 1);
  const maxCalls = Math.min(18, Math.max(0, options.maxCalls ?? 18));
  const pending = steps.slice(0, maxCalls);
  const cursors = new Map<string, string>();
  const seenCursors = new Map<string, Set<string>>();
  const failed = new Set<string>();
  const results: RetrievalResult[] = [];
  let calls = 0;
  let wave = 1;
  while (pending.length && calls < maxCalls) {
    const candidates = pending.filter(s => s.page === wave || (wave === 1 && s.page === 1));
    for (const step of candidates) {
      const i = pending.indexOf(step); if (i >= 0) pending.splice(i, 1);
    }
    if (!candidates.length) { wave++; continue; }
    const ready = candidates.filter(step => {
      const key = `${step.provider}:${step.keywords}:${step.location}`;
      if (failed.has(key)) return false;
      if (step.provider === 'jobspipe' && step.page > 1 && !cursors.has(key)) return false;
      return true;
    });
    // Fair batches select distinct providers first, then fill remaining slots only when
    // explicitly configured above one per provider.
    while (ready.length && calls < maxCalls) {
      const batch: RetrievalStep[] = [];
      const counts = new Map<string, number>();
      for (let i = 0; i < ready.length && batch.length < global; i++) {
        const provider = ready[i].provider;
        if ((counts.get(provider) ?? 0) < perProvider) { batch.push(ready[i]); counts.set(provider, (counts.get(provider) ?? 0) + 1); ready.splice(i, 1); i--; }
      }
      if (!batch.length) break;
      const outcomes = await Promise.all(batch.map(async step => {
        const key = `${step.provider}:${step.keywords}:${step.location}`;
        try {
          const out = await run(step, step.provider === 'jobspipe' ? cursors.get(key) : undefined);
           if (step.provider === 'jobspipe') cursors.delete(key);
           if (step.provider === 'jobspipe' && out.nextCursor) {
            const hash = out.nextCursor;
            const seen = seenCursors.get(key) ?? new Set<string>();
            if (seen.has(hash)) { failed.add(key); return { step, ok: true, nextCursor: null } as RetrievalResult; }
            seen.add(hash); seenCursors.set(key, seen); cursors.set(key, hash);
          }
          return { step, ok: true, nextCursor: out.nextCursor ?? null } as RetrievalResult;
        } catch (error) { failed.add(key); return { step, ok: false, error: safeError(error) } as RetrievalResult; }
      }));
      calls += batch.length; results.push(...outcomes);
    }
    wave++;
  }
  return results;
}
