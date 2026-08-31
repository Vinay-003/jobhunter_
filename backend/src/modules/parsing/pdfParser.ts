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
};

const SECTION_HEADINGS = [
  'summary', 'objective', 'profile', 'education', 'experience', 'work experience', 'employment', 'employment history',
  'skills', 'technical skills', 'projects', 'project', 'certifications', 'certificates', 'awards', 'achievements',
  'publications', 'languages', 'interests', 'references', 'leadership', 'activities', 'volunteer',
];

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

function detectSections(normalizedText: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const synonymMap: Record<string, string> = {
    'work history': 'experience',
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

      if (matched) candidates.push({ heading: matched, index: offset });
    }
    offset += rawLine.length + 1;
  }

  const seen = new Set<string>();
  const unique = candidates.filter((candidate) => {
    if (seen.has(candidate.heading)) return false;
    seen.add(candidate.heading);
    return true;
  });

  for (let i = 0; i < unique.length; i++) {
    const start = unique[i].index;
    const end = i + 1 < unique.length ? unique[i + 1].index : normalizedText.length;
    sections[unique[i].heading] = normalizedText.slice(start, end).trim().slice(0, 8000);
  }

  if (sections['technical skills'] && !sections.skills) sections.skills = sections['technical skills'];
  if (sections.project && !sections.projects) sections.projects = sections.project;
  if (sections['work experience'] && !sections.experience) sections.experience = sections['work experience'];
  if (sections.employment && !sections.experience) sections.experience = sections.employment;
  if (sections['employment history'] && !sections.experience) sections.experience = sections['employment history'];

  return sections;
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
  };
}

async function extractWithPdfJs(buffer: Buffer): Promise<string[] | null> {
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
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();

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
        if (y !== undefined) lastY = y;
        if (x !== undefined) lastRight = x + width;
      }

      pages.push(cleanText(text));
    }

    if (pages.length && pages.join('').trim().length > 100) return pages;
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

  let pages = await extractWithPdfJs(buffer);
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
  };
}

export default parsePdfBuffer;
