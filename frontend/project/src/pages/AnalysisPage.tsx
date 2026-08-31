import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Briefcase,
  Check,
  CheckCircle,
  ChevronDown,
  AlertCircle,
  FileSearch,
  Gauge,
  ListChecks,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
} from 'lucide-react';

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
  score?: number;
  breakdown?: Record<string, number | string>;
  responsibilityCoverage?: Array<{ responsibility?: string; matchScore?: number; candidateEvidence?: string | null }>;
  deterministic?: {
    requiredCoverage?: number;
    matchedRequired?: string[];
    missingRequired?: string[];
    matchedPreferred?: string[];
    missingPreferred?: string[];
  };
  jd?: { title?: string | null; requiredSkills?: string[]; preferredSkills?: string[] };
};

type ViewModel = {
  readiness: Readiness;
  jdMatch?: JdMatch;
  confidence?: string;
  fileName?: string;
  createdAt?: string;
  resumeId?: string;
};

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
      potentialGain: Math.max(0, (rule.pointsPossible ?? 0) - (rule.pointsAwarded ?? 0)),
      evidence: rule.evidence,
    }))
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || (b.potentialGain ?? 0) - (a.potentialGain ?? 0))
    .slice(0, 8);
}

function scoreMeta(score = 0) {
  if (score >= 90) return { label: 'Excellent', text: 'Your resume is structurally strong and evidence-rich.', accent: '#34d399' };
  if (score >= 80) return { label: 'Strong', text: 'You are close. Fix the highest-impact issues before applying.', accent: '#22d3ee' };
  if (score >= 70) return { label: 'Competitive', text: 'Solid foundation, but several issues are still costing clarity and impact.', accent: '#a78bfa' };
  if (score >= 55) return { label: 'Needs work', text: 'Important content or ATS-readability gaps are holding this version back.', accent: '#fbbf24' };
  return { label: 'High risk', text: 'Fix the critical parsing, completeness, and evidence issues first.', accent: '#fb7185' };
}

function statusIcon(status?: Status) {
  if (status === 'pass') return <CheckCircle size={16} className="text-emerald-300" />;
  if (status === 'fail') return <AlertCircle size={16} className="text-rose-300" />;
  return <AlertTriangle size={16} className="text-amber-300" />;
}

function priorityClasses(priority: Priority) {
  if (priority === 'high') return 'border-amber-400/20 bg-amber-400/[0.06] text-amber-200';
  if (priority === 'low') return 'border-stone-700 bg-stone-800/60 text-stone-300';
  return 'border-amber-300/15 bg-amber-300/[0.04] text-amber-200';
}

function metric(value: number | undefined, suffix = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}${suffix}` : '—';
}

function CategoryPanel({ category }: { category: Category }) {
  const [open, setOpen] = useState(false);
  const possible = category.pointsPossible || 1;
  const awarded = category.pointsAwarded || 0;
  const percent = category.percent ?? Math.round((awarded / possible) * 100);
  const issues = (category.rules ?? []).filter((rule) => rule.status !== 'pass').length;

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-800 bg-stone-900/60">
      <button onClick={() => setOpen((value) => !value)} className="w-full p-4 text-left md:p-5">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">{category.label || category.category}</p>
              {issues > 0 && <span className="rounded-full bg-amber-300/[0.08] px-2 py-0.5 text-[10px] font-semibold text-amber-200">{issues} issue{issues === 1 ? '' : 's'}</span>}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-stone-500">{category.summary}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-stone-800">
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <div className="text-right">
              <p className="text-lg font-semibold text-white">{awarded}<span className="text-xs font-normal text-slate-600">/{possible}</span></p>
              <p className="text-[10px] text-slate-600">{percent}%</p>
            </div>
            <ChevronDown size={16} className={`text-slate-600 transition ${open ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </button>

      {open && (
        <div className="border-t border-stone-800/60 px-4 py-2 md:px-5">
          {(category.rules ?? []).map((rule, index) => (
            <div key={rule.ruleId || index} className="flex gap-3 border-b border-stone-800/50 py-4 last:border-0">
              <span className="mt-0.5 shrink-0">{statusIcon(rule.status)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-slate-200">{rule.label || rule.ruleId}</p>
                  <span className="text-[10px] font-medium text-slate-600">{rule.pointsAwarded ?? 0}/{rule.pointsPossible ?? 0} pts</span>
                </div>
                {rule.message && <p className="mt-1 text-[11px] leading-5 text-slate-500">{rule.message}</p>}
                {rule.evidence && <p className="mt-1.5 break-words rounded-lg bg-stone-950 border border-stone-800 px-2.5 py-2 text-[10px] leading-4 text-stone-500">Evidence: {rule.evidence}</p>}
                {rule.status !== 'pass' && rule.recommendation && <p className="mt-2 text-[11px] leading-5 text-slate-400"><span className="font-semibold text-amber-300">Fix:</span> {rule.recommendation}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const { id } = useParams();
  const location = useLocation();
  const initial = (location.state as any)?.initialAnalysis as any | undefined;
  const initialName = (location.state as any)?.fileName as string | undefined;
  const initialCreatedAt = (location.state as any)?.createdAt as string | undefined;
  const [loading, setLoading] = useState(!initial);
  const [error, setError] = useState('');
  const [view, setView] = useState<ViewModel | null>(() => {
    if (!initial) return null;
    return {
      readiness: initial.readiness ?? initial.analysis ?? {},
      jdMatch: initial.jdMatch,
      confidence: initial.confidence,
      fileName: initialName,
      createdAt: initialCreatedAt,
      resumeId: initial.resumeId,
    };
  });

  useEffect(() => {
    if (initial || !id) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get(`/analyses/${id}`);
        const row = (response.data as any)?.analysis ?? response.data;
        const breakdownRaw = parseJson<any>(row.score_breakdown_json);
        const evidence = parseJson<any>(row.evidence_json) ?? {};
        const readinessBreakdown: Category[] = Array.isArray(breakdownRaw) ? breakdownRaw : (breakdownRaw?.readiness ?? []);
        const rules: Rule[] = evidence.rules ?? readinessBreakdown.flatMap((category: Category) => category.rules ?? []);
        const readiness: Readiness = {
          score: row.readiness_score ?? row.score,
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

        const jdEvidence = parseJson<any>(row.evidence_json) ?? {};
        const jdMatch = row.jd_match_score !== null && row.jd_match_score !== undefined ? {
          score: row.jd_match_score,
          breakdown: breakdownRaw?.jdMatch,
          responsibilityCoverage: jdEvidence.responsibilityCoverage,
          deterministic: jdEvidence.deterministic ?? breakdownRaw?.deterministic,
        } as JdMatch : undefined;

        let fileName: string | undefined;
        if (row.resume_id) {
          try {
            const resumeResponse = await api.get(`/resumes/${row.resume_id}`);
            fileName = (resumeResponse.data as any)?.resume?.fileName ?? (resumeResponse.data as any)?.resume?.file_name;
          } catch { /* report is still usable without the filename */ }
        }

        if (!cancelled) setView({ readiness, jdMatch, fileName, createdAt: row.created_at, resumeId: row.resume_id });
      } catch (err) {
        if (!cancelled) setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, initial]);

  const readiness = view?.readiness;
  const score = readiness?.score ?? 0;
  const meta = useMemo(() => scoreMeta(score), [score]);
  const rules = readiness?.rules ?? readiness?.breakdown?.flatMap((category) => category.rules ?? []) ?? [];
  const actions = readiness?.priorityActions?.length ? readiness.priorityActions : actionsFromRules(rules);
  const passed = rules.filter((rule) => rule.status === 'pass').length;
  const totalChecks = rules.length;
  const metrics = readiness?.metrics;

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Loading your report…</div>;

  if (error || !view || !readiness) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Link to="/app/ats" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Resume Health</Link>
        <div className="mt-5 rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4 text-sm text-rose-200">{error || 'This analysis could not be loaded.'}</div>
      </div>
    );
  }

  const ring = `conic-gradient(${meta.accent} ${Math.max(0, Math.min(100, score)) * 3.6}deg, rgba(255,255,255,.07) 0deg)`;

  return (
    <div className="space-y-7 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/app/ats" className="jh-button-ghost"><ArrowLeft size={14} /> New scan</Link>
        <div className="flex items-center gap-2 text-[11px] text-slate-600">
          {readiness.version && <span>Scorer v{readiness.version}</span>}
          {view.createdAt && <><span>•</span><span>{new Date(view.createdAt).toLocaleString()}</span></>}
        </div>
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-stone-800 bg-[#1C1917]/90 p-5 shadow-2xl shadow-black/20 md:p-7">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-16 top-0 h-64 w-64 rounded-full bg-stone-700/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[1fr_auto] xl:items-center">
          <div>
            <p className="jh-eyebrow"><Sparkles size={13} /> Resume health report</p>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-white md:text-3xl">{view.fileName || 'Your resume diagnostic'}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{readiness.scoreMessage || meta.text}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="jh-chip"><ListChecks size={12} className="mr-1" /> {passed}/{totalChecks || '—'} checks passed</span>
              <span className="jh-chip"><AlertCircle size={12} className="mr-1" /> {readiness.issueCount ?? totalChecks - passed} issues</span>
              <span className="jh-chip"><FileSearch size={12} className="mr-1" /> Rule-based, no JD</span>
            </div>
            <p className="mt-5 max-w-3xl text-[11px] leading-5 text-slate-600">{readiness.methodology?.note || 'This is a Resume Health / ATS-readiness diagnostic, not an employer ATS ranking or a probability of getting hired. Job-specific relevance is scored separately.'}</p>
          </div>

          <div className="flex items-center gap-5 xl:pr-2">
            <div className="relative grid h-36 w-36 place-items-center rounded-full p-[9px]" style={{ background: ring }}>
              <div className="grid h-full w-full place-items-center rounded-full border border-stone-800 bg-[#0C0A09] text-center shadow-inner shadow-black/30">
                <div>
                  <p className="text-4xl font-semibold tracking-[-0.05em] text-white">{score}</p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-600">out of 100</p>
                </div>
              </div>
            </div>
            <div className="hidden sm:block xl:hidden 2xl:block">
              <p className="text-lg font-semibold" style={{ color: meta.accent }}>{readiness.scoreLabel || meta.label}</p>
              <p className="mt-1 max-w-[180px] text-xs leading-5 text-slate-500">Fix the top actions below, then re-scan this version.</p>
            </div>
          </div>
        </div>
      </section>

      {view.jdMatch && (
        <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-5 md:p-6">
          <div className="grid gap-5 lg:grid-cols-[auto_1fr_auto] lg:items-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><Target size={21} /></span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-amber-300/70">Separate job-specific signal</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Tailored Match</h2>
              <p className="mt-1 text-xs leading-5 text-stone-500">This measures fit to the JD you supplied. It does not change the Resume Health score above.</p>
            </div>
            <div className="text-left lg:text-right">
              <p className="text-3xl font-semibold tracking-[-0.04em] text-amber-300">{view.jdMatch.score ?? '—'}<span className="text-sm font-normal text-stone-600">/100</span></p>
              <p className="text-[10px] text-slate-600">{view.confidence ? `${view.confidence} confidence` : 'JD-specific fit'}</p>
            </div>
          </div>
          {view.jdMatch.deterministic && (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] p-3.5">
                <p className="text-[11px] font-semibold text-emerald-200">Matched required skills</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{(view.jdMatch.deterministic.matchedRequired ?? []).map((skill) => <span key={skill} className="jh-chip border-emerald-400/10 text-emerald-100/70">{skill}</span>)}</div>
              </div>
              <div className="rounded-xl border border-rose-400/10 bg-rose-400/[0.035] p-3.5">
                <p className="text-[11px] font-semibold text-rose-200">Missing required skills</p>
                <div className="mt-2 flex flex-wrap gap-1.5">{(view.jdMatch.deterministic.missingRequired ?? []).map((skill) => <span key={skill} className="jh-chip border-rose-400/10 text-rose-100/70">{skill}</span>)}</div>
              </div>
            </div>
          )}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'ATS extraction', value: metrics?.extractionConfidence !== undefined ? `${Math.round(metrics.extractionConfidence * 100)}%` : '—', hint: 'Parser confidence', icon: Gauge },
          { label: 'Impact bullets', value: metric(metrics?.quantifiedBulletCount), hint: `${metric(metrics?.quantifiedBulletRatio !== undefined ? Math.round(metrics.quantifiedBulletRatio) : undefined, '%')} quantified`, icon: TrendingUp },
          { label: 'Action-led bullets', value: metric(metrics?.actionLedBulletCount), hint: `${metric(metrics?.actionLedBulletRatio !== undefined ? Math.round(metrics.actionLedBulletRatio) : undefined, '%')} of bullets`, icon: Wand2 },
          { label: 'Resume footprint', value: metrics?.wordCount ? `${metrics.wordCount} words` : '—', hint: `${metric(metrics?.pageCount)} page${metrics?.pageCount === 1 ? '' : 's'} • ${metric(metrics?.skillsCount)} skills`, icon: BarChart3 },
        ].map((item) => (
          <div key={item.label} className="jh-surface p-4">
            <div className="flex items-center justify-between"><span className="text-[11px] font-medium text-slate-500">{item.label}</span><item.icon size={15} className="text-slate-700" /></div>
            <p className="mt-3 text-xl font-semibold tracking-[-0.03em] text-white">{item.value}</p>
            <p className="mt-1 text-[10px] text-slate-600">{item.hint}</p>
          </div>
        ))}
      </section>

      {/* Priority actions — full-width, editorial, not side-by-side */}
      <section className="space-y-5">
        <div className="border-b border-stone-800 pb-4">
          <p className="jh-eyebrow">What to fix first</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>Priority actions</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">Sorted by impact — fix the top 2 and re-scan. Each action maps to a visible check and shows how many points you can recover.</p>
        </div>
        {actions.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {actions.map((action, index) => (
              <div key={action.id || index} className={`relative overflow-hidden rounded-2xl border p-5 ${priorityClasses(action.priority)}`}>
                <div className="absolute right-0 top-0 h-24 w-24 -translate-y-8 translate-x-8 rounded-full bg-amber-400/5 blur-2xl" />
                <div className="flex gap-4">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-900 border border-stone-800 text-sm font-bold text-stone-100">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15px] font-semibold text-stone-100">{action.title}</p>
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${action.priority === 'high' ? 'bg-amber-400 text-stone-900' : action.priority === 'medium' ? 'bg-stone-800 text-stone-300' : 'bg-stone-800/60 text-stone-500'}`}>{action.priority}</span>
                    </div>
                    <p className="mt-2 text-[13px] leading-5 text-stone-400">{action.why}</p>
                    <p className="mt-3 text-[13px] leading-5 text-stone-200"><span className="font-semibold text-amber-300">Do this:</span> {action.how}</p>
                    {action.evidence && <p className="mt-2.5 break-words rounded-xl bg-stone-950 border border-stone-800 px-3 py-2 text-xs leading-4 text-stone-500">Evidence: {action.evidence}</p>}
                    {!!action.potentialGain && <p className="mt-3 text-xs font-medium text-amber-300">↗ Up to +{action.potentialGain} points</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-800 bg-emerald-950/20 p-8 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/10 text-emerald-300"><Check size={20} /></div>
            <p className="mt-3 text-sm font-semibold text-emerald-100">No high-impact fixes — this version is solid.</p>
            <p className="text-xs text-emerald-200/60 mt-1">Keep 1 page, single column, and quantified bullets.</p>
          </div>
        )}
      </section>

      {/* Score breakdown — own section, not cramped beside actions */}
      <section className="space-y-5">
        <div className="border-b border-stone-800 pb-4">
          <p className="jh-eyebrow">100-point rubric</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>Score breakdown</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">Each category is independent. Hard refresh loads the same breakdown from <code className="text-stone-300">/api/v1/analyses/:id</code>.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          {(readiness.breakdown ?? []).map((category) => <CategoryPanel key={category.category || category.label} category={category} />)}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200"><Briefcase size={15} className="text-amber-300" /> Ready to test market fit?</div>
          <p className="mt-1.5 max-w-2xl text-xs leading-5 text-slate-500">Resume Health tells you whether the document is strong. Job Matches tells you where that evidence is most relevant.</p>
        </div>
        <Link to="/app/jobs" className="jh-button-primary">Open Job Matches <ArrowRight size={14} /></Link>
      </section>
    </div>
  );
}
