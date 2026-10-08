import { useEffect, useState, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button, Eyebrow, ScoreRing, Tag } from '../components/UI';
import './analysis.css';
import api, { getApiErrorMessage } from '../lib/api';
import { formatMetricValue } from '../lib/display';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Mail,
  MapPin,
  Phone,
  Printer,
  RefreshCcw,
  ShieldCheck,
  Target,
} from 'lucide-react';

type Status = 'pass' | 'warn' | 'fail';
type Priority = 'high' | 'medium' | 'low';

export type ResumeFinding = {
  id: string;
  type: 'repeated_verb' | 'weak_phrase' | 'unquantified' | 'quantified_strong' | 'typo' | 'formatting' | 'missing_section' | 'missing_contact';
  category: 'writing' | 'impact' | 'completeness' | 'parseability' | 'hygiene';
  severity: 'error' | 'warning' | 'info' | 'success';
  section?: string;
  bulletIndex?: number;
  bulletText?: string;
  targetWord?: string;
  occurrenceCount?: number;
  message: string;
  recommendation: string;
  suggestedAlternatives?: string[];
  suggestedRewrite?: string;
};

type Rule = {
  ruleId?: string;
  category?: string;
  label?: string;
  status?: Status;
  pointsAwarded?: number;
  pointsPossible?: number;
  message?: string;
  evidence?: string;
  recommendation?: string;
  priority?: Priority;
};

type Category = {
  category?: string;
  label?: string;
  pointsAwarded?: number;
  pointsPossible?: number;
  percent?: number;
  summary?: string;
  rules?: Rule[];
};

type Action = {
  id?: string;
  title: string;
  category?: string;
  priority: Priority;
  why: string;
  how: string;
  potentialGain?: number;
  evidence?: string;
};

type Metrics = {
  pageCount?: number;
  wordCount?: number;
  sectionCount?: number;
  skillsCount?: number;
  bulletCount?: number;
  quantifiedBulletCount?: number;
  quantifiedBulletRatio?: number;
  actionLedBulletCount?: number;
  actionLedBulletRatio?: number;
  outcomeBulletCount?: number;
  repeatedLeadVerbCount?: number;
  weakHits?: number;
  extractionConfidence?: number;
};

type Readiness = {
  score?: number;
  scoreLabel?: string;
  scoreMessage?: string;
  breakdown?: Category[];
  rules?: Rule[];
  strengths?: string[];
  warnings?: string[];
  priorityActions?: Action[];
  metrics?: Metrics;
  issueCount?: number;
  highPriorityIssueCount?: number;
  methodology?: { note?: string; mode?: string };
  version?: string;
  findings?: ResumeFinding[];
};

type JdMatch = {
  score?: number | null;
  relevanceScore?: number | null;
  seniorityPenalty?: number;
  rawScore?: number;
  pointsPossible?: number;
  eligibility?: string;
  qualificationReasons?: string[];
  applicability?: Record<string, boolean>;
  weights?: Record<string, number>;
  breakdown?: Record<string, number | string>;
  responsibilityCoverage?: Array<{ responsibility?: string; matchScore?: number; candidateEvidence?: string | null }>;
  deterministic?: {
    requiredCoverage?: number;
    overallScore?: number;
    matchedRequired?: string[];
    missingRequired?: string[];
    matchedPreferred?: string[];
    missingPreferred?: string[];
    partialMatches?: Array<{ jdSkill?: string; resumeSkill?: string; family?: string }>;
    strengths?: string[];
    warnings?: string[];
  };
  jd?: { title?: string | null; requiredSkills?: string[]; preferredSkills?: string[] };
};

type Versions = {
  scorerVersion?: string;
  parserVersion?: string;
  matcherVersion?: string;
  embeddingModelId?: string;
  dimension?: number;
  usedMock?: boolean;
  embeddingStatus?: string;
  rubricVersion?: string;
};

export type ParsedResumeSectionItem = {
  title?: string;
  company?: string;
  date?: string;
  text?: string;
  bullets?: string[];
};

export type ParsedResumeSection = {
  title?: string;
  heading?: string;
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

export type ViewModel = {
  readiness: Readiness;
  jdMatch?: JdMatch;
  confidence?: string;
  confidenceReasons?: string[];
  fileName?: string;
  createdAt?: string;
  resumeId?: string;
  versions?: Versions;
  targetLevel?: string;
  parsedSections?: ParsedResumeSection[];
  contactInfo?: ContactInfo;
  extractedText?: string;
};

type AnalysisRow = {
  result_json?: unknown;
  score_breakdown_json?: unknown;
  evidence_json?: unknown;
  readiness_score?: number | string | null;
  score?: number | string | null;
  jd_match_score?: number | string | null;
  analysis_type?: string;
  scorer_version?: string;
  parser_version?: string;
  matching_version?: string;
  embedding_model_id?: string;
  embedding_status?: string;
  embedding_dimension?: number;
  created_at?: string;
  resume_id?: string;
  target_level?: string;
};
type StoredBreakdown = { readiness?: Category[]; jdMatch?: Record<string, number>; deterministic?: JdMatch['deterministic'] };
type StoredEvidence = Pick<Readiness, 'rules' | 'strengths' | 'warnings' | 'priorityActions' | 'metrics' | 'scoreLabel' | 'scoreMessage' | 'methodology' | 'issueCount' | 'highPriorityIssueCount'> &
  Pick<JdMatch, 'responsibilityCoverage' | 'deterministic'> & {
    findings?: ResumeFinding[];
  };
type AnalysisLocationState = { initialAnalysis?: ViewModel & { analysis?: Readiness }; fileName?: string; createdAt?: string };

function parseJson<T>(value: unknown): T | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return undefined; }
  }
  return value as T;
}

function normalizePriority(value?: string): Priority {
  if (value === 'high' || value === 'low') return value;
  return 'medium';
}

function actionsFromRules(rules: Rule[]): Action[] {
  const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return rules
    .filter((rule) => rule.status !== 'pass' && rule.recommendation)
    .map((rule) => ({
      id: rule.ruleId,
      title: rule.label || 'Improve this check',
      category: rule.category,
      priority: normalizePriority(rule.priority),
      why: rule.message || 'This check is reducing the report score.',
      how: rule.recommendation || 'Review this section and make it more specific.',
      potentialGain: rule.pointsPossible != null && rule.pointsAwarded != null ? Math.max(0, rule.pointsPossible - rule.pointsAwarded) : undefined,
      evidence: rule.evidence,
    }))
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || (b.potentialGain ?? 0) - (a.potentialGain ?? 0))
    .slice(0, 8);
}

// Maps a raw `analyses` table row (SELECT * from GET /analyses[/:id]) into the
// report ViewModel. Shared by AnalysisPage's own fetch and ResumeViewPage.
export function viewModelFromAnalysisRow(row: AnalysisRow, fileName?: string): ViewModel {
  const snapshot = parseJson<ViewModel & { resultSchemaVersion: number }>(row.result_json);
  const evidence = parseJson<StoredEvidence>(row.evidence_json) ?? {};
  if (snapshot?.resultSchemaVersion === 1) {
    const findings = snapshot.readiness?.findings ?? evidence.findings;
    return {
      ...snapshot,
      readiness: {
        ...snapshot.readiness,
        score: snapshot.readiness.score == null ? undefined : Number(snapshot.readiness.score),
        findings,
      },
      jdMatch: snapshot.jdMatch ? { ...snapshot.jdMatch, score: snapshot.jdMatch.score == null ? null : Number(snapshot.jdMatch.score) } : undefined,
      fileName: snapshot.fileName ?? fileName,
      targetLevel: snapshot.targetLevel ?? row.target_level,
      parsedSections: snapshot.parsedSections,
      contactInfo: snapshot.contactInfo,
      extractedText: snapshot.extractedText,
    };
  }
  const breakdownRaw = parseJson<StoredBreakdown | Category[]>(row.score_breakdown_json);
  const breakdown = Array.isArray(breakdownRaw) ? undefined : breakdownRaw;
  const readinessBreakdown: Category[] = Array.isArray(breakdownRaw) ? breakdownRaw : (breakdown?.readiness ?? []);
  const rules: Rule[] = evidence.rules ?? readinessBreakdown.flatMap((category: Category) => category.rules ?? []);
  const readiness: Readiness = {
    score: row.readiness_score == null && row.score == null ? undefined : Number(row.readiness_score ?? row.score),
    breakdown: readinessBreakdown,
    rules,
    strengths: evidence.strengths ?? [],
    warnings: evidence.warnings ?? [],
    priorityActions: evidence.priorityActions ?? actionsFromRules(rules),
    metrics: evidence.metrics,
    scoreLabel: evidence.scoreLabel,
    scoreMessage: evidence.scoreMessage,
    methodology: evidence.methodology,
    issueCount: evidence.issueCount ?? rules.filter((rule) => rule.status !== 'pass').length,
    highPriorityIssueCount: evidence.highPriorityIssueCount,
    version: row.scorer_version,
    findings: evidence.findings,
  };
  const jdBreakdown = breakdown?.jdMatch;
  const jdMatch = row.analysis_type === 'jd_match' || row.jd_match_score != null ? {
    score: row.jd_match_score == null ? null : Number(row.jd_match_score),
    breakdown: jdBreakdown ? { explicitMustHave: jdBreakdown.explicitMustHave ?? jdBreakdown.explicitPts, responsibilitySemantic: jdBreakdown.responsibilitySemantic ?? jdBreakdown.semanticScore, roleAlignment: jdBreakdown.roleAlignment ?? jdBreakdown.rolePts, domain: jdBreakdown.domain ?? jdBreakdown.domainPts, education: jdBreakdown.education ?? jdBreakdown.eduPts } : undefined,
    responsibilityCoverage: evidence.responsibilityCoverage,
    deterministic: evidence.deterministic ?? breakdown?.deterministic,
  } as JdMatch : undefined;
  const versions: Versions = {
    scorerVersion: row.scorer_version,
    parserVersion: row.parser_version,
    matcherVersion: row.matching_version,
    embeddingModelId: row.embedding_model_id,
    dimension: row.embedding_dimension,
    usedMock: typeof row.embedding_model_id === 'string' ? row.embedding_model_id.includes('mock') : undefined,
    embeddingStatus: row.embedding_status,
  };
  return { readiness, jdMatch, fileName, createdAt: row.created_at, resumeId: row.resume_id, targetLevel: row.target_level, versions };
}

function scoreMeta(score = 0) {
  if (score >= 90) return { label: 'Excellent', text: 'Your resume is structurally strong and evidence-rich.', accent: '#34d399' };
  if (score >= 80) return { label: 'Strong', text: 'You are close. Fix the highest-impact issues before applying.', accent: '#22d3ee' };
  if (score >= 70) return { label: 'Competitive', text: 'Solid foundation, but several issues are still costing clarity and impact.', accent: '#a78bfa' };
  if (score >= 55) return { label: 'Needs work', text: 'Important content or ATS-readability gaps are holding this version back.', accent: '#fbbf24' };
  return { label: 'High risk', text: 'Fix the critical parsing, completeness, and evidence issues first.', accent: '#fb7185' };
}

function shortModel(modelId?: string) {
  if (!modelId) return 'unknown model';
  if (modelId.includes('mock')) return 'mock-384 (fallback, not semantic)';
  const parts = modelId.split('/');
  return parts[parts.length - 1];
}

function buildReportMarkdown(view: ViewModel): string {
  const r = view.readiness;
  const findings = r.findings || [];
  const lines: string[] = [];

  const candidateName = view.contactInfo?.name || 'Candidate';
  const candidateRole = view.contactInfo?.title || 'Professional';

  lines.push(`# ATS RESUME OPTIMIZATION AUDIT & LLM REWRITE DIRECTIVE`);
  lines.push(`**Candidate:** ${candidateName} | **Target Role:** ${candidateRole}`);
  lines.push(`**File:** ${view.fileName || 'resume.pdf'} | **Evaluation Date:** ${view.createdAt || 'n/a'}`);
  lines.push(`**ATS Health Score:** ${r.score ?? '—'}/100 (${r.scoreLabel || 'Evaluated'})`);
  lines.push(`**Scorer Version:** ${view.versions?.scorerVersion || r.version || 'v4.2.0'} (Strict ATS Rule Rubric, Deterministic)`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 🤖 INSTRUCTIONS FOR THE LLM REWRITER');
  lines.push('You are an expert executive resume writer and ATS optimization specialist.');
  lines.push('Rewrite the resume provided below following this strict, unambiguous plan:');
  lines.push('1. **Vary Repeated Action Verbs**: Look at the "Repeated Action Verbs" section below. For every overused lead verb (e.g. "built", "managed"), replace occurrences with the suggested high-impact drop-in alternatives provided. Never start consecutive bullets with the same verb.');
  lines.push('2. **Replace Weak / Passive Phrases**: Look at the "Weak / Passive Phrases" section below. Eradicate phrases like "responsible for", "helped with", or "worked on" and replace them with strong active ownership verbs.');
  lines.push('3. **Add Concrete Metrics to Unquantified Bullets**: For every bullet listed under "Unquantified Bullets (Missing Metrics)", enhance the accomplishment using the Google X-Y-Z formula ("Accomplished [X] as measured by [Y], by doing [Z]"). Incorporate believable metrics such as latency, throughput, percentages (%), dollar impact, or team scale.');
  lines.push('4. **Preserve Truth & Technology Stack**: Maintain all genuine technical terms, libraries, frameworks, tools, and platforms without inventing fictional employers or degree credentials.');
  lines.push('5. **Format in Professional ATS Markdown**: Produce the complete revised resume in clean, standard Markdown format with structured headings (# Summary, ## Technical Skills, ## Professional Experience, ## Projects, ## Education).');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 1. ATS METRIC AUDIT SCORECARD');
  lines.push(`- **Overall Score:** ${r.score ?? '—'}/100 (${r.scoreLabel || 'Evaluated'})`);
  if (r.metrics) {
    const m = r.metrics;
    lines.push(`- **Bullet Points Detected:** ${m.bulletCount ?? 'n/a'}`);
    lines.push(`- **Quantified Bullet Ratio:** ${m.quantifiedBulletRatio != null ? `${Math.round(m.quantifiedBulletRatio <= 1 ? m.quantifiedBulletRatio * 100 : m.quantifiedBulletRatio)}%` : 'n/a'} (${m.quantifiedBulletCount ?? 0}/${m.bulletCount ?? 0} bullets with metrics)`);
    lines.push(`- **Action-Led Bullet Ratio:** ${m.actionLedBulletRatio != null ? `${Math.round(m.actionLedBulletRatio <= 1 ? m.actionLedBulletRatio * 100 : m.actionLedBulletRatio)}%` : 'n/a'} (${m.actionLedBulletCount ?? 0}/${m.bulletCount ?? 0} bullets starting with strong action verbs)`);
    lines.push(`- **Overused Lead Verb Count:** ${m.repeatedLeadVerbCount ?? 0}`);
    lines.push(`- **Passive Weak Phrase Hits:** ${m.weakHits ?? 0}`);
    lines.push(`- **Total Skills Extracted:** ${m.skillsCount ?? 'n/a'}`);
    lines.push(`- **ATS Extraction Confidence:** ${m.extractionConfidence != null ? `${Math.round(m.extractionConfidence * 100)}%` : 'n/a'}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 2. EXACT LINE-BY-LINE CHANGES REQUIRED');
  lines.push('');

  // A. Repeated Verbs
  const verbFindings = findings.filter(f => f.type === 'repeated_verb');
  lines.push('### A. Repeated Action Verbs (Vary these overused words)');
  if (verbFindings.length) {
    const byWord = new Map<string, ResumeFinding[]>();
    verbFindings.forEach(f => {
      const word = (f.targetWord || 'lead verb').toLowerCase();
      if (!byWord.has(word)) byWord.set(word, []);
      byWord.get(word)!.push(f);
    });

    byWord.forEach((list, word) => {
      const first = list[0];
      const count = first.occurrenceCount || list.length;
      lines.push(`#### Verb: "${word}" (Repeated ${count} times)`);
      if (first.suggestedAlternatives?.length) {
        lines.push(`- **Suggested Drop-in Alternatives:** ${first.suggestedAlternatives.join(', ')}`);
      }
      lines.push(`- **Occurrences in Document:**`);
      list.forEach((item, idx) => {
        lines.push(`  ${idx + 1}. **Section:** ${item.section || 'Experience'}`);
        lines.push(`     - **Current Line:** "${item.bulletText || 'n/a'}"`);
        if (item.suggestedRewrite) {
          lines.push(`     - **Suggested Replacement:** "${item.suggestedRewrite}"`);
        }
      });
      lines.push('');
    });
  } else {
    lines.push('✅ No overused lead verbs detected. Action verbs are suitably varied.');
    lines.push('');
  }

  // B. Weak Phrases
  const weakFindings = findings.filter(f => f.type === 'weak_phrase');
  lines.push('### B. Weak / Passive Phrases (Replace with ownership verbs)');
  if (weakFindings.length) {
    weakFindings.forEach((item, idx) => {
      lines.push(`${idx + 1}. **Phrase:** "${item.targetWord || 'passive phrase'}" (in ${item.section || 'Experience'})`);
      lines.push(`   - **Current Line:** "${item.bulletText || 'n/a'}"`);
      if (item.suggestedAlternatives?.length) {
        lines.push(`   - **Drop-in Replacements:** ${item.suggestedAlternatives.join(', ')}`);
      }
      if (item.suggestedRewrite) {
        lines.push(`   - **Suggested Rewrite:** "${item.suggestedRewrite}"`);
      }
    });
    lines.push('');
  } else {
    lines.push('✅ No weak or passive phrases detected. Language exhibits strong ownership.');
    lines.push('');
  }

  // C. Unquantified Bullets
  const unquantified = findings.filter(f => f.type === 'unquantified');
  lines.push('### C. Bullets Lacking Metrics (Incorporate scale, volume, or % impact)');
  if (unquantified.length) {
    unquantified.forEach((item, idx) => {
      lines.push(`${idx + 1}. **Section:** ${item.section || 'Experience'}`);
      lines.push(`   - **Current Line:** "${item.bulletText || 'n/a'}"`);
      lines.push(`   - **Issue:** ${item.message}`);
      lines.push(`   - **Guidance:** ${item.recommendation}`);
      if (item.suggestedRewrite) {
        lines.push(`   - **Example Enhancement:** "${item.suggestedRewrite}"`);
      }
    });
    lines.push('');
  } else {
    lines.push('✅ All accomplishment bullets contain quantifiable metrics and outcomes.');
    lines.push('');
  }

  // D. Structure & Formatting Checks
  const formatFindings = findings.filter(f => f.type === 'formatting' || f.type === 'missing_section' || f.type === 'missing_contact' || f.type === 'typo');
  lines.push('### D. Structure, Formatting & Hygiene Checks');
  if (formatFindings.length) {
    formatFindings.forEach((item, idx) => {
      lines.push(`${idx + 1}. **Check:** ${item.message}`);
      lines.push(`   - **Action Required:** ${item.recommendation}`);
    });
    lines.push('');
  } else {
    lines.push('✅ Clear ATS formatting with standard sections and complete contact metadata.');
    lines.push('');
  }

  // E. Category Breakdown
  lines.push('### E. Full Category Breakdown');
  (r.breakdown ?? []).forEach(c => {
    lines.push(`- **${c.label || c.category}:** ${c.pointsAwarded ?? '—'}/${c.pointsPossible ?? '—'} pts (${c.percent ?? '—'}%) — ${c.summary || ''}`);
  });
  lines.push('');

  // 3. FULL EXTRACTED RESUME SOURCE
  lines.push('---');
  lines.push('');
  lines.push('## 3. FULL EXTRACTED RESUME SOURCE (Raw Document Markdown)');
  lines.push('Below is the authentic content extracted from the resume PDF. Use this as the base for the rewrite:');
  lines.push('');

  if (view.parsedSections?.length) {
    if (view.contactInfo) {
      lines.push(`# ${view.contactInfo.name || 'Candidate'}`);
      if (view.contactInfo.title) lines.push(`**${view.contactInfo.title}**`);
      const contacts = [view.contactInfo.email, view.contactInfo.phone, view.contactInfo.location, ...(view.contactInfo.links || [])].filter(Boolean);
      if (contacts.length) lines.push(contacts.join(' | '));
      lines.push('');
    }

    view.parsedSections.forEach(sec => {
      lines.push(`## ${sec.title || sec.heading || 'Section'}`);
      if (sec.content || sec.text) {
        lines.push(sec.content || sec.text || '');
        lines.push('');
      }
      if (sec.items?.length) {
        sec.items.forEach(item => {
          if (item.title || item.company) {
            const headerParts = [item.title, item.company, item.date].filter(Boolean);
            lines.push(`### ${headerParts.join(' — ')}`);
          }
          if (item.text && !item.bullets?.length) {
            lines.push(item.text);
          }
          if (item.bullets?.length) {
            item.bullets.forEach(b => lines.push(`- ${b}`));
          }
          lines.push('');
        });
      } else if (sec.bullets?.length) {
        sec.bullets.forEach(b => lines.push(`- ${b}`));
        lines.push('');
      }
    });
  } else if (view.extractedText) {
    lines.push(view.extractedText);
    lines.push('');
  } else {
    lines.push('(Raw document text unavailable in snapshot)');
    lines.push('');
  }

  // If JD match was attached
  if (view.jdMatch) {
    const j = view.jdMatch;
    lines.push('---');
    lines.push('');
    lines.push(`## 4. TAILORED JOB MATCH CONTEXT: ${j.jd?.title || 'Target Job'}`);
    lines.push(`- **Match Score:** ${j.score ?? '—'}/100`);
    lines.push(`- **Matched Required Skills:** ${(j.deterministic?.matchedRequired ?? []).join(', ') || 'None'}`);
    lines.push(`- **Missing Required Skills:** ${(j.deterministic?.missingRequired ?? []).join(', ') || 'None'}`);
    lines.push(`- **Matched Preferred Skills:** ${(j.deterministic?.matchedPreferred ?? []).join(', ') || 'None'}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('**End of report. Paste directly into LLM to generate the optimized resume.**');
  return lines.join('\n');
}

type Tab = 'overview' | 'evidence' | 'method';
function SavedSignals({ view, match = false }: { view: ViewModel; match?: boolean }) {
  const strengths = match ? view.jdMatch?.deterministic?.strengths : view.readiness.strengths;
  const warnings = match ? view.jdMatch?.deterministic?.warnings : view.readiness.warnings;
  return <section className="analysis-saved-signals" aria-label="All recorded signals">
    <h2>All recorded signals</h2>
    {!!strengths?.length && <div><h3>Strengths</h3><ul>{strengths.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
    {!!warnings?.length && <div><h3>Review before applying</h3><ul>{warnings.map((text, i) => <li key={i}>{text}</li>)}</ul></div>}
    {match && !!view.jdMatch?.deterministic?.matchedPreferred?.length && <div><h3>Matched preferred skills</h3><div className="skill-cloud">{view.jdMatch.deterministic.matchedPreferred.map(skill => <Tag key={skill} tone="blue">{skill}</Tag>)}</div></div>}
    {!match && view.readiness.metrics && <dl>{Object.entries(view.readiness.metrics).map(([name, value]) => <div key={name}><dt>{name.replace(/([A-Z])/g, ' $1')}</dt><dd>{formatMetricValue(value)}</dd></div>)}</dl>}
    {match && view.jdMatch?.breakdown && <dl>{Object.entries(view.jdMatch.breakdown).map(([name, value]) => <div key={name}><dt>{name.replace(/([A-Z])/g, ' $1')}</dt><dd>{value ?? 'Not recorded'}</dd></div>)}</dl>}
  </section>;
}
function scoreText(score?: number) { return score == null || !Number.isFinite(score) ? 'Not available' : `${score.toLocaleString(undefined, { maximumFractionDigits: 2 })}/100`; }
function formatDate(date?: string) { if (!date) return undefined; const parsed = new Date(date); return Number.isNaN(parsed.getTime()) ? undefined : parsed.toLocaleString(); }
function percent(value?: number, possible?: number) { return value == null || possible == null || possible <= 0 ? undefined : Math.max(0, Math.min(100, Math.round(value / possible * 100))); }
function RuleDetail({ rule }: { rule: Rule }) { return <div className="analysis-rule"><span className={`analysis-rule__status analysis-rule__status--${rule.status ?? 'warn'}`}>{rule.status === 'pass' ? <CheckCircle size={16}/> : <AlertCircle size={16}/>}</span><div><b>{rule.label || rule.ruleId || 'Check'}</b><small>{rule.pointsAwarded != null && rule.pointsPossible != null ? `${rule.pointsAwarded}/${rule.pointsPossible} points` : rule.status || 'Status unavailable'}</small>{rule.message && <p>{rule.message}</p>}{rule.evidence && <blockquote>{rule.evidence}</blockquote>}{rule.recommendation && <p><strong>What to do: </strong>{rule.recommendation}</p>}</div></div>; }
function ReportTabs({ tab, setTab, match }: { tab: Tab; setTab: (tab: Tab) => void; match: boolean }) {
  const tabs = [['overview', 'Overview'], ['evidence', match ? 'Matched evidence' : 'Resume evidence'], ['method', match ? 'How matching works' : 'How scoring works']] as const;
  return <div className="report-tabs" role="tablist" aria-label="Report views">{tabs.map(([key, label], index) =>
    <button key={key} type="button" role="tab" tabIndex={tab === key ? 0 : -1} aria-selected={tab === key}
      className={tab === key ? 'active' : ''} onClick={() => setTab(key)} onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
        setTab(tabs[next][0]);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>{label}</button>)}
  </div>;
}
function Actions({ actions, onEvidence }: { actions: Action[]; onEvidence: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(0);
  const [all, setAll] = useState(false);
  const visible = all ? actions : actions.slice(0, 3);
  return <section className="priority-section priority-section--editorial"><div className="priority-section__head"><div><span>Fix these first</span><h2>{actions.length ? 'The edits with the highest leverage.' : 'Your next edit starts with evidence.'}</h2><p>Every recommendation below comes from a recorded check.</p></div>{actions.length > 0 && <div className="priority-counter"><b>{actions.length}</b><span>priority<br/>actions</span></div>}</div>
    {visible.length ? <div className="priority-list priority-list--editorial">{visible.map((action, index) => { const open = expanded === index; return <article className={`priority-item ${open ? 'priority-item--open' : ''}`} key={action.id ?? `${action.title}-${index}`}><button type="button" className="priority-item__summary" aria-expanded={open} onClick={() => setExpanded(open ? null : index)}><span className="priority-item__number">{String(index + 1).padStart(2, '0')}</span><span className="priority-item__copy"><Tag tone={action.priority === 'high' ? 'amber' : 'neutral'}>{action.priority} priority</Tag><h3>{action.title}</h3><p>{action.why}</p></span><span className={`priority-item__chevron ${open ? 'is-open' : ''}`}><ChevronDown size={18}/></span></button>{open && <div className="priority-item__detail"><div className="priority-detail-block"><small>Evidence from your resume</small><blockquote>{action.evidence || 'No quoted resume excerpt was recorded for this check.'}</blockquote>{action.category && <small>Category: {action.category}</small>}</div><div className="priority-detail-block"><small>What to do</small><p>{action.how}</p>{action.potentialGain != null && <small>{action.potentialGain} check point{action.potentialGain === 1 ? '' : 's'} not awarded</small>}<button type="button" className="inline-link inline-link--button" onClick={onEvidence}>Show affected section <ArrowRight size={15}/></button></div></div>}</article>; })}</div> : <p className="analysis-empty-copy">No priority actions were recorded for this report. Inspect the individual checks below for more detail.</p>}
    {actions.length > 3 && <button type="button" className="inline-link inline-link--button analysis-expand-all" onClick={() => setAll(v => !v)}>{all ? 'Show top three' : `Show all ${actions.length} actions`} <ArrowRight size={15}/></button>}
  </section>;
}
function Breakdown({ categories, onEvidence }: { categories: Category[]; onEvidence: () => void }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return <section className="breakdown-section breakdown-section--editorial"><div className="breakdown-section__title"><div><span>Score breakdown</span><h2>{categories.length} signal{categories.length === 1 ? '' : 's'}. One explainable score.</h2><p>Open a category to inspect its recorded checks and evidence.</p></div></div>{categories.length ? <div className="breakdown-list">{categories.map((category, i) => { const open = expanded === i; const pct = category.percent ?? percent(category.pointsAwarded, category.pointsPossible); return <article key={`${category.category ?? category.label}-${i}`} className={`breakdown-row ${open ? 'breakdown-row--open' : ''}`}><button type="button" className="breakdown-row__summary" aria-expanded={open} onClick={() => setExpanded(open ? null : i)}><span className="breakdown-row__name"><span>{category.label || category.category || 'Category'}</span><p>{category.summary || 'Open to inspect checks'}</p></span><span className="breakdown-row__meter" aria-hidden="true"><i>{pct != null && <b className={pct >= 80 ? 'meter-good' : 'meter-warn'} style={{ width: `${pct}%` }}/>}</i></span><span className="breakdown-row__score"><strong>{category.pointsAwarded ?? '—'}</strong><span>/{category.pointsPossible ?? '—'}</span></span><ChevronDown size={17} className={`breakdown-row__chevron ${open ? 'is-open' : ''}`}/></button>{open && <div className="breakdown-row__detail analysis-category-detail">{category.rules?.length ? category.rules.map((rule, index) => <RuleDetail key={rule.ruleId ?? index} rule={rule}/>) : <p>No individual checks were saved for this category.</p>}<button type="button" className="inline-link inline-link--button" onClick={onEvidence}>Inspect resume evidence <ArrowRight size={15}/></button></div>}</article>; })}</div> : <p className="analysis-empty-copy">A category breakdown was not saved with this analysis.</p>}</section>;
}

function HealthEvidence({ view, rules }: { view: ViewModel; rules: Rule[]; actions: Action[] }) {
  const readiness = view.readiness;
  const findings: ResumeFinding[] = useMemo(() => {
    if (readiness.findings?.length) return readiness.findings;
    return rules
      .filter((r) => r.status !== 'pass' && (r.evidence || r.message))
      .map((r, i) => ({
        id: r.ruleId || `rule_${i}`,
        type: (r.ruleId?.includes('repetition') ? 'repeated_verb' : r.ruleId?.includes('metric') ? 'unquantified' : 'formatting') as any,
        category: (r.category as any) || 'impact',
        severity: r.status === 'fail' ? 'error' : 'warning',
        message: r.message || 'Check needs improvement',
        recommendation: r.recommendation || 'Review this line.',
        bulletText: r.evidence,
      }));
  }, [readiness.findings, rules]);

  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'repeat' | 'metric' | 'weak' | 'format'>('all');
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const verbFindings = useMemo(() => findings.filter((f) => f.type === 'repeated_verb'), [findings]);
  const metricFindings = useMemo(() => findings.filter((f) => f.type === 'unquantified' || f.type === 'quantified_strong'), [findings]);
  const weakFindings = useMemo(() => findings.filter((f) => f.type === 'weak_phrase'), [findings]);
  const formatFindings = useMemo(() => findings.filter((f) => ['formatting', 'missing_section', 'missing_contact', 'typo'].includes(f.type)), [findings]);

  const filteredFindings = useMemo(() => {
    switch (filterTab) {
      case 'repeat': return verbFindings;
      case 'metric': return metricFindings;
      case 'weak': return weakFindings;
      case 'format': return formatFindings;
      default: return findings;
    }
  }, [filterTab, findings, verbFindings, metricFindings, weakFindings, formatFindings]);

  const activeFinding = useMemo(() => {
    if (activeFindingId) {
      const found = findings.find((f) => f.id === activeFindingId);
      if (found) return found;
    }
    return filteredFindings[0] || findings[0] || null;
  }, [activeFindingId, filteredFindings, findings]);

  const selectFinding = (f: ResumeFinding) => {
    setActiveFindingId(f.id);
    const el = document.getElementById(f.id) || document.querySelector(`[data-finding-id="${f.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const renderBulletContent = (bulletText: string, bulletIdx: number, sectionName: string) => {
    const matched = findings.filter(f => {
      if (!f.bulletText) return false;
      const cleanF = f.bulletText.trim();
      const cleanB = bulletText.trim();
      return cleanF === cleanB || cleanB.includes(cleanF.slice(0, 35)) || cleanF.includes(cleanB.slice(0, 35));
    });

    const repeatFinding = matched.find(f => f.type === 'repeated_verb');
    const weakFinding = matched.find(f => f.type === 'weak_phrase');
    const typoFinding = matched.find(f => f.type === 'typo');
    const unquantifiedFinding = matched.find(f => f.type === 'unquantified');
    const quantifiedFinding = matched.find(f => f.type === 'quantified_strong');

    const isBulletActive = matched.some(f => f.id === activeFinding?.id);

    let content: React.ReactNode = bulletText;

    if (repeatFinding?.targetWord) {
      const word = repeatFinding.targetWord;
      const regex = new RegExp(`\\b(${word})\\b`, 'i');
      const parts = bulletText.split(regex);
      if (parts.length >= 3) {
        content = (
          <>
            {parts[0]}
            <mark
              className={`evidence-hl evidence-hl--verb ${activeFinding?.id === repeatFinding.id ? 'is-active' : ''}`}
              onClick={(e) => { e.stopPropagation(); selectFinding(repeatFinding); }}
              title={`Lead verb "${word}" repeated ${repeatFinding.occurrenceCount}x. Click for suggestions.`}
            >
              <span>{parts[1]}</span>
              <span className="hl-pill hl-pill--verb">{repeatFinding.occurrenceCount}x</span>
            </mark>
            {parts.slice(2).join('')}
          </>
        );
      }
    } else if (weakFinding?.targetWord) {
      const phrase = weakFinding.targetWord;
      const regex = new RegExp(`(${phrase})`, 'i');
      const parts = bulletText.split(regex);
      if (parts.length >= 3) {
        content = (
          <>
            {parts[0]}
            <mark
              className={`evidence-hl evidence-hl--weak ${activeFinding?.id === weakFinding.id ? 'is-active' : ''}`}
              onClick={(e) => { e.stopPropagation(); selectFinding(weakFinding); }}
              title={`Weak passive phrase. Click for strong action alternatives.`}
            >
              <span>{parts[1]}</span>
              <span className="hl-pill hl-pill--weak">weak phrase</span>
            </mark>
            {parts.slice(2).join('')}
          </>
        );
      }
    }

    const primaryFinding = repeatFinding || weakFinding || unquantifiedFinding || typoFinding || quantifiedFinding;

    return (
      <li
        key={bulletIdx}
        id={primaryFinding?.id || `bullet-${sectionName}-${bulletIdx}`}
        data-finding-id={primaryFinding?.id}
        className={`resume-paper__bullet ${isBulletActive ? 'is-focused' : ''}`}
        onClick={() => { if (primaryFinding) selectFinding(primaryFinding); }}
      >
        <span>{content}</span>
        {unquantifiedFinding && (
          <button
            type="button"
            className={`bullet-badge bullet-badge--warn ${activeFinding?.id === unquantifiedFinding.id ? 'is-active' : ''}`}
            onClick={(e) => { e.stopPropagation(); selectFinding(unquantifiedFinding); }}
            title="Lacks quantifiable metrics. Click to see recommendations."
          >
            <AlertCircle size={12} /> Needs metrics
          </button>
        )}
        {quantifiedFinding && !unquantifiedFinding && (
          <span className="bullet-badge bullet-badge--pass" title="Quantified accomplishment with measurable results.">
            <Check size={12} /> Quantified
          </span>
        )}
      </li>
    );
  };

  return (
    <section className="evidence-layout evidence-layout--editorial">
      <div className="resume-paper-container">
        <div className="resume-paper-toolbar">
          <div className="resume-paper-toolbar__title">
            <FileText size={18} />
            <b>{view.fileName || 'Resume Document'}</b>
            <small>Interactive ATS Evidence Map</small>
          </div>
          <div className="resume-paper-toolbar__badges">
            <Tag tone="amber">{verbFindings.length} repeated verbs</Tag>
            <Tag tone={metricFindings.some(f => f.type === 'unquantified') ? 'amber' : 'green'}>
              {metricFindings.filter(f => f.type === 'unquantified').length} unquantified
            </Tag>
            <Tag tone="neutral">ATS Scored {view.readiness.score}/100</Tag>
          </div>
        </div>

        <div className="resume-paper" id="resume-paper-doc">
          <header className="resume-paper__header">
            <h1 className="resume-paper__name">{view.contactInfo?.name || 'Candidate'}</h1>
            {view.contactInfo?.title && (
              <div className="resume-paper__target-role">{view.contactInfo.title}</div>
            )}
            <div className="resume-paper__contacts">
              {view.contactInfo?.email && (
                <span className="resume-paper__contact-item"><Mail size={13} /> {view.contactInfo.email}</span>
              )}
              {view.contactInfo?.phone && (
                <span className="resume-paper__contact-item"><Phone size={13} /> {view.contactInfo.phone}</span>
              )}
              {view.contactInfo?.location && (
                <span className="resume-paper__contact-item"><MapPin size={13} /> {view.contactInfo.location}</span>
              )}
              {view.contactInfo?.links?.map((link, i) => (
                <span key={i} className="resume-paper__contact-item">🔗 {link}</span>
              ))}
            </div>
          </header>

          {view.parsedSections?.length ? (
            view.parsedSections.map((sec, secIdx) => (
              <section key={secIdx} className="resume-paper__section">
                <h2 className="resume-paper__section-title">{sec.title || sec.heading || `Section ${secIdx + 1}`}</h2>

                {sec.content && !sec.items?.length && (
                  <p className="resume-paper__section-prose">{sec.content}</p>
                )}

                {sec.title?.toLowerCase().includes('skill') && sec.items?.length ? (
                  <div className="resume-paper__skills-grid">
                    {sec.items.map((item, itemIdx) => (
                      <div key={itemIdx} className="resume-paper__skill-group">
                        {item.title && <span className="resume-paper__skill-category">{item.title}:</span>}
                        {item.bullets?.length ? (
                          <div className="resume-paper__skill-tags">
                            {item.bullets.map((skill, skIdx) => (
                              <span key={skIdx} className="resume-paper__skill-tag">{skill}</span>
                            ))}
                          </div>
                        ) : (
                          <span>{item.text}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}

                {!sec.title?.toLowerCase().includes('skill') && sec.items?.length ? (
                  sec.items.map((item, itemIdx) => (
                    <article key={itemIdx} className="resume-paper__role">
                      {(item.title || item.company || item.date) && (
                        <div className="resume-paper__role-header">
                          <div className="resume-paper__role-title-company">
                            <span>{item.title || 'Role'}</span>
                            {item.company && <span className="resume-paper__role-company">• {item.company}</span>}
                          </div>
                          {item.date && <span className="resume-paper__role-date">{item.date}</span>}
                        </div>
                      )}
                      {item.text && !item.bullets?.length && (
                        <p className="resume-paper__section-prose">{item.text}</p>
                      )}
                      {item.bullets?.length ? (
                        <ul className="resume-paper__bullets">
                          {item.bullets.map((b, bIdx) => renderBulletContent(b, bIdx, sec.title || 'sec'))}
                        </ul>
                      ) : null}
                    </article>
                  ))
                ) : null}

                {sec.bullets?.length && !sec.items?.length && !sec.title?.toLowerCase().includes('skill') ? (
                  <ul className="resume-paper__bullets">
                    {sec.bullets.map((b, bIdx) => renderBulletContent(b, bIdx, sec.title || 'sec'))}
                  </ul>
                ) : null}
              </section>
            ))
          ) : view.extractedText ? (
            <div className="resume-paper__section">
              <h2 className="resume-paper__section-title">Extracted Resume Content</h2>
              <ul className="resume-paper__bullets">
                {view.extractedText.split('\n').filter(l => l.trim().length > 15).map((line, lIdx) => renderBulletContent(line, lIdx, 'extracted'))}
              </ul>
            </div>
          ) : (
            <p className="analysis-empty-copy">No parsed resume sections or text available in this report.</p>
          )}
        </div>
      </div>

      <aside className="evidence-diagnostic evidence-diagnostic--rail">
        <div className="diagnostic-inspector">
          <div>
            <Eyebrow>Evidence Inspector</Eyebrow>
            <div className="diagnostic-tabs" role="tablist">
              <button
                type="button"
                className={`diagnostic-tab-btn ${filterTab === 'all' ? 'is-active' : ''}`}
                onClick={() => setFilterTab('all')}
              >
                All ({findings.length})
              </button>
              <button
                type="button"
                className={`diagnostic-tab-btn ${filterTab === 'repeat' ? 'is-active' : ''}`}
                onClick={() => setFilterTab('repeat')}
              >
                Word Repetition ({verbFindings.length})
              </button>
              <button
                type="button"
                className={`diagnostic-tab-btn ${filterTab === 'metric' ? 'is-active' : ''}`}
                onClick={() => setFilterTab('metric')}
              >
                Metrics ({metricFindings.length})
              </button>
              <button
                type="button"
                className={`diagnostic-tab-btn ${filterTab === 'weak' ? 'is-active' : ''}`}
                onClick={() => setFilterTab('weak')}
              >
                Weak Phrases ({weakFindings.length})
              </button>
              <button
                type="button"
                className={`diagnostic-tab-btn ${filterTab === 'format' ? 'is-active' : ''}`}
                onClick={() => setFilterTab('format')}
              >
                Structure ({formatFindings.length})
              </button>
            </div>
          </div>

          {activeFinding ? (
            <div className="diagnostic-active-card">
              <div className="diagnostic-card-badge">
                {activeFinding.type === 'repeated_verb' ? (
                  <>⚠️ Repeated lead verb ({activeFinding.occurrenceCount}x)</>
                ) : activeFinding.type === 'weak_phrase' ? (
                  <>⚠️ Passive weak phrase</>
                ) : activeFinding.type === 'unquantified' ? (
                  <>⚠️ Missing metrics & outcome</>
                ) : activeFinding.type === 'quantified_strong' ? (
                  <>✅ Strong quantified accomplishment</>
                ) : (
                  <>ℹ️ ATS Check</>
                )}
              </div>

              <h3 className="diagnostic-card-title">{activeFinding.message}</h3>

              {activeFinding.section && (
                <div className="diagnostic-card-location">
                  Section: <strong>{activeFinding.section}</strong>
                </div>
              )}

              {activeFinding.bulletText && (
                <blockquote className="diagnostic-card-quote">
                  "{activeFinding.bulletText}"
                </blockquote>
              )}

              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--muted)' }}>
                <strong>What to do: </strong>{activeFinding.recommendation}
              </p>

              {activeFinding.suggestedAlternatives?.length ? (
                <div className="diagnostic-alternatives">
                  <span className="diagnostic-alternatives-title">Suggested Drop-in Replacements:</span>
                  <div className="diagnostic-alt-chips">
                    {activeFinding.suggestedAlternatives.map((alt, i) => (
                      <button
                        key={i}
                        type="button"
                        className="diagnostic-alt-chip"
                        onClick={() => copyToClipboard(alt, `copied-${alt}`)}
                        title={`Click to copy "${alt}"`}
                      >
                        {alt} {copiedText === `copied-${alt}` ? '✓' : ''}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {activeFinding.suggestedRewrite && (
                <div className="diagnostic-rewrite-box">
                  <small>Suggested Rewrite (Ready to Use)</small>
                  <p>"{activeFinding.suggestedRewrite}"</p>
                  <button
                    type="button"
                    className="diagnostic-copy-btn"
                    onClick={() => copyToClipboard(activeFinding.suggestedRewrite!, 'rewrite')}
                  >
                    <Copy size={13} /> {copiedText === 'rewrite' ? 'Copied to clipboard!' : 'Copy rewrite'}
                  </button>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
                <small style={{ color: 'var(--muted)', fontSize: 12 }}>
                  Check {filteredFindings.findIndex(f => f.id === activeFinding.id) + 1} of {filteredFindings.length}
                </small>
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const idx = filteredFindings.findIndex(f => f.id === activeFinding.id);
                      const prev = idx > 0 ? filteredFindings[idx - 1] : filteredFindings[filteredFindings.length - 1];
                      if (prev) selectFinding(prev);
                    }}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const idx = filteredFindings.findIndex(f => f.id === activeFinding.id);
                      const next = idx < filteredFindings.length - 1 ? filteredFindings[idx + 1] : filteredFindings[0];
                      if (next) selectFinding(next);
                    }}
                  >
                    Next <ArrowRight size={14} />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="analysis-empty-copy">No checks recorded for this filter.</p>
          )}

          {filteredFindings.length > 1 && (
            <div className="diagnostic-findings-list">
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--faint)', marginBottom: 4 }}>
                All Checks in this view:
              </span>
              {filteredFindings.map((f, i) => (
                <button
                  key={f.id || i}
                  type="button"
                  className={`diagnostic-finding-item ${activeFinding?.id === f.id ? 'is-selected' : ''}`}
                  onClick={() => selectFinding(f)}
                >
                  <span>{f.severity === 'error' ? '❌' : f.type === 'repeated_verb' ? '🔄' : f.type === 'unquantified' ? '📊' : f.type === 'quantified_strong' ? '✅' : '⚠️'}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {f.message}
                  </span>
                  <ChevronRight size={14} style={{ opacity: 0.5 }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
function HealthMethod({ view }: { view: ViewModel }) { const readiness = view.readiness; return <section className="method-section method-section--editorial"><div className="method-copy"><Eyebrow>Transparent scoring</Eyebrow><h2>A document-quality score you can inspect.</h2><p>{readiness.methodology?.note || 'Resume Health evaluates document quality independently of any job description. Role relevance belongs in Tailored Match.'}</p></div><div className="method-list"><article><span>01</span><div><h3>Recorded checks</h3><p>Points map to the rules listed in the score breakdown, not a job similarity estimate.</p></div></article><article><span>02</span><div><h3>Career-level context</h3><p>{view.targetLevel ? `Evaluated for ${view.targetLevel} level.` : 'Career-level expectations adapt when a target level was supplied.'} Seniority alone does not award points.</p></div></article><article><span>03</span><div><h3>Separate role matching</h3><p>Job descriptions and semantic relevance never change this document-quality score.</p></div></article></div><div className="rubric-table">{(readiness.breakdown ?? []).map((category, i) => <div key={i}><span>{category.label || category.category}</span><b>{category.pointsPossible == null ? 'Weight unavailable' : `${category.pointsPossible} pts`}</b></div>)}</div>{(readiness.version || view.versions?.parserVersion) && <p className="analysis-method-meta">{readiness.version && `Scorer ${readiness.version}`}{view.versions?.parserVersion && ` · Parser ${view.versions.parserVersion}`}</p>}</section>; }
function MatchReport({ view, tab, setTab }: { view: ViewModel; tab: Tab; setTab: (tab: Tab) => void }) {
  const match = view.jdMatch!;
  const deterministic = match.deterministic;
  const required = deterministic?.matchedRequired ?? [];
  const missing = deterministic?.missingRequired ?? [];
  const coverage = deterministic?.requiredCoverage;
  return <><section className="match-report-hero"><div className="match-report-hero__copy"><Eyebrow tone="blue">Role-specific evidence</Eyebrow><div className="match-role-line">{match.jd?.title && <Tag tone="blue">{match.jd.title}</Tag>}<span>Tailored Match</span></div><h1>How your evidence aligns.<br/><span>For this role only.</span></h1><p>This result evaluates your resume against one specific job description. It does not alter your document-quality score.</p><div className="report-meta"><span><FileText size={15}/> {view.fileName || 'Resume'}</span>{view.targetLevel && <span>{view.targetLevel} level</span>}{formatDate(view.createdAt) && <span>{formatDate(view.createdAt)}</span>}</div></div><div className="match-report-hero__score">{match.score != null && Number.isFinite(match.score) ? <ScoreRing value={match.score} size={190} label="Role match" tone="blue"/> : <div className="analysis-score-unavailable">Fit score<br/>unavailable</div>}<div className="report-score-label"><Tag tone="blue">{match.eligibility === 'ineligible' ? 'Qualification barrier' : match.score == null ? 'Not scored' : 'Role-specific fit'}</Tag><small>Resume Health: {scoreText(view.readiness.score)}</small></div></div></section>
    <div className="signal-separation"><div><span className="signal-separation__amber"><Target size={20}/></span><div><small>Resume Health</small><b>{scoreText(view.readiness.score)}</b><p>Document quality</p></div></div><span className="signal-separation__neq">≠</span><div><span className="signal-separation__blue"><Target size={20}/></span><div><small>Tailored Match</small><b>{scoreText(match.score ?? undefined)}</b><p>This role only</p></div></div></div>
    <ReportTabs tab={tab} setTab={setTab} match/>
    {tab === 'overview' && <><section className="analysis-qualification" aria-label="Qualification assessment"><Eyebrow tone="blue">Qualification assessment</Eyebrow><h2>{match.eligibility === 'ineligible' ? 'A confirmed qualification barrier' : match.eligibility === 'eligible' ? 'No confirmed qualification barrier' : 'Qualifications need verification'}</h2><p>Technology similarity alone cannot establish professional tenure, degree completion or senior engineering scope.</p>{match.qualificationReasons?.length ? <ul>{match.qualificationReasons.map((reason, i) => <li key={i}>{reason}</li>)}</ul> : null}{match.score == null && <p>A fit score was not available for this analysis; no value has been estimated.</p>}{match.pointsPossible != null && <p>{match.rawScore ?? '—'} / {match.pointsPossible} applicable points{view.versions?.rubricVersion ? ` · rubric ${view.versions.rubricVersion}` : ''}</p>}{match.seniorityPenalty ? <p>Seniority adjustment: −{match.seniorityPenalty} points{match.relevanceScore != null ? ` from ${match.relevanceScore} pre-adjustment fit` : ''}.</p> : null}</section>
      <section className="match-metrics-grid">{[{ label: 'Required skills', value: coverage != null ? `${Math.round(coverage * 100)}%` : undefined, note: `${required.length} matched · ${missing.length} missing`, ratio: coverage != null ? coverage * 100 : undefined }, { label: 'Responsibilities', value: match.breakdown?.responsibilitySemantic, note: `${match.responsibilityCoverage?.length ?? 0} recorded responsibilities` }, { label: 'Role alignment', value: match.breakdown?.roleAlignment, note: 'Reported rubric component' }, { label: 'Confidence', value: view.confidence, note: view.confidenceReasons?.join('; ') || 'No confidence reasons recorded' }].map(item => <article key={item.label}><small>{item.label}</small><div><b>{item.value ?? '—'}</b></div>{item.ratio != null && <i><em style={{ width: `${Math.max(0, Math.min(100, item.ratio))}%` }}/></i>}<p>{item.note}</p></article>)}</section>
      <section className="match-summary-grid"><article className="match-strength-card"><div className="match-strength-card__head"><div><small>Exact evidence</small><h2>{required.length ? `${required.length} required skill${required.length === 1 ? '' : 's'} matched.` : 'No exact required-skill overlap recorded.'}</h2></div></div><p>Concrete skill names are matched strictly. Related technology families do not count as exact matches.</p><div className="skill-cloud">{required.map(skill => <Tag key={skill} tone="blue">{skill} ✓</Tag>)}</div>{deterministic?.strengths?.map((strength, i) => <p key={i}>{strength}</p>)}</article><article className="match-gap-card"><small>Before applying</small><h3>Close the evidence gap, not the keyword gap.</h3><p>{missing.length ? `${missing.length} required skill${missing.length === 1 ? '' : 's'} not found in the resume evidence.` : 'Review responsibilities and qualification notes before applying.'} Add experience only when you can substantiate it.</p><Button variant="secondary" onClick={() => setTab('evidence')}>Review evidence <ArrowRight size={14}/></Button></article></section></>}
    {tab === 'evidence' && <><section className="match-evidence-list">{match.responsibilityCoverage?.length ? match.responsibilityCoverage.map((item, i) => <article key={i}><div className="match-evidence-score"><span>{String(i + 1).padStart(2, '0')}</span><b>{item.matchScore == null ? '—' : `${item.matchScore}`}</b></div><div><Tag tone="blue">Responsibility</Tag><h2>{item.responsibility || 'Role responsibility'}</h2><blockquote>{item.candidateEvidence || 'No candidate excerpt was returned for this responsibility.'}</blockquote></div></article>) : <p className="analysis-empty-copy">No responsibility-level evidence was saved with this match. Required skills and gaps remain available below.</p>}</section><section className="gap-review"><div className="gap-review__intro"><Eyebrow tone="blue">Missing or weak evidence</Eyebrow><h2>Do not turn this into keyword stuffing.</h2><p>These are gaps relative to this role, not necessarily flaws in your resume. Only add what you have genuinely done.</p></div><div className="gap-review__list">{missing.map((skill, i) => <article key={`${skill}-${i}`}><div><span className="gap-dot"/><h3>{skill}</h3></div><Tag tone="blue">Required · not matched</Tag></article>)}{deterministic?.missingPreferred?.map((skill, i) => <article key={`preferred-${skill}-${i}`}><div><span className="gap-dot"/><h3>{skill}</h3></div><Tag tone="neutral">Preferred · not matched</Tag></article>)}{!missing.length && !deterministic?.missingPreferred?.length && <p>No missing skills were recorded.</p>}</div>{!!deterministic?.partialMatches?.length && <div className="analysis-transferable"><h3>Transferable hints — not scored</h3>{deterministic.partialMatches.map((hint, i) => <p key={i}>{hint.resumeSkill || 'Related experience'} → {hint.jdSkill || 'Role skill'}{hint.family ? ` (${hint.family})` : ''}</p>)}</div>}{deterministic?.warnings?.map((warning, i) => <p className="analysis-match-warning" key={i}>{warning}</p>)}</section></>}
    {tab === 'method' && <section className="method-section method-section--editorial"><div className="method-copy"><Eyebrow tone="blue">Matching methodology</Eyebrow><h2>One role. A separate signal.</h2><p>Tailored Match combines available required-skill checks, responsibility evidence and role alignment. It is not an employer ATS score or hiring probability, and does not change Resume Health.</p></div><div className="method-list"><article><span>01</span><div><h3>Exact required skills</h3><p>Concrete skills match strictly; related families are shown only as unscored hints.</p></div></article><article><span>02</span><div><h3>Qualification review</h3><p>Check degree, tenure and seniority independently of technology similarity.</p></div></article><article><span>03</span><div><h3>Semantic responsibility evidence</h3><p>{view.versions?.embeddingStatus === 'real' ? 'Semantic evidence was available for this analysis.' : 'Semantic evidence was unavailable or unconfirmed for this saved analysis.'}</p></div></article></div>{match.weights && <div className="rubric-table">{Object.entries(match.weights).map(([name, weight]) => <div key={name}><span>{name}</span><b>{weight}</b></div>)}</div>}<p className="analysis-method-meta">{view.versions?.matcherVersion && `Matcher ${view.versions.matcherVersion} · `}Embedding status: {view.versions?.embeddingStatus || 'not recorded'}{view.versions?.embeddingModelId && ` · ${shortModel(view.versions.embeddingModelId)}`}{view.versions?.usedMock && ' · fallback, not semantic'}</p>{match.applicability && <p className="analysis-method-meta">Applicable components: {Object.entries(match.applicability).filter(([, applicable]) => applicable).map(([name]) => name).join(', ') || 'none recorded'}</p>}</section>}
  </>;
}

// initialView lets ResumeViewPage render a saved report under the resume URL.
export default function AnalysisPage({ initialView }: { initialView?: ViewModel } = {}) {
  const { id } = useParams();
  const location = useLocation();
  const locationState = location.state as AnalysisLocationState | null;
  const initial = initialView ?? locationState?.initialAnalysis;
  const [view, setView] = useState<ViewModel | null>(() => initial ? { ...initial, readiness: initial.readiness ?? (initial as any).analysis ?? {}, fileName: initial.fileName ?? locationState?.fileName, createdAt: initial.createdAt ?? locationState?.createdAt } : null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  useEffect(() => {
    setError('');
    setTab('overview');
    if (initial) {
      setView({ ...initial, readiness: initial.readiness ?? (initial as any).analysis ?? {}, fileName: initial.fileName ?? locationState?.fileName, createdAt: initial.createdAt ?? locationState?.createdAt });
      setLoading(false);
      return;
    }
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    api.get(`/analyses/${id}`).then(async response => {
      const body = response.data as { analysis?: AnalysisRow } & AnalysisRow;
      const row = body.analysis ?? body;
      let fileName: string | undefined;
      if (row.resume_id) { try { const res = await api.get(`/resumes/${row.resume_id}`); const resume = (res.data as { resume?: { fileName?: string; file_name?: string } })?.resume; fileName = resume?.fileName ?? resume?.file_name; } catch { /* Report remains usable. */ } }
      if (!cancelled) setView(viewModelFromAnalysisRow(row, fileName));
    }).catch(err => { if (!cancelled) setError((err as { status?: number })?.status === 404 ? 'This report could not be found — it may have been deleted. Run the analysis again to create a new one.' : getApiErrorMessage(err)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, initial, locationState?.fileName, locationState?.createdAt]);
  const downloadMarkdown = () => { if (!view) return; const blob = new Blob([buildReportMarkdown(view)], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `jobhunter-report-${id || 'resume'}.md`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const copyMarkdown = async () => { if (!view) return; try { await navigator.clipboard.writeText(buildReportMarkdown(view)); setCopyError(''); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopyError('Could not copy the report. Download the Markdown file instead.'); } };
  if (loading) return <div className="workspace-page report-page analysis-loading" aria-busy="true" aria-label="Loading your report"><div className="report-toolbar analysis-skeleton-line"/><div className="report-hero analysis-skeleton-hero"><div className="analysis-skeleton-line"/><div className="analysis-skeleton-line"/><div className="analysis-skeleton-line"/></div><div className="analysis-skeleton-line"/></div>;
  if (error || !view) return <div className="workspace-page report-page"><Link to="/app/ats" className="back-link"><ArrowLeft size={15}/> Resume Health</Link><div className="analysis-error" role="alert"><h1>Report unavailable</h1><p>{error || 'This analysis could not be loaded.'}</p><Link to="/app/ats" className="button button--primary">Run a new analysis</Link></div></div>;
  const readiness = view.readiness;
  const isMatch = !!view.jdMatch;
  const rules = readiness.rules?.length ? readiness.rules : readiness.breakdown?.flatMap(category => category.rules ?? []) ?? [];
  const actions = readiness.priorityActions?.length ? readiness.priorityActions : actionsFromRules(rules);
  const passed = rules.filter(rule => rule.status === 'pass').length;
  const openEvidence = () => { setTab('evidence'); requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' })); };
  const reanalyze = `/app/ats${view.resumeId ? `?resumeId=${encodeURIComponent(view.resumeId)}` : ''}`;
  return <div className={`workspace-page ${isMatch ? 'match-report-page' : 'report-page'}`}>
    <div className="report-toolbar">
      <Link to="/app/ats" className="back-link"><ArrowLeft size={15}/> {isMatch ? 'Tailored Match' : 'Resume Health'}</Link>
      <div className="report-toolbar__actions">
        <button
          type="button"
          onClick={copyMarkdown}
          className={`report-copy-btn ${copied ? 'is-copied' : ''}`}
          title="Copy comprehensive report formatted for LLM prompting"
        >
          {copied ? <><Check size={14}/> Copied for LLM!</> : <><Copy size={14}/> Copy report for LLM</>}
        </button>
        <button type="button" onClick={downloadMarkdown}><Download size={15}/> Export .md</button>
        <button type="button" onClick={() => window.print()}><Printer size={15}/> Print / PDF</button>
        <Link to={reanalyze}><RefreshCcw size={15}/> Re-analyze</Link>
      </div>
    </div>
    {isMatch ? <MatchReport view={view} tab={tab} setTab={setTab}/> : <><section className="report-hero report-hero--editorial"><div className="report-hero__copy"><Eyebrow>Resume Health {readiness.version ? `· ${readiness.version}` : ''}</Eyebrow><h1>{readiness.scoreLabel || (readiness.score == null ? 'Your report is ready.' : scoreMeta(readiness.score).label)}<br/><span>{readiness.score == null ? 'Inspect the recorded checks.' : 'Make the next edit count.'}</span></h1><p>{readiness.scoreMessage || (readiness.score == null ? 'A numerical score was not recorded for this report.' : scoreMeta(readiness.score).text)}</p><div className="report-meta"><span><FileText size={15}/> {view.fileName || 'Resume'}</span>{view.targetLevel && <span>{view.targetLevel} level</span>}{formatDate(view.createdAt) && <span>{formatDate(view.createdAt)}</span>}</div></div><div className="report-score-wrap">{readiness.score != null && Number.isFinite(readiness.score) ? <ScoreRing value={readiness.score} size={190}/> : <div className="analysis-score-unavailable">Score<br/>unavailable</div>}<div className="report-score-label"><Tag tone="amber">Document quality</Tag>{rules.length > 0 && <small>{passed} of {rules.length} checks passed</small>}</div></div></section><ReportTabs tab={tab} setTab={setTab} match={false}/>{tab === 'overview' && <><Actions actions={actions} onEvidence={openEvidence}/><Breakdown categories={readiness.breakdown ?? []} onEvidence={openEvidence}/><section className="report-notes"><div className="report-note"><span className="report-note__icon"><ShieldCheck size={22}/></span><div><small>Resume scan</small><h3>{readiness.strengths?.[0] || 'Document-quality evidence'}</h3><p>{readiness.warnings?.[0] || 'Review each category for the recorded evidence and recommendations.'}</p></div></div><div className="report-note report-note--confidence"><small>Extraction confidence</small><div><b>{readiness.metrics?.extractionConfidence != null ? `${Math.round(readiness.metrics.extractionConfidence * 100)}%` : 'Not recorded'}</b><span>{readiness.metrics?.pageCount != null ? `${readiness.metrics.pageCount} page${readiness.metrics.pageCount === 1 ? '' : 's'}` : 'Page count unavailable'}{readiness.metrics?.wordCount != null ? ` · ${readiness.metrics.wordCount} words` : ''}</span></div>{readiness.metrics?.extractionConfidence != null && <div className="confidence-bar"><i style={{ width: `${Math.max(0, Math.min(100, readiness.metrics.extractionConfidence * 100))}%` }}/></div>}</div></section><Link to="/app/jobs" className="inline-link">Explore Job Matches <ArrowRight size={15}/></Link></>}{tab === 'evidence' && <HealthEvidence view={view} rules={rules} actions={actions}/ >}{tab === 'method' && <HealthMethod view={view}/>}</>}
    {tab === 'evidence' && <SavedSignals view={view} match={isMatch}/>}
    <div className="analysis-report-tools">
      <button
        type="button"
        className={`inline-link inline-link--button analysis-copy-report-btn ${copied ? 'is-copied' : ''}`}
        onClick={copyMarkdown}
      >
        {copied ? <><Check size={15}/> Copied for LLM!</> : <>Copy report for LLM <ArrowRight size={15}/></>}
      </button>
      {copyError && <span role="alert">{copyError}</span>}
    </div>
  </div>;
}
