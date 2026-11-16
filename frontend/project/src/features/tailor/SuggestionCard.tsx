import React from 'react';
import { Check, X, Sparkles, Loader2, ShieldCheck, MapPin } from 'lucide-react';
import type { TailorSuggestion } from '../../lib/tailorApi';

export interface SuggestionCardProps {
  suggestion: TailorSuggestion;
  onAccept: (suggestion: TailorSuggestion) => void;
  onReject: (suggestion: TailorSuggestion) => void;
  isApplying?: boolean;
  isApplied?: boolean;
  isRejected?: boolean;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  onAccept,
  onReject,
  isApplying = false,
  isApplied = false,
  isRejected = false,
}) => {
  const formatSectionName = (sec: string) => {
    switch (sec.toLowerCase()) {
      case 'experience':
        return 'Work Experience';
      case 'projects':
        return 'Projects';
      case 'summary':
        return 'Summary / Profile';
      default:
        return sec.charAt(0).toUpperCase() + sec.slice(1);
    }
  };

  const bulletNumber = (suggestion.bulletIndex ?? 0) + 1;

  if (isRejected) {
    return (
      <div className="rounded-xl border border-stone-800/60 bg-stone-900/30 p-4 text-xs text-stone-500 opacity-60 transition-opacity">
        <div className="flex items-center justify-between">
          <span className="line-through">
            {formatSectionName(suggestion.section)} · Bullet #{bulletNumber}
          </span>
          <span className="text-[11px] font-medium text-stone-500">Dismissed</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border transition-all duration-200 p-5 ${
        isApplied
          ? 'border-emerald-500/40 bg-emerald-950/10 shadow-sm'
          : 'border-stone-800 bg-stone-900/70 hover:border-stone-700'
      }`}
    >
      {/* Header with location and status */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-800/80">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-800 text-amber-300">
            <MapPin size={11} />
            {formatSectionName(suggestion.section)} · Bullet #{bulletNumber}
          </span>
          {isApplied && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Check size={12} />
              Applied ✓
            </span>
          )}
        </div>

        {/* Verified skills badge */}
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <ShieldCheck size={14} className="text-emerald-400" />
          <span>Verified against candidate skills</span>
        </div>
      </div>

      {/* Diff comparison */}
      <div className="mt-4 space-y-3">
        {/* Original Text */}
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-stone-500">
            Current Resume
          </div>
          <div className="rounded-lg border border-red-900/20 bg-red-950/10 px-3.5 py-2.5 text-xs leading-relaxed text-stone-400 line-through decoration-red-500/40">
            {suggestion.originalText}
          </div>
        </div>

        {/* Suggested Text */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] font-medium uppercase tracking-wider text-amber-400/90">
            <span>Tailored Suggestion</span>
            <span className="text-[10px] lowercase text-stone-500">
              (action verbs, quantifiable metrics, role alignment)
            </span>
          </div>
          <div
            className={`rounded-lg border px-3.5 py-2.5 text-xs leading-relaxed font-normal ${
              isApplied
                ? 'border-emerald-500/40 bg-emerald-950/30 text-emerald-200'
                : 'border-amber-500/30 bg-amber-950/20 text-amber-100'
            }`}
          >
            {suggestion.suggestedText}
          </div>
        </div>
      </div>

      {/* Rationale & Verified Skills */}
      <div className="mt-4 space-y-2 rounded-lg bg-stone-950/60 p-3 border border-stone-800/60 text-xs">
        <div className="text-stone-300 leading-relaxed">
          <span className="font-semibold text-stone-400">Why this helps: </span>
          {suggestion.rationale}
        </div>

        {suggestion.verifiedSkillsUsed && suggestion.verifiedSkillsUsed.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-stone-800/50">
            <span className="text-[11px] text-stone-500 font-medium">Demonstrated skills applied:</span>
            {suggestion.verifiedSkillsUsed.map((skill) => (
              <span
                key={skill}
                className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300"
              >
                {skill}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex items-center justify-end gap-2.5 pt-2">
        {!isApplied ? (
          <>
            <button
              type="button"
              onClick={() => onReject(suggestion)}
              disabled={isApplying}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-400 hover:text-stone-200 hover:bg-stone-800 transition-colors disabled:opacity-50"
            >
              <X size={14} />
              <span>Dismiss</span>
            </button>
            <button
              type="button"
              onClick={() => onAccept(suggestion)}
              disabled={isApplying}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold text-stone-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-sm transition-all disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <Loader2 size={14} className="animate-spin text-stone-950" />
                  <span>Applying & Re-scoring…</span>
                </>
              ) : (
                <>
                  <Sparkles size={14} className="fill-stone-950" />
                  <span>Accept & Apply</span>
                </>
              )}
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-medium">
            <Check size={15} />
            <span>Applied to tailored resume & re-scored</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default SuggestionCard;

