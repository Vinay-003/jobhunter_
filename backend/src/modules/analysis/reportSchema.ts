export const REPORT_SCHEMA_VERSION = 1;
export type ReportSnapshot = {
  success: true;
  resultSchemaVersion: number;
  analysisId: string;
  resumeId: string;
  fileName: string | null;
  createdAt: string;
  readiness: Record<string, any>;
  jdMatch?: Record<string, any>;
  confidence?: 'High' | 'Medium' | 'Low';
  confidenceReasons?: string[];
  versions: Record<string, any>;
  profileContentHash: string;
  parsedSections?: Array<{
    title?: string;
    heading?: string;
    content?: string;
    text?: string;
    bullets?: string[];
    items?: Array<{
      title?: string;
      company?: string;
      date?: string;
      text?: string;
      bullets?: string[];
    }>;
  }>;
  extractedText?: string;
  contactInfo?: {
    name?: string | null;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    location?: string | null;
    links?: string[];
  };
};

// pg NUMERIC arrives as a string; never let a fresh report silently become text.
export function analysisSnapshot(row: Record<string, any>): ReportSnapshot | null {
  const result = typeof row.result_json === 'string' ? JSON.parse(row.result_json) : row.result_json;
  if (!result || result.resultSchemaVersion !== REPORT_SCHEMA_VERSION) return null;
  return {
    ...result,
    readiness: { ...result.readiness, score: Number(result.readiness.score) },
    jdMatch: result.jdMatch ? { ...result.jdMatch, score: result.jdMatch.score == null ? null : Number(result.jdMatch.score) } : undefined,
    parsedSections: result.parsedSections,
    extractedText: result.extractedText,
    contactInfo: result.contactInfo,
  };
}
