import crypto from 'node:crypto';

/**
 * Minimal PDF parser — positional + regex fallback.
 * Validates PDF magic bytes, extracts text via pdfjs-dist if available,
 * else fallback to buffer toString scan. Emits ParsedDocument.
 */

export type LayoutSignals = {
  pageCount: number;
  hasMultiColumnRisk: boolean;
  excessiveTables: boolean;
  avgCharsPerPage: number;
  hasImages: boolean;
  textDensity: number; // chars per page avg
};

export type ParsedDocument = {
  pages: string[]; // per-page raw text
  normalizedText: string;
  sections: Record<string, string>; // detected sections
  layoutSignals: LayoutSignals;
  extractionConfidence: number; // 0-1
  detectedAsScanned: boolean;
  sha256: string;
  charCount: number;
};

const SECTION_HEADINGS = [
  'summary', 'objective', 'experience', 'work experience', 'employment',
  'education', 'skills', 'technical skills', 'projects', 'certifications',
  'awards', 'publications', 'languages', 'interests', 'references'
];

function isPdfMagic(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.subarray(0, 4).toString() === '%PDF';
}

function fallbackExtract(buffer: Buffer): string[] {
  // Very naive: decode as utf8, extract between stream/endstream and text-like runs
  const raw = buffer.toString('utf8');
  // Extract text inside parentheses and BT/ET blocks commonly
  const matches = raw.match(/\(([^\)]{2,})\)/g);
  const text = matches ? matches.map((m) => m.slice(1, -1)).join(' ') : raw;
  // Also split by form feed / page markers
  const pagesRaw = text.split(/\f/);
  // Heuristic: split long text into pages of ~3000 chars if only 1 page detected but buffer large
  if (pagesRaw.length === 1 && text.length > 4000) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += 3000) chunks.push(text.slice(i, i + 3000));
    return chunks.map((c) => cleanText(c));
  }
  return pagesRaw.map((c) => cleanText(c)).filter((c) => c.length > 0);
}

function cleanText(s: string): string {
  return s
    .replace(/\x00/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectSections(normalizedText: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lower = normalizedText.toLowerCase();
  const headingRegex = new RegExp(`\\b(${SECTION_HEADINGS.map(escapeRegex).join('|')})\\b\\s*[:\\-]?`, 'gi');
  const indices: { heading: string; index: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRegex.exec(lower)) !== null) {
    indices.push({ heading: m[1].toLowerCase(), index: m.index });
  }
  // Deduplicate nearby headings? keep first occurrence per heading
  const seen = new Set<string>();
  const unique: typeof indices = [];
  for (const it of indices) {
    if (!seen.has(it.heading)) {
      seen.add(it.heading);
      unique.push(it);
    }
  }
  unique.sort((a, b) => a.index - b.index);
  for (let i = 0; i < unique.length; i++) {
    const start = unique[i].index;
    const end = i + 1 < unique.length ? unique[i + 1].index : normalizedText.length;
    const heading = unique[i].heading;
    sections[heading] = normalizedText.slice(start, end).trim().slice(0, 8000);
  }
  return sections;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function computeLayoutSignals(pages: string[]): LayoutSignals {
  const pageCount = pages.length;
  const totalChars = pages.reduce((s, p) => s + p.length, 0);
  const avgCharsPerPage = pageCount ? totalChars / pageCount : 0;
  // Heuristic: multi-column risk if lines are short and many line breaks per page
  const hasMultiColumnRisk = pages.some((p) => {
    const lines = p.split(/\n|\|/).length;
    return lines > 80 && avgCharsPerPage < 800;
  });
  const excessiveTables = pages.some((p) => (p.match(/\t/g) || []).length > 20 || (p.match(/\|/g) || []).length > 20);
  const hasImages = false; // cannot detect without pdfjs
  const textDensity = avgCharsPerPage;
  return { pageCount, hasMultiColumnRisk, excessiveTables, avgCharsPerPage, hasImages, textDensity };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedDocument> {
  if (!isPdfMagic(buffer)) {
    throw new Error('Invalid PDF: missing %PDF magic bytes');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  let pages: string[] = [];
  let usedPdfJs = false;

  try {
    // Try pdfjs-dist if installed (optional dep)
    // @ts-ignore - optional peer dep
    const pdfjs: unknown = await import('pdfjs-dist').catch(() => null) ??
      // @ts-ignore - optional peer dep
      await import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);
    if (pdfjs && typeof pdfjs === 'object' && 'getDocument' in (pdfjs as Record<string, unknown>)) {
      const pdfjsAny = pdfjs as { getDocument: (opts: unknown) => { promise: Promise<unknown> } };
      const loadingTask = pdfjsAny.getDocument({ data: new Uint8Array(buffer), verbosity: 0 });
      const doc = (await loadingTask.promise) as {
        numPages: number;
        getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: { str: string }[] }> }>;
      };
      const numPages: number = doc.numPages;
      for (let i = 1; i <= numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((it) => it.str).join(' ');
        pages.push(cleanText(text));
      }
      usedPdfJs = true;
    }
  } catch {
    // fall through to fallback
  }

  if (!usedPdfJs || pages.length === 0) {
    pages = fallbackExtract(buffer);
    if (pages.length === 0) {
      // last resort: whole buffer as string cleaned
      const cleaned = cleanText(buffer.toString('utf8'));
      if (cleaned) pages = [cleaned];
    }
  }

  const normalizedText = pages.join('\n\n').replace(/\s+/g, ' ').trim();
  const sections = detectSections(normalizedText);
  const layoutSignals = computeLayoutSignals(pages);
  const charCount = normalizedText.length;

  // Extraction confidence heuristic
  let confidence = 0.85;
  if (!usedPdfJs) confidence -= 0.25;
  if (charCount < 200) confidence -= 0.3;
  if (layoutSignals.hasMultiColumnRisk) confidence -= 0.1;
  if (pages.length === 0) confidence = 0.1;
  confidence = Math.max(0, Math.min(1, confidence));

  const detectedAsScanned = charCount < 100 && buffer.length > 5000;

  return {
    pages,
    normalizedText,
    sections,
    layoutSignals,
    extractionConfidence: Number(confidence.toFixed(2)),
    detectedAsScanned,
    sha256,
    charCount,
  };
}

export default parsePdfBuffer;
