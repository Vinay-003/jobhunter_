/* eslint-disable @typescript-eslint/no-explicit-any */
export type ReportJob = Record<string, any>;

const text = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const list = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(v => typeof v === 'string' ? v.trim() : text(v)).filter(Boolean))];
};

const BREAKDOWN_MAX_MAP: Record<string, number> = {
  requiredSkill: 30,
  responsibilitySemantic: 25,
  roleTitle: 15,
  seniority: 15,
  domainEducation: 10,
  location: 5,
};

const BREAKDOWN_LABEL_MAP: Record<string, string> = {
  requiredSkill: 'Required Technical Skills',
  responsibilitySemantic: 'Responsibility Semantic Alignment',
  roleTitle: 'Role Title & Function Fit',
  seniority: 'Seniority & Career Scope',
  domainEducation: 'Domain & Degree Credentials',
  location: 'Location & Work Mode Compatibility',
};

/**
 * Builds an extremely detailed, actionable Markdown match report
 * containing full recruiter evidence, scoring arithmetic, skill mappings,
 * and an LLM tailoring directive.
 */
export function buildMatchReport(input: {
  jobs: ReportJob[];
  resumeFileName?: string;
  runId?: string | null;
  run?: any;
  roleDiscovery?: any;
  scope?: 'loaded' | 'all';
  total?: number;
  filteredCount?: number;
}): string {
  const run = input.run ?? {};
  const totalCount = input.total ?? input.jobs.length;
  const filteredCount = input.filteredCount ?? input.jobs.length;
  const resumeName = input.resumeFileName || 'Current Resume Profile';

  const lines: string[] = [];

  lines.push('# JOBHUNTER OPPORTUNITY MATCH & EVIDENCE AUDIT REPORT');
  lines.push('');
  lines.push(`**Evaluated Resume:** ${resumeName}`);
  if (input.runId) lines.push(`**Recommendation Run ID:** \`${input.runId}\``);
  lines.push(`**Date Generated:** ${new Date().toLocaleString()}`);
  lines.push(`**Evaluated Matches:** Loaded ${filteredCount} of ${totalCount} ranked opportunities`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. LLM Tailoring Directive
  lines.push('## 🤖 LLM TAILORING PROMPT');
  lines.push('> **Role:** Expert Executive Career Strategist and ATS Specialist.');
  lines.push('> **Objective:** Tailor the candidate\'s resume for the ranked opportunities detailed below.');
  lines.push('> **Guardrails:**');
  lines.push('> 1. Close the identified **Skill Gaps** only where the candidate\'s existing projects and background genuinely support them.');
  lines.push('> 2. Emphasize the **Demonstrated Skills** and mirror the exact terminology used in the target role responsibilities.');
  lines.push('> 3. Align accomplishments with the **Supported Responsibilities** using measurable impact metrics (latency, scale, cost, revenue, %).');
  lines.push('> 4. Never fabricate employer history, fake titles, or unearned credentials.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // 2. Search Scope & Target Roles
  lines.push('## 1. TARGET SEARCH PROFILE & DISCOVERY');
  const discovery = input.roleDiscovery;
  if (discovery?.roles?.length) {
    lines.push(`**Discovered Target Roles (Source: ${discovery.source || 'AI Discovery'}${discovery.model ? ` · ${discovery.model}` : ''}):**`);
    for (const role of discovery.roles) {
      lines.push(`- **${text(role.title)}**`);
      if (role.reason) lines.push(`  - *Rationale:* ${text(role.reason)}`);
      const evList = list(role.evidence);
      if (evList.length) lines.push(`  - *Resume Evidence:* ${evList.join('; ')}`);
    }
  } else {
    lines.push('- Standard role matching based on parsed professional experience and skills.');
  }

  if (run.preferences) {
    const prefs = run.preferences;
    const prefLines: string[] = [];
    if (prefs.targetRoles?.length) prefLines.push(`Target Roles: ${list(prefs.targetRoles).join(', ')}`);
    if (prefs.location) prefLines.push(`Location Scope: ${prefs.location}`);
    if (prefs.workModes?.length) prefLines.push(`Work Modes: ${list(prefs.workModes).join(', ')}`);
    if (prefs.minScore != null) prefLines.push(`Minimum Fit Threshold: ${prefs.minScore}%`);
    if (prefLines.length) {
      lines.push('');
      lines.push(`**Applied Search Filters:** ${prefLines.join(' | ')}`);
    }
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 3. Ranked Opportunities
  lines.push('## 2. RANKED OPPORTUNITIES (DETAILED EVIDENCE AUDIT)');
  lines.push('');

  for (const [index, job] of input.jobs.entries()) {
    const scoreVal = job.fitScore ?? job.matchScore;
    const score = Number.isFinite(scoreVal) ? Math.round(Number(scoreVal)) : null;
    const title = text(job.title) || 'Untitled Position';
    const company = text(job.company) || 'Confidential / Unlisted';
    const loc = text(job.location) || 'Not specified';
    const workMode = text(job.workMode) || 'On-site / Unspecified';
    const link = text(job.link ?? job.url);

    lines.push(`### ${index + 1}. ${title} — ${company} (${score != null ? `${score}/100 Fit` : 'Score Uncalculated'})`);
    lines.push('');
    lines.push(`- **Company:** ${company}`);
    lines.push(`- **Location:** ${loc} (${workMode})`);
    lines.push(`- **Fit Index:** **${score != null ? `${score}%` : 'N/A'}** (Evidence-based fit index, not an employer probability)`);
    lines.push(`- **Evidence Confidence:** ${text(job.confidence) || 'Medium'}`);
    if (job.postedAt) lines.push(`- **Posted Date:** ${text(job.postedAt)}`);
    if (job.source) lines.push(`- **Provider / Source:** ${text(job.source)}`);
    if (link) lines.push(`- **Application Link:** [View Job Posting](${link})`);

    // Availability & Eligibility
    const elig = job.eligibility;
    const eligStatus = elig?.status === 'eligible' ? 'No confirmed qualification barrier' : elig?.status === 'ineligible' ? 'Qualification barrier detected' : 'Qualifications need verification';
    lines.push(`- **Qualification Status:** ${eligStatus}${list(elig?.reasons).length ? ` (${list(elig?.reasons).join('; ')})` : ''}`);

    if (job.availability) {
      lines.push(`- **Posting Availability:** ${text(job.availability.status)}${job.availability.reason ? ` — ${text(job.availability.reason)}` : ''}`);
    }

    lines.push('');

    // A. Transparent Scoring Breakdown
    lines.push('#### A. Scoring Breakdown (Points Awarded vs Maximum)');
    const details = job.scoreDetails ?? {};
    const breakdownList: Array<{ key: string; label: string; value: number; max: number }> = [];

    if (Array.isArray(job.breakdown)) {
      for (const item of job.breakdown) {
        const k = text(item.label);
        const max = BREAKDOWN_MAX_MAP[k] ?? 20;
        const lbl = BREAKDOWN_LABEL_MAP[k] || k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ');
        breakdownList.push({ key: k, label: lbl, value: Number(item.value) || 0, max });
      }
    } else if (Array.isArray(details.components)) {
      for (const c of details.components) {
        const k = text(c.key ?? c.label);
        const max = Number(c.maxPoints) || BREAKDOWN_MAX_MAP[k] || 20;
        const lbl = BREAKDOWN_LABEL_MAP[k] || text(c.label ?? c.key);
        breakdownList.push({ key: k, label: lbl, value: Number(c.points) || 0, max });
      }
    }

    if (breakdownList.length) {
      for (const b of breakdownList) {
        lines.push(`- **${b.label}:** ${Math.round(b.value)} / ${b.max} pts`);
      }
    } else {
      lines.push('- *Detailed score component breakdown was not stored for this entry.*');
    }

    if (details.seniorityPenalty) {
      lines.push(`- *Seniority Adjustment:* -${details.seniorityPenalty} pts (${text(details.candidateSeniority)} candidate vs ${text(details.jobSeniority)} role)`);
    }
    if (details.scoreCap != null) {
      lines.push(`- *Score Cap Applied:* ${details.scoreCap}/100${list(details.scoreCapReasons).length ? ` (${list(details.scoreCapReasons).join('; ')})` : ''}`);
    }

    lines.push('');

    // B. Skill Evidence Matrix
    lines.push('#### B. Skills Evidence Matrix');
    const skillEv = Array.isArray(details.skillEvidence) ? details.skillEvidence : [];
    const demonstrated = skillEv.filter((s: any) => s.source === 'demonstrated').map((s: any) => text(s.skill));
    const declared = skillEv.filter((s: any) => s.source === 'declared').map((s: any) => text(s.skill));
    const matched = list(job.matchedSkills);
    const missing = list(job.missingSkills);

    if (demonstrated.length) {
      lines.push(`- **Demonstrated in Resume Accomplishments:** ${demonstrated.join(', ')}`);
    }
    if (declared.length) {
      lines.push(`- **Declared in Skills Section:** ${declared.join(', ')}`);
    }
    if (matched.length && !demonstrated.length && !declared.length) {
      lines.push(`- **Matched Skills:** ${matched.join(', ')}`);
    }
    if (missing.length) {
      lines.push(`- **Missing Skills / Requirement Gaps:** ⚠️ ${missing.join(', ')}`);
    } else {
      lines.push('- **Missing Skills:** No explicit skill gaps detected from required keywords.');
    }

    lines.push('');

    // C. Responsibility Alignment
    const respMatches = Array.isArray(details.responsibilityMatches) ? details.responsibilityMatches : [];
    if (respMatches.length) {
      lines.push('#### C. Responsibility Coverage & Direct Resume Evidence');
      for (const item of respMatches) {
        const icon = item.supported ? '✅' : '⚠️';
        lines.push(`- ${icon} **JD Responsibility:** "${text(item.responsibility)}"`);
        if (item.evidence) {
          lines.push(`  - *Candidate Resume Evidence:* "${text(item.evidence)}"${typeof item.similarity === 'number' ? ` (Semantic Similarity: ${item.similarity.toFixed(2)})` : ''}`);
        } else {
          lines.push(`  - *Candidate Resume Evidence:* No direct supporting evidence found in resume bullets.`);
        }
      }
      lines.push('');
    }

    // D. Why This Surfaced / Reasons
    const reasons = [...list(job.recommendationReasons), ...list(job.evidence)];
    if (reasons.length) {
      lines.push('#### D. Why This Job Surfaced');
      for (const r of reasons.slice(0, 5)) {
        lines.push(`- ${r}`);
      }
      lines.push('');
    }

    // E. Job Description Excerpt
    const desc = text(job.description ?? job.snippet);
    if (desc) {
      lines.push('#### E. Job Posting Summary / Excerpt');
      lines.push('```text');
      lines.push(desc.length > 800 ? `${desc.slice(0, 800)}...` : desc);
      lines.push('```');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  lines.push('**End of match report. Paste directly into an LLM with your resume to tailor and generate custom cover letters.**');
  return lines.join('\n');
}
