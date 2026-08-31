import type { ParsedDocument } from '../parsing/pdfParser.js';
import type { ResumeProfile } from '../parsing/resumeProfile.js';

/**
 * Resume Health / ATS Readiness Scorer v3
 *
 * Important product rule:
 * - This is a NO-JD score. It never uses embeddings, target-role similarity, job keywords,
 *   salary, seniority fit, or any other job-specific signal.
 * - It measures whether the document is parseable, complete, evidence-rich, concise,
 *   and recruiter-readable.
 * - Job-specific fit belongs in the JD matcher and job recommendation pipeline.
 *
 * Exact 100 point rubric:
 *  20 Parseability & ATS structure
 *  15 Core completeness
 *  20 Impact & measurable evidence
 *  15 Experience / project quality
 *  10 Skills clarity & evidence
 *  10 Writing & bullet quality
 *   5 Concision & readability
 *   5 Consistency & hygiene
 */

export const VERSION = '3.0.0';

export type RuleStatus = 'pass' | 'warn' | 'fail';
export type Priority = 'high' | 'medium' | 'low';

export type RuleResult = {
  ruleId: string;
  category: string;
  label: string;
  status: RuleStatus;
  pointsAwarded: number;
  pointsPossible: number;
  message: string;
  evidence?: string;
  recommendation?: string;
  priority?: Priority;
};

export type CategoryBreakdown = {
  category: string;
  label: string;
  pointsAwarded: number;
  pointsPossible: number;
  percent: number;
  summary: string;
  rules: RuleResult[];
};

export type PriorityAction = {
  id: string;
  title: string;
  category: string;
  priority: Priority;
  why: string;
  how: string;
  potentialGain: number;
  evidence?: string;
};

export type ResumeHealthMetrics = {
  pageCount: number;
  wordCount: number;
  sectionCount: number;
  skillsCount: number;
  bulletCount: number;
  quantifiedBulletCount: number;
  quantifiedBulletRatio: number;
  actionLedBulletCount: number;
  actionLedBulletRatio: number;
  outcomeBulletCount: number;
  weakPhraseHits: number;
  repeatedLeadVerbCount: number;
  extractionConfidence: number;
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedIn: boolean;
  hasGithub: boolean;
};

export type ReadinessResult = {
  score: number;
  scoreLabel: string;
  scoreMessage: string;
  breakdown: CategoryBreakdown[];
  rules: RuleResult[];
  strengths: string[];
  warnings: string[];
  priorityActions: PriorityAction[];
  metrics: ResumeHealthMetrics;
  issueCount: number;
  highPriorityIssueCount: number;
  version: string;
  methodology: {
    mode: 'rule_based_no_jd';
    note: string;
    totalPossible: 100;
  };
};

type TargetLevel = 'entry' | 'junior' | 'mid' | 'senior' | 'lead' | string | null | undefined;

type BulletCandidate = {
  text: string;
  source: 'experience' | 'projects' | 'other';
  quantified: boolean;
  actionLed: boolean;
  outcomeLed: boolean;
  weakPhraseHits: number;
  leadVerb: string | null;
};

const ACTION_VERBS = new Set([
  'achieved', 'accelerated', 'automated', 'built', 'created', 'cut', 'decreased', 'delivered', 'designed',
  'developed', 'drove', 'enabled', 'engineered', 'established', 'executed', 'expanded', 'generated', 'grew',
  'implemented', 'improved', 'increased', 'launched', 'led', 'managed', 'migrated', 'optimized', 'owned',
  'reduced', 'refactored', 'resolved', 'saved', 'scaled', 'shipped', 'simplified', 'spearheaded', 'streamlined',
  'tested', 'trained', 'transformed', 'upgraded', 'wrote', 'analyzed', 'coordinated', 'integrated', 'deployed',
  'maintained', 'mentored', 'negotiated', 'planned', 'produced', 'restructured', 'secured', 'standardized',
]);

const OUTCOME_TERMS = [
  'increased', 'improved', 'reduced', 'decreased', 'grew', 'saved', 'cut', 'boosted', 'accelerated', 'raised',
  'generated', 'achieved', 'exceeded', 'lowered', 'optimized', 'scaled', 'resulting in', 'leading to', 'which led to',
  'throughput', 'latency', 'conversion', 'revenue', 'cost', 'time saved', 'accuracy', 'adoption', 'retention',
];

const WEAK_PHRASES = [
  'responsible for', 'worked on', 'helped with', 'helped to', 'participated in', 'assisted with', 'duties included',
  'tasked with', 'involved in', 'hard working', 'hardworking', 'team player', 'go getter', 'self motivated',
  'detail oriented', 'results driven', 'results-oriented', 'excellent communication skills', 'good communication skills',
  'passionate about', 'dynamic professional', 'highly motivated', 'proven track record',
];

const COMMON_TYPOS = [
  'teh', 'recieve', 'occured', 'seperate', 'definately', 'experiance', 'responcible', 'managment', 'acheivement',
  'profesional', 'adress', 'succesful',
];

const REQUIRED_HEADINGS = ['experience', 'education', 'skills'];
const STANDARD_HEADINGS = new Set([
  'summary', 'objective', 'profile', 'education', 'experience', 'work experience', 'employment', 'employment history',
  'skills', 'technical skills', 'projects', 'project', 'certifications', 'certificates', 'awards', 'achievements',
  'publications', 'languages', 'leadership', 'activities', 'volunteer',
]);

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function pct(points: number, possible: number): number {
  if (!possible) return 100;
  return Math.round((points / possible) * 100);
}

function statusFor(points: number, possible: number): RuleStatus {
  const p = possible ? points / possible : 1;
  if (p >= 0.85) return 'pass';
  if (p >= 0.45) return 'warn';
  return 'fail';
}

function rule(
  ruleId: string,
  category: string,
  label: string,
  pointsAwarded: number,
  pointsPossible: number,
  message: string,
  extras: Partial<Pick<RuleResult, 'evidence' | 'recommendation' | 'priority'>> = {},
): RuleResult {
  const awarded = round1(clamp(pointsAwarded, 0, pointsPossible));
  return {
    ruleId,
    category,
    label,
    status: statusFor(awarded, pointsPossible),
    pointsAwarded: awarded,
    pointsPossible,
    message,
    ...extras,
  };
}

function labelForScore(score: number): { label: string; message: string } {
  if (score >= 90) return { label: 'Excellent', message: 'Polished, parseable, and evidence-rich. Focus on job-specific tailoring next.' };
  if (score >= 80) return { label: 'Strong', message: 'A strong base with a few improvements that can materially increase recruiter clarity.' };
  if (score >= 70) return { label: 'Competitive', message: 'Usable today, but several high-value fixes can make the resume easier to scan and more persuasive.' };
  if (score >= 55) return { label: 'Needs work', message: 'The document is readable, but important structure or content signals are weakening it.' };
  return { label: 'High risk', message: 'Fix parseability, missing sections, and evidence quality before relying on this resume.' };
}

function normalizeLine(line: string): string {
  return line.replace(/^\s*[•◦▪▫‣⁃*\-–—]+\s*/, '').replace(/\s+/g, ' ').trim();
}

function hasMetric(text: string): boolean {
  const patterns = [
    /\b\d+(?:\.\d+)?\s*%\b/,
    /[$€£₹]\s*\d[\d,.]*\b/,
    /\b\d+(?:\.\d+)?\s*[xX]\b/,
    /\b\d+(?:\.\d+)?\s*(?:k|m|b|million|billion|thousand)\b/i,
    /\b\d+(?:\.\d+)?\s*(?:users?|customers?|clients?|requests?|records?|transactions?|files?|services?|endpoints?|teams?|members?|hours?|days?|weeks?|months?|minutes?|seconds?)\b/i,
    /\b(?:from|to|by|under|over|within)\s+\d+(?:\.\d+)?\b/i,
  ];
  return patterns.some((r) => r.test(text));
}

function leadVerb(text: string): string | null {
  const first = normalizeLine(text).toLowerCase().match(/^([a-z][a-z-]{2,})\b/)?.[1] ?? null;
  return first && ACTION_VERBS.has(first) ? first : null;
}

function weakHits(text: string): number {
  const lower = text.toLowerCase();
  return WEAK_PHRASES.reduce((sum, phrase) => sum + (lower.includes(phrase) ? 1 : 0), 0);
}

function outcomeLed(text: string): boolean {
  const lower = text.toLowerCase();
  return OUTCOME_TERMS.some((t) => lower.includes(t));
}

function extractBulletCandidates(parsedDoc: ParsedDocument): BulletCandidate[] {
  const candidates: BulletCandidate[] = [];
  const seen = new Set<string>();

  const add = (raw: string, source: BulletCandidate['source']) => {
    const text = normalizeLine(raw);
    if (text.length < 25 || text.length > 360) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const verb = leadVerb(text);
    candidates.push({
      text,
      source,
      quantified: hasMetric(text),
      actionLed: !!verb,
      outcomeLed: outcomeLed(text),
      weakPhraseHits: weakHits(text),
      leadVerb: verb,
    });
  };

  // First preference: real visual lines retained by the parser.
  for (const page of parsedDoc.pages) {
    for (const line of page.split(/\n+/)) {
      if (/^\s*[•◦▪▫‣⁃*\-–—]\s+/.test(line)) add(line, 'other');
    }
  }

  // Section fallback catches resumes exported without bullet glyphs.
  for (const [heading, body] of Object.entries(parsedDoc.sections)) {
    const source: BulletCandidate['source'] = heading.includes('project') ? 'projects' : heading.includes('experience') || heading.includes('employment') ? 'experience' : 'other';
    if (source === 'other') continue;
    const lines = body.split(/\n+|(?<=[.;])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) add(line, source);
  }

  return candidates.slice(0, 80);
}

function sectionPresent(parsedDoc: ParsedDocument, names: string[]): boolean {
  const keys = Object.keys(parsedDoc.sections).map((s) => s.toLowerCase());
  return names.some((name) => keys.some((k) => k === name || k.includes(name)));
}

function countDateTokens(text: string): number {
  const months = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
  const re = new RegExp(`\\b(?:${months}\\s+)?(?:19|20)\\d{2}\\b`, 'gi');
  return (text.match(re) || []).length;
}


function hasRecentExperience(profile: ResumeProfile): boolean {
  const currentYear = new Date().getFullYear();
  const cutoff = currentYear - 2;
  return profile.experience.some((entry) => {
    if (entry.isCurrent) return true;
    const text = `${entry.startDate || ''} ${entry.endDate || ''}`;
    const years = [...text.matchAll(/\b(?:19|20)\d{2}\b/g)].map((m) => Number(m[0]));
    return years.some((year) => year >= cutoff && year <= currentYear + 1);
  });
}

function countRepeatedLeadVerbs(bullets: BulletCandidate[]): number {
  const counts = new Map<string, number>();
  for (const b of bullets) {
    if (!b.leadVerb) continue;
    counts.set(b.leadVerb, (counts.get(b.leadVerb) || 0) + 1);
  }
  let repeats = 0;
  for (const count of counts.values()) if (count > 3) repeats += count - 3;
  return repeats;
}

function skillEvidenceCount(parsedDoc: ParsedDocument, profile: ResumeProfile): number {
  if (!profile.skillsNormalized.length) return 0;
  const evidenceText = [
    parsedDoc.sections['experience'] || '',
    parsedDoc.sections['work experience'] || '',
    parsedDoc.sections['employment'] || '',
    parsedDoc.sections['projects'] || '',
    parsedDoc.sections['project'] || '',
  ].join(' ').toLowerCase();
  if (!evidenceText.trim()) return 0;
  return profile.skillsNormalized.filter((skill) => {
    const token = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${token}\\b`, 'i').test(evidenceText);
  }).length;
}

function category(category: string, label: string, rules: RuleResult[], summary: string): CategoryBreakdown {
  const pointsAwarded = round1(rules.reduce((s, r) => s + r.pointsAwarded, 0));
  const pointsPossible = rules.reduce((s, r) => s + r.pointsPossible, 0);
  return {
    category,
    label,
    pointsAwarded,
    pointsPossible,
    percent: pct(pointsAwarded, pointsPossible),
    summary,
    rules,
  };
}

function actionFromRule(r: RuleResult): PriorityAction | null {
  if (r.status === 'pass' || !r.recommendation) return null;
  return {
    id: r.ruleId,
    title: r.label,
    category: r.category,
    priority: r.priority || (r.status === 'fail' ? 'high' : 'medium'),
    why: r.message,
    how: r.recommendation,
    potentialGain: round1(r.pointsPossible - r.pointsAwarded),
    evidence: r.evidence,
  };
}

export function scoreReadiness(
  parsedDoc: ParsedDocument,
  profile: ResumeProfile,
  targetLevel: TargetLevel,
): ReadinessResult {
  const text = parsedDoc.normalizedText || '';
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const bullets = extractBulletCandidates(parsedDoc);
  const quantified = bullets.filter((b) => b.quantified);
  const actionLed = bullets.filter((b) => b.actionLed);
  const outcomeBullets = bullets.filter((b) => b.outcomeLed);
  const weakPhraseHits = bullets.reduce((sum, b) => sum + b.weakPhraseHits, 0) + weakHits(text.slice(0, 2500));
  const repeatedLeadVerbCount = countRepeatedLeadVerbs(bullets);
  const dateTokens = countDateTokens(text);
  const standardSectionCount = Object.keys(parsedDoc.sections).filter((h) => STANDARD_HEADINGS.has(h.toLowerCase())).length;
  const skillsEvidence = skillEvidenceCount(parsedDoc, profile);

  const metrics: ResumeHealthMetrics = {
    pageCount: parsedDoc.layoutSignals.pageCount,
    wordCount,
    sectionCount: Object.keys(parsedDoc.sections).length,
    skillsCount: profile.skills.length,
    bulletCount: bullets.length,
    quantifiedBulletCount: quantified.length,
    quantifiedBulletRatio: bullets.length ? round1((quantified.length / bullets.length) * 100) : 0,
    actionLedBulletCount: actionLed.length,
    actionLedBulletRatio: bullets.length ? round1((actionLed.length / bullets.length) * 100) : 0,
    outcomeBulletCount: outcomeBullets.length,
    weakPhraseHits,
    repeatedLeadVerbCount,
    extractionConfidence: parsedDoc.extractionConfidence,
    hasEmail: profile.contactSignals.hasEmail,
    hasPhone: profile.contactSignals.hasPhone,
    hasLinkedIn: profile.contactSignals.hasLinkedIn,
    hasGithub: profile.contactSignals.hasGithub,
  };

  const breakdown: CategoryBreakdown[] = [];

  // 1) Parseability & ATS structure — 20
  const parseRules: RuleResult[] = [];
  {
    const c = parsedDoc.extractionConfidence;
    const pts = c >= 0.9 ? 6 : c >= 0.8 ? 5 : c >= 0.65 ? 3 : c >= 0.45 ? 1.5 : 0;
    parseRules.push(rule('parse_extraction', 'parseability', 'Text extraction quality', pts, 6,
      `The parser extracted this resume with ${Math.round(c * 100)}% confidence.`, {
        evidence: `extractionConfidence=${c}`,
        recommendation: 'Export a text-based PDF from Word/Google Docs and confirm the text can be selected/copied.',
        priority: c < 0.65 ? 'high' : 'medium',
      }));
  }
  {
    const columnRisk = parsedDoc.layoutSignals.hasMultiColumnRisk;
    const tableRisk = parsedDoc.layoutSignals.excessiveTables;
    const pts = !columnRisk && !tableRisk ? 6 : columnRisk && tableRisk ? 0 : 3;
    parseRules.push(rule('parse_layout', 'parseability', 'ATS-safe layout', pts, 6,
      !columnRisk && !tableRisk ? 'No strong multi-column or table parsing risk was detected.' : 'The layout contains signals that can make resume parsing less reliable.', {
        evidence: `multiColumnRisk=${columnRisk}; excessiveTables=${tableRisk}`,
        recommendation: 'Use a single-column body and avoid using tables/text boxes for core resume content.',
        priority: columnRisk || tableRisk ? 'high' : 'low',
      }));
  }
  {
    const p = parsedDoc.layoutSignals.pageCount;
    let pts = 0;
    if (p === 1) pts = 4;
    else if (p === 2) pts = 4;
    else if (p === 3) pts = targetLevel && ['senior', 'lead'].includes(String(targetLevel).toLowerCase()) ? 3 : 2;
    else if (p > 3 && p <= 4) pts = 1;
    parseRules.push(rule('parse_pages', 'parseability', 'Page length', pts, 4,
      p <= 2 ? `${p || 0} page${p === 1 ? '' : 's'} is easy to review.` : `${p || 0} pages is longer than most resumes need.`, {
        evidence: `pageCount=${p}`,
        recommendation: 'Compress older or lower-value content. Keep the highest-signal accomplishments and skills.',
        priority: p > 3 ? 'high' : 'medium',
      }));
  }
  {
    const pts = standardSectionCount >= 3 ? 4 : standardSectionCount === 2 ? 2.5 : standardSectionCount === 1 ? 1 : 0;
    parseRules.push(rule('parse_headings', 'parseability', 'Standard section headings', pts, 4,
      `${standardSectionCount} standard section heading${standardSectionCount === 1 ? '' : 's'} were recognized.`, {
        evidence: `sections=${Object.keys(parsedDoc.sections).join(', ') || 'none'}`,
        recommendation: 'Use conventional headings such as Experience, Education, Skills, Projects, and Certifications.',
        priority: standardSectionCount < 2 ? 'high' : 'medium',
      }));
  }
  breakdown.push(category('parseability', 'ATS parseability', parseRules, 'Can common resume parsers reliably read the document structure and text?'));

  // 2) Core completeness — 15
  const completeRules: RuleResult[] = [];
  {
    const hasExp = sectionPresent(parsedDoc, ['experience', 'employment']);
    const hasEdu = sectionPresent(parsedDoc, ['education']);
    const hasSkills = sectionPresent(parsedDoc, ['skills']);
    const hasProjects = sectionPresent(parsedDoc, ['projects', 'project']);
    const isEntry = !targetLevel || ['entry', 'junior'].includes(String(targetLevel).toLowerCase());
    let pts = 0;
    if (hasExp) pts += 3;
    else if (isEntry && hasProjects) pts += 2.5;
    if (hasEdu) pts += 2.5;
    if (hasSkills) pts += 2.5;
    completeRules.push(rule('complete_core_sections', 'completeness', 'Core sections', pts, 8,
      `Experience: ${hasExp ? 'yes' : 'no'}, Education: ${hasEdu ? 'yes' : 'no'}, Skills: ${hasSkills ? 'yes' : 'no'}, Projects: ${hasProjects ? 'yes' : 'no'}.`, {
        recommendation: isEntry
          ? 'Include Skills and Education, plus either Experience or Projects with substantive evidence.'
          : 'Include Experience, Skills, and Education using standard headings.',
        priority: pts < 5 ? 'high' : 'medium',
      }));
  }
  {
    const { hasEmail, hasPhone } = profile.contactSignals;
    const pts = hasEmail && hasPhone ? 4 : hasEmail || hasPhone ? 2 : 0;
    completeRules.push(rule('complete_contact', 'completeness', 'Contact essentials', pts, 4,
      hasEmail && hasPhone ? 'Email and phone are present.' : hasEmail || hasPhone ? 'Only one primary contact method was detected.' : 'Email and phone were not reliably detected.', {
        evidence: `email=${hasEmail}; phone=${hasPhone}`,
        recommendation: 'Place a professional email and reachable phone number in the main document body near your name.',
        priority: pts < 4 ? 'high' : 'low',
      }));
  }
  {
    let pts = 0;
    if (dateTokens >= 4) pts = 3;
    else if (dateTokens >= 2) pts = 2;
    else if (dateTokens >= 1) pts = 1;
    completeRules.push(rule('complete_dates', 'completeness', 'Career dates', pts, 3,
      `${dateTokens} date signal${dateTokens === 1 ? '' : 's'} detected across the resume.`, {
        recommendation: 'Use consistent month/year or year ranges for experience and education where dates matter.',
        priority: dateTokens === 0 ? 'high' : 'medium',
      }));
  }
  breakdown.push(category('completeness', 'Core completeness', completeRules, 'Are the essential sections and contact signals present without forcing optional sections?'));

  // 3) Impact & measurable evidence — 20 (STRICT: ResumeWorded 74 benchmark)
  const impactRules: RuleResult[] = [];
  {
    const ratio = bullets.length ? quantified.length / bullets.length : 0;
    // Stricter: was 0.5->10, now 0.6->10, and 0.2->5 becomes 0.15->3
    const pts = bullets.length === 0 ? 0 : ratio >= 0.6 ? 10 : ratio >= 0.4 ? 7 : ratio >= 0.25 ? 4 : ratio >= 0.12 ? 2 : quantified.length >= 1 ? 1 : 0;
    impactRules.push(rule('impact_metrics', 'impact', 'Quantified achievements', pts, 10,
      bullets.length ? `${quantified.length} of ${bullets.length} evidence bullets contain a measurable result or scope signal.` : 'No reliable experience/project bullets were detected.', {
        evidence: `quantifiedRatio=${metrics.quantifiedBulletRatio}%`,
        recommendation: 'Add credible scale, speed, quality, revenue, cost, user, volume, or time metrics to the bullets where numbers genuinely exist.',
        priority: pts < 4 ? 'high' : 'medium',
      }));
  }
  {
    const ratio = bullets.length ? outcomeBullets.length / bullets.length : 0;
    // Stricter: 0.5->6 becomes 0.6->6, and 0.15->3 becomes 0.2->2
    const pts = bullets.length === 0 ? 0 : ratio >= 0.6 ? 6 : ratio >= 0.4 ? 4 : ratio >= 0.25 ? 2 : outcomeBullets.length >= 1 ? 1 : 0;
    impactRules.push(rule('impact_outcomes', 'impact', 'Outcome-oriented bullets', pts, 6,
      bullets.length ? `${outcomeBullets.length} bullet${outcomeBullets.length === 1 ? '' : 's'} communicate an outcome or improvement.` : 'No outcome evidence was detected.', {
        recommendation: 'Rewrite task-only bullets as action + context + outcome. Explain what changed because of your work.',
        priority: pts < 2 ? 'high' : 'medium',
      }));
  }
  {
    const evidenceBullets = bullets.filter((b) => b.source === 'experience' || b.source === 'projects');
    let pts = 0;
    if (evidenceBullets.length >= 10) pts = 4;
    else if (evidenceBullets.length >= 7) pts = 3;
    else if (evidenceBullets.length >= 4) pts = 1.5;
    else if (evidenceBullets.length >= 1) pts = 0.5;
    impactRules.push(rule('impact_evidence_volume', 'impact', 'Evidence density', pts, 4,
      `${evidenceBullets.length} substantive experience/project bullet${evidenceBullets.length === 1 ? '' : 's'} were detected.`, {
        recommendation: 'Give your strongest roles/projects multiple concise bullets with concrete scope, action, and result.',
        priority: evidenceBullets.length < 4 ? 'high' : 'medium',
      }));
  }
  breakdown.push(category('impact', 'Impact & evidence', impactRules, 'Does the resume prove outcomes instead of only listing responsibilities?'));

  // 4) Experience / project quality — 15
  const experienceRules: RuleResult[] = [];
  {
    const expCount = profile.experience.length;
    const hasProjects = sectionPresent(parsedDoc, ['projects', 'project']);
    const isEntry = !targetLevel || ['entry', 'junior'].includes(String(targetLevel).toLowerCase());
    let pts = 0;
    if (expCount >= 2) pts = 5;
    else if (expCount === 1) pts = isEntry ? 4.5 : 3.5;
    else if (isEntry && hasProjects) pts = 4;
    else if (hasProjects) pts = 2;
    experienceRules.push(rule('experience_depth', 'experience_quality', 'Relevant evidence sections', pts, 5,
      `${expCount} experience entr${expCount === 1 ? 'y' : 'ies'} detected${hasProjects ? ', plus a projects section' : ''}.`, {
        recommendation: isEntry
          ? 'If formal experience is limited, use strong projects, research, internships, freelancing, or leadership evidence instead of padding.'
          : 'Prioritize the roles with the strongest relevance and measurable outcomes; avoid replacing experience with generic summaries.',
        priority: pts < 3 ? 'high' : 'medium',
      }));
  }
  {
    const withDescription = profile.experience.filter((e) => (e.description || '').trim().length >= 40).length;
    const expCount = profile.experience.length;
    const ratio = expCount ? withDescription / expCount : 0;
    const pts = expCount === 0 ? (bullets.length >= 4 ? 3 : 0) : ratio >= 0.8 ? 4 : ratio >= 0.5 ? 3 : withDescription >= 1 ? 1.5 : 0;
    experienceRules.push(rule('experience_detail', 'experience_quality', 'Role detail quality', pts, 4,
      expCount ? `${withDescription} of ${expCount} detected experience entries include substantive detail.` : 'Formal experience entries were not reliably parsed.', {
        recommendation: 'For each important role, include concise accomplishment bullets instead of title/company/date alone.',
        priority: pts < 2 ? 'high' : 'medium',
      }));
  }
  {
    const recent = hasRecentExperience(profile);
    const pts = profile.experience.length === 0 ? 1.5 : recent ? 3 : 1.5;
    experienceRules.push(rule('experience_recency', 'experience_quality', 'Recent work visibility', pts, 3,
      profile.experience.length === 0 ? 'Recency could not be reliably inferred.' : recent ? 'Recent/current experience is easy to detect.' : 'Recent/current experience was not clearly detected.', {
        recommendation: 'Keep recent work prominent and use explicit date ranges so chronology is easy to understand.',
        priority: 'medium',
      }));
  }
  {
    const hasProgressionLanguage = /\b(promoted|promotion|progressed|advanced|lead|senior|owner|ownership|mentored|managed)\b/i.test(lower);
    const isEntry = !targetLevel || ['entry', 'junior'].includes(String(targetLevel).toLowerCase());
    const pts = isEntry ? 3 : hasProgressionLanguage ? 3 : 1.5;
    experienceRules.push(rule('experience_scope', 'experience_quality', 'Scope and ownership', pts, 3,
      isEntry ? 'Entry-level resumes are not penalized for missing management signals.' : hasProgressionLanguage ? 'Ownership/progression language is present.' : 'Limited ownership or progression signals were detected.', {
        recommendation: 'For mid/senior resumes, make ownership, decision scope, mentoring, systems scale, and progression explicit where true.',
        priority: isEntry ? 'low' : 'medium',
      }));
  }
  breakdown.push(category('experience_quality', 'Experience & project quality', experienceRules, 'Does the resume show enough credible evidence for the candidate’s level?'));

  // 5) Skills clarity & evidence — 10 (STRICT)
  const skillRules: RuleResult[] = [];
  {
    const hasSkillsSection = sectionPresent(parsedDoc, ['skills', 'technical skills']);
    skillRules.push(rule('skills_section', 'skills', 'Dedicated skills section', hasSkillsSection ? 3 : 0, 3,
      hasSkillsSection ? 'A dedicated skills section was recognized.' : 'A dedicated skills section was not recognized.', {
        recommendation: 'Add a concise Skills or Technical Skills section using plain text and familiar category names.',
        priority: hasSkillsSection ? 'low' : 'medium',
      }));
  }
  {
    const n = profile.skillsNormalized.length;
    let pts = 0;
    // Stricter: 12-20 ideal, not 8-24; 23 is now 2 not 3 (ResumeWorded would flag 23 as borderline high)
    if (n >= 12 && n <= 20) pts = 3;
    else if (n >= 8 && n < 12) pts = 2.5;
    else if (n > 20 && n <= 28) pts = 1.5;
    else if (n > 28) pts = 1;
    else if (n >= 5) pts = 2;
    else if (n >= 2) pts = 1;
    else if (n === 1) pts = 0.5;
    skillRules.push(rule('skills_focus', 'skills', 'Skill focus', pts, 3,
      `${n} normalized hard skill${n === 1 ? '' : 's'} were detected.`, {
        recommendation: n > 20
          ? 'Trim low-value or obsolete skills and keep the technologies/tools you can defend in an interview.'
          : 'Add the hard skills that are genuinely demonstrated by your experience/projects; avoid soft-skill keyword stuffing.',
        priority: pts < 1.5 ? 'medium' : 'low',
      }));
  }
  {
    const n = profile.skillsNormalized.length;
    const ratio = n ? skillsEvidence / n : 0;
    // Stricter: 0.5->4 becomes 0.6->4
    const pts = n === 0 ? 0 : ratio >= 0.6 ? 4 : ratio >= 0.4 ? 2.5 : ratio >= 0.2 ? 1 : skillsEvidence >= 1 ? 0.5 : 0;
    skillRules.push(rule('skills_evidence', 'skills', 'Skills backed by evidence', pts, 4,
      `${skillsEvidence} detected skill${skillsEvidence === 1 ? '' : 's'} also appear in experience/project evidence.`, {
        evidence: `skillsEvidence=${skillsEvidence}/${n}`,
        recommendation: 'Mention important skills naturally inside accomplishment bullets so they are supported by evidence, not only listed.',
        priority: pts < 1 ? 'high' : 'medium',
      }));
  }
  breakdown.push(category('skills', 'Skills clarity', skillRules, 'Are hard skills focused and supported by real experience or projects?'));

  // 6) Writing & bullet quality — 10 (STRICT)
  const writingRules: RuleResult[] = [];
  {
    const ratio = bullets.length ? actionLed.length / bullets.length : 0;
    // Stricter: 0.75->4 becomes 0.8->4
    const pts = bullets.length === 0 ? 0 : ratio >= 0.8 ? 4 : ratio >= 0.6 ? 2.5 : ratio >= 0.4 ? 1.5 : actionLed.length >= 1 ? 0.5 : 0;
    writingRules.push(rule('writing_action_verbs', 'writing', 'Action-led bullets', pts, 4,
      bullets.length ? `${actionLed.length} of ${bullets.length} bullets begin with a strong action verb.` : 'No reliable bullets were detected.', {
        evidence: `actionLedRatio=${metrics.actionLedBulletRatio}%`,
        recommendation: 'Start accomplishment bullets with specific verbs such as Built, Reduced, Automated, Led, Improved, or Shipped.',
        priority: pts < 1.5 ? 'high' : 'medium',
      }));
  }
  {
    const pts = weakPhraseHits === 0 ? 3 : weakPhraseHits === 1 ? 2 : weakPhraseHits <= 3 ? 1 : 0;
    writingRules.push(rule('writing_weak_phrases', 'writing', 'Specific language', pts, 3,
      weakPhraseHits === 0 ? 'No major weak responsibility phrases were detected.' : `${weakPhraseHits} weak or generic phrase signal${weakPhraseHits === 1 ? '' : 's'} were detected.`, {
        recommendation: 'Replace phrases like “responsible for” or “worked on” with the exact action, object, and result.',
        priority: weakPhraseHits >= 2 ? 'high' : 'medium',
      }));
  }
  {
    const pts = repeatedLeadVerbCount === 0 ? 3 : repeatedLeadVerbCount === 1 ? 2 : repeatedLeadVerbCount <= 3 ? 1 : 0;
    writingRules.push(rule('writing_repetition', 'writing', 'Verb variety', pts, 3,
      repeatedLeadVerbCount === 0 ? 'Lead verbs are reasonably varied.' : `${repeatedLeadVerbCount} repetitive lead-verb use${repeatedLeadVerbCount === 1 ? '' : 's'} beyond the recommended repetition threshold were detected.`, {
        recommendation: 'Vary repeated lead verbs when different verbs more precisely describe the work. Do not vary words just for novelty.',
        priority: repeatedLeadVerbCount >= 2 ? 'medium' : 'low',
      }));
  }
  breakdown.push(category('writing', 'Writing & bullet quality', writingRules, 'Are bullets direct, specific, and easy to scan?'));

  // 7) Concision & readability — 5
  const concisionRules: RuleResult[] = [];
  {
    const pages = Math.max(parsedDoc.layoutSignals.pageCount, 1);
    const wordsPerPage = wordCount / pages;
    let pts = 0;
    if (wordsPerPage >= 250 && wordsPerPage <= 650) pts = 3;
    else if (wordsPerPage >= 180 && wordsPerPage <= 750) pts = 2;
    else if (wordsPerPage >= 120 && wordsPerPage <= 850) pts = 1;
    concisionRules.push(rule('concision_density', 'concision', 'Content density', pts, 3,
      `${Math.round(wordsPerPage)} words per page were detected.`, {
        recommendation: 'Keep enough detail to prove impact without turning the resume into dense prose. Remove low-signal repetition before useful evidence.',
        priority: pts === 0 ? 'medium' : 'low',
      }));
  }
  {
    const longBullets = bullets.filter((b) => b.text.split(/\s+/).length > 38).length;
    const ratio = bullets.length ? longBullets / bullets.length : 0;
    const pts = bullets.length === 0 ? 0.5 : ratio <= 0.1 ? 2 : ratio <= 0.25 ? 1 : 0;
    concisionRules.push(rule('concision_bullets', 'concision', 'Bullet scanability', pts, 2,
      bullets.length ? `${longBullets} of ${bullets.length} bullets are longer than ~38 words.` : 'Bullet scanability could not be measured reliably.', {
        recommendation: 'Split very long bullets or remove setup that does not help prove action, scope, or outcome.',
        priority: ratio > 0.25 ? 'medium' : 'low',
      }));
  }
  breakdown.push(category('concision', 'Concision & readability', concisionRules, 'Is the document dense enough to be useful but still skimmable?'));

  // 8) Consistency & hygiene — 5
  const hygieneRules: RuleResult[] = [];
  {
    const typoHits = COMMON_TYPOS.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(lower)).length;
    const doubleSpaces = (text.match(/ {2,}/g) || []).length;
    let pts = 0;
    if (typoHits === 0 && doubleSpaces <= 2) pts = 3;
    else if (typoHits <= 1 && doubleSpaces <= 8) pts = 2;
    else if (typoHits <= 2) pts = 1;
    hygieneRules.push(rule('hygiene_typos', 'hygiene', 'Text hygiene', pts, 3,
      typoHits === 0 ? 'No common spelling red flags were detected by the lightweight rule set.' : `${typoHits} common typo signal${typoHits === 1 ? '' : 's'} detected.`, {
        recommendation: 'Run a final spelling/grammar pass and inspect copied text for spacing artifacts before applying.',
        priority: typoHits >= 2 ? 'high' : 'medium',
      }));
  }
  {
    const hasContactBody = profile.contactSignals.hasEmail || profile.contactSignals.hasPhone;
    const pts = hasContactBody && standardSectionCount >= 2 ? 2 : hasContactBody || standardSectionCount >= 2 ? 1 : 0;
    hygieneRules.push(rule('hygiene_consistency', 'hygiene', 'Document consistency', pts, 2,
      pts === 2 ? 'Core contact and section structure are consistently detectable.' : 'Some structural signals are inconsistent or difficult to detect.', {
        recommendation: 'Use consistent section naming, date patterns, punctuation, and spacing throughout the resume.',
        priority: pts === 0 ? 'medium' : 'low',
      }));
  }
  breakdown.push(category('hygiene', 'Consistency & hygiene', hygieneRules, 'Are there avoidable text and structure inconsistencies?'));

  const rules = breakdown.flatMap((c) => c.rules);
  const rawTotal = breakdown.reduce((sum, c) => sum + c.pointsAwarded, 0);
  const totalPossible = breakdown.reduce((sum, c) => sum + c.pointsPossible, 0);
  // Programmer guard: if weights drift, fail loudly during development instead of silently clamping.
  if (totalPossible !== 100) {
    throw new Error(`Resume readiness rubric misconfigured: expected 100 points, found ${totalPossible}`);
  }
  const score = round1(rawTotal);
  const label = labelForScore(score);

  const priorityActions = rules
    .map(actionFromRule)
    .filter((a): a is PriorityAction => !!a)
    .sort((a, b) => {
      const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] || b.potentialGain - a.potentialGain;
    })
    .slice(0, 8);

  const strengths = rules
    .filter((r) => r.status === 'pass')
    .sort((a, b) => b.pointsPossible - a.pointsPossible)
    .slice(0, 6)
    .map((r) => r.message);

  const warnings = rules
    .filter((r) => r.status !== 'pass')
    .sort((a, b) => (b.pointsPossible - b.pointsAwarded) - (a.pointsPossible - a.pointsAwarded))
    .slice(0, 8)
    .map((r) => r.message);

  return {
    score,
    scoreLabel: label.label,
    scoreMessage: label.message,
    breakdown,
    rules,
    strengths,
    warnings,
    priorityActions,
    metrics,
    issueCount: rules.filter((r) => r.status !== 'pass').length,
    highPriorityIssueCount: priorityActions.filter((a) => a.priority === 'high').length,
    version: VERSION,
    methodology: {
      mode: 'rule_based_no_jd',
      note: 'This score measures resume health and ATS readability without a job description. It is not an employer ATS ranking or job-fit probability.',
      totalPossible: 100,
    },
  };
}

export default scoreReadiness;
