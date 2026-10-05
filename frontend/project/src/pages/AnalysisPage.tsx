import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { Button, Eyebrow, ScoreRing, Tag } from '../components/UI';
import './analysis.css';
import api, { getApiErrorMessage } from '../lib/api';
import { AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle, ChevronDown, Download, FileText, Printer, RefreshCcw, ShieldCheck, Target } from 'lucide-react';

type Status = 'pass' | 'warn' | 'fail';
type Priority = 'high' | 'medium' | 'low';

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

type ViewModel = {
  readiness: Readiness;
  jdMatch?: JdMatch;
  confidence?: string;
  confidenceReasons?: string[];
  fileName?: string;
  createdAt?: string;
  resumeId?: string;
  versions?: Versions;
  targetLevel?: string;
  parsedSections?: Array<{ title?: string; heading?: string; content?: string; text?: string; bullets?: string[] }>;
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
  Pick<JdMatch, 'responsibilityCoverage' | 'deterministic'>;
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
  if (snapshot?.resultSchemaVersion === 1) return {
    ...snapshot,
    readiness: { ...snapshot.readiness, score: snapshot.readiness.score == null ? undefined : Number(snapshot.readiness.score) },
    jdMatch: snapshot.jdMatch ? { ...snapshot.jdMatch, score: snapshot.jdMatch.score == null ? null : Number(snapshot.jdMatch.score) } : undefined,
    fileName: snapshot.fileName ?? fileName,
    targetLevel: snapshot.targetLevel ?? row.target_level,
  };
  const breakdownRaw = parseJson<StoredBreakdown | Category[]>(row.score_breakdown_json);
  const breakdown = Array.isArray(breakdownRaw) ? undefined : breakdownRaw;
  const evidence = parseJson<StoredEvidence>(row.evidence_json) ?? {};
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
  const lines: string[] = [];
  lines.push(`# JobHunter report — ${view.fileName || 'resume'}`);
  lines.push('');
  lines.push(`- Date: ${view.createdAt || 'n/a'}`);
  lines.push(`- Scorer: ${view.versions?.scorerVersion || r.version || 'n/a'} | Parser: ${view.versions?.parserVersion || 'n/a'} | Matcher: ${view.versions?.matcherVersion || 'n/a'}`);
  lines.push(`- Embedding status: ${view.versions?.embeddingStatus || (view.versions?.usedMock ? 'mock' : 'not recorded')}`);
  lines.push(`- Embedding model: ${view.versions?.embeddingModelId || 'n/a'}${view.versions?.usedMock ? ' (MOCK FALLBACK — not semantic)' : ''}`);
  lines.push('');
  lines.push(`## Resume Health: ${r.score ?? '—'}/100 ${r.scoreLabel ? `(${r.scoreLabel})` : ''}`);
  lines.push('');
  lines.push(`Method: rule-based, no JD. ${r.methodology?.note || ''}`);
  lines.push('');
  lines.push('### Plus points (passing checks)');
  if (r.strengths?.length) r.strengths.forEach((s) => lines.push(`- ✅ ${s}`));
  else lines.push('- (none recorded)');
  lines.push('');
  lines.push('### Warnings and checks needing attention');
  if (r.warnings?.length) r.warnings.forEach((w) => lines.push(`- ⚠️ ${w}`));
  else lines.push('- (none recorded)');
  lines.push('');
  lines.push('### Category breakdown');
  (r.breakdown ?? []).forEach((c) => {
    lines.push(`- ${c.label || c.category}: ${c.pointsAwarded ?? '—'}/${c.pointsPossible ?? '—'} (${c.percent ?? '—'}%) — ${c.summary || ''}`);
    (c.rules ?? []).filter((rule) => rule.status !== 'pass').forEach((rule) => {
      lines.push(`  - [${rule.status}] ${rule.label}: ${rule.message || ''} (${rule.pointsAwarded ?? '—'}/${rule.pointsPossible ?? '—'})`);
      if (rule.evidence) lines.push(`    Evidence: ${rule.evidence}`);
      if (rule.recommendation) lines.push(`    Fix: ${rule.recommendation}`);
    });
  });
  lines.push('');
  lines.push('### Priority actions');
  const acts = r.priorityActions ?? [];
  if (!acts.length) lines.push('- No high-impact fixes.');
  acts.forEach((a, i) => {
    lines.push(`${i + 1}. ${a.title} [${a.priority}]${a.potentialGain != null ? ` (${a.potentialGain} available check points)` : ''}`);
    lines.push(`   Why: ${a.why}`);
    lines.push(`   How: ${a.how}`);
    if (a.evidence) lines.push(`   Evidence: ${a.evidence}`);
  });
  lines.push('');
  if (view.jdMatch) {
    const j = view.jdMatch;
    const d = j.deterministic;
    lines.push(`## Tailored fit index (resume + JD): ${j.score ?? '—'}/100 ${view.confidence ? `(${view.confidence} confidence)` : ''}`);
    lines.push('');
    lines.push(`- JD title: ${j.jd?.title || 'n/a'}`);
    lines.push(`- Qualification: ${j.eligibility || 'unknown'}; ${j.qualificationReasons?.join('; ') || 'Requires independent verification'}`);
    lines.push(`- Raw points: ${j.rawScore ?? 'n/a'}/${j.pointsPossible ?? 'n/a'} applicable; rubric: ${view.versions?.rubricVersion || 'legacy'}`);
    if (j.seniorityPenalty) lines.push(`- Seniority adjustment: -${j.seniorityPenalty}; pre-adjustment fit: ${j.relevanceScore ?? 'n/a'}`);
    lines.push(`- Confidence reasons: ${view.confidenceReasons?.join('; ') || '(none recorded)'}`);
    if (j.applicability) lines.push(`- Applicable components: ${Object.entries(j.applicability).filter(([, v]) => v).map(([k]) => k).sort().join(', ')}`);
  lines.push(`- Required coverage: ${d?.requiredCoverage !== undefined ? `${Math.round(d.requiredCoverage * 100)}%` : 'n/a'} | Explicit score: ${j.breakdown?.explicitMustHave ?? 'n/a'} | Semantic: ${j.breakdown?.responsibilitySemantic ?? 'n/a'}`);
    lines.push(`- Matched required: ${(d?.matchedRequired ?? []).join(', ') || '(none — exact match only)'}`);
    lines.push(`- Preferred skills matched: ${(d?.matchedPreferred ?? []).join(', ') || '(none)'}`);
    lines.push(`- Missing required: ${(d?.missingRequired ?? []).join(', ') || '(none)'}`);
    if (d?.partialMatches?.length) {
      lines.push(`- Transferable (family hints, not scored): ${d.partialMatches.map((p) => `${p.resumeSkill} → ${p.jdSkill} (${p.family})`).join('; ')}`);
    }
    if (d?.strengths?.length) { lines.push(''); lines.push('### JD plus points'); d.strengths.forEach((s) => lines.push(`- ✅ ${s}`)); }
    if (d?.warnings?.length) { lines.push(''); lines.push('### JD minus points'); d.warnings.forEach((w) => lines.push(`- ⚠️ ${w}`)); }
    if (j.responsibilityCoverage?.length) {
      lines.push(''); lines.push('### Responsibility coverage (semantic per bullet)');
      j.responsibilityCoverage.forEach((rc) => lines.push(`- [${rc.matchScore}] ${rc.responsibility}${rc.candidateEvidence ? ` | Evidence: ${rc.candidateEvidence}` : ''}`));
    }
    lines.push('');
  } else {
    lines.push('## Tailored Match: not run (no JD supplied for this analysis).');
    lines.push('');
  }
  lines.push('---');
  lines.push('Paste this full report into an LLM with your resume + JD to ask for rewrite suggestions.');
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
    {!match && view.readiness.metrics && <dl>{Object.entries(view.readiness.metrics).map(([name, value]) => <div key={name}><dt>{name.replace(/([A-Z])/g, ' $1')}</dt><dd>{typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : 'Not recorded'}</dd></div>)}</dl>}
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
function HealthEvidence({ view, rules, actions }: { view: ViewModel; rules: Rule[]; actions: Action[] }) {
  const [selected, setSelected] = useState(0);
  const evidence = rules.filter(rule => rule.evidence || rule.message);
  const current = evidence[selected];
  return <section className="evidence-layout evidence-layout--editorial"><div className="resume-evidence resume-evidence--paper"><div className="resume-evidence__head"><div><span className="mini-avatar"><FileText size={20}/></span><div><b>{view.fileName || 'Resume evidence'}</b><small>Recorded excerpts and checks from your analysis</small></div></div><Tag tone="neutral">Extracted text</Tag></div>{view.parsedSections?.length ? view.parsedSections.map((section, i) => <div key={i} className="resume-section"><span>{section.title || section.heading || `Section ${i + 1}`}</span>{section.content || section.text ? <p>{section.content || section.text}</p> : null}{section.bullets?.map((bullet, j) => <p key={j}>{bullet}</p>)}</div>) : evidence.length ? evidence.map((rule, i) => <button type="button" key={rule.ruleId ?? i} className={`analysis-evidence-excerpt ${selected === i ? 'is-selected' : ''}`} onClick={() => setSelected(i)}><span>{rule.category || rule.label || `Check ${i + 1}`}</span><p>{rule.evidence || rule.message}</p></button>) : <p className="analysis-empty-copy">The saved analysis did not contain parsed resume sections or quoted excerpts. We cannot show a document preview without them.</p>}</div><aside className="evidence-diagnostic evidence-diagnostic--rail"><Eyebrow>Selected evidence</Eyebrow><h2>{current?.label || actions[0]?.title || 'Inspect the saved checks.'}</h2><p>{current?.message || actions[0]?.why || 'No diagnostic evidence was recorded.'}</p>{current?.recommendation && <div className="evidence-callout"><small>Recommendation</small><p>{current.recommendation}</p></div>}{evidence.length > 1 && <Button variant="secondary" onClick={() => setSelected(index => (index + 1) % evidence.length)}>Next evidence <ArrowRight size={15}/></Button>}</aside></section>;
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
  const [view, setView] = useState<ViewModel | null>(() => initial ? { ...initial, readiness: initial.readiness ?? initial.analysis ?? {}, fileName: initial.fileName ?? locationState?.fileName, createdAt: initial.createdAt ?? locationState?.createdAt } : null);
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  useEffect(() => {
    setError('');
    setTab('overview');
    if (initial) {
      setView({ ...initial, readiness: initial.readiness ?? initial.analysis ?? {}, fileName: initial.fileName ?? locationState?.fileName, createdAt: initial.createdAt ?? locationState?.createdAt });
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
    <div className="report-toolbar"><Link to="/app/ats" className="back-link"><ArrowLeft size={15}/> {isMatch ? 'Tailored Match' : 'Resume Health'}</Link><div className="report-toolbar__actions"><button type="button" onClick={downloadMarkdown}><Download size={15}/> Export .md</button><button type="button" onClick={() => window.print()}><Printer size={15}/> Print / PDF</button><Link to={reanalyze}><RefreshCcw size={15}/> Re-analyze</Link></div></div>
    {isMatch ? <MatchReport view={view} tab={tab} setTab={setTab}/> : <><section className="report-hero report-hero--editorial"><div className="report-hero__copy"><Eyebrow>Resume Health {readiness.version ? `· ${readiness.version}` : ''}</Eyebrow><h1>{readiness.scoreLabel || (readiness.score == null ? 'Your report is ready.' : scoreMeta(readiness.score).label)}<br/><span>{readiness.score == null ? 'Inspect the recorded checks.' : 'Make the next edit count.'}</span></h1><p>{readiness.scoreMessage || (readiness.score == null ? 'A numerical score was not recorded for this report.' : scoreMeta(readiness.score).text)}</p><div className="report-meta"><span><FileText size={15}/> {view.fileName || 'Resume'}</span>{view.targetLevel && <span>{view.targetLevel} level</span>}{formatDate(view.createdAt) && <span>{formatDate(view.createdAt)}</span>}</div></div><div className="report-score-wrap">{readiness.score != null && Number.isFinite(readiness.score) ? <ScoreRing value={readiness.score} size={190}/> : <div className="analysis-score-unavailable">Score<br/>unavailable</div>}<div className="report-score-label"><Tag tone="amber">Document quality</Tag>{rules.length > 0 && <small>{passed} of {rules.length} checks passed</small>}</div></div></section><ReportTabs tab={tab} setTab={setTab} match={false}/>{tab === 'overview' && <><Actions actions={actions} onEvidence={openEvidence}/><Breakdown categories={readiness.breakdown ?? []} onEvidence={openEvidence}/><section className="report-notes"><div className="report-note"><span className="report-note__icon"><ShieldCheck size={22}/></span><div><small>Resume scan</small><h3>{readiness.strengths?.[0] || 'Document-quality evidence'}</h3><p>{readiness.warnings?.[0] || 'Review each category for the recorded evidence and recommendations.'}</p></div></div><div className="report-note report-note--confidence"><small>Extraction confidence</small><div><b>{readiness.metrics?.extractionConfidence != null ? `${Math.round(readiness.metrics.extractionConfidence * 100)}%` : 'Not recorded'}</b><span>{readiness.metrics?.pageCount != null ? `${readiness.metrics.pageCount} page${readiness.metrics.pageCount === 1 ? '' : 's'}` : 'Page count unavailable'}{readiness.metrics?.wordCount != null ? ` · ${readiness.metrics.wordCount} words` : ''}</span></div>{readiness.metrics?.extractionConfidence != null && <div className="confidence-bar"><i style={{ width: `${Math.max(0, Math.min(100, readiness.metrics.extractionConfidence * 100))}%` }}/></div>}</div></section><Link to="/app/jobs" className="inline-link">Explore Job Matches <ArrowRight size={15}/></Link></>}{tab === 'evidence' && <HealthEvidence view={view} rules={rules} actions={actions}/ >}{tab === 'method' && <HealthMethod view={view}/>}</>}
    {tab === 'evidence' && <SavedSignals view={view} match={isMatch}/>}
    <div className="analysis-report-tools"><button type="button" className="inline-link inline-link--button" onClick={copyMarkdown}>{copied ? <><Check size={15}/> Copied for LLM</> : <>Copy report for LLM <ArrowRight size={15}/></>}</button>{copyError && <span role="alert">{copyError}</span>}</div>
  </div>;
}
