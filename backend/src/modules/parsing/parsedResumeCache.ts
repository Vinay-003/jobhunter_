import parsePdfBuffer from './pdfParser.js';
import type { ParsedDocument } from './pdfParser.js';

// Process-local parsed-resume cache keyed by resume id: upload seeds it and
// readiness/jd-match/GET enrichment reuse it instead of re-downloading the PDF
// from storage (cross-region round trip, seconds per request).
// shortcut: per-process only — a Render restart cold-starts it; upgrade to a
// shared store if Server-Timing still shows download dominating warm requests.
const cache = new Map<string, ParsedDocument>();
const MAX_ENTRIES = 16;

export function cacheParsedResume(resumeId: string, parsed: ParsedDocument): void {
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(resumeId, parsed);
}

/** Return the cached parse, else download+parse via the loader and cache it. Loader errors (e.g. STORED_FILE_MISSING) propagate unchanged. */
export async function loadParsedResume(resumeId: string, loadBuffer: () => Promise<Buffer>): Promise<ParsedDocument> {
  const hit = cache.get(resumeId);
  if (hit) return hit;
  const parsed = await parsePdfBuffer(await loadBuffer());
  cacheParsedResume(resumeId, parsed);
  return parsed;
}
