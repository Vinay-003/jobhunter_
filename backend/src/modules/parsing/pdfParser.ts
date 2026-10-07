import crypto from 'node:crypto';

/**
 * PDF parser v3.
 *
 * The important difference from v2 is that line breaks are preserved. Resume
 * quality checks such as bullet strength, line density, and section boundaries
 * cannot work reliably after collapsing the document into one giant line.
 */

export type LayoutSignals = {
  pageCount: number;
  hasMultiColumnRisk: boolean;
  excessiveTables: boolean;
  avgCharsPerPage: number;
  hasImages: boolean;
  textDensity: number;
  pageCharCounts?: number[];
  imageDetectionAvailable?: boolean;
};

export type ParsedDocument = {
  pages: string[];
  normalizedText: string;
  sections: Record<string, string>;
  layoutSignals: LayoutSignals;
  extractionConfidence: number;
  detectedAsScanned: boolean;
  sha256: string;
  charCount: number;
  lineSpans?: Array<{ page: number; text: string; x: number | null; y: number | null; width: number | null }>;
};

const SECTION_HEADINGS = [
  'summary', 'objective', 'profile', 'education', 'education & certifications', 'education and certifications', 'academic background', 'experience', 'work experience', 'employment', 'employment history',
  'skills', 'technical skills', 'technical proficiencies', 'frameworks', 'frameworks & databases', 'automation & cloud', 'platforms & apis', 'core cs', 'tools', 'technologies', 'tools and technologies', 'frameworks & libraries', 'technical toolkit', 'projects', 'project', 'selected projects', 'certifications', 'certificates', 'awards', 'achievements',
  'publications', 'languages', 'interests', 'references', 'leadership', 'activities', 'volunteer',
];

const SECTION_ALIASES: Record<string, string> = {
  'technical skills': 'skills', 'technical proficiencies': 'skills', 'frameworks': 'skills', 'frameworks & databases': 'skills', 'automation & cloud': 'skills', 'platforms & apis': 'skills', 'core cs': 'skills', tools: 'skills', technologies: 'skills', 'tools and technologies': 'skills', 'frameworks & libraries': 'skills', 'technical toolkit': 'skills', 'key skills': 'skills', 'core skills': 'skills',
  'work experience': 'experience', 'professional experience': 'experience',
  'employment history': 'experience', employment: 'experience', 'work history': 'experience',
  project: 'projects', 'selected projects': 'projects', 'personal projects': 'projects', activities: 'leadership', volunteering: 'leadership',
  'volunteer experience': 'leadership', 'professional summary': 'summary',
  'education & certifications': 'education', 'education and certifications': 'education', 'academic background': 'education',
};
/** Normalize whole section bodies, not just their keys; never combine different section families. */
export function canonicalizeSections(sections: Record<string, string>): Record<string, string> {
  const canonical: Record<string, string> = {};
  for (const [key, body] of Object.entries(sections)) {
    const name = SECTION_ALIASES[key.toLowerCase()] ?? key.toLowerCase();
    if (canonical[name] === body || canonical[name]?.includes(body)) continue;
    canonical[name] = [canonical[name], body].filter(Boolean).join('\n');
  }
  return canonical;
}

function isPdfMagic(b: Buffer): boolean {
  return b.length >= 4 && b.subarray(0, 4).toString() === '%PDF';
}

/** Preserve semantic line boundaries while cleaning extraction artifacts. */
function cleanText(s: string): string {
  return s
    .replace(/\r/g, '')
    .replace(/\x00/g, '')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' ')
    .split('\n')
    // Keep internal tabs / wide spacing on page text because they are useful
    // layout signals. normalizedText collapses them later for content parsing.
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectSections(normalizedText: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const synonymMap: Record<string, string> = {
    'work history': 'experience',
    'technical skills': 'skills',
    'technical proficiencies': 'skills', frameworks: 'skills', 'frameworks & databases': 'skills', 'automation & cloud': 'skills', 'platforms & apis': 'skills', 'core cs': 'skills', tools: 'skills',
    'selected projects': 'projects',
    'work experience': 'experience',
    employment: 'experience',
    project: 'projects',
    'professional experience': 'experience',
    'employment history': 'experience',
    'key skills': 'skills',
    'core skills': 'skills',
    'key competencies': 'skills',
    'expertise': 'skills',
    'technologies': 'skills',
    'tech stack': 'skills',
    'professional summary': 'summary',
    'career summary': 'summary',
    'career objective': 'objective',
    'projects & achievements': 'projects',
    'personal projects': 'projects',
    'certificates': 'certifications',
    'awards & achievements': 'achievements',
    honors: 'achievements',
    activities: 'leadership',
    'volunteer experience': 'leadership',
    extracurricular: 'leadership',
    'education & certifications': 'education',
    'education and certifications': 'education',
    'academic background': 'education',
  };

  const canonical = new Map<string, string>();
  for (const heading of SECTION_HEADINGS) canonical.set(heading, heading);
  for (const [variant, target] of Object.entries(synonymMap)) canonical.set(variant, target);

  const candidates: { heading: string; index: number }[] = [];
  let offset = 0;
  for (const rawLine of normalizedText.split('\n')) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();

    // A real section heading is normally short. We accept either a standalone
    // heading ("EXPERIENCE") or a heading followed by a colon ("Skills: ...").
    // This deliberately avoids matching body sentences that merely contain the
    // word "experience" or "skills".
    if (line.length > 0 && line.length <= 140) {
      const normalized = lower.replace(/[\s:—–-]+$/g, '').trim();
      let matched: string | null = canonical.get(normalized) ?? null;

      if (!matched) {
        for (const [variant, target] of canonical.entries()) {
          const prefix = new RegExp(`^${escapeRegex(variant)}\\s*[:—–-]\\s+`, 'i');
          if (prefix.test(line)) { matched = target; break; }
        }
      }

       if (matched === 'languages' && candidates.at(-1)?.heading === 'skills') {
         const remainder = line.replace(/^languages\s*:/i, '').trim();
         if (/(?:python|java(?:script)?|typescript|c\+\+|c#|\bsql\b|ruby|php|golang|kotlin|swift|rust)/i.test(remainder)) matched = 'skills';
       }
       if (matched) candidates.push({ heading: matched, index: offset });
    }
    offset += rawLine.length + 1;
  }

  for (let i = 0; i < candidates.length; i++) {
    const start = candidates[i].index;
    const end = i + 1 < candidates.length ? candidates[i + 1].index : normalizedText.length;
    const heading = candidates[i].heading;
    sections[heading] = [sections[heading], normalizedText.slice(start, end).trim()].filter(Boolean).join('\n').slice(0, 8000);
  }

  return canonicalizeSections(sections);
}

function computeLayoutSignals(pages: string[]): LayoutSignals {
  const pageCount = pages.length;
  const totalChars = pages.reduce((sum, page) => sum + page.length, 0);
  const avgCharsPerPage = pageCount ? totalChars / pageCount : 0;

  const hasMultiColumnRisk = pages.some((page) => {
    const lines = page.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 8) return false;

    // Extraction from multi-column PDFs often produces many tiny alternating
    // lines or unusually dense rows with a large visual gap in the middle.
    const tinyLineRatio = lines.filter((line) => line.length > 0 && line.length < 24).length / lines.length;
    const suspiciousGapRows = lines.filter((line) => /\S\s{8,}\S/.test(line)).length;
    const tabSeparatedRows = lines.filter((line) => line.includes('\t')).length;
    return tinyLineRatio > 0.58 || suspiciousGapRows >= 4 || tabSeparatedRows >= 4;
  });

  const excessiveTables = pages.some((page) => {
    const pipes = (page.match(/\|/g) || []).length;
    const tabs = (page.match(/\t/g) || []).length;
    return pipes > 20 || tabs > 20;
  });

  return {
    pageCount,
    hasMultiColumnRisk,
    excessiveTables,
    avgCharsPerPage,
    hasImages: false,
    textDensity: avgCharsPerPage,
    pageCharCounts: pages.map(page => page.length),
    imageDetectionAvailable: false,
  };
}

type PdfJsExtraction = { pages: string[]; lineSpans: NonNullable<ParsedDocument['lineSpans']>; hasImages: boolean };
async function extractWithPdfJs(buffer: Buffer): Promise<PdfJsExtraction | null> {
  try {
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(async () => {
      // @ts-ignore optional fallback for package layout differences
      return await import('pdfjs-dist').catch(() => null);
    });
    if (!pdfjs?.getDocument) return null;

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      verbosity: 0,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;

    const pages: string[] = [];
    const lineSpans: PdfJsExtraction['lineSpans'] = [];
    let hasImages = false;
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const operators = await page.getOperatorList();
      hasImages ||= operators.fnArray.some((operator: number) => [pdfjs.OPS?.paintImageXObject, pdfjs.OPS?.paintInlineImageXObject, pdfjs.OPS?.paintImageMaskXObject, pdfjs.OPS?.paintJpegXObject].includes(operator));

      let lastY: number | null = null;
      let lastRight: number | null = null;
      let text = '';
      for (const item of textContent.items as any[]) {
        const str = String(item.str ?? '');
        const x = item.transform?.[4];
        const y = item.transform?.[5];
        const width = typeof item.width === 'number' ? item.width : 0;
        const newLine = lastY !== null && y !== undefined && Math.abs(y - lastY) > 4;

        if (newLine) {
          text += '\n';
          lastRight = null;
        } else if (text && !text.endsWith('\n')) {
          const gap = x !== undefined && lastRight !== null ? x - lastRight : 0;
          text += gap > 72 ? '\t' : ' ';
        }

        text += str;
        if (str.trim()) lineSpans.push({ page: pageNumber - 1, text: str, x: typeof x === 'number' ? x : null, y: typeof y === 'number' ? y : null, width });
        if (y !== undefined) lastY = y;
        if (x !== undefined) lastRight = x + width;
      }

      pages.push(cleanText(text));
    }

    if (pages.length && pages.join('').trim().length > 100) return { pages, lineSpans, hasImages };
    return null;
  } catch {
    return null;
  }
}

async function extractWithPdfParse(buffer: Buffer): Promise<string[] | null> {
  try {
    const mod: any = await import('pdf-parse').catch(() => null);
    const parse = mod?.default ?? mod;
    if (!parse) return null;

    const data = await parse(buffer);
    const rawText = String(data.text ?? '');
    const text = cleanText(rawText);
    if (text.length < 100) return null;

    // form-feed is a stronger page boundary than arbitrary blank lines.
    const formFeedPages = rawText.split('\f').map(cleanText).filter(Boolean);
    if (formFeedPages.length > 1) return formFeedPages;

    return [text];
  } catch {
    return null;
  }
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedDocument> {
  if (!isPdfMagic(buffer)) throw new Error('Invalid PDF: missing %PDF magic bytes');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  const pdfjsResult = await extractWithPdfJs(buffer);
  let pages = pdfjsResult?.pages ?? null;
  let method: 'pdfjs' | 'pdf-parse' | 'fallback' = 'pdfjs';

  if (!pages) {
    pages = await extractWithPdfParse(buffer);
    method = 'pdf-parse';
  }

  if (!pages || pages.length === 0) {
    const raw = buffer.toString('utf8');
    const matches = raw.match(/\(([^\)]{5,})\)/g);
    const fallbackText = cleanText(matches ? matches.map((part) => part.slice(1, -1)).join('\n') : '');
    if (fallbackText.length >= 100) {
      pages = [fallbackText];
      method = 'fallback';
    }
  }

  if (!pages || pages.length === 0) {
    return {
      pages: [],
      normalizedText: '',
      sections: {},
      layoutSignals: {
        pageCount: 0,
        hasMultiColumnRisk: false,
        excessiveTables: false,
        avgCharsPerPage: 0,
        hasImages: false,
        textDensity: 0,
      },
      extractionConfidence: 0.1,
      detectedAsScanned: true,
      sha256,
      charCount: 0,
    };
  }

  // A resume parser should never invent hundreds of pages from binary chunks.
  // pdfjs supplies the real page count; this is only a final fallback guard.
  if (pages.length > 8) {
    pages = [cleanText(pages.join('\n\n').slice(0, 30000))];
    method = 'fallback';
  }

  const normalizedText = pages
    .join('\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const sections = detectSections(normalizedText);
  const layoutSignals = computeLayoutSignals(pages);
  if (pdfjsResult) {
    layoutSignals.hasImages = pdfjsResult.hasImages;
    layoutSignals.imageDetectionAvailable = true;
  }
  const charCount = normalizedText.length;

  let confidence = method === 'pdfjs' ? 0.92 : method === 'pdf-parse' ? 0.84 : 0.5;
  if (charCount < 500) confidence -= 0.2;
  if (charCount < 200) confidence -= 0.3;
  if (layoutSignals.hasMultiColumnRisk) confidence -= 0.08;
  if (Object.keys(sections).length === 0 && charCount > 800) confidence -= 0.08;
  confidence = Math.max(0, Math.min(1, confidence));

  const detectedAsScanned = charCount < 200 && buffer.length > 8000 && method === 'fallback';

  return {
    pages,
    normalizedText,
    sections,
    layoutSignals,
    extractionConfidence: Number(confidence.toFixed(2)),
    detectedAsScanned,
    sha256,
    charCount,
    lineSpans: pdfjsResult?.lineSpans,
  };
}

export default parsePdfBuffer;
