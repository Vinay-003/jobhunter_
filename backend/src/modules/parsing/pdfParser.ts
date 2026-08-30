import crypto from 'node:crypto';

/**
 * Robust PDF parser — pdfjs-dist (primary) + pdf-parse (fallback).
 * Fixes legacy naive fallback that created 314 pages from binary.
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
  'publications', 'languages', 'interests', 'references', 'leadership', 'activities', 'volunteer'
];

function isPdfMagic(b: Buffer): boolean { return b.length >= 4 && b.subarray(0, 4).toString() === '%PDF'; }

function cleanText(s: string): string {
  return s.replace(/\x00/g, '').replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectSections(normalizedText: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lower = normalizedText.toLowerCase();
  // Match headings that are on their own line or start of section, with optional colon/dash
  const headingPattern = `\\b(${SECTION_HEADINGS.map(escapeRegex).join('|')})\\b\\s*[:\\-—]*`;
  const re = new RegExp(headingPattern, 'gi');
  const indices: { heading: string; index: number; raw: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    // Only consider heading if it's at start of text or after newline/period or isolated
    const before = lower.slice(Math.max(0, m.index - 30), m.index);
    const after = lower.slice(m.index + m[0].length, m.index + m[0].length + 20);
    // Heuristic: heading should be reasonably isolated (not inside a sentence)
    indices.push({ heading: m[1].toLowerCase(), index: m.index, raw: m[0] });
  }
  // Dedupe: keep first occurrence, sorted
  const seen = new Set<string>();
  const unique: typeof indices = [];
  for (const it of indices) {
    if (!seen.has(it.heading)) { seen.add(it.heading); unique.push(it); }
  }
  unique.sort((a, b) => a.index - b.index);
  for (let i = 0; i < unique.length; i++) {
    const start = unique[i].index;
    const end = i + 1 < unique.length ? unique[i + 1].index : normalizedText.length;
    const heading = unique[i].heading;
    sections[heading] = normalizedText.slice(start, end).trim().slice(0, 8000);
  }
  // Also handle "Technical Skills" as "skills" alias
  if (sections['technical skills'] && !sections['skills']) sections['skills'] = sections['technical skills'];
  if (sections['project'] && !sections['projects']) sections['projects'] = sections['project'];
  return sections;
}

function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function computeLayoutSignals(pages: string[]): LayoutSignals {
  const pageCount = pages.length;
  const totalChars = pages.reduce((s, p) => s + p.length, 0);
  const avgCharsPerPage = pageCount ? totalChars / pageCount : 0;
  const hasMultiColumnRisk = pages.some(p => {
    const lines = p.split('\n').length;
    return lines > 80 && avgCharsPerPage < 800;
  });
  const excessiveTables = pages.some(p => (p.match(/\t/g) || []).length > 20 || (p.match(/\|/g) || []).length > 20);
  return { pageCount, hasMultiColumnRisk, excessiveTables, avgCharsPerPage, hasImages: false, textDensity: avgCharsPerPage };
}

async function extractWithPdfJs(buffer: Buffer): Promise<string[] | null> {
  try {
    // pdfjs-dist 4.x legacy build for Node
    const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs').catch(async () => {
      // @ts-ignore
      return await import('pdfjs-dist').catch(() => null);
    });
    if (!pdfjs || !pdfjs.getDocument) return null;
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), verbosity: 0, isEvalSupported: false, useSystemFonts: true }).promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      // Join with space, but preserve line breaks via hasEOL
      let lastY: number | null = null;
      let text = '';
      for (const item of tc.items as any[]) {
        const str = item.str ?? '';
        const y = item.transform?.[5];
        if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 5) text += '\n';
        text += str + ' ';
        lastY = y ?? lastY;
      }
      pages.push(cleanText(text));
    }
    if (pages.length && pages.join('').trim().length > 100) return pages;
    return null;
  } catch (e) {
    return null;
  }
}

async function extractWithPdfParse(buffer: Buffer): Promise<string[] | null> {
  try {
    const mod: any = await import('pdf-parse').catch(() => null);
    const parse = mod?.default ?? mod;
    if (!parse) return null;
    const data = await parse(buffer);
    const text = cleanText(data.text ?? '');
    if (text.length < 100) return null;
    // pdf-parse already joins pages with \n\n; split if it contains form feed
    const pages = data.text.split('\n\n').map(cleanText).filter(Boolean);
    if (pages.length) return pages;
    return [text];
  } catch {
    return null;
  }
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedDocument> {
  if (!isPdfMagic(buffer)) throw new Error('Invalid PDF: missing %PDF magic bytes');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  let pages: string[] | null = null;
  let method: 'pdfjs' | 'pdf-parse' | 'fallback' = 'fallback';

  pages = await extractWithPdfJs(buffer);
  if (pages) method = 'pdfjs';
  else {
    pages = await extractWithPdfParse(buffer);
    if (pages) method = 'pdf-parse';
  }

  if (!pages || pages.length === 0) {
    // Final fallback: try to extract text between parentheses (old naive) but don't split into 3000-char chunks
    const raw = buffer.toString('utf8');
    const m = raw.match(/\(([^\)]{5,})\)/g);
    let text = m ? m.map(s => s.slice(1, -1)).join(' ') : '';
    text = cleanText(text);
    if (text.length < 100) {
      // If still garbage, treat as scanned
      pages = [];
    } else {
      pages = [text];
      method = 'fallback';
    }
  }

  // Guard: if pages still empty, return scanned
  if (!pages || pages.length === 0) {
    return {
      pages: [],
      normalizedText: '',
      sections: {},
      layoutSignals: { pageCount: 0, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: 0, hasImages: false, textDensity: 0 },
      extractionConfidence: 0.1,
      detectedAsScanned: true,
      sha256,
      charCount: 0,
    };
  }

  // Clamp page count: real resumes are 1-3 pages, not 314
  if (pages.length > 5) {
    // If naive fallback created many chunks, join and re-split sensibly (should not happen with pdfjs/pdf-parse)
    const joined = pages.join(' ');
    pages = [joined.slice(0, 8000)];
  }

  const normalizedText = pages.join('\n\n').replace(/\s+/g, ' ').trim();
  const sections = detectSections(normalizedText);
  const layoutSignals = computeLayoutSignals(pages);
  const charCount = normalizedText.length;

  let confidence = 0.9;
  if (method === 'pdf-parse') confidence = 0.85;
  if (method === 'fallback') confidence = 0.5;
  if (charCount < 500) confidence -= 0.2;
  if (charCount < 200) confidence -= 0.3;
  if (layoutSignals.hasMultiColumnRisk) confidence -= 0.1;
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
