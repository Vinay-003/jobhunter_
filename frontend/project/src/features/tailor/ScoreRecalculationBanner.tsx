import React from 'react';
import { TrendingUp, Sparkles, FileText, Download, CheckCircle2 } from 'lucide-react';
import type { ScoreBreakdown, ScoreDelta } from '../../lib/tailorApi';

export interface ScoreRecalculationBannerProps {
  previousScores: ScoreBreakdown;
  updatedScores: ScoreBreakdown;
  scoreDelta: ScoreDelta;
  pdfUrl?: string;
  downloadUrl?: string;
  onPreviewPdf?: () => void;
}

export const ScoreRecalculationBanner: React.FC<ScoreRecalculationBannerProps> = ({
  previousScores,
  updatedScores,
  scoreDelta,
  pdfUrl,
  downloadUrl,
  onPreviewPdf,
}) => {
  const atsPositive = scoreDelta.atsDelta >= 0;
  const semanticPositive = scoreDelta.semanticDelta >= 0;

  const downloadHref = downloadUrl || pdfUrl;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-950/30 via-stone-900 to-amber-950/20 p-5 shadow-lg animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Title & Status */}
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles size={20} className="fill-emerald-400" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">
                Resume Tailored & Re-Scored in Real Time
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/30">
                <CheckCircle2 size={11} />
                Live Delta
              </span>
            </div>
            <p className="mt-0.5 text-xs text-stone-400">
              Your edits were compiled into a clean ATS PDF and re-evaluated with deterministic rubrics.
            </p>
          </div>
        </div>

        {/* Action Buttons: Preview & Download */}
        <div className="flex items-center gap-2 shrink-0">
          {onPreviewPdf && pdfUrl && (
            <button
              type="button"
              onClick={onPreviewPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-100 bg-stone-800 hover:bg-stone-700 border border-stone-700 shadow-sm transition-all"
            >
              <FileText size={14} className="text-amber-400" />
              <span>Preview Tailored PDF</span>
            </button>
          )}

          {downloadHref && (
            <a
              href={downloadHref}
              download="tailored_resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-stone-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-sm transition-all"
            >
              <Download size={14} />
              <span>Download PDF</span>
            </a>
          )}
        </div>
      </div>

      {/* Score Comparison Grid */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 pt-4 border-t border-white/5">
        {/* ATS Readiness Delta */}
        <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/60 p-3.5">
          <div>
            <div className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">
              ATS Readiness
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-stone-500 line-through text-sm">
                {previousScores.atsScore}
              </span>
              <span className="text-lg font-bold text-white">
                {updatedScores.atsScore}
              </span>
              <span className="text-xs text-stone-500">/ 100</span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
              atsPositive
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                : 'bg-stone-800 text-stone-400'
            }`}
          >
            <TrendingUp size={13} />
            <span>{atsPositive ? `+${scoreDelta.atsDelta} pts` : `${scoreDelta.atsDelta} pts`}</span>
          </div>
        </div>

        {/* Semantic Job Fit Delta */}
        <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-stone-950/60 p-3.5">
          <div>
            <div className="text-[11px] font-medium text-stone-400 uppercase tracking-wider">
              Semantic Job Fit
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-stone-500 line-through text-sm">
                {previousScores.semanticScore}%
              </span>
              <span className="text-lg font-bold text-amber-300">
                {updatedScores.semanticScore}%
              </span>
              <span className="text-xs text-stone-500">fit</span>
            </div>
          </div>

          <div
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold ${
              semanticPositive
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25'
                : 'bg-stone-800 text-stone-400'
            }`}
          >
            <TrendingUp size={13} />
            <span>{semanticPositive ? `+${scoreDelta.semanticDelta}%` : `${scoreDelta.semanticDelta}%`}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScoreRecalculationBanner;

