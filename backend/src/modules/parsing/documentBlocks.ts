import type { ParsedDocument } from './pdfParser.js';

export type DocumentBullet = { text: string; section: string; page: number; startLine: number; endLine: number; source: 'visual' | 'fallback' };
export type DocumentBlocks = { bullets: DocumentBullet[] };
const HEADING = /^(?:#{1,4}\s*)?(?:summary|profile|objective|education|(?:professional |work )?experience|employment|projects?|technical skills|skills|leadership|activities|volunteer(?:ing)?|certifications?)\s*:?(?:\s*)$/i;
const BULLET = /^\s*(?:[•◦▪▫‣⁃*]|[-–—])\s+(.+)$/;
const canonical: Record<string, string> = { 'technical skills': 'skills', 'work experience': 'experience', 'professional experience': 'experience', employment: 'experience', project: 'projects', activities: 'leadership', volunteer: 'leadership', volunteering: 'leadership' };
export function buildDocumentBlocks(doc: ParsedDocument): DocumentBlocks {
  const bullets: DocumentBullet[] = [];
  doc.pages.forEach((page, pageIndex) => {
    let section = '';
    const lines = page.split('\n');
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (HEADING.test(line.trim())) {
        section = line.trim().replace(/^#+\s*/, '').replace(/:$/, '').toLowerCase();
        section = canonical[section] ?? section;
        continue;
      }
      const match = line.match(BULLET);
      if (match) {
        bullets.push({ text: match[1].trim(), section, page: pageIndex, startLine: index, endLine: index, source: 'visual' });
      } else if (bullets.length && bullets.at(-1)?.page === pageIndex && bullets.at(-1)?.endLine === index - 1 && line.trim() && /^\s/.test(line) && !/\b(?:19|20)\d{2}\b/.test(line)) {
        const bullet = bullets[bullets.length - 1];
        bullet.text += ` ${line.trim()}`;
        bullet.endLine = index;
      }
    }
  });
  // Synthetic callers may provide sections while pages have no headings; retain visual bullets once.
  for (const bullet of bullets) {
    if (bullet.section) continue;
    const section = Object.entries(doc.sections).find(([, body]) => body.includes(bullet.text));
    if (section) bullet.section = canonical[section[0]] ?? section[0];
  }
  return { bullets };
}
