import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import {
  ArrowUpRight,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  AlertCircle,
  Filter,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
} from 'lucide-react';

type BreakdownItem = { label: string; value: number };

type Job = {
  id?: string | number;
  jobId?: string | number;
  title: string;
  company?: string;
  location?: string;
  snippet?: string;
  description?: string;
  salary?: string;
  type?: string;
  link?: string;
  url?: string;
  updated?: string;
  matchScore?: number;
  matchLevel?: string;
  fitScore?: number;
  confidence?: string;
  semanticSimilarity?: number;
  jobLevel?: string;
  breakdown?: BreakdownItem[];
  recommendationReasons?: string[];
  matchedSkills?: string[];
  missingSkills?: string[];
  evidence?: string[];
};

type Resume = { id: string; fileName?: string; file_name?: string };

function safeText(value?: string): string {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function safeExternalUrl(value?: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function scoreOf(job: Job): number {
  const raw = job.fitScore ?? job.matchScore ?? 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function mapRecommendation(raw: any): Job {
  const breakdown = raw?.breakdown && !Array.isArray(raw.breakdown)
    ? Object.entries(raw.breakdown).filter(([, value]) => typeof value === 'number').map(([label, value]) => ({ label, value: value as number }))
    : raw?.breakdown;

  return {
    ...raw,
    id: raw.id ?? raw.jobId ?? raw.job_id,
    title: raw.title ?? raw.jobTitle ?? raw.job_title ?? 'Untitled role',
    company: raw.company ?? raw.companyName ?? raw.company_name,
    location: raw.location,
    snippet: raw.snippet ?? raw.description,
    link: raw.link ?? raw.url,
    fitScore: raw.fitScore ?? raw.matchScore ?? raw.relevanceScore,
    confidence: raw.confidence ?? raw.matchLevel,
    breakdown,
    matchedSkills: raw.matchedSkills ?? raw.matched_skills ?? raw.skillMatches,
    missingSkills: raw.missingSkills ?? raw.missing_skills ?? raw.skillGaps,
    evidence: raw.evidence ?? raw.matchEvidence,
    recommendationReasons: raw.recommendationReasons ?? raw.reasons,
  };
}

function scoreTone(score: number) {
  if (score >= 80) return { text: 'text-emerald-200', bg: 'bg-emerald-300/[0.08]', border: 'border-emerald-300/15' };
  if (score >= 65) return { text: 'text-amber-200', bg: 'bg-amber-300/[0.07]', border: 'border-amber-300/15' };
  if (score >= 50) return { text: 'text-stone-300', bg: 'bg-stone-700/30', border: 'border-stone-700' };
  return { text: 'text-stone-300', bg: 'bg-stone-800/60', border: 'border-stone-700' };
}

function JobCard({ job, active, onSelect }: { job: Job; active: boolean; onSelect: () => void }) {
  const score = scoreOf(job);
  const tone = scoreTone(score);
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-2xl border p-4 text-left transition ${active ? 'border-amber-400/30 bg-amber-400/[0.07] shadow-xl shadow-black/10' : 'border-stone-800 bg-stone-900/50 hover:border-stone-700 hover:bg-stone-800'}`}
    >
      <div className="flex gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.035] text-slate-400"><Building2 size={19} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-white">{job.title}</h3>
              <p className="mt-0.5 truncate text-xs text-slate-500">{job.company || 'Company not listed'}</p>
            </div>
            <div className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-center ${tone.border} ${tone.bg}`}>
              <p className={`text-base font-semibold leading-none ${tone.text}`}>{score}%</p>
              <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-600">fit</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-slate-600">
            {job.location && <span className="flex items-center gap-1"><MapPin size={11} /> {job.location}</span>}
            {job.jobLevel && <span className="flex items-center gap-1"><Briefcase size={11} /> {job.jobLevel}</span>}
            {job.confidence && <span className="flex items-center gap-1"><Target size={11} /> {job.confidence} confidence</span>}
          </div>

          {!!job.matchedSkills?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.matchedSkills.slice(0, 4).map((skill) => <span key={skill} className="rounded-full border border-emerald-400/10 bg-emerald-400/[0.035] px-2 py-0.5 text-[9px] font-medium text-emerald-100/65">{skill}</span>)}
              {job.matchedSkills.length > 4 && <span className="rounded-full border border-white/[0.055] px-2 py-0.5 text-[9px] text-slate-600">+{job.matchedSkills.length - 4}</span>}
            </div>
          )}
        </div>
        <ChevronRight size={15} className={`mt-3 shrink-0 ${active ? 'text-amber-300' : 'text-slate-700'}`} />
      </div>
    </button>
  );
}

function JobDetail({ job }: { job: Job }) {
  const score = scoreOf(job);
  const tone = scoreTone(score);
  const external = safeExternalUrl(job.link ?? job.url);
  const description = safeText(job.snippet ?? job.description);
  const reasons = job.recommendationReasons ?? [];
  const breakdown = job.breakdown ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-5 border-b border-white/[0.06] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.035] text-slate-300"><Building2 size={21} /></span>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">{job.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{job.company || 'Company not listed'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
              {job.location && <span className="jh-chip"><MapPin size={11} className="mr-1" />{job.location}</span>}
              {job.type && <span className="jh-chip">{job.type}</span>}
              {job.salary && job.salary !== 'Not specified' && <span className="jh-chip">{job.salary}</span>}
            </div>
          </div>
        </div>

        <div className={`self-start rounded-2xl border px-4 py-3 text-center ${tone.border} ${tone.bg}`}>
          <p className={`text-3xl font-semibold tracking-[-0.05em] ${tone.text}`}>{score}%</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">fit score</p>
        </div>
      </div>

      {breakdown.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-slate-300">Why it scored this way</p><span className="text-[10px] text-slate-600">transparent breakdown</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {breakdown.slice(0, 8).map((item, index) => {
              const shown = item.value <= 1 ? Math.round(item.value * 100) : Math.round(item.value);
              return (
                <div key={`${item.label}-${index}`} className="rounded-xl border border-white/[0.055] bg-black/10 p-3">
                  <div className="flex items-center justify-between gap-3"><span className="truncate text-[10px] capitalize text-slate-500">{item.label.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</span><span className="text-[11px] font-semibold text-slate-300">{shown}</span></div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.055]"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(4, Math.min(100, shown))}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.03] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-200"><Check size={13} /> Matched skills</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.matchedSkills?.length ? job.matchedSkills.map((skill) => <span key={skill} className="rounded-full border border-emerald-400/10 bg-emerald-400/[0.04] px-2 py-1 text-[9px] text-emerald-100/70">{skill}</span>) : <span className="text-[10px] text-slate-600">No explicit matched-skill list returned.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-rose-400/10 bg-rose-400/[0.03] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-200"><AlertCircle size={13} /> Skill gaps</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.missingSkills?.length ? job.missingSkills.map((skill) => <span key={skill} className="rounded-full border border-rose-400/10 bg-rose-400/[0.04] px-2 py-1 text-[9px] text-rose-100/70">{skill}</span>) : <span className="text-[10px] text-slate-600">No explicit required-skill gaps returned.</span>}
          </div>
        </div>
      </div>

      {(reasons.length > 0 || job.evidence?.length) && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
          <p className="text-[11px] font-semibold text-amber-200">Why this job surfaced</p>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-5 text-stone-500">
            {[...reasons, ...(job.evidence ?? [])].slice(0, 6).map((reason, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-300/70" /><span>{reason}</span></li>)}
          </ul>
        </div>
      )}

      {description && (
        <div>
          <p className="text-xs font-semibold text-slate-300">Job summary</p>
          <p className="mt-2 text-xs leading-6 text-slate-500">{description}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-5">
        {external ? <a href={external} target="_blank" rel="noopener noreferrer" className="jh-button-primary">View original job <ArrowUpRight size={14} /></a> : <span className="text-xs text-slate-600">Original job link unavailable</span>}
        <span className="text-[10px] text-slate-700">Fit score should guide prioritization, not replace reading the full JD.</span>
      </div>
    </div>
  );
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [selectedResume, setSelectedResume] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [prefs, setPrefs] = useState({ targetRole: '', location: 'India', minScore: 40, workMode: 'remote,hybrid' });

  useEffect(() => {
    (async () => {
      try {
        const [resumeResponse, profileResponse] = await Promise.all([
          api.get('/resumes'),
          api.get('/profile').catch(() => ({ data: {} })),
        ]);
        const list = ((resumeResponse.data as any)?.resumes ?? []) as Resume[];
        setResumes(list);
        if (list.length) setSelectedResume((value) => value || list[0].id);

        const preferences = (profileResponse.data as any)?.preferences ?? (profileResponse.data as any)?.profile?.preferences;
        const roles = preferences?.target_roles ?? preferences?.targetRoles;
        const locations = preferences?.locations;
        setPrefs((current) => ({
          ...current,
          targetRole: current.targetRole || roles?.[0] || '',
          location: locations?.[0] || current.location,
        }));
      } catch {
        // The empty state below explains what the user needs to do.
      }
    })();
  }, []);

  const runRecommendations = async (isRefresh = false) => {
    if (!selectedResume) return setError('Choose a resume before generating matches.');
    setError('');
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const payload = {
        resumeId: selectedResume,
        ...(prefs.targetRole.trim() ? { targetRoles: [prefs.targetRole.trim()] } : {}),
        ...(prefs.location.trim() ? { locations: [prefs.location.trim()] } : {}),
        workModes: prefs.workMode.split(',').map((value) => value.trim()).filter(Boolean),
      };
      const response = await api.post('/recommendation-runs', payload);
      const raw = (response.data as any)?.recommendations ?? (response.data as any)?.results ?? [];
      const mapped = raw.map(mapRecommendation).sort((a: Job, b: Job) => scoreOf(b) - scoreOf(a));
      setJobs(mapped);
      setSelectedIndex(0);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (selectedResume) void runRecommendations(false);
    // Run when the user switches the resume; filter changes are applied explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResume]);

  const visibleJobs = useMemo(() => jobs.filter((job) => scoreOf(job) >= prefs.minScore), [jobs, prefs.minScore]);
  const selected = visibleJobs[Math.min(selectedIndex, Math.max(0, visibleJobs.length - 1))];
  const topMatches = visibleJobs.filter((job) => scoreOf(job) >= 75).length;
  const selectedResumeName = resumes.find((resume) => resume.id === selectedResume)?.fileName ?? resumes.find((resume) => resume.id === selectedResume)?.file_name;

  return (
    <div className="space-y-6 pb-10">
      <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="jh-eyebrow"><Sparkles size={13} /> Role discovery</p>
          <h1 className="jh-title mt-3">Job Matches</h1>
          <p className="jh-subtitle mt-3">A dedicated workspace for opportunities ranked by evidence in your resume—not by generic health.</p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900/60 px-2.5 py-1 text-[11px] text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> SageMaker embeddings when EMBEDDING_PROVIDER=aws — mock only on fallback
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowFilters((value) => !value)} className="jh-button-ghost"><SlidersHorizontal size={14} /> Preferences</button>
          <button onClick={() => runRecommendations(true)} disabled={refreshing || !selectedResume} className="jh-button-accent"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh matches</button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="jh-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Matches shown</p><p className="mt-2 text-2xl font-semibold text-white">{visibleJobs.length}</p><p className="mt-1 text-[10px] text-slate-600">minimum fit {prefs.minScore}%</p></div>
        <div className="jh-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Strong matches</p><p className="mt-2 text-2xl font-semibold text-emerald-200">{topMatches}</p><p className="mt-1 text-[10px] text-slate-600">75% fit or higher</p></div>
        <div className="jh-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Resume source</p><p className="mt-2 truncate text-sm font-semibold text-white">{selectedResumeName || 'No resume selected'}</p><p className="mt-1 text-[10px] text-slate-600">change it in filters</p></div>
      </section>

      {showFilters && (
        <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold text-stone-300"><Filter size={14} className="text-amber-300" /> Search profile</div><button onClick={() => setShowFilters(false)} className="rounded-lg p-1.5 text-stone-500 hover:bg-white/5 hover:text-white"><X size={14} /></button></div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div><label className="text-[10px] font-medium text-slate-600">Resume</label><select value={selectedResume} onChange={(event) => setSelectedResume(event.target.value)} className="jh-input mt-1.5">{resumes.map((resume) => <option key={resume.id} value={resume.id} className="bg-[#0d1019]">{resume.fileName ?? resume.file_name ?? resume.id.slice(0, 8)}</option>)}</select></div>
            <div><label className="text-[10px] font-medium text-slate-600">Target role</label><input value={prefs.targetRole} onChange={(event) => setPrefs((current) => ({ ...current, targetRole: event.target.value }))} className="jh-input mt-1.5" placeholder="e.g. Backend Engineer" /></div>
            <div><label className="text-[10px] font-medium text-slate-600">Location</label><input value={prefs.location} onChange={(event) => setPrefs((current) => ({ ...current, location: event.target.value }))} className="jh-input mt-1.5" placeholder="India, Bengaluru, Remote" /></div>
            <div><label className="text-[10px] font-medium text-slate-600">Minimum fit score</label><input type="number" min={0} max={100} value={prefs.minScore} onChange={(event) => setPrefs((current) => ({ ...current, minScore: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} className="jh-input mt-1.5" /></div>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.055] pt-4"><p className="text-[10px] leading-4 text-slate-600">Target role drives provider retrieval. Resume evidence + semantic alignment drive ranking. Soft skills are not stuffed into the search query.</p><button onClick={() => runRecommendations(false)} className="jh-button-primary"><Search size={14} /> Apply & rerun</button></div>
        </section>
      )}

      {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4 text-xs text-rose-200">{error}</div>}

      {loading ? (
        <div className="flex min-h-[45vh] items-center justify-center gap-2 text-sm text-slate-500"><Loader2 size={18} className="animate-spin" /> Ranking opportunities for this resume…</div>
      ) : resumes.length === 0 ? (
        <div className="mx-auto max-w-xl rounded-3xl border border-white/[0.07] bg-white/[0.025] px-6 py-12 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-400/10 text-amber-300"><Briefcase size={23} /></span>
          <h2 className="mt-4 text-lg font-semibold text-white">Analyze a resume first</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">JobHunter needs a parsed resume profile before it can retrieve and rank relevant roles.</p>
          <Link to="/app/ats" className="jh-button-primary mt-5">Go to Resume Health <ChevronRight size={14} /></Link>
        </div>
      ) : visibleJobs.length === 0 ? (
        <div className="mx-auto max-w-xl rounded-3xl border border-white/[0.07] bg-white/[0.025] px-6 py-12 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-stone-800 text-stone-500"><Search size={23} /></span>
          <h2 className="mt-4 text-lg font-semibold text-white">No matches above your threshold</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Lower the minimum fit score, broaden the target role/location, or refresh the provider cache.</p>
          <button onClick={() => setShowFilters(true)} className="jh-button-ghost mt-5">Adjust preferences</button>
        </div>
      ) : (
        <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="jh-surface-strong p-3 xl:max-h-[calc(100vh-150px)] xl:overflow-y-auto jh-scrollbar">
            <div className="sticky top-0 z-10 mb-2 flex items-center justify-between rounded-xl bg-[#10131f]/95 px-2 py-2 backdrop-blur"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Ranked opportunities</p><span className="text-[10px] text-slate-700">best fit first</span></div>
            <div className="space-y-2.5">{visibleJobs.map((job, index) => <JobCard key={String(job.id ?? job.jobId ?? `${job.title}-${job.company}-${index}`)} job={job} active={index === selectedIndex} onSelect={() => setSelectedIndex(index)} />)}</div>
          </div>

          <div className="jh-surface-strong min-w-0 p-5 md:p-6 xl:sticky xl:top-8 xl:self-start">
            {selected ? <JobDetail job={selected} /> : <div className="py-20 text-center text-sm text-slate-600">Select a job to inspect its match report.</div>}
          </div>
        </section>
      )}
    </div>
  );
}
