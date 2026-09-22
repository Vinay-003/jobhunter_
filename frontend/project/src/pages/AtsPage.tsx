import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import {
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle,
  FileText,
  Gauge,
  Loader2,
  Lock,
  FileSearch,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';

type Mode = 'resume' | 'match';
type TargetLevel = 'entry' | 'mid' | 'senior';

const modes = [
  {
    id: 'resume' as const,
    eyebrow: 'No job description',
    title: 'Resume Health',
    description: 'A rule-based 100-point review of ATS readability, impact, bullet quality, skills evidence, completeness, and writing.',
    icon: FileSearch,
    accent: 'amber',
    tags: ['No AI similarity', 'Detailed report', 'Priority fixes'],
  },
  {
    id: 'match' as const,
    eyebrow: 'For a specific role',
    title: 'Tailored Match',
    description: 'Keep your Resume Health score separate, then compare your evidence, required skills, responsibilities, and seniority to one JD.',
    icon: Briefcase,
    accent: 'amber',
    tags: ['JD-specific', 'Semantic evidence', 'Missing skills'],
  },
];

function FileDropzone({
  file,
  loading,
  onFile,
}: {
  file: File | null;
  loading: boolean;
  onFile: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const validate = (next: File | null) => {
    if (!next) return onFile(null);
    if (next.type !== 'application/pdf' && !next.name.toLowerCase().endsWith('.pdf')) return;
    onFile(next);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (loading) return;
    validate(event.dataTransfer.files?.[0] ?? null);
  };

  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`relative overflow-hidden rounded-2xl border border-dashed p-6 transition sm:p-8 ${dragging ? 'border-amber-400/40 bg-amber-400/10' : file ? 'border-emerald-400/25 bg-emerald-400/[0.035]' : 'border-stone-700 bg-stone-900/50 hover:border-amber-400/40 hover:bg-amber-400/[0.06]'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        disabled={loading}
        onChange={(event: ChangeEvent<HTMLInputElement>) => validate(event.target.files?.[0] ?? null)}
      />
      <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative flex flex-col items-center text-center">
        <span className={`grid h-14 w-14 place-items-center rounded-2xl border ${file ? 'border-emerald-400/20 bg-emerald-400/[0.08] text-emerald-300' : 'border-stone-700 bg-stone-800 text-amber-300'}`}>
          {file ? <CheckCircle size={24} /> : <UploadCloud size={24} />}
        </span>
        <p className="mt-4 text-sm font-semibold text-stone-100">{file ? file.name : 'Drop your resume here'}</p>
        <p className="mt-1 max-w-md text-xs leading-5 text-stone-500">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB • ready to analyze` : 'PDF only, up to 5 MB. Text-based PDFs give the most reliable structural analysis.'}</p>
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="pointer-events-auto mt-4 rounded-xl border border-stone-700 bg-stone-800 px-4 py-2 text-xs font-medium text-stone-300 transition hover:bg-stone-700 hover:text-stone-100"
        >
          {file ? 'Choose another file' : 'Browse PDF'}
        </button>
        {file && (
          <button
            type="button"
            disabled={loading}
            onClick={() => onFile(null)}
            className="pointer-events-auto absolute right-0 top-0 rounded-lg p-1.5 text-stone-600 transition hover:bg-white/5 hover:text-stone-300"
            aria-label="Remove selected file"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function AtsPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('resume');
  const [file, setFile] = useState<File | null>(null);
  const [targetLevel, setTargetLevel] = useState<TargetLevel>('entry');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFile = (next: File | null) => {
    if (next && next.size > 5 * 1024 * 1024) {
      setError('That PDF is larger than 5 MB. Choose a smaller file.');
      setFile(null);
      return;
    }
    setError('');
    setFile(next);
  };

  const analyze = async () => {
    if (!file) return setError('Choose a PDF resume first.');
    if (mode === 'match' && jobDescription.trim().length < 20) return setError('Paste the job description you want to match against.');

    setLoading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('resume', file);
      form.append('targetLevel', targetLevel);

      const upload = await api.post('/resumes', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      const resumeId = (upload.data as any)?.resume?.id ?? (upload.data as any)?.id;
      if (!resumeId) throw new Error('Upload succeeded but no resume id was returned.');

      // Cold local model load (venv SentenceTransformer) can take 60-120s on first
      // request; SageMaker cold starts can also exceed the 60s default. Give these
      // calls their own longer timeout instead of raising the global one.
      const response = mode === 'resume'
        ? await api.post('/analyses/readiness', { resumeId, targetLevel }, { timeout: 120000 })
        : await api.post('/analyses/jd-match', { resumeId, jobDescription, targetLevel }, { timeout: 260000 });

      const data = response.data as any;
      if (!data?.analysisId) throw new Error('Analysis completed but no report id was returned.');

      navigate(`/app/analysis/${data.analysisId}`, {
        state: {
          initialAnalysis: data,
          fileName: file.name,
          mode,
          createdAt: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 pb-10">
      <section className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <p className="jh-eyebrow"><Sparkles size={13} /> Resume intelligence</p>
          <h1 className="jh-title mt-3">Know what is holding your resume back.</h1>
          <p className="jh-subtitle mt-3">Start with document quality. Add a job description only when you want role-specific matching. We keep those two signals separate so the score stays interpretable.</p>
        </div>
        <div className="flex max-w-xl gap-3 rounded-2xl border border-stone-800 bg-stone-900/60 p-3 text-xs text-stone-500">
          <ShieldCheck className="mt-0.5 shrink-0 text-amber-300" size={17} />
          <span>Your no-JD report is deterministic and rule-based. AWS embeddings are used only for tailored matching and job relevance, never to invent a generic resume score.</span>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {modes.map((item) => {
          const active = mode === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => { setMode(item.id); setError(''); }}
              className={`relative overflow-hidden rounded-2xl border p-5 text-left transition md:p-6 ${active ? 'border-amber-400/30 bg-amber-400/[0.07]' : 'border-stone-800 bg-stone-900/60 hover:border-stone-700 hover:bg-stone-900'}`}
            >
              <div className="absolute right-[-55px] top-[-55px] h-40 w-40 rounded-full blur-3xl bg-amber-500/10" />
              <div className="relative flex items-start gap-4">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${active ? 'border-amber-400/20 bg-amber-400/10 text-amber-300' : 'border-stone-700 bg-stone-800 text-stone-500'}`}>
                  <Icon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-600">{item.eyebrow}</p>
                      <h2 className="mt-1 text-lg font-semibold tracking-[-0.02em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>{item.title}</h2>
                    </div>
                    <span className={`grid h-6 w-6 place-items-center rounded-full border ${active ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-stone-700 text-transparent'}`}><Check size={13} /></span>
                  </div>
                  <p className="mt-2 max-w-xl text-xs leading-5 text-stone-500">{item.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.tags.map((tag) => <span key={tag} className="jh-chip">{tag}</span>)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
        <div className="jh-surface-strong p-5 md:p-6">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-stone-100">Upload and analyze</p>
              <p className="mt-1 text-xs text-stone-500">Your report opens as a dedicated diagnostic page after processing.</p>
            </div>
            <span className="hidden rounded-full border border-stone-800 bg-stone-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-stone-600 sm:inline-flex">Step 1 of 1</span>
          </div>

          <FileDropzone file={file} loading={loading} onFile={handleFile} />

          <div className="mt-5 grid gap-4 md:grid-cols-[.65fr_1.35fr]">
            <div>
              <label className="text-[11px] font-medium text-stone-500">Career level</label>
              <select value={targetLevel} onChange={(event) => setTargetLevel(event.target.value as TargetLevel)} className="jh-input mt-2">
                <option value="entry" className="bg-stone-950">Entry / early career</option>
                <option value="mid" className="bg-stone-950">Mid-level</option>
                <option value="senior" className="bg-stone-950">Senior</option>
              </select>
              <p className="mt-1.5 text-[10px] leading-4 text-stone-600">Used only to adapt reasonable depth/length expectations—not to award points for being senior.</p>
            </div>

            {mode === 'match' ? (
              <div>
                <div className="flex items-center justify-between gap-3">
                  <label className="text-[11px] font-medium text-stone-500">Job description</label>
                  <span className="text-[10px] text-stone-600">{jobDescription.length.toLocaleString()} chars</span>
                </div>
                <textarea
                  value={jobDescription}
                  onChange={(event) => setJobDescription(event.target.value)}
                  rows={8}
                  maxLength={20000}
                  placeholder="Paste the complete job description here…"
                  className="jh-input mt-2 min-h-[170px] resize-y leading-5"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-stone-800 bg-stone-950 p-4">
                <p className="text-[11px] font-medium text-stone-400">What the report checks</p>
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-stone-500 sm:grid-cols-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">
                  {['ATS parseability', 'Core completeness', 'Impact & metrics', 'Experience / projects', 'Skills evidence', 'Bullet writing', 'Concision', 'Consistency'].map((label) => (
                    <span key={label} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400/70" />{label}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {error && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">{error}</div>}

          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-stone-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2 text-[11px] text-stone-500"><Lock size={13} /> Private resume storage through your existing Supabase setup</span>
            <button onClick={analyze} disabled={loading || !file} className="jh-button-primary min-w-[170px]">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Analyzing…</> : <>{mode === 'match' ? 'Analyze + match' : 'Build my report'} <ArrowRight size={15} /></>}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="jh-surface p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><Gauge size={18} /></span>
              <div><p className="text-sm font-semibold text-stone-100">A score you can explain</p><p className="text-[11px] text-stone-600">Every point maps to a visible check.</p></div>
            </div>
            <div className="mt-5 space-y-3">
              {[['20', 'Parseability & ATS structure'], ['20', 'Impact & measurable evidence'], ['15', 'Completeness'], ['15', 'Experience / project quality'], ['10', 'Skills clarity & evidence'], ['10', 'Writing & bullet quality'], ['5', 'Concision'], ['5', 'Consistency']].map(([points, label]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-stone-800 pb-2.5 last:border-0 last:pb-0">
                  <span className="text-xs text-stone-500">{label}</span>
                  <span className="text-xs font-semibold text-stone-300">{points} pts</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-5">
            <FileText size={18} className="text-amber-300" />
            <p className="mt-3 text-sm font-semibold text-stone-100">Why this is different</p>
            <p className="mt-1.5 text-xs leading-5 text-stone-500">A generic report should diagnose document quality, not guess whether your resume fits a job that was never provided. Tailored Match handles relevance separately.</p>
          </div>
        </aside>
      </section>
    </div>
  );
}
