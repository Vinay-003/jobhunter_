import { normalizeSkill, CANONICAL_SKILL_ALIASES } from '../parsing/skillNormalizer.js';

export type ParsedJobDescription = {
  title: string | null;
  seniority: 'junior' | 'mid' | 'senior' | 'lead' | null;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  yearsExperience: number | null;
  domainTerms: string[];
  rawText: string;
};

const SENIORITY_KEYWORDS: Record<string, ParsedJobDescription['seniority']> = {
  junior: 'junior',
  entry: 'junior',
  'entry-level': 'junior',
  mid: 'mid',
  intermediate: 'mid',
  senior: 'senior',
  lead: 'lead',
  staff: 'lead',
  principal: 'lead',
};

const DOMAIN_KEYWORDS = [
  'fintech', 'healthcare', 'e-commerce', 'ecommerce', 'saas', 'cloud', 'ai', 'ml',
  'machine learning', 'data', 'security', 'devops', 'blockchain', 'gaming', 'edtech',
];

export function parseJd(jdText: string): ParsedJobDescription {
  const rawText = jdText;
  const text = jdText.trim();
  const lower = text.toLowerCase();

  // Title: first line or "Title: ..." or before first newline if short
  let title: string | null = null;
  const titleMatch = text.match(/^(?:job\s*title|title|role)\s*[:\-]\s*(.+)$/im);
  if (titleMatch) {
    title = titleMatch[1].split('\n')[0].trim().slice(0, 120);
  } else {
    const firstLine = text.split('\n')[0].trim();
    if (firstLine.length < 80 && firstLine.length > 3 && !firstLine.includes('. ')) {
      title = firstLine;
    }
  }

  // Seniority
  let seniority: ParsedJobDescription['seniority'] = null;
  for (const [kw, level] of Object.entries(SENIORITY_KEYWORDS)) {
    if (lower.includes(kw)) {
      seniority = level;
      // prefer senior/lead over junior if multiple
      if (level === 'lead' || level === 'senior') break;
    }
  }

  // Years experience
  let yearsExperience: number | null = null;
  const yearsMatch = text.match(/(\d+)\+?\s*(?:years?|yrs?)\s*(?:of\s*)?experience/i);
  if (yearsMatch) yearsExperience = parseInt(yearsMatch[1], 10);
  else {
    const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)\s*years?/i);
    if (rangeMatch) yearsExperience = parseInt(rangeMatch[1], 10);
  }

  // Skills — naive extraction via known skill list
  // We collect skills that appear in text; then split required vs preferred via section headings
  const { requiredSkills, preferredSkills } = extractSkillsBySection(text);

  // Responsibilities: split by lines/bullets in responsibilities section or whole text
  const responsibilities = extractResponsibilities(text);

  // Domain terms
  const domainTerms = DOMAIN_KEYWORDS.filter((k) => lower.includes(k));

  return {
    title,
    seniority,
    requiredSkills,
    preferredSkills,
    responsibilities,
    yearsExperience,
    domainTerms,
    rawText,
  };
}

function extractSkillsBySection(text: string): { requiredSkills: string[]; preferredSkills: string[] } {
  const lower = text.toLowerCase();

  // Identify preferred/nice-to-have section
  const preferredIdx = lower.search(/\b(preferred|nice to have|bonus|plus|desired)\b/i);
  const requiredIdx = lower.search(/\b(required|must have|essential|qualifications)\b/i);

  // Gather all skills present in text
  const allSkills = extractAllSkills(text);

  if (preferredIdx === -1 && requiredIdx === -1) {
    // No section split, all required
    return { requiredSkills: allSkills, preferredSkills: [] };
  }

  // Split text into required part and preferred part by index
  let requiredText = text;
  let preferredText = '';
  if (preferredIdx !== -1) {
    requiredText = text.slice(0, preferredIdx);
    preferredText = text.slice(preferredIdx);
  }

  const requiredSkills = extractAllSkills(requiredText);
  const preferredSkills = extractAllSkills(preferredText).filter((s) => !requiredSkills.includes(s));

  // If no required found but allSkills non-empty, treat as required
  if (requiredSkills.length === 0 && allSkills.length > 0 && preferredSkills.length > 0) {
    return { requiredSkills: allSkills.slice(0, Math.ceil(allSkills.length / 2)), preferredSkills: allSkills.slice(Math.ceil(allSkills.length / 2)) };
  }

  return { requiredSkills, preferredSkills };
}

function extractAllSkills(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  // Use unified alias map from skillNormalizer — single source of truth.
  // Covers bare forms: react, python, html, css, next, etc.
  const keys = Object.keys(CANONICAL_SKILL_ALIASES).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(lower)) {
      const norm = normalizeSkill(key);
      if (!found.includes(norm)) found.push(norm);
    }
  }
  return found;
}

function extractResponsibilities(text: string): string[] {
  // Find responsibilities section
  const respIdx = text.toLowerCase().search(/\b(responsibilities|duties|what you.?ll do|role|job description)\b/i);
  let chunk = respIdx !== -1 ? text.slice(respIdx) : text;
  // Limit to next section heading
  const nextSection = chunk.slice(500).search(/\n\s*(requirements|qualifications|skills|benefits|about us|preferred)\b/i);
  if (nextSection !== -1) chunk = chunk.slice(0, 500 + nextSection);

  // Split by bullets or lines
  const lines = chunk
    .split(/\n|•|·|—|–/)
    .map((s) => s.replace(/^[\-\*\d\.\)\s]+/, '').trim())
    .filter((s) => s.length > 10 && s.length < 300)
    .slice(0, 15);

  // Filter out likely non-responsibility lines (e.g., skill lists)
  return lines.filter((l) => /[a-z]/i.test(l)).slice(0, 10);
}

export default parseJd;
