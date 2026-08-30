// src/pages/AtsPage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import { Upload, Loader2, FileText, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

type Mode = 'resume' | 'match';

interface CategoryScore {
  name?: string;
  score?: number;
  max?: number;
  reasons?: string[];
}
interface Rule {
  id?: string;
  label?: string;
  status?: 'pass' | 'fail' | 'warn';
  message?: string;
}
interface Readiness {
  score?: number;
  level?: string;
  statusMessage?: string;
  categories?: CategoryScore[];
  rules?: Rule[];
  strengths?: string[];
  warnings?: string[];
  insights?: string[];
  recommendations?: string[];
  extractedInfo?: unknown;
  // compat with old analysis shape
  status?: string;
}

export default function AtsPage() {
  const [mode, setMode] = useState<Mode>('resume');
  const [file, setFile] = useState<File | null>(null);
  const [targetLevel, setTargetLevel] = useState<'entry' | 'mid' | 'senior'>('entry');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ readiness?: Readiness; analysis?: Readiness; resume?: { id: number } } | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.type !== 'application/pdf') {
      setError('Only PDF files are allowed');
      setFile(null);
      return;
    }
    setError('');
    setFile(f);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError('Select a PDF first');
      return;
    }
    if (mode === 'match' && !jobDescription.trim()) {
      setError('Paste a job description for matching');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const form = new FormData();
      form.append('resume', file);
      form.append('targetLevel', targetLevel);

      // V2: POST /resumes
      const uploadRes = await api.post('/resumes', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const resumeId = (uploadRes.data as { resume?: { id: string } })?.resume?.id ?? (uploadRes.data as { id?: string })?.id;
      if (!resumeId) throw new Error('Upload failed: no resume id');

      // V2: POST /analyses/readiness or /analyses/jd-match
      let analysisRes;
      if (mode === 'resume') {
        analysisRes = await api.post('/analyses/readiness', { resumeId, targetLevel });
      } else {
        analysisRes = await api.post('/analyses/jd-match', { resumeId, jobDescription, targetLevel });
      }

      const data = analysisRes.data as any;
      const readiness = data.readiness ?? data.analysis ?? data.jdMatch ?? data;
      // V2 returns { readiness: { score, breakdown, rules... }, jdMatch?: { score, breakdown, responsibilityCoverage } }
      const normalized: any = {
        readiness: data.readiness ?? data.analysis ?? data,
        jdMatch: data.jdMatch,
        analysis: data.readiness ?? data.analysis,
        resume: { id: resumeId },
        raw: data,
      };
      if (data.jdMatch) {
        normalized.readiness = data.readiness;
        normalized.jdMatch = data.jdMatch;
      }
      if (typeof data.score === 'number' && !normalized.readiness?.score) normalized.readiness = data;
      setResult(normalized);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const readiness: Readiness | undefined = result?.readiness ?? result?.analysis;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ATS Check</h1>
        <p className="text-sm text-gray-400 mt-1">Check resume readiness or match it against a job description.</p>
      </div>

      <div className="inline-flex p-1 bg-white/[0.04] border border-white/5 rounded-xl">
        <button
          onClick={() => setMode('resume')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${mode === 'resume' ? 'bg-red-500 text-white' : 'text-gray-400'}`}
        >
          Resume Check
        </button>
        <button
          onClick={() => setMode('match')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium ${mode === 'match' ? 'bg-red-500 text-white' : 'text-gray-400'}`}
        >
          Match to JD
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
          <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-red-500/40 transition-colors">
            <input id="ats-file" type="file" accept="application/pdf" className="hidden" onChange={handleFile} disabled={loading} />
            <label htmlFor="ats-file" className="cursor-pointer block">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                {loading ? <Loader2 className="animate-spin text-red-400" size={20} /> : <Upload className="text-red-400" size={20} />}
              </div>
              <p className="text-sm font-medium">{file ? file.name : 'Click to select PDF'}</p>
              <p className="text-xs text-gray-500 mt-1">Max 5MB • PDF only</p>
            </label>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400">Target level</label>
              <select
                value={targetLevel}
                onChange={(e) => setTargetLevel(e.target.value as typeof targetLevel)}
                className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
              >
                <option value="entry">Entry (0–2y)</option>
                <option value="mid">Mid (2–5y)</option>
                <option value="senior">Senior (5+y)</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSubmit}
                disabled={loading || !file}
                className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-40 text-white py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {mode === 'match' ? 'Check Match' : 'Analyze Resume'}
              </button>
            </div>
          </div>

          {mode === 'match' && (
            <div>
              <label className="text-xs text-gray-400">Job description (paste)</label>
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                rows={8}
                placeholder="Paste JD here..."
                className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg p-3 text-sm"
              />
              <p className="text-[11px] text-gray-500 mt-1">We compare skills, evidence, and readiness side-by-side.</p>
            </div>
          )}

          {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        </div>

        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          {!readiness ? (
            <div className="py-12 text-center text-sm text-gray-500">
              <FileText className="mx-auto mb-2 text-gray-600" />
              Results will appear here after analysis.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs tracking-widest text-gray-500">READINESS</p>
                  <p className="text-3xl font-bold text-red-400">
                    {typeof readiness.score === 'number' ? readiness.score : '—'}
                    <span className="text-sm font-normal text-gray-500"> /100</span>
                  </p>
                  <p className="text-sm text-gray-300 mt-1">{readiness.statusMessage ?? readiness.level ?? readiness.status ?? ''}</p>
                </div>
                {result?.resume?.id && (
                  <Link to={`/app/analysis/${result.resume.id}`} className="text-xs bg-white text-black px-3 py-1.5 rounded-lg">
                    View analysis
                  </Link>
                )}
              </div>

              {readiness.categories && readiness.categories.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Category breakdown</p>
                  <div className="space-y-2">
                    {readiness.categories.map((c, i) => (
                      <div key={i} className="bg-black/30 rounded-lg p-3 border border-white/5">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{c.name ?? `Category ${i + 1}`}</span>
                          <span className="text-red-400 font-medium">{c.score ?? '—'}/{c.max ?? 100}</span>
                        </div>
                        {c.reasons && c.reasons.length > 0 && <p className="text-xs text-gray-500 mt-1">{c.reasons.join(' • ')}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {readiness.rules && readiness.rules.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-300 mb-2">Rules</p>
                  <ul className="space-y-1.5">
                    {readiness.rules.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        {r.status === 'pass' && <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />}
                        {r.status === 'warn' && <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />}
                        {r.status === 'fail' && <XCircle size={16} className="text-red-400 mt-0.5 shrink-0" />}
                        {!r.status && <span className="text-gray-500">•</span>}
                        <span className="text-gray-300">
                          <span className="font-medium">{r.label ?? r.id ?? ''}</span>
                          {r.message ? ` — ${r.message}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-green-950/10 border border-green-900/20 rounded-lg p-3">
                  <p className="text-xs font-semibold text-green-400 mb-2">Strengths</p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    {(readiness.strengths ?? readiness.insights ?? []).slice(0, 6).map((s, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-green-400">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                    {(readiness.strengths ?? readiness.insights ?? []).length === 0 && <li className="text-gray-500 italic">No strengths listed</li>}
                  </ul>
                </div>
                <div className="bg-yellow-950/10 border border-yellow-900/20 rounded-lg p-3">
                  <p className="text-xs font-semibold text-yellow-400 mb-2">Warnings</p>
                  <ul className="text-xs text-gray-300 space-y-1">
                    {(readiness.warnings ?? readiness.recommendations ?? []).slice(0, 6).map((w, i) => (
                      <li key={i} className="flex gap-1.5">
                        <span className="text-yellow-400">•</span>
                        <span>{w}</span>
                      </li>
                    ))}
                    {(readiness.warnings ?? readiness.recommendations ?? []).length === 0 && <li className="text-gray-500 italic">No warnings</li>}
                  </ul>
                </div>
              </div>

              {(result as any)?.jdMatch && (
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                  <p className="text-xs tracking-widest text-gray-500">JD MATCH</p>
                  <p className="text-3xl font-bold text-emerald-400">
                    {(result as any).jdMatch.score ?? '—'}
                    <span className="text-sm font-normal text-gray-500"> /100</span>
                    <span className="ml-2 text-xs font-normal text-gray-400">{(result as any).confidence ?? (result as any).jdMatch?.confidence ?? ''}</span>
                  </p>
                  {(result as any).jdMatch.breakdown && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {Object.entries((result as any).jdMatch.breakdown).map(([k, v]) => (
                        <span key={k} className="bg-black/30 border border-white/5 rounded-full px-2 py-1">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                  {(result as any).jdMatch.deterministic?.missingRequired?.length > 0 && (
                    <p className="text-xs text-red-400">Missing: {(result as any).jdMatch.deterministic.missingRequired.join(', ')}</p>
                  )}
                  {(result as any).jdMatch.responsibilityCoverage && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-gray-400">Responsibility coverage</p>
                      {(result as any).jdMatch.responsibilityCoverage.slice(0, 3).map((r: any, i: number) => (
                        <p key={i} className="text-xs text-gray-500">
                          • {r.responsibility?.slice(0, 80)} — <span className="text-gray-300">{Math.round(r.matchScore * 100)}%</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <Link to="/app/jobs" className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg">
                  See job matches →
                </Link>
                <Link to="/app/resumes" className="text-xs text-gray-400 hover:text-white px-3 py-1.5">
                  Manage resumes
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
