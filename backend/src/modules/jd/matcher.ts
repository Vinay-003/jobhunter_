import type { ParsedJobDescription } from './jdParser.js';
import type { ResumeProfile } from '../parsing/resumeProfile.js';
import { normalizeSkill } from '../parsing/skillNormalizer.js';

/**
 * Exact skill matching strict: Java != JavaScript via normalized equality.
 * Hard requirement comparison, produce match for JD.
 */

export type SkillMatch = {
  skill: string;
  required: boolean;
  present: boolean;
};

export type JdMatchResult = {
  overallScore: number; // 0-100
  requiredMatched: SkillMatch[];
  preferredMatched: SkillMatch[];
  requiredCoverage: number; // 0-1
  preferredCoverage: number; // 0-1
  missingRequired: string[];
  matchedRequired: string[];
  matchedPreferred: string[];
  missingPreferred: string[];
  partialMatches: Array<{ jdSkill: string; resumeSkill: string; family: string }>;
  strengths: string[];
  warnings: string[];
};

// Skill families for partial credit hints (display only — scoring stays strict).
const SKILL_FAMILIES: Record<string, string> = {
  PostgreSQL: 'SQL databases',
  MySQL: 'SQL databases',
  MongoDB: 'databases',
  SQL: 'SQL databases',
  Redis: 'databases',
  React: 'JS frontend',
  'Next.js': 'JS frontend',
  'Vue.js': 'JS frontend',
  JavaScript: 'JS language',
  TypeScript: 'JS language',
  'Node.js': 'JS backend',
  Express: 'JS backend',
  Python: 'backend language',
  FastAPI: 'Python backend',
  Flask: 'Python backend',
  Django: 'Python backend',
  AWS: 'cloud',
  GCP: 'cloud',
  Azure: 'cloud',
  Docker: 'devops',
  Kubernetes: 'devops',
  HTML: 'web basics',
  CSS: 'web basics',
  'Tailwind CSS': 'web basics',
  Sass: 'web basics',
};

function normalizeSet(skills: string[]): Set<string> {
  return new Set(skills.map((s) => normalizeSkill(s).toLowerCase()));
}

export function matchJd(profile: ResumeProfile, jd: ParsedJobDescription): JdMatchResult {
  const profileSkills = profile.skillsNormalized.length ? profile.skillsNormalized : profile.skills;
  const profileSet = normalizeSet(profileSkills);
  // For display, keep original canonical names but matching via lower normalized
  const requiredMatches: SkillMatch[] = jd.requiredSkills.map((skill) => {
    const norm = normalizeSkill(skill).toLowerCase();
    return { skill, required: true, present: profileSet.has(norm) };
  });

  const preferredMatches: SkillMatch[] = jd.preferredSkills.map((skill) => {
    const norm = normalizeSkill(skill).toLowerCase();
    return { skill, required: false, present: profileSet.has(norm) };
  });

  const requiredPresent = requiredMatches.filter((m) => m.present).length;
  const preferredPresent = preferredMatches.filter((m) => m.present).length;

  const requiredCoverage = jd.requiredSkills.length ? requiredPresent / jd.requiredSkills.length : 1;
  const preferredCoverage = jd.preferredSkills.length ? preferredPresent / jd.preferredSkills.length : 1;

  // Scoring: 70% required, 30% preferred; if no preferred then 100% required
  let overallScore: number;
  if (jd.requiredSkills.length === 0 && jd.preferredSkills.length === 0) {
    overallScore = 50; // no skills to match, neutral
  } else if (jd.preferredSkills.length === 0) {
    overallScore = Math.round(requiredCoverage * 100);
  } else if (jd.requiredSkills.length === 0) {
    overallScore = Math.round(preferredCoverage * 100);
  } else {
    overallScore = Math.round(requiredCoverage * 70 + preferredCoverage * 30);
  }

  // Also factor seniority mismatch as warning not score (explicit strict skill only)
  const matchedRequired = requiredMatches.filter((m) => m.present).map((m) => m.skill);
  const missingRequired = requiredMatches.filter((m) => !m.present).map((m) => m.skill);
  const matchedPreferred = preferredMatches.filter((m) => m.present).map((m) => m.skill);
  const missingPreferred = preferredMatches.filter((m) => !m.present).map((m) => m.skill);

  // Partial / family hints: JD skill missing exactly but resume has same-family skill.
  // Display-only — does not change score.
  const partialMatches: Array<{ jdSkill: string; resumeSkill: string; family: string }> = [];
  const resumeFamilies = new Map<string, string>(); // resumeSkill -> family
  for (const rs of profileSkills) {
    const fam = SKILL_FAMILIES[normalizeSkill(rs)];
    if (fam) resumeFamilies.set(normalizeSkill(rs), fam);
  }
  for (const miss of missingRequired) {
    const missNorm = normalizeSkill(miss);
    const fam = SKILL_FAMILIES[missNorm];
    if (!fam) continue;
    for (const [rs, rf] of resumeFamilies) {
      if (rf === fam && normalizeSkill(rs) !== missNorm) {
        partialMatches.push({ jdSkill: miss, resumeSkill: rs, family: fam });
        break;
      }
    }
  }

  const strengths: string[] = [];
  const warnings: string[] = [];

  if (requiredCoverage === 1 && jd.requiredSkills.length > 0) strengths.push('All required skills matched');
  else if (matchedRequired.length > 0) strengths.push(`Matched ${matchedRequired.length}/${jd.requiredSkills.length} required skills: ${matchedRequired.slice(0, 8).join(', ')}`);
  if (preferredCoverage >= 0.5 && jd.preferredSkills.length > 0) strengths.push('Strong preferred skills coverage');
  if (partialMatches.length > 0) strengths.push(`Transferable: ${partialMatches.slice(0, 4).map((p) => `${p.resumeSkill} → ${p.jdSkill} (${p.family})`).join('; ')}`);
  if (missingRequired.length > 0) warnings.push(`Missing required: ${missingRequired.join(', ')}`);
  if (jd.yearsExperience !== null && profile.totalExperienceYears !== null) {
    if (profile.totalExperienceYears < jd.yearsExperience) {
      warnings.push(`Experience ${profile.totalExperienceYears}y below required ${jd.yearsExperience}y`);
    } else if (profile.totalExperienceYears >= jd.yearsExperience) {
      strengths.push('Experience meets requirement');
    }
  }
  if (jd.seniority && profile.seniority && jd.seniority !== profile.seniority) {
    warnings.push(`Seniority mismatch: resume ${profile.seniority} vs JD ${jd.seniority}`);
  }

  return {
    overallScore,
    requiredMatched: requiredMatches,
    preferredMatched: preferredMatches,
    requiredCoverage,
    preferredCoverage,
    missingRequired,
    matchedRequired,
    matchedPreferred,
    missingPreferred,
    partialMatches,
    strengths,
    warnings,
  };
}

export default matchJd;
