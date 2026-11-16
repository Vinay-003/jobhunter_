import type { ResumeProfile } from '../parsing/resumeProfile.js';

// Evidence is sourced only from typed professional records. Never substitute
// raw PDF text or a first-page summary, even when all records are empty.
export function redactProfessionalText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com)\/[^\s,)]+/gi, '[profile link removed]')
    .replace(/\+?\d{1,3}[\s.-]?[6-9]\d{4}[\s.-]?\d{5}\b/g, '[phone removed]')
    .replace(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}\b/g, '[phone removed]')
    .replace(/\s+/g, ' ').trim();
}

export function professionalEvidence(profile: ResumeProfile): string[] {
  const chunks: string[] = [];
  if (profile.skills?.length) chunks.push(`Skills: ${profile.skills.join(', ')}`);
  const records = [...(profile.experience ?? []), ...(profile.projects ?? [])];
  for (const entry of records.slice(0, 30)) {
    if (entry.kind === 'leadership') continue;
    const title = entry.title ?? '';
    const rawParts: string[] = [];
    if (entry.bullets?.length) {
      for (const b of entry.bullets) {
        if (b?.text && typeof b.text === 'string' && b.text.trim()) {
          rawParts.push(b.text.trim());
        }
      }
    }
    if (entry.description) {
      const descParts = entry.description.split(/(?<=[.!?])\s+(?=[A-Z•◦▪▫‣⁃*])|(?=[•◦▪▫‣⁃*]\s*)/)
        .map(s => s.replace(/^[•◦▪▫‣⁃*\-–—]\s*/, '').trim())
        .filter(s => s.length > 20);
      for (const dp of descParts) {
        const flatDp = dp.replace(/\s+/g, ' ');
        if (!rawParts.some(rp => rp.replace(/\s+/g, ' ').includes(flatDp) || flatDp.includes(rp.replace(/\s+/g, ' ')))) {
          rawParts.push(dp);
        }
      }
      if (!rawParts.length && entry.description.trim()) {
        rawParts.push(entry.description.trim());
      }
    }
    for (const part of rawParts) {
      if (!part.trim()) continue;
      const safe = redactProfessionalText(`${title} ${part}`).slice(0, 2000);
      if (safe && !/^(?:\[email removed\]|\[phone removed\]|\[profile link removed\]\s*)+$/i.test(safe)) chunks.push(safe);
    }
  }
  return [...new Set(chunks)];
}
