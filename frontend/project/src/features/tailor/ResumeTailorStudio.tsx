import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  FileText,
  X,
  RefreshCw,
} from 'lucide-react';
import { getApiErrorMessage } from '../../lib/api';
import {
  fetchJobSuggestions,
  applySuggestion,
  fetchExistingTailoredResume,
  type TailorSuggestion,
  type ApplySuggestionResult,
} from '../../lib/tailorApi';
import SuggestionCard from './SuggestionCard';
import ScoreRecalculationBanner from './ScoreRecalculationBanner';
import PdfPreviewModal from '../../components/PdfPreviewModal';

export interface ResumeTailorStudioProps {
  resumeId: string;
  jobId: string;
  jobTitle?: string;
  companyName?: string;
  initialSuggestions?: TailorSuggestion[];
  onScoreUpdated?: (updatedAtsScore: number, updatedSemanticScore: number) => void;
  onClose?: () => void;
}

export const ResumeTailorStudio: React.FC<ResumeTailorStudioProps> = ({
  resumeId,
  jobId,
  jobTitle,
  companyName,
  initialSuggestions,
  onScoreUpdated,
  onClose,
}) => {
  const [suggestions, setSuggestions] = useState<TailorSuggestion[]>(
    initialSuggestions && initialSuggestions.length > 0 ? initialSuggestions : []
  );
  const [loading, setLoading] = useState(!initialSuggestions || initialSuggestions.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [activeBanner, setActiveBanner] = useState<ApplySuggestionResult | null>(null);
  const [existingTailoredId, setExistingTailoredId] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Sync if initialSuggestions updates from parent
  useEffect(() => {
    if (initialSuggestions && initialSuggestions.length > 0) {
      setSuggestions(initialSuggestions);
      setLoading(false);
    }
  }, [initialSuggestions]);

  // Load existing tailored resume (if any) and fetch new suggestions without prompting user
  const loadStudioData = useCallback(async (forceRefresh = false) => {
    if (!resumeId || !jobId) return;

    const hasInitial = !forceRefresh && initialSuggestions && initialSuggestions.length > 0;
    if (!hasInitial) {
      setLoading(true);
    }
    setError(null);

    try {
      // 1. Check if a tailored version already exists
      try {
        const existing = await fetchExistingTailoredResume(resumeId, jobId);
        if (existing?.tailoredResume?.id) {
          setExistingTailoredId(existing.tailoredResume.id);
          if (
            typeof existing.tailoredResume.atsScore === 'number' &&
            typeof existing.tailoredResume.semanticScore === 'number'
          ) {
            // Set existing score banner if available
            setActiveBanner({
              success: true,
              tailoredResumeId: existing.tailoredResume.id,
              storagePath: existing.tailoredResume.storagePath || '',
              previousScores: {
                atsScore: existing.tailoredResume.atsScore,
                semanticScore: existing.tailoredResume.semanticScore,
              },
              updatedScores: {
                atsScore: existing.tailoredResume.atsScore,
                semanticScore: existing.tailoredResume.semanticScore,
              },
              scoreDelta: {
                atsDelta: 0,
                semanticDelta: 0,
              },
              pdfUrl: existing.tailoredResume.pdfUrl || `/api/v1/resumes/${existing.tailoredResume.id}/file`,
              downloadUrl:
                existing.tailoredResume.downloadUrl ||
                `/api/v1/resumes/${existing.tailoredResume.id}/download`,
            });
          }
        }
      } catch {
        // Non-fatal if existing check fails
      }

      // 2. Fetch suggestions only if not provided or forceRefresh
      if (!hasInitial) {
        const res = await fetchJobSuggestions(resumeId, jobId);
        if (res?.suggestions) {
          setSuggestions(res.suggestions);
          // Pre-populate any accepted suggestions if returned from backend
          const initialApplied = new Set<string>();
          res.suggestions.forEach((s) => {
            if (s.status === 'accepted') initialApplied.add(s.id);
          });
          setAppliedIds(initialApplied);
        } else {
          setSuggestions([]);
        }
      }
    } catch (err: unknown) {
      console.error('[ResumeTailorStudio] Failed to load suggestions:', err);
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [resumeId, jobId, initialSuggestions]);

  useEffect(() => {
    loadStudioData();
  }, [loadStudioData]);

  // Handle Accept & Apply
  const handleAccept = async (suggestion: TailorSuggestion) => {
    if (applyingId) return;

    setApplyingId(suggestion.id);
    setError(null);

    try {
      const result = await applySuggestion(resumeId, jobId, {
        suggestionId: suggestion.id,
        section: suggestion.section,
        itemIndex: suggestion.itemIndex,
        bulletIndex: suggestion.bulletIndex,
        originalText: suggestion.originalText,
        acceptedText: suggestion.suggestedText,
      });

      if (result.success) {
        setAppliedIds((prev) => new Set([...prev, suggestion.id]));
        setActiveBanner(result);
        setExistingTailoredId(result.tailoredResumeId);

        // Notify parent JobsPage of real-time score updates
        if (
          typeof result.updatedScores.atsScore === 'number' &&
          typeof result.updatedScores.semanticScore === 'number'
        ) {
          onScoreUpdated?.(
            result.updatedScores.atsScore,
            result.updatedScores.semanticScore
          );
        }
      }
    } catch (err: unknown) {
      console.error('[ResumeTailorStudio] Error applying suggestion:', err);
      setError(getApiErrorMessage(err));
    } finally {
      setApplyingId(null);
    }
  };

  // Handle Reject
  const handleReject = (suggestion: TailorSuggestion) => {
    setRejectedIds((prev) => new Set([...prev, suggestion.id]));
  };

  const currentPdfUrl =
    activeBanner?.pdfUrl || (existingTailoredId ? `/api/v1/resumes/${existingTailoredId}/file` : '');
  const currentDownloadUrl =
    activeBanner?.downloadUrl ||
    (existingTailoredId ? `/api/v1/resumes/${existingTailoredId}/download` : '');

  return (
    <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-xl text-stone-900">
      {/* Studio Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <Sparkles size={18} className="fill-amber-600" />
            </span>
            <h2 className="text-base font-bold text-stone-900">
              In-Place Resume Studio
            </h2>
          </div>
          <p className="mt-1 text-xs text-stone-600">
            Tailoring for{' '}
            <span className="font-semibold text-stone-900">{jobTitle || 'Target Role'}</span>
            {companyName ? ` at ${companyName}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadStudioData(true)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-700 hover:text-stone-900 hover:bg-stone-100 border border-stone-200 transition-colors disabled:opacity-50"
            title="Refresh suggestions"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Regenerate</span>
          </button>

          {currentPdfUrl && (
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-900 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors"
            >
              <FileText size={13} />
              <span>Preview PDF</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
              aria-label="Close Studio"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Recalculated Score Delta Banner (shown when a suggestion has been applied) */}
      {activeBanner && (
        <ScoreRecalculationBanner
          previousScores={activeBanner.previousScores}
          updatedScores={activeBanner.updatedScores}
          scoreDelta={activeBanner.scoreDelta}
          pdfUrl={activeBanner.pdfUrl}
          downloadUrl={activeBanner.downloadUrl}
          onPreviewPdf={() => setIsPreviewOpen(true)}
        />
      )}

      {/* Error alert */}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Unable to complete request</p>
            <p className="mt-0.5 text-stone-600">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-stone-400 hover:text-stone-700"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Suggestions List */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-800">
              Recommended Bullet Improvements
            </span>
            {!loading && suggestions.length > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-900 border border-amber-200 px-2 py-0.5 text-[10px] font-semibold">
                {suggestions.filter((s) => !rejectedIds.has(s.id)).length} available
              </span>
            )}
          </div>
          <span className="text-[11px] text-stone-500">
            Accepting updates the job-isolated PDF & re-scores
          </span>
        </div>

        {loading ? (
          <div className="space-y-4 py-8 text-center bg-stone-50 rounded-xl border border-stone-200">
            <Loader2 size={24} className="mx-auto animate-spin text-amber-600" />
            <div className="text-xs text-stone-600">
              <p className="font-semibold text-stone-800">
                Analyzing role requirements against verified resume evidence…
              </p>
              <p className="mt-1 text-[11px] text-stone-500">
                Enforcing zero-hallucination guardrail on candidate skills
              </p>
            </div>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-6 text-center text-xs text-stone-600">
            <CheckCircle2 size={22} className="mx-auto text-emerald-600 mb-2" />
            <p className="font-semibold text-stone-800">No immediate bullet weaknesses found!</p>
            <p className="mt-1 text-stone-500">
              Your resume bullets are already well-quantified and aligned with target role keywords.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onAccept={handleAccept}
                onReject={handleReject}
                isApplying={applyingId === suggestion.id}
                isApplied={appliedIds.has(suggestion.id)}
                isRejected={rejectedIds.has(suggestion.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      {currentPdfUrl && (
        <PdfPreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          pdfUrl={currentPdfUrl}
          downloadUrl={currentDownloadUrl}
          title={`Tailored Resume: ${jobTitle || 'Role'}`}
        />
      )}
    </div>
  );
};

export default ResumeTailorStudio;
