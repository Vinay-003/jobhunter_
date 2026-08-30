import type { ParsedDocument } from './pdfParser.js';
import { normalizeSkill, CANONICAL_SKILL_ALIASES } from './skillNormalizer.js';

export type ExperienceEntry = {
  title: string | null;
  company: string | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  description: string | null;
};

export type EducationEntry = {
  degree: string | null;
  institution: string | null;
  year: string | null;
  raw: string;
};

export type ResumeProfile = {
  skills: string[];
  skillsNormalized: string[];
  education: EducationEntry[];
  experience: ExperienceEntry[];
  totalExperienceYears: number | null;
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | null;
  contactSignals: {
    hasEmail: boolean;
    hasPhone: boolean;
    hasLinkedIn: boolean;
    hasGithub: boolean;
  };
  summary: string | null;
  languages: string[];
};

const DEGREE_KEYWORDS = [
  'bachelor', "bachelor's", 'b.sc', 'btech', 'b.tech', 'be ', 'master', "master's", 'm.sc', 'mtech', 'm.tech', 'mba', 'phd', 'ph.d', 'doctorate',
  'associate', 'diploma', 'bca', 'mca', 'bsc', 'msc',
];

const DATE_REGEX = /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|\b\d{4}\s*[-–—]\s*(?:\d{4}|present|current|now)\b|\b\d{4}\b/gi;
const DATE_RANGE_REGEX = /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|\b\d{4}\b)\s*[-–—]\s*(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|\b\d{4}\b|present|current|now)/gi;

function extractSkills(normalizedText: string): string[] {
  const lower = normalizedText.toLowerCase();
  const found: string[] = [];
  // Check each alias key as word boundary match; longest keys first
  const keys = Object.keys(CANONICAL_SKILL_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(lower)) {
      found.push(normalizeSkill(key));
    }
  }
  // Dedupe
  return [...new Set(found)];
}

function extractEducation(normalizedText: string): EducationEntry[] {
  const entries: EducationEntry[] = [];
  const lower = normalizedText.toLowerCase();
  // Split into lines / sentences
  const sentences = normalizedText.split(/[\n\.]+/).map((s) => s.trim()).filter(Boolean);
  for (const s of sentences) {
    const sl = s.toLowerCase();
    const hasDegree = DEGREE_KEYWORDS.some((k) => sl.includes(k));
    if (!hasDegree) continue;
    const yearMatch = s.match(/\b(19|20)\d{2}\b/);
    entries.push({
      degree: s.slice(0, 120),
      institution: null,
      year: yearMatch ? yearMatch[0] : null,
      raw: s.slice(0, 300),
    });
    if (entries.length >= 5) break;
  }
  return entries;
}

function parseYear(str: string): number | null {
  const m = str.match(/\b(19|20)\d{2}\b/);
  if (!m) return null;
  return parseInt(m[0], 10);
}

function extractExperience(normalizedText: string): ExperienceEntry[] {
  const entries: ExperienceEntry[] = [];
  // Use date ranges to infer experience blocks: grab surrounding context
  let match: RegExpExecArray | null;
  // Reset regex
  const re = new RegExp(DATE_RANGE_REGEX.source, 'gi');
  while ((match = re.exec(normalizedText)) !== null) {
    const start = match[1];
    const end = match[2];
    const isCurrent = /present|current|now/i.test(end);
    // Grab ~200 chars before match as potential title/company
    const idx = match.index;
    const before = normalizedText.slice(Math.max(0, idx - 250), idx).trim();
    const after = normalizedText.slice(idx + match[0].length, idx + match[0].length + 250).trim();
    // Heuristic: last line before date may be title
    const beforeLines = before.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
    const title = beforeLines.length ? beforeLines[beforeLines.length - 1].slice(0, 120) : null;
    entries.push({
      title,
      company: null,
      startDate: start,
      endDate: end,
      isCurrent,
      description: after.slice(0, 300) || null,
    });
    if (entries.length >= 10) break;
  }
  // Fallback: if no ranges, look for single year mentions near job keywords
  if (entries.length === 0) {
    const jobKeywords = /(engineer|developer|manager|analyst|intern|consultant|lead|architect|designer)/i;
    if (jobKeywords.test(normalizedText)) {
      const year = normalizedText.match(/\b(19|20)\d{2}\b/);
      if (year) {
        entries.push({
          title: normalizedText.slice(0, 100),
          company: null,
          startDate: year[0],
          endDate: null,
          isCurrent: false,
          description: null,
        });
      }
    }
  }
  return entries;
}

function computeTotalYears(experience: ExperienceEntry[]): number | null {
  if (experience.length === 0) return null;
  const nowYear = new Date().getFullYear();
  let totalMonths = 0;
  for (const e of experience) {
    const sy = e.startDate ? parseYear(e.startDate) : null;
    let ey: number | null = e.isCurrent ? nowYear : (e.endDate ? parseYear(e.endDate) : null);
    if (sy && ey && ey >= sy) {
      totalMonths += (ey - sy) * 12;
    } else if (sy && !ey) {
      // single year, assume 1 year
      totalMonths += 12;
    }
  }
  if (totalMonths === 0) return null;
  return Math.round((totalMonths / 12) * 10) / 10;
}

function inferSeniority(totalYears: number | null, normalizedText: string): ResumeProfile['seniority'] {
  const lower = normalizedText.toLowerCase();
  if (lower.includes('tech lead') || lower.includes('staff engineer') || lower.includes('principal') || lower.includes('architect')) {
    if ((totalYears ?? 0) >= 6) return 'lead';
  }
  if (totalYears === null) {
    if (lower.includes('senior')) return 'senior';
    if (lower.includes('junior') || lower.includes('entry')) return 'junior';
    return null;
  }
  if (totalYears < 2) return 'junior';
  if (totalYears < 5) return 'mid';
  if (totalYears < 8) return 'senior';
  return 'lead';
}

export function buildResumeProfile(parsedDoc: ParsedDocument): ResumeProfile {
  const text = parsedDoc.normalizedText;
  const skills = extractSkills(text);
  const education = extractEducation(text);
  const experience = extractExperience(text);
  const totalExperienceYears = computeTotalYears(experience);
  const seniority = inferSeniority(totalExperienceYears, text);

  const lower = text.toLowerCase();
  const contactSignals = {
    hasEmail: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text),
    hasPhone: /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(text),
    hasLinkedIn: lower.includes('linkedin.com'),
    hasGithub: lower.includes('github.com'),
  };

  // Summary: first 500 chars or summary section
  let summary: string | null = null;
  if (parsedDoc.sections['summary'] || parsedDoc.sections['objective']) {
    summary = (parsedDoc.sections['summary'] ?? parsedDoc.sections['objective']).slice(0, 500);
  } else {
    summary = text.slice(0, 500) || null;
  }

  const languages: string[] = [];
  const langMatch = text.match(/languages?\s*[:\-]\s*([^\n]+)/i);
  if (langMatch) {
    languages.push(...langMatch[1].split(/[,;]+/).map((s) => s.trim()).filter(Boolean).slice(0, 10));
  }

  return {
    skills,
    skillsNormalized: skills.map((s) => normalizeSkill(s)),
    education,
    experience,
    totalExperienceYears,
    seniority,
    contactSignals,
    summary,
    languages,
  };
}

export default buildResumeProfile;
