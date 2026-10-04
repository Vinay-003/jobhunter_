// src/pages/ResumeViewPage.tsx — opens ONE resume by its id (PLAN Issue 2):
// shows its latest report when analyzed, otherwise a resume card with
// Download + Analyze actions. Never surfaces raw backend messages like
// "Analysis not found" for a resume id.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import AnalysisPage, { viewModelFromAnalysisRow } from './AnalysisPage';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  FileSearch,
  FileText,
  Loader2,
  Sparkles,
} from 'lucide-react';

type ResumeDetail = {
  id: string;
  fileName?: string;
  uploadDate?: string;
  status?: string;
  sha256?: string;
  pageCount?: number;
};

function ResumeViewSkeleton() {
  return (
    <div className="space-y-6 pb-12" aria-busy="true" aria-label="Loading resume">
      <div className="flex flex-wrap items-center justify-between gap-3 animate-pulse">
        <div className="h-7 w-36 rounded-lg bg-stone-800/70" />
        <div className="h-7 w-44 rounded-lg bg-stone-800/70" />
      </div>
      <div className="rounded-3xl border border-stone-800 bg-[#1C1917]/90 p-5 md:p-7 animate-pulse">
        <div className="h-3.5 w-40 rounded bg-stone-800/70" />
        <div className="mt-4 h-7 w-72 max-w-full rounded bg-stone-800/70" />
        <div className="mt-4 h-3.5 w-full max-w-xl rounded bg-stone-800/50" />
        <div className="mt-2.5 h-3.5 w-2/3 rounded bg-stone-800/50" />
        <div className="mt-6 flex gap-2">
          <div className="h-7 w-28 rounded-full bg-stone-800/60" />
          <div className="h-7 w-32 rounded-full bg-stone-800/60" />
          <div className="h-7 w-40 rounded-full bg-stone-800/60" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-32 rounded-2xl border border-stone-800 bg-stone-900/60 animate-pulse" />
        <div className="h-32 rounded-2xl border border-stone-800 bg-stone-900/60 animate-pulse" />
      </div>
    </div>
  );
}

function ResumeContextBar({
  resume,
  onDownload,
  downloading,
}: {
  resume: ResumeDetail;
  onDownload: () => void;
  downloading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link to="/app/resumes" className="jh-button-ghost"><ArrowLeft size={14} /> All resumes</Link>
      <div className="flex flex-wrap items-center gap-2">
        <span className="jh-chip min-w-0 max-w-full" title={resume.sha256 ? `sha256 ${resume.sha256.slice(0, 12)}…` : undefined}>
          <FileText size={12} className="mr-1" />
           <span className="min-w-0 break-words">{resume.fileName || 'resume'}</span>{typeof resume.pageCount === 'number' ? ` • ${resume.pageCount} page${resume.pageCount === 1 ? '' : 's'}` : ''}
        </span>
        <button onClick={onDownload} disabled={downloading} className="jh-button-ghost disabled:opacity-50">
          {downloading ? <><Loader2 size={14} className="animate-spin" /> Preparing…</> : <><Download size={14} /> Download PDF</>}
        </button>
        <Link to={`/app/ats?resumeId=${resume.id}`} className="jh-button-primary">
          <Sparkles size={14} /> Re-analyze
        </Link>
      </div>
    </div>
  );
}

export default function ResumeViewPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [analysisRow, setAnalysisRow] = useState<unknown | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setMissing(false);
      try {
        const [resumeRes, analysisRes] = await Promise.all([
          api.get(`/resumes/${id}`),
          api.get('/analyses', { params: { resumeId: id, latest: 'true' } }),
        ]);
        if (cancelled) return;
        const r = (resumeRes.data as { resume?: ResumeDetail })?.resume;
        if (!r) { setMissing(true); return; }
        setResume({
          id: String(r.id ?? id),
          fileName: r.fileName,
          uploadDate: r.uploadDate,
          status: r.status,
          sha256: r.sha256,
          pageCount: r.pageCount,
        });
        const rows = (analysisRes.data as { analyses?: unknown[] })?.analyses ?? [];
        setAnalysisRow(rows[0] ?? null);
      } catch (err) {
        if (cancelled) return;
        const status = (err as { status?: number })?.status;
        if (status === 404) setMissing(true);
        else setError(getApiErrorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const download = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      const res = await api.get(`/resumes/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = resume?.fileName || 'resume.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      alert(status === 404
        ? 'The stored file for this resume could not be found — re-upload it to restore downloads.'
        : getApiErrorMessage(err));
    } finally {
      setDownloading(false);
    }
  };

  if (loading) return <ResumeViewSkeleton />;

  if (missing) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Link to="/app/resumes" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Back to resumes</Link>
        <div className="mt-5 rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-5">
          <p className="text-sm font-semibold text-amber-100">Resume not found</p>
          <p className="mt-1.5 text-sm leading-6 text-amber-200/70">
            This resume doesn’t exist any more — it may have been deleted from another session.
          </p>
          <Link to="/app/resumes" className="jh-button-ghost mt-4">Back to your resumes</Link>
        </div>
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <Link to="/app/resumes" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft size={15} /> Back to resumes</Link>
        <div className="mt-5 rounded-2xl border border-rose-400/15 bg-rose-400/[0.05] p-4 text-sm text-rose-200">{error || 'This resume could not be loaded.'}</div>
      </div>
    );
  }

  // Analyzed resume → render its latest report in place (resume id stays in the URL).
  if (analysisRow) {
    return (
      <div className="space-y-6 pb-4">
        <ResumeContextBar resume={resume} onDownload={download} downloading={downloading} />
        <AnalysisPage initialView={viewModelFromAnalysisRow(analysisRow, resume.fileName)} />
      </div>
    );
  }

  // No analysis yet → resume card with clear next actions (no dead-end 404).
  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link to="/app/resumes" className="jh-button-ghost"><ArrowLeft size={14} /> All resumes</Link>
        <span className="jh-chip"><FileSearch size={12} className="mr-1" /> Not analyzed yet</span>
      </div>

      <section className="relative overflow-hidden rounded-3xl border border-stone-800 bg-[#1C1917]/90 p-5 shadow-2xl shadow-black/20 md:p-7">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="relative">
          <p className="jh-eyebrow"><Sparkles size={13} /> Saved resume</p>
           <h1 className="mt-3 min-w-0 break-words text-2xl font-semibold tracking-[-0.035em] text-white md:text-3xl">{resume.fileName || 'Your resume'}</h1>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {resume.uploadDate && <span className="jh-chip">Uploaded {new Date(resume.uploadDate).toLocaleString()}</span>}
            {resume.status && <span className="jh-chip">{resume.status}</span>}
            {typeof resume.pageCount === 'number' && <span className="jh-chip">{resume.pageCount} page{resume.pageCount === 1 ? '' : 's'}</span>}
            {resume.sha256 && <span className="jh-chip" title={`sha256 ${resume.sha256}`}>sha256 {resume.sha256.slice(0, 12)}…</span>}
          </div>
          <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-400">
            This resume hasn’t been analyzed yet. Run Resume Health to get the 100-point report — it uses this stored file, so there’s nothing to re-upload.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to={`/app/ats?resumeId=${resume.id}`} className="jh-button-primary">
              Analyze this resume <ArrowRight size={15} />
            </Link>
            <button onClick={download} disabled={downloading} className="jh-button-ghost disabled:opacity-50">
              {downloading ? <><Loader2 size={14} className="animate-spin" /> Preparing…</> : <><Download size={14} /> Download PDF</>}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
