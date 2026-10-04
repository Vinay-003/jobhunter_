/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import { displayValue, safeText } from '../lib/display';
import { buildMatchReport } from '../lib/matchReport';
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
  Copy,
} from 'lucide-react';

type BreakdownItem = { label: string; value: number };
type ScoreDetails = {
  relevanceScore?: number;
  seniorityPenalty?: number;
  candidateSeniority?: string | null;
  jobSeniority?: string | null;
  semanticStatus?: 'embedded' | 'keyword-only';
  scoreCap?: number | null;
  scoreCapReasons?: string[];
  skillEvidence?: Array<{ skill: string; source: 'demonstrated' | 'declared' | 'unverified' }>;
  responsibilityMatches?: Array<{ responsibility: string; evidence: string | null; similarity?: number; rawCosine?: number; supported?: boolean }>;
  components?: Array<{ key?: string; label?: string; points?: number; maxPoints?: number; reason?: string }>;
};

type Job = {
  id?: string | number;
  jobId?: string | number;
  title: string;
  company?: string;
  location?: string;
  snippet?: string;
  description?: string;
  descriptionQuality?: 'full' | 'snippet' | 'unknown';
  source?: string;
  salary?: unknown;
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
  eligibility?: { status: string; reasons?: string[] };
  workMode?: string;
  postedAt?: string;
  scoreDetails?: ScoreDetails | null;
  availability?: { status: 'open' | 'closed' | 'unknown'; checkedAt?: string | null; reason?: string; source?: string };
  updatedAt?: string; firstSeenAt?: string; lastFetchedAt?: string; dateSource?: string; foundByTitles?: string[];
};

type Resume = { id: string; fileName?: string; file_name?: string };
type SavedPreferences = {
  target_roles?: string[]; targetRoles?: string[]; locations?: string[];
  work_modes?: string[]; workModes?: string[];
};
type RawRecommendation = Partial<Job> & {
  job_id?: string | number; jobTitle?: string; job_title?: string;
  companyName?: string; company_name?: string; fit_score?: number;
  relevanceScore?: number; breakdown_json?: Record<string, number>;
  matched_skills?: string[]; skillMatches?: string[];
  missing_skills?: string[]; skillGaps?: string[];
  matchEvidence?: string[]; work_mode?: string; posted_at?: string;
  reasons?: string[];
  breakdown?: BreakdownItem[] | Record<string, number>;
  scoreDetails?: ScoreDetails | null;
};
type RecommendationResponse = {
  recommendations?: RawRecommendation[]; results?: RawRecommendation[];
  runId?: string; nextOffset?: number | null; returnedCount?: number;
  sources?: Array<{ provider?: unknown; status?: unknown; cacheHit?: unknown; fetchedCount?: unknown; fallbackReason?: unknown; errorCode?: unknown; location?: unknown; page?: unknown }>;
  rejectedReasons?: Record<string, number>;
  roleDiscovery?: any; queries?: any[]; timings?: any;
};

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
  const candidate = job.fitScore ?? job.matchScore ?? 0;
  const raw = typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// Backend category point ceilings (ranking.ts breakdown). Used to render
// value/max bars instead of mistaking small point values for fractions.
const BREAKDOWN_MAX: Record<string, number> = {
  requiredSkill: 30,
  responsibilitySemantic: 25,
  roleTitle: 15,
  seniority: 15,
  domainEducation: 10,
  location: 5,
};

function mapRecommendation(raw: RawRecommendation): Job {
  const breakdown = raw?.breakdown && !Array.isArray(raw.breakdown)
    ? Object.entries(raw.breakdown).filter((entry): entry is [string, number] => typeof entry[1] === 'number').map(([label, value]) => ({ label, value }))
    : raw?.breakdown;

  return {
    ...raw,
    id: raw.jobId ?? raw.job_id ?? raw.id,
    title: raw.title ?? raw.jobTitle ?? raw.job_title ?? 'Untitled role',
    company: raw.company ?? raw.companyName ?? raw.company_name,
    location: raw.location,
    snippet: raw.snippet ?? raw.description,
    link: raw.link ?? raw.url,
    fitScore: raw.fitScore ?? raw.fit_score ?? raw.matchScore ?? raw.relevanceScore,
    confidence: raw.confidence ?? raw.matchLevel,
     breakdown: breakdown ?? (raw.breakdown_json ? Object.entries(raw.breakdown_json).map(([label, value]) => ({ label, value: Number(value) })) : []),
    matchedSkills: raw.matchedSkills ?? raw.matched_skills ?? raw.skillMatches,
    missingSkills: raw.missingSkills ?? raw.missing_skills ?? raw.skillGaps,
    evidence: raw.evidence ?? raw.matchEvidence,
    eligibility: raw.eligibility,
    workMode: raw.workMode ?? raw.work_mode,
    postedAt: raw.postedAt ?? raw.posted_at,
    recommendationReasons: raw.recommendationReasons ?? raw.reasons,
    scoreDetails: raw.scoreDetails ?? null,
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
               <h3 className="truncate text-sm font-semibold text-white">{displayValue(job.title)}</h3>
               <p className="mt-0.5 truncate text-xs text-slate-500">{displayValue(job.company) || 'Company not listed'}</p>
            </div>
            <div className={`shrink-0 rounded-xl border px-2.5 py-1.5 text-center ${tone.border} ${tone.bg}`}>
              <p className={`text-base font-semibold leading-none ${tone.text}`}>{score}/100</p>
              <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-slate-600">fit</p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10px] text-slate-600">
             {job.location && <span className="flex items-center gap-1"><MapPin size={11} /> {displayValue(job.location)}</span>}
             {displayValue(job.jobLevel) && <span className="flex items-center gap-1"><Briefcase size={11} /> {displayValue(job.jobLevel)}</span>}
            {displayValue(job.confidence) && <span className="flex items-center gap-1"><Target size={11} /> {displayValue(job.confidence)} confidence</span>}
             {job.eligibility && <span>{job.eligibility.status === 'eligible' ? 'No confirmed barrier' : job.eligibility.status === 'uncertain' ? 'Qualifications unverified' : 'Eligibility barrier'}</span>}
             {job.availability && <span className={job.availability.status === 'open' ? 'text-emerald-300' : job.availability.status === 'closed' ? 'text-rose-300' : 'text-amber-300'}>{job.availability.status}</span>}
          </div>

          {!!job.matchedSkills?.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {job.matchedSkills.slice(0, 4).map((skill) => <span key={displayValue(skill)} className="rounded-full border border-emerald-400/10 bg-emerald-400/[0.035] px-2 py-0.5 text-[9px] font-medium text-emerald-100/65">{displayValue(skill)}</span>)}
              {job.matchedSkills.length > 4 && <span className="rounded-full border border-white/[0.055] px-2 py-0.5 text-[9px] text-slate-600">+{job.matchedSkills.length - 4}</span>}
            </div>
          )}
        </div>
        <ChevronRight size={15} className={`mt-3 shrink-0 ${active ? 'text-amber-300' : 'text-slate-700'}`} />
      </div>
    </button>
  );
}

function JobDetail({ job, onRecheck, onReportClosed, checking }: { job: Job; onRecheck?:()=>void; onReportClosed?:()=>void; checking?:boolean }) {
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
             <h2 className="text-xl font-semibold tracking-[-0.03em] text-white">{displayValue(job.title)}</h2>
             <p className="mt-1 text-sm text-slate-500">{displayValue(job.company) || 'Company not listed'}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-600">
               {job.location && <span className="jh-chip"><MapPin size={11} className="mr-1" />{displayValue(job.location)}</span>}
              {displayValue(job.type) && <span className="jh-chip">{displayValue(job.type)}</span>}
              {displayValue(job.workMode) && <span className="jh-chip">{displayValue(job.workMode)}</span>}
              {displayValue(job.salary) && displayValue(job.salary) !== 'Not specified' && <span className="jh-chip break-words">{displayValue(job.salary)}</span>}
            </div>
          </div>
        </div>

        <div className={`self-start rounded-2xl border px-4 py-3 text-center ${tone.border} ${tone.bg}`}>
          <p className={`text-3xl font-semibold tracking-[-0.05em] ${tone.text}`}>{score}/100</p>
          <p className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-600">fit score</p>
        </div>
      </div>

      {breakdown.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold text-slate-300">Why it scored this way</p><span className="text-[10px] text-slate-600">transparent breakdown</span></div>
          <div className="grid gap-2 sm:grid-cols-2">
            {breakdown.slice(0, 8).map((item, index) => {
              // Backend sends raw points per category (skill 30 / semantic 25 /
              // role 15 / seniority 15 / domain 10 / location 5). Never treat
              // small point values as 0-1 fractions (roleTitle=1 showed as 100).
              const max = BREAKDOWN_MAX[item.label] ?? 100;
              const shown = Math.round(item.value);
              const pct = max > 0 ? Math.max(4, Math.min(100, (shown / max) * 100)) : 4;
              return (
                <div key={`${item.label}-${index}`} className="rounded-xl border border-white/[0.055] bg-black/10 p-3">
                  <div className="flex items-center justify-between gap-3"><span className="truncate text-[10px] capitalize text-slate-500">{item.label.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}</span><span className="text-[11px] font-semibold text-slate-300">{shown}<span className="text-slate-600">/{max}</span></span></div>
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.055]"><div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {job.scoreDetails && (job.scoreDetails.seniorityPenalty !== undefined || job.scoreDetails.scoreCap !== null && job.scoreDetails.scoreCap !== undefined || job.scoreDetails.scoreCapReasons?.length || job.scoreDetails.semanticStatus === 'keyword-only') && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.04] p-4">
          <p className="text-[11px] font-semibold text-amber-200">Scoring safeguards</p>
          <div className="mt-2 space-y-1 text-[11px] leading-5 text-stone-500">
            {job.scoreDetails.seniorityPenalty !== undefined && job.scoreDetails.seniorityPenalty !== 0 ? <p>Seniority adjustment: −{job.scoreDetails.seniorityPenalty} points ({displayValue(job.scoreDetails.candidateSeniority) || 'unknown'} candidate → {displayValue(job.scoreDetails.jobSeniority) || 'unknown'} role).</p> : null}
            {job.scoreDetails.scoreCap !== null && job.scoreDetails.scoreCap !== undefined ? <p>Score capped at {job.scoreDetails.scoreCap}/100.</p> : null}
            {job.scoreDetails.scoreCapReasons?.length ? <p>Cap reasons: {job.scoreDetails.scoreCapReasons.map(displayValue).join('; ')}</p> : null}
            {job.scoreDetails.semanticStatus === 'keyword-only' ? <p>Semantic model unavailable; this fit score uses limited keyword evidence.</p> : null}
          </div>
        </div>
      )}

      {job.scoreDetails?.skillEvidence?.length ? <div className="rounded-xl border border-white/[0.055] bg-black/10 p-4"><p className="text-[11px] font-semibold text-slate-300">Skill evidence</p><div className="mt-2 space-y-1 text-[11px] text-slate-500">{job.scoreDetails.skillEvidence.map((item, index) => <p key={`${displayValue(item.skill)}-${index}`}><span className="text-slate-300">{displayValue(item.skill)}</span>: {displayValue(item.source) || 'unavailable'}</p>)}</div></div> : null}
      {job.scoreDetails?.responsibilityMatches?.length ? <div className="rounded-xl border border-white/[0.055] bg-black/10 p-4"><p className="text-[11px] font-semibold text-slate-300">Responsibility evidence</p><div className="mt-2 space-y-2 text-[11px] text-slate-500">{job.scoreDetails.responsibilityMatches.map((item, index) => <p key={`${displayValue(item.responsibility)}-${index}`}><span className="text-slate-300">{displayValue(item.responsibility)}</span>: {item.supported === undefined ? 'support unavailable' : item.supported ? 'supported' : 'not supported'}{item.evidence ? ` — ${displayValue(item.evidence)}` : ''}{typeof item.rawCosine === 'number' ? ` (raw cosine ${item.rawCosine.toFixed(2)})` : typeof item.similarity === 'number' ? ` (similarity ${item.similarity.toFixed(2)})` : ''}</p>)}</div></div> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.03] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-emerald-200"><Check size={13} /> Matched skills</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.matchedSkills?.length ? job.matchedSkills.map((skill) => <span key={displayValue(skill)} className="rounded-full border border-emerald-400/10 bg-emerald-400/[0.04] px-2 py-1 text-[9px] text-emerald-100/70">{displayValue(skill)}</span>) : <span className="text-[10px] text-slate-600">No explicit matched-skill list returned.</span>}
          </div>
        </div>
        <div className="rounded-xl border border-rose-400/10 bg-rose-400/[0.03] p-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold text-rose-200"><AlertCircle size={13} /> Skill gaps</div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {job.missingSkills?.length ? job.missingSkills.map((skill) => <span key={displayValue(skill)} className="rounded-full border border-rose-400/10 bg-rose-400/[0.04] px-2 py-1 text-[9px] text-rose-100/70">{displayValue(skill)}</span>) : <span className="text-[10px] text-slate-600">No explicit required-skill gaps returned.</span>}
          </div>
        </div>
      </div>

      {(reasons.length > 0 || job.evidence?.length) && (
        <div className="rounded-xl border border-amber-400/15 bg-amber-400/[0.06] p-4">
          <p className="text-[11px] font-semibold text-amber-200">Why this job surfaced</p>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-5 text-stone-500">
             {[...reasons, ...(job.evidence ?? [])].slice(0, 6).map((reason, index) => <li key={index} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-300/70" /><span>{displayValue(reason)}</span></li>)}
          </ul>
        </div>
      )}
      <p className="text-xs text-amber-200">Qualification status: {job.eligibility?.status === 'eligible' ? 'No explicit barrier detected; verify the full posting and work authorization.' : job.eligibility?.status === 'uncertain' ? `Unverified — ${job.eligibility.reasons?.join('; ') || 'check the full posting'}` : job.eligibility?.status === 'ineligible' ? `Known barrier — ${job.eligibility.reasons?.join('; ')}` : 'Not evaluated for this historical result.'}</p>
      {job.availability && <p className="text-xs text-amber-200">Availability: {job.availability.status}{job.availability.reason ? ` — ${displayValue(job.availability.reason)}` : ''}. Checked: {job.availability.checkedAt ? new Date(job.availability.checkedAt).toLocaleString() : 'not checked'}. Status may change; recheck before applying.</p>}

      {description && (
        <div>
          <p className="text-xs font-semibold text-slate-300">{job.descriptionQuality === 'snippet' ? 'API-provided job snippet' : 'Provider job description'}</p>
          <p className="mt-1 text-[11px] text-stone-500">{job.source ? `Source: ${displayValue(job.source)}. ` : ''}{job.descriptionQuality === 'snippet' ? 'This is only an excerpt; omitted requirements cannot be verified.' : 'Provider-supplied text, not independent verification of the original posting.'} This text is retained with the recommendation.</p>
          <p className="mt-2 text-xs leading-6 text-slate-500">{description}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-5">
          {onRecheck&&<button onClick={onRecheck} disabled={checking} className="jh-button-ghost">{checking?'Checking…':'Check current availability'}</button>}
          {onReportClosed&&job.availability?.status!=='closed'&&<button onClick={onReportClosed} disabled={checking} className="jh-button-ghost">Report expired / closed</button>}
          {external && job.availability?.status !== 'closed' ? <a href={external} target="_blank" rel="noopener noreferrer" className="jh-button-primary">View original job <ArrowUpRight size={14} /></a> : <span className="text-xs text-slate-600">{job.availability?.status === 'closed' ? 'Closed posting — link disabled' : 'Original job link unavailable'}</span>}
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
  const [runId, setRunId] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [sources, setSources] = useState<NonNullable<RecommendationResponse['sources']>>([]);
  const [rejectedReasons, setRejectedReasons] = useState<Record<string, number>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [checkingAvailability,setCheckingAvailability]=useState(false);
  const requestSequence = useRef(0);
  const activeRequest = useRef<AbortController | null>(null);
  const [showFilters, setShowFilters] = useState(true);
  const [prefs, setPrefs] = useState({ targetRole: '', location: 'India', minScore: 40, workMode: '', keywords: '', daysPosted: '7' });
  const [targetRoles, setTargetRoles] = useState<string[]>([]);
  const [roleDiscovery, setRoleDiscovery] = useState<any>(null);
  const [roleDiscoveryError, setRoleDiscoveryError] = useState('');
  const [lastRunDiagnostics, setLastRunDiagnostics] = useState<any>({});
  const [sortBy, setSortBy] = useState<'match' | 'newest'>('match');
  const [includeUnknownDates, setIncludeUnknownDates] = useState(false);
  const [verifiedOpenOnly, setVerifiedOpenOnly] = useState(false);
  const [includeUnknownLocations,setIncludeUnknownLocations]=useState(false);
  const discoverySequence = useRef(0);
  const manualRoles = useRef(false);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [resumeResponse, profileResponse] = await Promise.all([
          api.get('/resumes'),
          api.get('/profile/job-preferences').catch(() => ({ data: {} })),
        ]);
         const list = (resumeResponse.data as { resumes?: Resume[] })?.resumes ?? [];
        setResumes(list);
        if (list.length) setSelectedResume((value) => value || list[0].id);

         const profile = profileResponse.data as { preferences?: SavedPreferences; profile?: { preferences?: SavedPreferences } };
         const preferences = profile?.preferences ?? profile?.profile?.preferences;
        const roles = preferences?.target_roles ?? preferences?.targetRoles;
        const locations = preferences?.locations;
         setPrefs((current) => ({
          ...current,
           targetRole: current.targetRole || roles?.[0] || '',
            location: locations?.[0] || current.location || 'India',
          workMode: (preferences?.work_modes ?? preferences?.workModes ?? []).join(','),
         }));
         if (roles?.length) { setTargetRoles(roles.slice(0, 3)); manualRoles.current=true; }
      } catch {
        // The empty state below explains what the user needs to do.
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedResume) return;
    const sequence = ++discoverySequence.current;
    const sequenceRef=discoverySequence;
    const controller = new AbortController();
    setDiscovering(true);setRoleDiscovery(null);setJobs([]);setRunId(null);setNextOffset(null);setTotal(0);
    if (!manualRoles.current) setTargetRoles([]);
    setRoleDiscoveryError('');
    void api.post('/recommendation-runs/roles', { resumeId: selectedResume }, { timeout: 90000, signal:controller.signal })
      .then(({ data }) => { if (sequence === discoverySequence.current && data?.roleDiscovery) { setRoleDiscovery(data.roleDiscovery); if(!manualRoles.current) setTargetRoles((data.roleDiscovery.roles ?? []).slice(0, 3).map((r: any) => r.title)); if(data.roleDiscovery.warning)setRoleDiscoveryError(data.roleDiscovery.warning); } })
      .catch(() => { if (sequence === discoverySequence.current&&!controller.signal.aborted) { setRoleDiscovery(null); setRoleDiscoveryError('Role suggestions are unavailable right now. Add up to three roles manually; no search has been submitted.'); } })
      .finally(()=>{if(sequence===discoverySequence.current)setDiscovering(false);});
    return ()=>{controller.abort();sequenceRef.current=sequence+1;};
  }, [selectedResume]);

  const runRecommendations = async (isRefresh = false) => {
    if (!selectedResume) return setError('Choose a resume before generating matches.');
    if (discovering) return;
    if (!prefs.location.trim()) return setError('Choose a location explicitly (for example India); remote is not a country.');
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const sequence = ++requestSequence.current;
    setJobs([]); setRunId(null); setNextOffset(null); setTotal(0); setSelectedIndex(0); setSources([]); setRejectedReasons({});
    setError('');
     if (isRefresh) setRefreshing(true);
     else setLoading(true);
    try {
      const payload = {
        resumeId: selectedResume,
         targetRoles: targetRoles.slice(0, 3).filter(Boolean),
         locations: prefs.location.split(';').map(s=>s.trim()).filter(Boolean),
        workModes: prefs.workMode.split(',').map((value) => value.trim()).filter(Boolean),
          daysPosted: prefs.daysPosted ? Number(prefs.daysPosted) : null,
          sortBy, includeUnknownDates, verifiedOpenOnly, includeUnknownLocations,
        ...(prefs.keywords.trim() ? { keywords: prefs.keywords.trim() } : {}),
        ...(isRefresh ? { forceRefresh: true, idempotencyKey: crypto.randomUUID() } : {}),
      };
      // Local model loads ~90s cold; SageMaker cold starts can also exceed 60s.
      const response = await api.post('/recommendation-runs', payload, { timeout: 260000, signal: controller.signal });
      if (sequence !== requestSequence.current) return;
       const result = response.data as RecommendationResponse;
       const raw = result?.recommendations ?? result?.results ?? [];
      const mapped = raw.map(mapRecommendation);
      setJobs(mapped);
        setRunId(result?.runId ?? null);
        if (result?.roleDiscovery) setRoleDiscovery(result.roleDiscovery);
         setLastRunDiagnostics({ ...result, resumeFileName:selectedResumeName });
       setNextOffset(result?.nextOffset ?? null);
       setTotal(result?.returnedCount ?? mapped.length); setSources(result?.sources ?? []); setRejectedReasons(result?.rejectedReasons ?? {});
      setSelectedIndex(0);
    } catch (err) {
      if (sequence === requestSequence.current && !controller.signal.aborted) setError(getApiErrorMessage(err));
    } finally {
      if (sequence === requestSequence.current) { setLoading(false); setRefreshing(false); activeRequest.current = null; }
    }
  };

  const loadMore = async () => {
    if (!runId || nextOffset === null || loadingMore) return;
    const sequence = requestSequence.current;
    const expectedRun = runId;
    const expectedOffset = nextOffset;
    setLoadingMore(true);
    try {
      const response = await api.get(`/recommendation-runs/${expectedRun}/results`, { params: { offset: expectedOffset, limit: 20 } });
      if (sequence !== requestSequence.current) return;
       const result = response.data as RecommendationResponse;
       setJobs((current) => [...current, ...(result.results ?? []).map(mapRecommendation)]);
       setNextOffset(result.nextOffset ?? null);
    } catch (err) { if (sequence === requestSequence.current) setError(getApiErrorMessage(err)); }
    finally { if (sequence === requestSequence.current) setLoadingMore(false); }
  };

  useEffect(() => {
    const sequence = requestSequence.current;
    const requestRef = activeRequest;
    const sequenceRef = requestSequence;
    return () => { requestRef.current?.abort(); if (sequenceRef.current === sequence) sequenceRef.current++; };
    // Run when the user switches the resume; filter changes are applied explicitly.
  }, [selectedResume]);

  const visibleJobs = useMemo(() => jobs.filter((job) => scoreOf(job) >= prefs.minScore), [jobs, prefs.minScore]);
  const selected = visibleJobs[Math.min(selectedIndex, Math.max(0, visibleJobs.length - 1))];
  const topMatches = visibleJobs.filter((job) => scoreOf(job) >= 75).length;
  const selectedResumeName = resumes.find((resume) => resume.id === selectedResume)?.fileName ?? resumes.find((resume) => resume.id === selectedResume)?.file_name;
  const copyMatches = async () => {
    try { await navigator.clipboard.writeText(buildMatchReport({ jobs: visibleJobs, resumeFileName:lastRunDiagnostics.resumeFileName || selectedResumeName, runId, run: lastRunDiagnostics, roleDiscovery:lastRunDiagnostics.roleDiscovery, scope: 'loaded', total, filteredCount: visibleJobs.length })); }
    catch { setError('Could not copy the report. Allow clipboard access and try again.'); }
  };
  const recheckAvailability=async()=>{
    if(!runId||!selected)return;
    const id=selected.id??selected.jobId,sequence=requestSequence.current;
    setCheckingAvailability(true);
    try{const response=await api.post(`/recommendation-runs/${runId}/jobs/${id}/availability`,{}, {timeout:15000});if(sequence===requestSequence.current)setJobs(current=>current.map(j=>(j.id??j.jobId)===id?{...j,availability:response.data.availability}:j));}
    catch{setError('Availability check failed; do not assume the posting is open.');}finally{setCheckingAvailability(false);}
  };
  const reportClosed=async()=>{
    if(!runId||!selected||!window.confirm('Have you confirmed that the original posting is expired or closed? This hides it from your searches for 24 hours.'))return;
    const id=selected.id??selected.jobId,sequence=requestSequence.current;
    try{const response=await api.post(`/recommendation-runs/${runId}/jobs/${id}/report-closed`);if(sequence===requestSequence.current)setJobs(current=>current.map(j=>(j.id??j.jobId)===id?{...j,availability:response.data.availability}:j));}
    catch{setError('Could not save the closure report.');}
  };

  return (
    <div className="min-w-0 space-y-6 pb-10 [overflow-wrap:anywhere]">
      <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="jh-eyebrow"><Sparkles size={13} /> Role discovery</p>
          <h1 className="jh-title mt-3">Job Matches</h1>
          <p className="jh-subtitle mt-3">A dedicated workspace for opportunities ranked by evidence in your resume—not by generic health.</p>
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-stone-700 bg-stone-900/60 px-2.5 py-1 text-[11px] text-stone-500">
             <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> {jobs[0]?.scoreDetails?.semanticStatus === 'embedded' ? 'Semantic evidence enabled' : jobs[0]?.scoreDetails?.semanticStatus === 'keyword-only' ? 'Keyword-only evidence' : 'Evidence status unavailable'}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowFilters((value) => !value)} className="jh-button-ghost"><SlidersHorizontal size={14} /> Preferences</button>
          <button onClick={() => runRecommendations(true)} disabled={refreshing || loading || discovering || !selectedResume} className="jh-button-accent"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh matches</button>
        </div>
      </section>

      <section className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3 [&>div]:min-w-0">
        <div className="jh-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Matches shown</p><p className="mt-2 text-2xl font-semibold text-white">{visibleJobs.length}</p><p className="mt-1 text-[10px] text-slate-600">{jobs.length} loaded of {total} stored; minimum fit {prefs.minScore}%</p></div>
        <div className="jh-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Strong matches</p><p className="mt-2 text-2xl font-semibold text-emerald-200">{topMatches}</p><p className="mt-1 text-[10px] text-slate-600">75% fit or higher</p></div>
        <div className="jh-surface p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">Resume source</p><p className="mt-2 truncate text-sm font-semibold text-white">{selectedResumeName || 'No resume selected'}</p><p className="mt-1 text-[10px] text-slate-600">change it in filters</p></div>
      </section>

      {showFilters && (
        <section className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.04] p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 text-xs font-semibold text-stone-300"><Filter size={14} className="text-amber-300" /> Search profile</div><button onClick={() => setShowFilters(false)} className="rounded-lg p-1.5 text-stone-500 hover:bg-white/5 hover:text-white"><X size={14} /></button></div>
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4 [&>div]:min-w-0">
            <div><label className="text-[10px] font-medium text-slate-600">Resume</label><select value={selectedResume} onChange={(event) => setSelectedResume(event.target.value)} className="jh-input mt-1.5">{resumes.map((resume) => <option key={resume.id} value={resume.id} className="bg-[#0d1019]">{resume.fileName ?? resume.file_name ?? resume.id.slice(0, 8)}</option>)}</select></div>
              <div className="md:col-span-2"><label className="text-[10px] font-medium text-slate-600">Target roles (up to 3)</label>
                {discovering && <p role="status" className="text-xs text-amber-300">Reading professional evidence to suggest roles…</p>}
                <div className="mt-1.5 space-y-2">{targetRoles.map((role,index)=><div key={index} className="flex gap-2"><input aria-label={`Target role ${index+1}`} maxLength={80} value={role} onChange={event=>{manualRoles.current=true;setTargetRoles(current=>current.map((item,i)=>i===index?event.target.value:item));}} className="jh-input" /><button aria-label={`Remove role ${index+1}`} onClick={()=>{manualRoles.current=true;setTargetRoles(current=>current.filter((_,i)=>i!==index));}}>×</button></div>)}</div>
                {targetRoles.length<3&&<button onClick={()=>{manualRoles.current=true;setTargetRoles(current=>[...current,'']);}} className="text-xs text-amber-300">+ Add role</button>}
                {roleDiscovery?.roles?.length>0&&<><button className="ml-3 text-xs text-amber-300" onClick={()=>{manualRoles.current=false;setTargetRoles(roleDiscovery.roles.map((r:any)=>r.title));}}>Use suggested roles</button><p className="mt-2 text-xs">Suggestions: {roleDiscovery.source} · {roleDiscovery.model || 'deterministic fallback'}</p>{roleDiscovery.roles.map((role:any)=><details key={role.title} className="mt-2 text-xs text-slate-400"><summary>{role.title}: {role.reason}</summary><p className="mt-1 whitespace-pre-wrap">{role.evidence.join('\n')}</p></details>)}</>}
                {roleDiscoveryError&&<p className="mt-2 text-xs text-amber-300">{roleDiscoveryError}</p>}
              </div>
            <div><label className="text-[10px] font-medium text-slate-600">Location</label><input value={prefs.location} onChange={(event) => setPrefs((current) => ({ ...current, location: event.target.value }))} className="jh-input mt-1.5" placeholder="India, Bengaluru, Remote" /></div>
            <div><label className="text-[10px] font-medium text-slate-600">Minimum fit score</label><input type="number" min={0} max={100} value={prefs.minScore} onChange={(event) => setPrefs((current) => ({ ...current, minScore: Math.max(0, Math.min(100, Number(event.target.value) || 0)) }))} className="jh-input mt-1.5" /></div>
            <div><label className="text-[10px] font-medium text-slate-600">Work mode (comma-separated)</label><input value={prefs.workMode} onChange={(event) => setPrefs((current) => ({ ...current, workMode: event.target.value }))} className="jh-input mt-1.5" placeholder="remote,hybrid" /></div>
            <div><label className="text-[10px] font-medium text-slate-600">Keywords in job text</label><input value={prefs.keywords} onChange={(event) => setPrefs((current) => ({ ...current, keywords: event.target.value }))} className="jh-input mt-1.5" /></div>
              <div><label className="text-[10px] font-medium text-slate-600">Freshness</label><select aria-label="Freshness" value={prefs.daysPosted || 'any'} onChange={(event) => setPrefs((current) => ({ ...current, daysPosted: event.target.value === 'any' ? '' : event.target.value }))} className="jh-input mt-1.5"><option value="1">24 hours</option><option value="3">3 days</option><option value="7">7 days</option><option value="30">30 days</option><option value="any">Any date</option></select></div>
             <div><label className="text-[10px] font-medium text-slate-600">Sort</label><select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'match' | 'newest')} className="jh-input mt-1.5"><option value="match">Best match</option><option value="newest">Newest</option></select></div>
          </div>
           <div className="mt-4 flex flex-wrap gap-4 border-t border-white/[0.055] pt-4 text-[10px] text-slate-500"><label><input type="checkbox" checked={includeUnknownDates} onChange={(e) => setIncludeUnknownDates(e.target.checked)} /> Include unknown dates</label><label><input type="checkbox" checked={verifiedOpenOnly} onChange={(e) => setVerifiedOpenOnly(e.target.checked)} /> Verified open only</label></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] leading-4 text-slate-600">Review roles and search scope before retrieving matches. Fit scores are evidence summaries, not hiring probabilities.</p><button onClick={() => runRecommendations(false)} className="jh-button-primary"><Search size={14} /> Find matches</button></div>
        </section>
      )}

      {error && <div className="rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4 text-xs text-rose-200">{error}</div>}
      {showFilters&&<label className="block text-xs text-slate-400"><input type="checkbox" checked={includeUnknownLocations} onChange={e=>setIncludeUnknownLocations(e.target.checked)}/> Include jobs with unverified applicant location (may not accept applications from your country)</label>}
      {(jobs.length > 0 || sources.length > 0 || Object.keys(rejectedReasons).length > 0) && <div className="rounded-2xl border border-white/[0.055] bg-white/[0.02] p-4 text-[11px] text-slate-500"><p className="font-semibold text-slate-300">Recommendation evidence</p>{sources.length > 0 ? <div className="mt-1 space-y-1">{sources.map((source, index) => <p key={`${displayValue(source.provider)}-${index}`} className="break-words"><span className="text-slate-300">{displayValue(source.provider) || 'Provider unavailable'}</span>: {displayValue(source.status) || 'status unavailable'} · {source.cacheHit === undefined ? 'cache unknown' : `cache ${displayValue(source.cacheHit)}`} · fetched {source.fetchedCount === undefined ? 'unknown' : displayValue(source.fetchedCount)}{displayValue(source.location) ? ` · ${displayValue(source.location)}` : ''}{displayValue(source.page) ? ` · page ${displayValue(source.page)}` : ''}{displayValue(source.fallbackReason) ? ` · fallback: ${displayValue(source.fallbackReason)}` : ''}{displayValue(source.errorCode) ? ` · error: ${displayValue(source.errorCode)}` : ''}</p>)}</div> : <p className="mt-1">Sources unavailable.</p>}{Object.keys(rejectedReasons).length > 0 && <p className="mt-1">Rejected: {Object.entries(rejectedReasons).map(([reason, count]) => `${displayValue(reason)} (${count})`).join(', ')}</p>}</div>}

      {loading || refreshing ? (
        // Ranking can run 25–50 s behind provider scrapes + embeds — show a
        // structural skeleton of the results grid, not a bare spinner (§0 rule 7).
        <div className="space-y-4" aria-busy="true" aria-label="Ranking opportunities for this resume">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 size={14} className="animate-spin" /> Ranking opportunities for this resume…</div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5 animate-pulse">
                <div className="h-3.5 w-2/5 rounded bg-stone-800/70" />
                <div className="mt-3 h-3 w-3/5 rounded bg-stone-800/50" />
                <div className="mt-2.5 h-3 w-2/5 rounded bg-stone-800/40" />
                <div className="mt-4 h-7 w-24 rounded-lg bg-stone-800/50" />
              </div>
            ))}
          </div>
        </div>
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
          <h2 className="mt-4 text-lg font-semibold text-white">{runId?'No matches above your threshold':'Review your roles and search scope'}</h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Lower the minimum fit score, broaden the target role/location, or refresh the provider cache.</p>
           <div className="mt-5 flex flex-wrap justify-center gap-2"><button onClick={() => setShowFilters(true)} className="jh-button-ghost">Adjust preferences</button>{nextOffset !== null && <button className="jh-button-ghost" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : `Load more (${jobs.length} of ${total})`}</button>}</div>
        </div>
      ) : (
        <section className="grid min-w-0 grid-cols-1 gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="jh-surface-strong min-w-0 p-3 xl:max-h-[calc(100vh-150px)] xl:overflow-y-auto jh-scrollbar">
             <div className="sticky top-0 z-10 mb-2 flex items-center justify-between rounded-xl bg-[#10131f]/95 px-2 py-2 backdrop-blur"><p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600">Ranked opportunities</p><button onClick={copyMatches} className="flex items-center gap-1 text-[10px] text-amber-300 hover:text-amber-200" title="Copy match report as Markdown"><Copy size={12} /> Copy report</button></div>
            <div className="space-y-2.5">{visibleJobs.map((job, index) => <JobCard key={String(job.id ?? job.jobId ?? `${job.title}-${job.company}-${index}`)} job={job} active={index === selectedIndex} onSelect={() => setSelectedIndex(index)} />)}</div>
            {nextOffset !== null && <button className="jh-button-ghost mt-4 w-full" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : `Load more (${jobs.length} of ${total})`}</button>}
          </div>

          <div className="jh-surface-strong min-w-0 p-5 md:p-6 xl:sticky xl:top-8 xl:self-start">
            {selected ? <JobDetail job={selected} onRecheck={recheckAvailability} onReportClosed={reportClosed} checking={checkingAvailability} /> : <div className="py-20 text-center text-sm text-slate-600">Select a job to inspect its match report.</div>}
          </div>
        </section>
      )}
    </div>
  );
}
