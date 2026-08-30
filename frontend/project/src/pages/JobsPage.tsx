// src/pages/JobsPage.tsx - no dangerouslySetInnerHTML, safe text rendering
import { useEffect, useState } from 'react';
import api, { getApiErrorMessage } from '../lib/api';
import { Loader2, MapPin, DollarSign, Clock, Briefcase, RefreshCw, ExternalLink } from 'lucide-react';

interface Job {
  title: string;
  company?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  type?: string;
  link?: string;
  updated?: string;
  matchScore?: number;
  matchLevel?: string;
  semanticSimilarity?: number;
  seniorityPenalty?: number;
  jobLevel?: string;
  recommendationReasons?: string[];
  fitScore?: number;
  breakdown?: { label: string; value: number }[];
  confidence?: string;
  matchedSkills?: string[];
  missingSkills?: string[];
  evidence?: string[];
}

function safeText(s: string): string {
  // Strip HTML tags and decode common entities without using dangerouslySetInnerHTML
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [resumes, setResumes] = useState<{ id: string; fileName: string }[]>([]);
  const [selectedResume, setSelectedResume] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [prefs, setPrefs] = useState({ location: 'India', keywords: 'Backend Engineer', days_posted: 30, min_match_score: 40 });
  const [showPrefs, setShowPrefs] = useState(false);

  const fetchResumes = async () => {
    try {
      const res = await api.get('/resumes');
      const data = res.data as { resumes?: { id: string; fileName: string }[] };
      const list = data.resumes ?? [];
      setResumes(list);
      if (list.length && !selectedResume) setSelectedResume(list[0].id);
    } catch {}
  };

  const fetchJobs = async () => {
    if (!selectedResume) {
      setError('Select a resume first (upload at ATS Check)');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/recommendation-runs', {
        resumeId: selectedResume,
        targetRoles: prefs.keywords ? [prefs.keywords] : ['Backend Engineer'],
        locations: prefs.location ? [prefs.location] : ['India'],
        workModes: ['remote', 'hybrid'],
      });
      const data = res.data as { recommendations?: Job[]; results?: Job[] };
      // V2 returns { recommendations: [{ fitScore, breakdown, confidence, ... }] }
      const recs = (data.recommendations ?? data.results ?? []) as Job[];
      // map V2 shape to UI shape if needed
      const mapped = recs.map((j: any) => ({
        ...j,
        title: j.title ?? j.jobTitle,
        company: j.company,
        location: j.location,
        snippet: j.snippet ?? j.description,
        link: j.link ?? j.url,
        fitScore: j.fitScore ?? j.matchScore,
        confidence: j.confidence ?? j.matchLevel,
        breakdown: j.breakdown ? Object.entries(j.breakdown).map(([k, v]) => ({ label: k, value: v as number })) : j.breakdown,
      }));
      setJobs(mapped);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError('');
    try {
      if (!selectedResume) {
        setError('Select a resume first');
        return;
      }
      await fetchJobs();
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchResumes();
  }, []);

  useEffect(() => {
    if (selectedResume) fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedResume]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Job Matches</h1>
          <p className="text-sm text-gray-500 mt-1">Fit score + breakdown + evidence. All descriptions are safely escaped.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPrefs((v) => !v)} className="text-sm border border-white/10 rounded-lg px-3 py-1.5 hover:bg-white/5">
            Preferences
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="text-sm bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
        <label className="text-xs text-gray-400">Resume</label>
        {resumes.length === 0 ? (
          <p className="text-sm text-gray-500 mt-1">No resumes found. Upload at ATS Check first.</p>
        ) : (
          <select
            value={selectedResume}
            onChange={(e) => setSelectedResume(e.target.value)}
            className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
          >
            {resumes.map((r) => (
              <option key={r.id} value={r.id} className="bg-black">
                {r.fileName} — {r.id.slice(0, 8)}
              </option>
            ))}
          </select>
        )}
      </div>

      {showPrefs && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400">Location</label>
            <input
              value={prefs.location}
              onChange={(e) => setPrefs((p) => ({ ...p, location: e.target.value }))}
              placeholder="Remote, New York"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Keywords</label>
            <input
              value={prefs.keywords}
              onChange={(e) => setPrefs((p) => ({ ...p, keywords: e.target.value }))}
              placeholder="React, Python"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Days posted</label>
            <input
              type="number"
              value={prefs.days_posted}
              onChange={(e) => setPrefs((p) => ({ ...p, days_posted: parseInt(e.target.value) || 30 }))}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Min match score</label>
            <input
              type="number"
              value={prefs.min_match_score}
              onChange={(e) => setPrefs((p) => ({ ...p, min_match_score: parseInt(e.target.value) || 0 }))}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <button onClick={fetchJobs} className="w-full bg-white text-black rounded-lg py-2 text-sm font-medium">
              Apply
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-sm text-gray-400">
          <Loader2 className="animate-spin" size={18} /> Loading recommendations…
        </div>
      ) : error ? (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-500">No recommendations yet. Upload and analyze a resume first.</div>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job, idx) => (
            <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
              <div className="flex justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-white">{job.title}</h3>
                  <p className="text-sm text-gray-400">{job.company ?? 'Unknown company'}</p>
                </div>
                {(job.matchScore ?? job.fitScore) !== undefined && (
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-red-400">{job.matchScore ?? job.fitScore}%</p>
                    <p className="text-xs text-gray-500">{job.matchLevel ?? job.confidence ?? 'Match'}</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {job.location}
                  </span>
                )}
                {job.salary && job.salary !== 'Not specified' && (
                  <span className="flex items-center gap-1">
                    <DollarSign size={12} /> {job.salary}
                  </span>
                )}
                {job.updated && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} /> {new Date(job.updated).toLocaleDateString()}
                  </span>
                )}
                {job.type && (
                  <span className="flex items-center gap-1">
                    <Briefcase size={12} /> {job.type}
                  </span>
                )}
              </div>

              {job.snippet && (
                <div className="mt-3 bg-black/30 border border-white/5 rounded-lg p-3">
                  <p className="text-xs font-medium text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{safeText(job.snippet)}</p>
                </div>
              )}

              {(job.breakdown || job.semanticSimilarity !== undefined) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {job.breakdown?.map((b, i) => (
                    <span key={i} className="text-xs bg-black/30 border border-white/5 rounded-full px-2 py-1">
                      {b.label}: {b.value}
                    </span>
                  ))}
                  {job.semanticSimilarity !== undefined && (
                    <span className="text-xs bg-black/30 border border-white/5 rounded-full px-2 py-1">AI {job.semanticSimilarity}%</span>
                  )}
                  {job.jobLevel && <span className="text-xs bg-black/30 border border-white/5 rounded-full px-2 py-1">{job.jobLevel}</span>}
                </div>
              )}

              {job.recommendationReasons && job.recommendationReasons.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-400">Why matched</p>
                  <ul className="text-xs text-gray-500 list-disc list-inside">
                    {job.recommendationReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 grid sm:grid-cols-2 gap-3 text-xs">
                {job.matchedSkills && job.matchedSkills.length > 0 && (
                  <div>
                    <p className="font-medium text-green-400">Matched skills</p>
                    <p className="text-gray-400">{job.matchedSkills.join(', ')}</p>
                  </div>
                )}
                {job.missingSkills && job.missingSkills.length > 0 && (
                  <div>
                    <p className="font-medium text-red-400">Missing skills</p>
                    <p className="text-gray-400">{job.missingSkills.join(', ')}</p>
                  </div>
                )}
              </div>

              {job.evidence && job.evidence.length > 0 && (
                <div className="mt-3 text-xs">
                  <p className="font-medium text-gray-400">Evidence</p>
                  <ul className="text-gray-500 list-disc list-inside">
                    {job.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {job.link && (
                <a
                  href={job.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg"
                >
                  View job <ExternalLink size={14} />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
