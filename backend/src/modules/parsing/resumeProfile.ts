import { canonicalizeSections, type ParsedDocument } from './pdfParser.js';
import { normalizeSkill } from './skillNormalizer.js';
import { extractSkills } from './skillExtractor.js';
import { buildDocumentBlocks, type DocumentBullet } from './documentBlocks.js';
import { detectSeniority, type CanonicalSeniority } from '../jobs/seniority.js';

export const PROFILE_VERSION = '5.2.0';

export type ExperienceEntry = {
  title: string | null; company: string | null; startDate: string | null; endDate: string | null;
  isCurrent: boolean; description: string | null;
  kind?: 'employment' | 'internship' | 'leadership' | 'project';
  bullets?: DocumentBullet[];
};
export type EducationEntry = {
  degree: string | null; institution: string | null; year: string | null; raw: string;
  field?: string | null; completionDate?: string | null; completed?: boolean | null;
};
export type ResumeProfile = {
  skills: string[]; skillsNormalized: string[]; education: EducationEntry[]; experience: ExperienceEntry[];
  totalExperienceYears: number | null; seniority: CanonicalSeniority | 'junior' | 'lead' | null;
  declaredSkills?: string[]; demonstratedSkills?: string[];
  contactSignals: { hasEmail: boolean; hasPhone: boolean; hasLinkedIn: boolean; hasGithub: boolean };
  summary: string | null; languages: string[];
  projects?: ExperienceEntry[]; leadership?: ExperienceEntry[];
  employmentYears?: number | null; internshipYears?: number | null;
};

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DATE = '(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+)?(?:19|20)\\d{2}';
const RANGE = new RegExp(`(${DATE})\\s*(?:[-–—]|\\bto\\b)\\s*(${DATE}|present|current|now)`, 'i');
export function parseMonth(value: string | null, evaluationDate: Date, end = false): number | null {
  if (!value) return null;
  if (/^(present|current|now)$/i.test(value)) return evaluationDate.getUTCFullYear() * 12 + evaluationDate.getUTCMonth();
  const year = value.match(/(?:19|20)\d{2}/)?.[0];
  if (!year) return null;
  const month = value.match(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i)?.[0].slice(0, 3).toLowerCase();
  return Number(year) * 12 + (month ? MONTHS[month] : end ? 11 : 0);
}
/** Elapsed months: March–July is four; overlapping professional intervals count once. */
export function unionMonths(entries: ExperienceEntry[], evaluationDate: Date): number | null {
  const intervals = entries.map(entry => [parseMonth(entry.startDate, evaluationDate), parseMonth(entry.endDate, evaluationDate, true)] as const)
    .filter((range): range is readonly [number, number] => range[0] !== null && range[1] !== null && range[1] >= range[0])
    .sort((a, b) => a[0] - b[0]);
  if (!intervals.length) return null;
  let months = 0, start = intervals[0][0], end = intervals[0][1];
  for (const [nextStart, nextEnd] of intervals.slice(1)) {
    if (nextStart <= end) end = Math.max(end, nextEnd);
    else { months += end - start; start = nextStart; end = nextEnd; }
  }
  return months + end - start;
}
function extractEducation(body: string, evaluationDate: Date): EducationEntry[] {
  const rawLines = body.split('\n').map(s => s.trim()).filter(Boolean).filter(s => !/^(?:education|education & certifications|certifications)$/i.test(s));
  const lines = rawLines.flatMap(line => line.includes(' | ') && /\b(?:b\.?s|m\.?s|bachelor|master|b\.?tech)/i.test(line) ? line.split(' | ').map(s => s.trim()) : [line]);
  const result: EducationEntry[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const degree = line.match(/\b(?:bachelor(?:'s)?(?: of (?:technology|science|engineering|arts))?|b\.?tech|b\.?s(?:c|\.)?|b\.?e\.?|bca|master(?:'s)?(?: of (?:technology|science|arts))?|m\.?tech|m\.?s(?:c|\.)?|mca|mba|ph\.?d|doctorate|diploma)\b/i);
    if (!degree) continue;
    const context = [lines[index - 1], line, lines[index + 1]].filter(Boolean).join(' | ');
    const period = context.match(RANGE);
    const yearsInContext = context.match(/\b(?:19|20)\d{2}\b/g);
    const lastYear = yearsInContext && yearsInContext.length ? yearsInContext[yearsInContext.length - 1] : null;
    const date = period?.[2] ?? context.match(new RegExp(DATE, 'i'))?.[0] ?? lastYear;
    const rawInst = line.split(/\s*[|,]\s*/).find(part => /\b(?:university|institute|college|school)\b/i.test(part))
      ?? (lines[index - 1] && /\b(?:university|institute|college)\b/i.test(lines[index - 1]) ? lines[index - 1] : null);
    const institution = rawInst ? rawInst.replace(/\s*[-–—]\s*(?:19|20)\d{2}.*$/, '').trim() : null;
    const fieldRegex = /\b(?:in|of|,\s*|-|\/|\.?\s+)\s*(computer science(?: engineering| and engineering| & engineering)?|information technology|electrical engineering|computer engineering|mechanical engineering|software engineering|applied mathematics|mathematics|data science|artificial intelligence)\b/i;
    const fieldMatch = line.match(fieldRegex)?.[1] ?? context.match(fieldRegex)?.[1];
    const field = fieldMatch ?? (
      /\b(?:cse|cs)\b/i.test(line) || /\b(?:cse|cs)\b/i.test(context) ? 'Computer Science' :
      /\b(?:it)\b/i.test(line) && !/\b(?:split|hit|git)\b/i.test(line) ? 'Information Technology' :
      null
    );
    const completion = date ? parseMonth(date, evaluationDate) : null;
    const today = evaluationDate.getUTCFullYear() * 12 + evaluationDate.getUTCMonth();
    result.push({ degree: degree[0], institution, field, year: date?.match(/\d{4}/)?.[0] ?? lastYear, completionDate: date, completed: completion === null ? null : completion <= today, raw: context });
    if (result.length >= 5) break;
  }
  return result;
}
function entriesFor(body: string, kind: ExperienceEntry['kind'], bullets: DocumentBullet[]): ExperienceEntry[] {
  if (!body) return [];
  const lines = body.split('\n').filter(line => line.trim());
  const entries: ExperienceEntry[] = [];
  let current: ExperienceEntry | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^(?:experience|work experience|employment|projects?|selected projects|personal projects|leadership|activities|volunteer(?:ing)?|education|education & certifications)\s*:?$/i.test(line)) continue;
    if (/^[•◦▪▫‣⁃*\-–—]\s/.test(line)) {
      if (current) current.description = [current.description, line.replace(/^[•◦▪▫‣⁃*\-–—]\s*/, '')].filter(Boolean).join(' ');
      continue;
    }
    const range = line.match(RANGE);
    const role = /\b(?:intern|engineer|developer|scientist|analyst|architect|designer|consultant|manager|lead|specialist|administrator|secretary|coordinator|editor)\b/i;
    const colonProject = kind === 'project' && /^([A-Z0-9][A-Za-z0-9\s/&–—-]{2,60}):\s*(.+)$/.exec(line);
    if (colonProject) {
      current = { title: colonProject[1].trim(), company: null, startDate: null, endDate: null, isCurrent: false, description: colonProject[2].trim(), kind: 'project', bullets: [] };
      entries.push(current);
      continue;
    }
    const projectTitle = kind === 'project' && !current && (line.split('|')[0].trim().length < 100) && !/[.!?:]$/.test(line);
    const projectNextTitle = kind === 'project' && !!current && (line.length < 75 || (line.includes('|') && line.split('|')[0].trim().length < 75)) && !/[.!?:]$/.test(line)
      && !/^\s/.test(rawLine) && !/\b(?:built|developed|created|designed|implemented|integrated|deployed|maintained|optimized|using|with)\b/i.test(line);
    if (range || projectTitle || projectNextTitle) {
      const withoutDate = line.replace(RANGE, '').replace(/\s*[|,;–—-]\s*$/, '').trim();
      const parts = withoutDate.split(/\s*[|,;]\s*/).filter(Boolean);
      const rolePart = parts.find(part => role.test(part));
      const company = kind === 'project' ? null : (parts.length >= 2 ? (rolePart ? parts.find(part => part !== rolePart) ?? null : parts[1] ?? null) : (rolePart ? null : parts[0] ?? null));
      const title = kind === 'project' ? withoutDate : (parts.length >= 2 ? (rolePart ?? parts[0] ?? null) : (rolePart ?? null));
      current = { title, company, startDate: range?.[1] ?? null, endDate: range?.[2] ?? null, isCurrent: /^(present|current|now)$/i.test(range?.[2] ?? ''), description: null, kind: kind === 'employment' && /intern/i.test(title ?? '') ? 'internship' : kind, bullets: [] };
      entries.push(current);
    } else if (current && (role.test(line) || !current.title) && kind !== 'project') {
      current.title = current.title ?? line;
      current.kind = kind === 'employment' && /intern/i.test(line) ? 'internship' : kind;
    } else if (current && !/^\w+(?:\s+\w+){0,3}:/.test(line)) {
      current.description = [current.description, line].filter(Boolean).join(' ');
    }
  }
  if (!entries.length && bullets.length) entries.push({ title: null, company: null, startDate: null, endDate: null, isCurrent: false, description: bullets.map(b => b.text).join(' '), kind, bullets });
  for (const entry of entries) {
    entry.bullets = bullets.filter(b => entry.description?.includes(b.text.slice(0, 20)));
    if (entry.bullets.length) {
      const prose = (entry.description ?? '').split(/(?=[•◦▪▫‣⁃*]\s)/)[0].trim();
      entry.description = [prose, ...entry.bullets.map(b => b.text).filter(b => !prose.includes(b))].filter(Boolean).join(' ');
    }
  }
  return entries;
}
export function buildResumeProfile(parsedDoc: ParsedDocument, evaluationDate = new Date()): ResumeProfile {
  const text = parsedDoc.normalizedText;
  const sections = canonicalizeSections(parsedDoc.sections);
  const bullets = buildDocumentBlocks(parsedDoc).bullets;
  const experience = entriesFor(sections.experience ?? sections['work experience'] ?? sections.employment ?? '', 'employment', bullets.filter(b => b.section === 'experience'));
  const leadership = entriesFor(sections.leadership ?? sections.activities ?? '', 'leadership', bullets.filter(b => b.section === 'leadership'));
  const projects = entriesFor(sections.projects ?? sections.project ?? '', 'project', bullets.filter(b => b.section === 'projects'));
  const months = unionMonths(experience, evaluationDate);
  const years = months === null ? null : Math.round(months / 12 * 100) / 100;
  const fullTime = unionMonths(experience.filter(e => e.kind === 'employment'), evaluationDate);
  const internship = unionMonths(experience.filter(e => e.kind === 'internship'), evaluationDate);
  // Tenure alone does not confer leadership scope; senior titles remain senior.
  const seniority: ResumeProfile['seniority'] = [...experience].sort((a,b) => Number(b.isCurrent)-Number(a.isCurrent) || (parseMonth(b.endDate,evaluationDate) ?? 0) - (parseMonth(a.endDate,evaluationDate) ?? 0)).map(entry => detectSeniority(entry.title)).find(Boolean)
    ?? (years === null || years < 2 ? (experience.some(entry => entry.kind === 'internship') ? 'intern' : 'entry') : years < 5 ? 'mid' : 'senior');
  const summary = (sections.summary ?? sections.objective ?? sections.profile)
    ?.replace(/^(?:summary|objective|profile)\s*:?\s*/i, '')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, '[phone]')
    .replace(/https?:\/\/\S+/gi, '[link]').trim() ?? null;
  const declaredSkills = extractSkills(Object.entries(sections).filter(([name]) => /^(?:skills|technical proficiencies|frameworks|tools|technologies|tech stack|expertise|key competencies)$/.test(name)).map(([, body]) => body).join('\n'));
  const demonstratedSkills = extractSkills([...experience.map(entry => entry.description ?? ''), ...projects.map(entry => [entry.title, entry.description].filter(Boolean).join(' '))].join('\n'));
  const lower = text.toLowerCase();
  const langMatch = sections.languages?.match(/languages?\s*[:\-]?\s*([^\n]+)/i);
  return {
    skills: [...new Set([...declaredSkills, ...demonstratedSkills])], skillsNormalized: [...new Set([...declaredSkills, ...demonstratedSkills])].map(normalizeSkill), declaredSkills, demonstratedSkills, education: extractEducation(sections.education ?? '', evaluationDate),
    experience, projects, leadership, totalExperienceYears: years, employmentYears: fullTime === null ? null : Math.round(fullTime / 12 * 100) / 100,
    internshipYears: internship === null ? null : Math.round(internship / 12 * 100) / 100, seniority,
    contactSignals: { hasEmail: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text), hasPhone: /(\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/i.test(text), hasLinkedIn: lower.includes('linkedin'), hasGithub: lower.includes('github') },
    summary: summary || null, languages: langMatch ? langMatch[1].split(/[,;]+/).map(s => s.trim()).filter(Boolean) : [],
  };
}

export type ParsedResumeSectionItem = {
  title?: string;
  company?: string;
  date?: string;
  text?: string;
  bullets?: string[];
};

export type ParsedResumeSection = {
  title: string;
  heading: string;
  content?: string;
  text?: string;
  bullets?: string[];
  items?: ParsedResumeSectionItem[];
};

export type ContactInfo = {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  links?: string[];
};

export function buildParsedResumeSections(doc: ParsedDocument, prof: ResumeProfile): {
  parsedSections: ParsedResumeSection[];
  contactInfo: ContactInfo;
  extractedText: string;
} {
  const lines = doc.normalizedText.split('\n').map(l => l.trim()).filter(Boolean);
  const email = doc.normalizedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] ?? null;
  const phone = doc.normalizedText.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] ?? null;
  const headerLines: string[] = [];
  for (const line of lines) {
    if (/^(?:professional summary|summary|technical skills|skills|professional experience|experience)/i.test(line)) break;
    headerLines.push(line);
  }
  const name = headerLines[0] || 'Candidate';
  const targetRole = headerLines.length > 1 && !headerLines[1].includes('@') && !headerLines[1].includes('+') ? headerLines[1] : null;
  const contactLine = headerLines.find(l => l.includes('@') || l.includes('|') || l.includes('+')) || '';
  const parts = contactLine.split('|').map(s => s.trim());
  const location = parts.find(p => !p.includes('@') && !p.includes('+') && !p.includes('.com') && !p.includes('http')) || null;
  const links = parts.filter(p => p.includes('.com') || p.includes('http') || p.includes('github') || p.includes('linkedin'));

  const contactInfo: ContactInfo = { name, title: targetRole, email, phone, location, links };

  const parsedSections: ParsedResumeSection[] = [];

  // 1. Summary
  if (doc.sections.summary) {
    const cleanSum = doc.sections.summary.replace(/^(?:professional summary|summary|career summary|objective)\s*:?\s*/i, '').trim();
    parsedSections.push({
      title: 'Professional Summary',
      heading: 'Professional Summary',
      content: cleanSum,
      text: cleanSum,
    });
  }

  // 2. Skills
  if (doc.sections.skills) {
    const skillLines = doc.sections.skills.split('\n').map(l => l.trim()).filter(l => !/^(?:technical skills|skills)$/i.test(l));
    const skillItems: ParsedResumeSectionItem[] = skillLines.map(line => {
      const col = line.match(/^([A-Za-z0-9\s&/]+):\s*(.+)$/);
      if (col) {
        const skillsList = col[2].split(',').map(s => s.trim()).filter(Boolean);
        return { title: col[1].trim(), text: col[2].trim(), bullets: skillsList };
      }
      return { text: line };
    });
    parsedSections.push({
      title: 'Technical Skills',
      heading: 'Technical Skills',
      content: doc.sections.skills.replace(/^(?:technical skills|skills)\s*:?\s*/i, '').trim(),
      text: doc.sections.skills.replace(/^(?:technical skills|skills)\s*:?\s*/i, '').trim(),
      items: skillItems,
      bullets: prof.skills,
    });
  }

  // 3. Experience
  if (prof.experience && prof.experience.length) {
    const expItems: ParsedResumeSectionItem[] = prof.experience.map(exp => {
      const bullets = (exp.description || '').split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 15);
      return {
        title: exp.title || 'Role',
        company: exp.company || '',
        date: [exp.startDate, exp.endDate || (exp.isCurrent ? 'Present' : '')].filter(Boolean).join(' – '),
        text: exp.description || '',
        bullets,
      };
    });
    parsedSections.push({
      title: 'Professional Experience',
      heading: 'Professional Experience',
      items: expItems,
      bullets: expItems.flatMap(i => i.bullets || []),
    });
  }

  // 4. Projects
  if (prof.projects && prof.projects.length) {
    const projItems: ParsedResumeSectionItem[] = prof.projects.map(proj => {
      const bullets = (proj.description || '').split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(s => s.length > 15);
      return {
        title: proj.title || 'Project',
        text: proj.description || '',
        bullets,
      };
    });
    parsedSections.push({
      title: 'Selected Projects',
      heading: 'Selected Projects',
      items: projItems,
      bullets: projItems.flatMap(i => i.bullets || []),
    });
  }

  // 5. Education
  if (doc.sections.education) {
    const eduItems: ParsedResumeSectionItem[] = (prof.education || []).map(edu => ({
      title: [edu.degree, edu.field].filter(Boolean).join(' in '),
      company: edu.institution || '',
      date: edu.year || '',
      text: edu.raw,
    }));
    parsedSections.push({
      title: 'Education & Certifications',
      heading: 'Education & Certifications',
      content: doc.sections.education.replace(/^(?:education & certifications|education)\s*:?\s*/i, '').trim(),
      text: doc.sections.education.replace(/^(?:education & certifications|education)\s*:?\s*/i, '').trim(),
      items: eduItems.length ? eduItems : undefined,
    });
  }

  return { contactInfo, parsedSections, extractedText: doc.normalizedText };
}

export default buildResumeProfile;
