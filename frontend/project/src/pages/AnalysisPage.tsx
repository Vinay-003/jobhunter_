// src/pages/AnalysisPage.tsx
import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import { Loader2, ArrowLeft } from 'lucide-react';

interface AnalysisData {
  score?: number;
  statusMessage?: string;
  level?: string;
  categories?: { name: string; score: number; max?: number; reasons?: string[] }[];
  rules?: { label?: string; status?: string; message?: string }[];
  strengths?: string[];
  warnings?: string[];
  insights?: string[];
  recommendations?: string[];
  jdMatch?: {
    score?: number;
    confidence?: string;
    matchedSkills?: string[];
    missingSkills?: string[];
    evidence?: string[];
    breakdown?: { label: string; value: number }[];
  };
  extractedInfo?: unknown;
}

export default function AnalysisPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<AnalysisData | null>(null);
  const [meta, setMeta] = useState<{ fileName?: string; uploadDate?: string } | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        // V2: GET /analyses/:id (analysisId, not resumeId)
        const analysisRes = await api.get(`/analyses/${id}`);
        const d = analysisRes.data as { analysis?: any; readiness?: any } & Record<string, unknown>;
        const analysis = (d as { analysis?: AnalysisData }).analysis ?? d;
        // V2 shape: analysis.score_breakdown_json, evidence_json, readiness_score
        // Try to map to UI shape
        const mapped: AnalysisData = {
          score: (analysis as any).readiness_score ?? (analysis as any).readiness?.score ?? (analysis as any).score,
          statusMessage: (analysis as any).evidence_json?.rules ? 'V2 Analysis' : undefined,
          categories: (analysis as any).score_breakdown_json?.map((b: any) => ({ name: b.category, score: b.pointsAwarded, max: b.pointsPossible })) ?? (analysis as any).breakdown,
          rules: (analysis as any).evidence_json?.rules ?? (analysis as any).rules,
          strengths: (analysis as any).evidence_json?.strengths ?? (analysis as any).strengths,
          warnings: (analysis as any).evidence_json?.warnings ?? (analysis as any).warnings,
          insights: (analysis as any).evidence_json?.strengths,
          recommendations: (analysis as any).evidence_json?.warnings,
        };
        // Try to fetch resume meta if analysis has resume_id
        const resumeId = (analysis as any).resume_id;
        if (resumeId) {
          try {
            const r = await api.get(`/resumes/${resumeId}`);
            const resume = (r.data as { resume?: { fileName?: string; uploadDate?: string } })?.resume;
            if (resume) setMeta({ fileName: resume.fileName, uploadDate: resume.uploadDate });
          } catch {}
        }
        if (mapped.score !== undefined || mapped.categories) setData(mapped);
        else setData(analysis as AnalysisData);
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
        <Loader2 className="animate-spin" size={18} /> Loading analysis…
      </div>
    );
  }
  if (error) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <Link to="/app/ats" className="text-sm text-red-400 flex items-center gap-1">
          <ArrowLeft size={16} /> Back to ATS
        </Link>
        <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>
      </div>
    );
  }
  if (!data) return <div className="text-sm text-gray-500 py-12 text-center">No analysis found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link to="/app/ats" className="text-sm text-gray-400 hover:text-white flex items-center gap-1">
        <ArrowLeft size={16} /> Back to ATS
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Analysis #{id}</h1>
        {meta?.fileName && <p className="text-sm text-gray-500">{meta.fileName} • {meta.uploadDate ? new Date(meta.uploadDate).toLocaleString() : ''}</p>}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5 text-center">
          <p className="text-xs tracking-widest text-gray-500">ATS SCORE</p>
          <p className="text-4xl font-bold text-red-400 mt-2">{data.score ?? '—'}</p>
          <p className="text-sm text-gray-400 mt-2">{data.statusMessage ?? data.level ?? ''}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <p className="text-xs font-semibold text-gray-300 mb-2">Summary</p>
          <ul className="text-xs text-gray-400 space-y-1">
            {(data.insights ?? data.strengths ?? []).slice(0, 5).map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </div>
      </div>

      {data.categories && data.categories.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <p className="text-sm font-semibold mb-3">Readiness breakdown</p>
          <div className="space-y-2">
            {data.categories.map((c, i) => (
              <div key={i} className="flex justify-between text-sm bg-black/30 rounded-lg p-3 border border-white/5">
                <span className="text-gray-300">{c.name}</span>
                <span className="text-red-400">{c.score}/{c.max ?? 100}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.rules && data.rules.length > 0 && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <p className="text-sm font-semibold mb-3">Rules</p>
          <ul className="text-sm text-gray-300 space-y-1">
            {data.rules.map((r, i) => (
              <li key={i} className="text-xs">
                <span className="font-medium">{r.label ?? ''}</span> — {r.message ?? ''} <span className="text-gray-500">({r.status})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-green-950/10 border border-green-900/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-green-400 mb-2">Strengths</p>
          <ul className="text-xs text-gray-300 space-y-1">
            {(data.strengths ?? data.insights ?? []).map((s, i) => (
              <li key={i}>• {s}</li>
            ))}
          </ul>
        </div>
        <div className="bg-yellow-950/10 border border-yellow-900/20 rounded-xl p-4">
          <p className="text-xs font-semibold text-yellow-400 mb-2">Warnings</p>
          <ul className="text-xs text-gray-300 space-y-1">
            {(data.warnings ?? data.recommendations ?? []).map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      </div>

      {data.jdMatch && (
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
          <p className="text-sm font-semibold mb-3">JD Match</p>
          <p className="text-sm">Score: <span className="text-red-400 font-bold">{data.jdMatch.score ?? '—'}</span> • Confidence: {data.jdMatch.confidence ?? '—'}</p>
          {data.jdMatch.breakdown && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {data.jdMatch.breakdown.map((b, i) => (
                <span key={i} className="text-xs bg-black/30 border border-white/5 rounded-full px-2 py-1">
                  {b.label}: {b.value}
                </span>
              ))}
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3 mt-3 text-xs">
            <div>
              <p className="font-medium text-green-400">Matched</p>
              <p className="text-gray-400">{(data.jdMatch.matchedSkills ?? []).join(', ') || '—'}</p>
            </div>
            <div>
              <p className="font-medium text-red-400">Missing</p>
              <p className="text-gray-400">{(data.jdMatch.missingSkills ?? []).join(', ') || '—'}</p>
            </div>
          </div>
          {data.jdMatch.evidence && data.jdMatch.evidence.length > 0 && (
            <div className="mt-3 text-xs text-gray-500">
              <p className="font-medium text-gray-300">Evidence</p>
              <ul className="list-disc list-inside">
                {data.jdMatch.evidence.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
