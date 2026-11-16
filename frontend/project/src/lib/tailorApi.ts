import { api } from './api';

export interface TailorSuggestion {
  id: string;
  section: 'experience' | 'projects' | 'summary' | string;
  itemIndex?: number;
  bulletIndex?: number;
  originalText: string;
  suggestedText: string;
  rationale: string;
  verifiedSkillsUsed: string[];
  status: 'pending' | 'accepted' | 'rejected';
}

export interface ScoreBreakdown {
  atsScore: number;
  semanticScore: number;
}

export interface ScoreDelta {
  atsDelta: number;
  semanticDelta: number;
}

export interface ApplySuggestionPayload {
  suggestionId: string;
  acceptedText: string;
  section: string;
  bulletIndex?: number;
  itemIndex?: number;
  originalText?: string;
}

export interface ApplySuggestionResult {
  success: boolean;
  tailoredResumeId: string;
  storagePath: string;
  previousScores: ScoreBreakdown;
  updatedScores: ScoreBreakdown;
  scoreDelta: ScoreDelta;
  pdfUrl: string;
  downloadUrl?: string;
  appliedSuggestion?: {
    suggestionId: string;
    acceptedText: string;
    verifiedSkillsUsed: string[];
  };
}

export interface TailoredResumeData {
  id?: string;
  resumeId?: string;
  jobId?: string;
  tailoredResumeId?: string;
  filename?: string;
  storagePath?: string;
  createdAt?: string;
  atsScore?: number | null;
  semanticScore?: number | null;
  scores?: {
    atsScore?: number | null;
    semanticScore?: number | null;
  };
  pdfUrl?: string;
  downloadUrl?: string;
}

export interface FetchSuggestionsResponse {
  success: boolean;
  jobId: string;
  resumeId: string;
  suggestions: TailorSuggestion[];
}

export interface ExistingTailoredResumeResponse {
  success: boolean;
  tailoredResume: TailoredResumeData | null;
}

/**
 * Fetch tailored suggestions for a candidate resume against a job description.
 * Triggers zero-prompt LLM analysis with verified skills guardrail.
 */
export async function fetchJobSuggestions(
  resumeId: string,
  jobId: string
): Promise<FetchSuggestionsResponse> {
  const response = await api.post<FetchSuggestionsResponse>(
    `/resumes/${encodeURIComponent(resumeId)}/tailor/${encodeURIComponent(jobId)}/suggestions`,
    {}
  );
  return response.data;
}

/**
 * Apply an approved suggestion: recompiles PDF, stores in job-isolated Supabase storage,
 * and recalculates ATS Readiness & Semantic Job Fit scores in real time.
 */
export async function applySuggestion(
  resumeId: string,
  jobId: string,
  payload: ApplySuggestionPayload
): Promise<ApplySuggestionResult> {
  const response = await api.post<ApplySuggestionResult>(
    `/resumes/${encodeURIComponent(resumeId)}/tailor/${encodeURIComponent(jobId)}/apply-suggestion`,
    payload
  );
  return response.data;
}

/**
 * Check if a tailored resume already exists for this resume and job.
 */
export async function fetchExistingTailoredResume(
  resumeId: string,
  jobId: string
): Promise<ExistingTailoredResumeResponse> {
  const response = await api.get<ExistingTailoredResumeResponse>(
    `/resumes/${encodeURIComponent(resumeId)}/tailor/${encodeURIComponent(jobId)}`
  );
  return response.data;
}

