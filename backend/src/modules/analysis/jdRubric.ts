import type { ResumeProfile } from '../parsing/resumeProfile.js';
import type { ParsedJobDescription } from '../jd/jdParser.js';
import type { JdMatchResult } from '../jd/matcher.js';
import { normalizeSeniority, seniorityPenalty } from '../jobs/seniority.js';

export const JD_RUBRIC_VERSION = '3.1.0';
const round = (n: number) => Math.round(n);
const tokenize = (s: string) => (s.toLowerCase().match(/[a-z][a-z+#.]*/g) ?? []);
const roleFamily = (s: string) => {
  const words = new Set(tokenize(s));
  if (['software', 'developer', 'engineer', 'backend', 'frontend', 'fullstack', 'full-stack'].some(w => words.has(w))) return 'software engineering';
  if (words.has('data') && (words.has('analyst') || words.has('scientist'))) return 'data';
  return null;
};

export function scoreJdRubric(profile: ResumeProfile, jd: ParsedJobDescription, match: JdMatchResult,
  responsibilityCoverage: Array<{ responsibility: string; matchScore: number; candidateEvidence: string | null }>) {
  const groups = jd.requirementGroups;
  const skills = new Set((profile.skillsNormalized?.length ? profile.skillsNormalized : profile.skills).map(s => s.toLowerCase()));
  const cover = (required: boolean) => {
    const selected = groups?.filter(g => (g.required !== false) === required);
    if (!selected?.length) return required ? (jd.requiredSkills.length ? match.requiredCoverage : null) : (jd.preferredSkills.length ? match.preferredCoverage : null);
    return selected.filter(g => {
      return g.allOf.every(s => skills.has(s.toLowerCase())) &&
        (!g.anyOf.length || g.anyOf.some(s => skills.has(s.toLowerCase())));
    }).length / selected.length;
  };
  const requiredCoverage = cover(true);
  const preferredCoverage = cover(false);
  const explicitPossible = requiredCoverage === null && preferredCoverage === null ? 0 : 35;
  const explicitMustHave = round((requiredCoverage ?? 0) * (preferredCoverage === null ? 35 : 30) + (preferredCoverage ?? 0) * (preferredCoverage === null ? 0 : requiredCoverage === null ? 35 : 5));
  const evidenceCoverage = responsibilityCoverage.filter(c => c.candidateEvidence && c.matchScore >= 0.45).length;
  const responsibilityPossible = responsibilityCoverage.length ? 30 : 0;
  const responsibilitySemantic = responsibilityPossible ? round(responsibilityCoverage.reduce((sum, c) => sum + (c.candidateEvidence ? Math.max(0, Math.min(1, c.matchScore)) : 0), 0) / responsibilityCoverage.length * 30) : 0;
  const targetFamily = roleFamily(jd.title ?? '');
  const roles = [...profile.experience, ...((profile as any).projects ?? [])].map(e => roleFamily(e.title ?? e.name ?? ''));
  const rolePossible = targetFamily && roles.some(Boolean) ? 15 : 0;
  const roleAlignment = rolePossible && roles.includes(targetFamily) ? 15 : 0;
  const domains = jd.domainTerms.filter(s => s.length >= 3 && !['data', 'cloud'].includes(s.toLowerCase()));
  const domainPossible = domains.length ? 10 : 0;
  const evidence = [...profile.experience, ...((profile as any).projects ?? [])].map(e => `${e.title ?? ''} ${e.description ?? ''}`).join(' ').toLowerCase();
  const domain = domainPossible && domains.some(s => new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(evidence)) ? 10 : 0;
  const raw = jd.rawText;
  const degreeRequested = /\b(?:bachelor(?:'s)?|master(?:'s)?|b\.?tech|b\.?e\.?|degree|ph\.?d)\b/i.test(raw);
  const educationPossible = degreeRequested ? 10 : 0;
  const educationEvidence = profile.education.some(e => /bachelor|b\.?tech|b\.?e\.?|master|m\.?tech|ph\.?d|bca|mca|degree/i.test(`${e.degree ?? ''} ${e.raw ?? ''}`));
  const candidateLevel = normalizeSeniority(profile.seniority);
  const jobLevel = normalizeSeniority(jd.seniority);
  const isEarlyCareerJob = /intern|fresher|trainee|apprentice/i.test(jd.title ?? '') ||
    /\b(?:pursuing|student|intern|fresher|recent grad|new grad)\b/i.test(raw) ||
    (candidateLevel === 'intern' && (!jobLevel || jobLevel === 'intern'));
  const educationStatus = !degreeRequested ? 'not_applicable' : !educationEvidence ? 'unverified' :
    profile.education.some(e => e.completed === true) ? 'evidenced' :
    (isEarlyCareerJob && profile.education.some(e => e.completed === false || /in.progress|expected|pursuing/i.test(`${e.degree ?? ''} ${e.raw ?? ''}`) || (e.year && Number(e.year) >= new Date().getFullYear()))) ? 'evidenced' :
    profile.education.some(e => e.completed === false || /in.progress|expected|pursuing/i.test(`${e.degree ?? ''} ${e.raw ?? ''}`) || (e.year && Number(e.year) > new Date().getFullYear())) ? 'in_progress' : 'unverified';
  const education = educationPossible && educationStatus === 'evidenced' ? 10 : 0;
  const minYears = jd.minYears ?? jd.yearsExperience;
  const years = profile.totalExperienceYears;
  // Internship evidence can qualify for entry roles; title alone is not a
  // barrier for that transition. Explicit advanced scope is a separate check.
  const seniorGap = ['intern', 'entry'].includes(candidateLevel ?? '') && ['mid', 'senior', 'principal'].includes(jobLevel ?? '');
  const overqualifiedIntern = jobLevel === 'intern' && (['mid', 'senior', 'principal'].includes(candidateLevel ?? '') || (typeof years === 'number' && years >= 2));
  const experienceGap = typeof minYears === 'number' && typeof years === 'number' && years < minYears;
  const missingQualification = (typeof minYears === 'number' && years === null) || (degreeRequested && educationStatus !== 'evidenced') || requiredCoverage === null || requiredCoverage < 1;
  const eligibility = experienceGap || seniorGap || overqualifiedIntern ? 'ineligible' : missingQualification ? 'uncertain' : 'eligible';
  const reasons = [experienceGap ? `Professional experience ${years} years below required ${minYears} years` : null,
    seniorGap ? `Junior career stage does not establish ${jd.seniority} engineering scope` : null,
    overqualifiedIntern ? `Candidate career stage (${candidateLevel ?? `${years} yrs experience`}) exceeds internship role` : null,
    educationStatus === 'in_progress' ? 'Degree in progress; completion requirement needs confirmation' : null].filter(Boolean);
  const breakdown = { explicitMustHave, responsibilitySemantic, roleAlignment, domain, education };
  const weights = { explicitMustHave: 35, responsibilitySemantic: 30, roleAlignment: 15, domain: 10, education: 10 };
  const applicability = { explicitMustHave: !!explicitPossible, responsibilitySemantic: !!responsibilityPossible,
    roleAlignment: !!rolePossible, domain: !!domainPossible, education: !!educationPossible };
  const pointsPossible = explicitPossible + responsibilityPossible + rolePossible + domainPossible + educationPossible;
  const rawScore = Object.values(breakdown).reduce((sum, n) => sum + n, 0);
  // A title or generic role label is not substantive qualification evidence.
  // Keep the score unavailable/limited rather than manufacturing 100/100.
  const substantiveEvidence = Boolean(jd.requiredSkills.length || jd.preferredSkills.length || responsibilityCoverage.length || degreeRequested || domains.length);
  const relevanceScore = pointsPossible && substantiveEvidence ? round(rawScore / pointsPossible * 100) : null;
  const penalty = seniorityPenalty(candidateLevel, jobLevel);
  const score = relevanceScore === null ? null : Math.max(0, relevanceScore - penalty);
  return { score, rawScore, relevanceScore, seniorityPenalty: penalty, pointsPossible, weights, applicability, breakdown, eligibility,
    eligibilityChecks: { minimumProfessionalYears: { required: minYears ?? null, observed: years ?? null, status: experienceGap ? 'fail' : minYears == null ? 'not_applicable' : years == null ? 'uncertain' : 'pass' }, seniorScope: { required: jd.seniority, observed: profile.seniority, status: seniorGap ? 'fail' : jd.seniority == null ? 'uncertain' : jd.seniority === profile.seniority ? 'pass' : 'uncertain' }, education: educationStatus },
    qualificationReasons: reasons, evidenceCoverage, requiredCoverage, preferredCoverage, rubricVersion: JD_RUBRIC_VERSION };
}
