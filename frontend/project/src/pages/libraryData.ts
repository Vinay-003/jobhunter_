import { viewModelFromAnalysisRow } from './AnalysisPage';

export interface SavedResume {
  id: string;
  fileName?: string;
  uploadDate?: string;
  status?: string;
  pageCount?: number;
  isLatest?: boolean;
}

export interface SavedAnalysis {
  id: string;
  resume_id?: string;
  created_at?: string;
  analysis_type?: string;
  result_json?: unknown;
  readiness_score?: number | null;
  jd_match_score?: number | null;
}

export const dateLabel = (date?: string) => {
  if (!date) return 'Date unavailable';
  const parsed = new Date(date);
  return Number.isNaN(parsed.valueOf()) ? 'Date unavailable' : parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export const resumeName = (resume: SavedResume) => resume.fileName || 'Untitled resume';

export function analysisInfo(row: SavedAnalysis, name?: string) {
  const view = viewModelFromAnalysisRow(row, name);
  const isMatch = row.analysis_type === 'jd_match' || Boolean(view.jdMatch);
  const rawScore = isMatch ? view.jdMatch?.score : view.readiness.score;
  const score = typeof rawScore === 'number' && Number.isFinite(rawScore) ? rawScore : null;
  return {
    isMatch,
    score,
    label: isMatch ? 'Tailored Match' : 'Resume Health',
    scoreLabel: isMatch ? (score === null ? 'Score unavailable' : `${score}% relevance`) : (score === null ? 'Score unavailable' : `${score} / 100`),
    view,
  };
}

export const apiStatus = (error: unknown) => error && typeof error === 'object' && 'status' in error ? (error as { status?: number }).status : undefined;
