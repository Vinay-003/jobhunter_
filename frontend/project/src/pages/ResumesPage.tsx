// src/pages/ResumesPage.tsx — Warm Ink + Amber
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import { Loader2, FileText, Trash2 } from 'lucide-react';

interface Resume {
  id: number;
  fileName?: string;
  file_name?: string;
  uploadDate?: string;
  upload_date?: string;
  status?: string;
  analysisData?: unknown;
}

export default function ResumesPage() {
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/resumes').catch(() => api.get('/latest-resume').catch(() => null));
      if (!res) throw new Error('No resumes endpoint');
      const data = res.data as { resumes?: Resume[]; resume?: Resume };
      if (data.resumes) setResumes(data.resumes);
      else if (data.resume) setResumes([data.resume]);
      else setResumes([]);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      if (msg.includes('404')) setResumes([]);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this resume?')) return;
    setDeleting(id);
    try {
      await api.delete(`/resumes/${id}`).catch(() => api.delete(`/resume/${id}`));
      setResumes((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      alert(getApiErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-sm text-stone-500">
        <Loader2 className="animate-spin" size={18} /> Loading resumes…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>Resumes</h1>
          <p className="text-sm text-stone-500">Your uploaded PDFs. Select one to re-analyze.</p>
        </div>
        <Link to="/app/ats" className="text-sm bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold px-4 py-1.5 rounded-lg transition">
          Upload new
        </Link>
      </div>

      {error && <div className="text-sm text-amber-200 bg-amber-400/10 border border-amber-400/20 rounded-lg p-3">{error}</div>}

      {resumes.length === 0 ? (
        <div className="text-center py-12 text-sm text-stone-500">No resumes yet.</div>
      ) : (
        <div className="grid gap-3">
          {resumes.map((r) => {
            const name = r.fileName ?? r.file_name ?? `Resume #${r.id}`;
            const date = r.uploadDate ?? r.upload_date;
            return (
              <div key={r.id} className="flex items-center justify-between gap-4 rounded-xl border border-stone-800 bg-stone-900/60 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-amber-400/10 border border-amber-400/15 flex items-center justify-center shrink-0">
                    <FileText size={16} className="text-amber-300" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-100 truncate">{name}</p>
                    <p className="text-xs text-stone-500">
                      {date ? new Date(date).toLocaleString() : ''} {r.status ? `• ${r.status}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link to={`/app/analysis/${r.id}`} className="text-xs border border-stone-800 bg-stone-900 rounded-lg px-3 py-1.5 text-stone-300 hover:bg-stone-800 hover:text-stone-100 transition">
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="text-xs text-amber-300 hover:text-amber-200 border border-amber-400/20 bg-amber-400/10 hover:bg-amber-400/15 rounded-lg px-3 py-1.5 flex items-center gap-1 disabled:opacity-50 transition"
                  >
                    {deleting === r.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
