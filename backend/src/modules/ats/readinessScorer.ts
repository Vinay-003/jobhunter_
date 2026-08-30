import type { ParsedDocument } from '../parsing/pdfParser.js';
import type { ResumeProfile } from '../parsing/resumeProfile.js';

/**
 * ATS Readiness Scorer — exact 100pt rubric:
 * 25 layout, 15 sections, 25 experience, 15 skills, 10 consistency, 5 concision, 5 targetLevel.
 * Each category returns {pointsAwarded, pointsPossible, rules: {ruleId, category, status, pointsAwarded, pointsPossible, message, evidence}[]}.
 * Sum totals 100. No clamp needed but ensure 0-100.
 */

export const VERSION = '2.0.0';

export type RuleStatus = 'pass' | 'fail' | 'warn';

export type RuleResult = {
  ruleId: string;
  category: string;
  status: RuleStatus;
  pointsAwarded: number;
  pointsPossible: number;
  message: string;
  evidence?: string;
};

export type CategoryBreakdown = {
  category: string;
  pointsAwarded: number;
  pointsPossible: number;
  rules: RuleResult[];
};

export type ReadinessResult = {
  score: number;
  breakdown: CategoryBreakdown[];
  rules: RuleResult[];
  strengths: string[];
  warnings: string[];
  version: string;
};

type TargetLevel = 'junior' | 'mid' | 'senior' | 'lead' | string | null | undefined;

function mkRule(
  ruleId: string,
  category: string,
  pointsAwarded: number,
  pointsPossible: number,
  message: string,
  evidence?: string,
): RuleResult {
  const status: RuleStatus = pointsAwarded === pointsPossible ? 'pass' : pointsAwarded === 0 ? 'fail' : 'warn';
  return { ruleId, category, status, pointsAwarded, pointsPossible, message, evidence };
}

export function scoreReadiness(
  parsedDoc: ParsedDocument,
  profile: ResumeProfile,
  targetLevel: TargetLevel,
): ReadinessResult {
  const allRules: RuleResult[] = [];

  // ── 1. Layout 25pts ──
  // R1.1 pageCount 1-2 pages (10pts), R1.2 no multiColumn risk (5), R1.3 no excessive tables (5), R1.4 extraction confidence (5)
  const layoutRules: RuleResult[] = [];
  {
    const pages = parsedDoc.layoutSignals.pageCount;
    let pts = 0;
    let msg = '';
    if (pages >= 1 && pages <= 2) { pts = 10; msg = `Ideal page count: ${pages} page(s)`; }
    else if (pages === 3) { pts = 5; msg = `Page count ${pages} — slightly long`; }
    else if (pages === 0) { pts = 0; msg = 'No pages detected'; }
    else { pts = 0; msg = `Page count ${pages} — too long`; }
    layoutRules.push(mkRule('layout_page_count', 'layout', pts, 10, msg, `pages=${pages}`));
  }
  {
    const risk = parsedDoc.layoutSignals.hasMultiColumnRisk;
    layoutRules.push(mkRule('layout_columns', 'layout', risk ? 0 : 5, 5, risk ? 'Multi-column layout risk detected' : 'Single-column layout', `hasMultiColumnRisk=${risk}`));
  }
  {
    const tables = parsedDoc.layoutSignals.excessiveTables;
    layoutRules.push(mkRule('layout_tables', 'layout', tables ? 0 : 5, 5, tables ? 'Excessive tables detected' : 'No excessive tables', `excessiveTables=${tables}`));
  }
  {
    const conf = parsedDoc.extractionConfidence;
    let pts = 0;
    if (conf >= 0.85) pts = 5;
    else if (conf >= 0.6) pts = 3;
    else if (conf >= 0.4) pts = 1;
    else pts = 0;
    layoutRules.push(mkRule('layout_confidence', 'layout', pts, 5, `Extraction confidence ${(conf * 100).toFixed(0)}%`, `confidence=${conf}`));
  }
  const layoutAwarded = layoutRules.reduce((s, r) => s + r.pointsAwarded, 0);
  allRules.push(...layoutRules);

  // ── 2. Sections 15pts ──
  // R2.1 has experience section (5), R2.2 has education (5), R2.3 has skills (5)
  const sectionsRules: RuleResult[] = [];
  {
    const hasExp = !!parsedDoc.sections['experience'] || !!parsedDoc.sections['work experience'] || !!parsedDoc.sections['employment'];
    sectionsRules.push(mkRule('sections_experience', 'sections', hasExp ? 5 : 0, 5, hasExp ? 'Experience section present' : 'Missing experience section', `keys=${Object.keys(parsedDoc.sections).join(',')}`));
  }
  {
    const hasEdu = !!parsedDoc.sections['education'];
    sectionsRules.push(mkRule('sections_education', 'sections', hasEdu ? 5 : 0, 5, hasEdu ? 'Education section present' : 'Missing education section'));
  }
  {
    const hasSkills = !!parsedDoc.sections['skills'] || !!parsedDoc.sections['technical skills'];
    sectionsRules.push(mkRule('sections_skills', 'sections', hasSkills ? 5 : 0, 5, hasSkills ? 'Skills section present' : 'Missing skills section'));
  }
  const sectionsAwarded = sectionsRules.reduce((s, r) => s + r.pointsAwarded, 0);
  allRules.push(...sectionsRules);

  // ── 3. Experience 25pts ──
  // R3.1 has experience entries (10), R3.2 date ranges present (5), R3.3 description per entry (5), R3.4 at least 1 current or recent (5)
  const expRules: RuleResult[] = [];
  {
    const count = profile.experience.length;
    let pts = 0;
    let msg = '';
    if (count >= 2) { pts = 10; msg = `${count} experience entries`; }
    else if (count === 1) { pts = 5; msg = '1 experience entry — add more detail'; }
    else { pts = 0; msg = 'No experience entries detected'; }
    expRules.push(mkRule('experience_entries', 'experience', pts, 10, msg, `count=${count}`));
  }
  {
    const withDates = profile.experience.filter((e) => e.startDate).length;
    const pts = withDates >= 1 ? 5 : 0;
    expRules.push(mkRule('experience_dates', 'experience', pts, 5, withDates ? `Dates found (${withDates})` : 'No dates found', `withDates=${withDates}`));
  }
  {
    const withDesc = profile.experience.filter((e) => e.description && e.description.length > 20).length;
    let pts = 0;
    if (withDesc >= 2) pts = 5;
    else if (withDesc === 1) pts = 3;
    else pts = 0;
    expRules.push(mkRule('experience_descriptions', 'experience', pts, 5, withDesc ? `Descriptions present (${withDesc})` : 'Missing experience descriptions', `withDesc=${withDesc}`));
  }
  {
    const hasCurrent = profile.experience.some((e) => e.isCurrent);
    const hasRecent = profile.experience.some((e) => {
      const y = e.endDate ? parseInt(e.endDate.match(/\d{4}/)?.[0] ?? '', 10) : NaN;
      return !isNaN(y) && y >= new Date().getFullYear() - 2;
    });
    const pts = hasCurrent || hasRecent ? 5 : 0;
    expRules.push(mkRule('experience_recency', 'experience', pts, 5, pts ? 'Recent/current experience found' : 'No recent/current experience', `hasCurrent=${hasCurrent} hasRecent=${hasRecent}`));
  }
  const expAwarded = expRules.reduce((s, r) => s + r.pointsAwarded, 0);
  allRules.push(...expRules);

  // ── 4. Skills 15pts ──
  // R4.1 skill count (10), R4.2 normalized skills present (5)
  const skillsRules: RuleResult[] = [];
  {
    const n = profile.skills.length;
    let pts = 0;
    let msg = '';
    if (n >= 6) { pts = 10; msg = `${n} skills detected — strong`; }
    else if (n >= 3) { pts = 6; msg = `${n} skills — moderate`; }
    else if (n >= 1) { pts = 3; msg = `${n} skill(s) — sparse`; }
    else { pts = 0; msg = 'No skills detected'; }
    skillsRules.push(mkRule('skills_count', 'skills', pts, 10, msg, `skills=${profile.skills.join(',')}`));
  }
  {
    const pts = profile.skillsNormalized.length > 0 ? 5 : 0;
    skillsRules.push(mkRule('skills_normalized', 'skills', pts, 5, pts ? 'Skills normalized' : 'No normalized skills'));
  }
  const skillsAwarded = skillsRules.reduce((s, r) => s + r.pointsAwarded, 0);
  allRules.push(...skillsRules);

  // ── 5. Consistency 10pts ──
  // R5.1 contact signals (5): email+phone, R5.2 education present (5)
  const consistencyRules: RuleResult[] = [];
  {
    const { hasEmail, hasPhone } = profile.contactSignals;
    let pts = 0;
    if (hasEmail && hasPhone) pts = 5;
    else if (hasEmail || hasPhone) pts = 3;
    else pts = 0;
    consistencyRules.push(mkRule('consistency_contact', 'consistency', pts, 5, pts === 5 ? 'Email and phone present' : pts === 3 ? 'Partial contact info' : 'Missing contact info', `email=${hasEmail} phone=${hasPhone}`));
  }
  {
    const hasEdu = profile.education.length > 0;
    consistencyRules.push(mkRule('consistency_education', 'consistency', hasEdu ? 5 : 0, 5, hasEdu ? 'Education detected' : 'No education detected'));
  }
  const consistencyAwarded = consistencyRules.reduce((s, r) => s + r.pointsAwarded, 0);
  allRules.push(...consistencyRules);

  // ── 6. Concision 5pts ──
  // R6.1 charCount 1500-4000 ideal (5pts), else partial
  const concisionRules: RuleResult[] = [];
  {
    const c = parsedDoc.charCount;
    let pts = 0;
    let msg = '';
    if (c >= 1500 && c <= 4000) { pts = 5; msg = `Concise length ${c} chars`; }
    else if (c >= 800 && c < 1500) { pts = 3; msg = `Short resume ${c} chars — consider expanding`; }
    else if (c > 4000 && c <= 6000) { pts = 3; msg = `Long resume ${c} chars — consider trimming`; }
    else if (c < 800) { pts = 0; msg = `Too short ${c} chars`; }
    else { pts = 0; msg = `Too long ${c} chars`; }
    concisionRules.push(mkRule('concision_length', 'concision', pts, 5, msg, `charCount=${c}`));
  }
  const concisionAwarded = concisionRules.reduce((s, r) => s + r.pointsAwarded, 0);
  allRules.push(...concisionRules);

  // ── 7. TargetLevel 5pts ──
  // R7.1 seniority alignment with targetLevel (5)
  const targetLevelRules: RuleResult[] = [];
  {
    if (!targetLevel) {
      targetLevelRules.push(mkRule('target_level_alignment', 'targetLevel', 3, 5, 'No target level specified — partial credit', `targetLevel=null`));
    } else {
      const tl = String(targetLevel).toLowerCase();
      const seniority = profile.seniority;
      if (!seniority) {
        targetLevelRules.push(mkRule('target_level_alignment', 'targetLevel', 2, 5, 'Seniority not inferred — partial credit', `targetLevel=${tl} seniority=null`));
      } else if (seniority === tl) {
        targetLevelRules.push(mkRule('target_level_alignment', 'targetLevel', 5, 5, `Seniority matches target (${seniority})`, `targetLevel=${tl} seniority=${seniority}`));
      } else {
        // adjacent levels get partial
        const order = ['junior', 'mid', 'senior', 'lead'];
        const ti = order.indexOf(tl);
        const si = order.indexOf(seniority);
        const diff = Math.abs(ti - si);
        const pts = diff === 1 ? 3 : 0;
        targetLevelRules.push(mkRule('target_level_alignment', 'targetLevel', pts, 5, diff === 1 ? `Adjacent level (resume ${seniority} vs target ${tl})` : `Mismatch (resume ${seniority} vs target ${tl})`, `targetLevel=${tl} seniority=${seniority}`));
      }
    }
  }
  const targetAwarded = targetLevelRules.reduce((s, r) => s + r.pointsAwarded, 0);
  allRules.push(...targetLevelRules);

  const breakdown: CategoryBreakdown[] = [
    { category: 'layout', pointsAwarded: layoutAwarded, pointsPossible: 25, rules: layoutRules },
    { category: 'sections', pointsAwarded: sectionsAwarded, pointsPossible: 15, rules: sectionsRules },
    { category: 'experience', pointsAwarded: expAwarded, pointsPossible: 25, rules: expRules },
    { category: 'skills', pointsAwarded: skillsAwarded, pointsPossible: 15, rules: skillsRules },
    { category: 'consistency', pointsAwarded: consistencyAwarded, pointsPossible: 10, rules: consistencyRules },
    { category: 'concision', pointsAwarded: concisionAwarded, pointsPossible: 5, rules: concisionRules },
    { category: 'targetLevel', pointsAwarded: targetAwarded, pointsPossible: 5, rules: targetLevelRules },
  ];

  const score = breakdown.reduce((s, b) => s + b.pointsAwarded, 0);

  const strengths = allRules.filter((r) => r.status === 'pass').map((r) => r.message).slice(0, 5);
  const warnings = allRules.filter((r) => r.status === 'fail' || r.status === 'warn').map((r) => r.message).slice(0, 10);

  return {
    score,
    breakdown,
    rules: allRules,
    strengths,
    warnings,
    version: VERSION,
  };
}

export default scoreReadiness;
