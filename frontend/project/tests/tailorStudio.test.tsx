/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, spyOn } from 'bun:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { api } from '../src/lib/api';
import {
  fetchJobSuggestions,
  applySuggestion,
  fetchExistingTailoredResume,
  type TailorSuggestion,
  type ApplySuggestionResult,
} from '../src/lib/tailorApi';
import { SuggestionCard } from '../src/features/tailor/SuggestionCard';
import { ScoreRecalculationBanner } from '../src/features/tailor/ScoreRecalculationBanner';
import { PdfPreviewModal } from '../src/components/PdfPreviewModal';
import { ResumeTailorStudio } from '../src/features/tailor/ResumeTailorStudio';

const cleanHtml = (html: string) => html.replace(/<!--.*?-->/g, '');

describe('tailorApi Client', () => {
  const sampleResumeId = 'res-12345';
  const sampleJobId = 'job-67890';

  test('fetchJobSuggestions calls POST /resumes/:resumeId/tailor/:jobId/suggestions with empty body', async () => {
    const mockSuggestions: TailorSuggestion[] = [
      {
        id: 'sug-1',
        section: 'experience',
        bulletIndex: 0,
        originalText: 'Built web applications',
        suggestedText: 'Architected scalable web applications using React and TypeScript',
        rationale: 'Direct alignment with target JD requirements for TypeScript and React.',
        verifiedSkillsUsed: ['React', 'TypeScript'],
        status: 'pending',
      },
    ];

    const postSpy = spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        success: true,
        jobId: sampleJobId,
        resumeId: sampleResumeId,
        suggestions: mockSuggestions,
      },
    } as any);

    const result = await fetchJobSuggestions(sampleResumeId, sampleJobId);

    expect(postSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].id).toBe('sug-1');
    expect(result.suggestions[0].verifiedSkillsUsed).toEqual(['React', 'TypeScript']);

    postSpy.mockRestore();
  });

  test('applySuggestion calls POST /resumes/:resumeId/tailor/:jobId/apply-suggestion with payload', async () => {
    const payload = {
      suggestionId: 'sug-1',
      acceptedText: 'Engineered high-throughput microservices reducing latency by 35%',
      section: 'experience',
      bulletIndex: 1,
      itemIndex: 0,
      originalText: 'Worked on backend services',
    };

    const mockResult: ApplySuggestionResult = {
      success: true,
      tailoredResumeId: 'tailored-abc-123',
      storagePath: `test-user/jobs/${sampleJobId}/tailored-abc-123/tailored_resume.pdf`,
      previousScores: { atsScore: 72, semanticScore: 65 },
      updatedScores: { atsScore: 84, semanticScore: 78 },
      scoreDelta: { atsDelta: 12, semanticDelta: 13 },
      pdfUrl: '/api/v1/resumes/tailored-abc-123/file',
      downloadUrl: '/api/v1/resumes/tailored-abc-123/download',
      appliedSuggestion: {
        suggestionId: 'sug-1',
        acceptedText: payload.acceptedText,
        verifiedSkillsUsed: ['Microservices', 'Latency Optimization'],
      },
    };

    const postSpy = spyOn(api, 'post').mockResolvedValueOnce({
      data: mockResult,
    } as any);

    const result = await applySuggestion(sampleResumeId, sampleJobId, payload);

    expect(postSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.tailoredResumeId).toBe('tailored-abc-123');
    expect(result.scoreDelta.atsDelta).toBe(12);
    expect(result.scoreDelta.semanticDelta).toBe(13);
    expect(result.pdfUrl).toBe('/api/v1/resumes/tailored-abc-123/file');

    postSpy.mockRestore();
  });

  test('fetchExistingTailoredResume calls GET /resumes/:resumeId/tailor/:jobId', async () => {
    const getSpy = spyOn(api, 'get').mockResolvedValueOnce({
      data: {
        success: true,
        tailoredResume: {
          id: 'tailored-xyz',
          filename: 'tailored_lead_engineer.pdf',
          storagePath: 'test/path.pdf',
          createdAt: new Date().toISOString(),
          atsScore: 80,
          semanticScore: 75,
          pdfUrl: '/api/v1/resumes/tailored-xyz/file',
          downloadUrl: '/api/v1/resumes/tailored-xyz/download',
        },
      },
    } as any);

    const result = await fetchExistingTailoredResume(sampleResumeId, sampleJobId);

    expect(getSpy).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.tailoredResume?.id).toBe('tailored-xyz');
    expect(result.tailoredResume?.atsScore).toBe(80);

    getSpy.mockRestore();
  });
});

describe('SuggestionCard Component', () => {
  const sampleSuggestion: TailorSuggestion = {
    id: 'sug-card-1',
    section: 'experience',
    bulletIndex: 1,
    originalText: 'Assisted in cloud database migration.',
    suggestedText: 'Spearheaded PostgreSQL migration to AWS Aurora, improving query performance by 40%.',
    rationale: 'Demonstrates quantified impact and specific database technologies requested in JD.',
    verifiedSkillsUsed: ['PostgreSQL', 'AWS Aurora'],
    status: 'pending',
  };

  test('renders location, diff comparison, rationale, and verified skills', () => {
    const rawHtml = renderToString(
      <SuggestionCard
        suggestion={sampleSuggestion}
        onAccept={() => {}}
        onReject={() => {}}
      />
    );
    const html = cleanHtml(rawHtml);

    // Location
    expect(html).toContain('Work Experience · Bullet #2');
    // Original Text (with strike-through styling)
    expect(html).toContain('Current Resume');
    expect(html).toContain('Assisted in cloud database migration.');
    // Suggested Text
    expect(html).toContain('Tailored Suggestion');
    expect(html).toContain('Spearheaded PostgreSQL migration to AWS Aurora, improving query performance by 40%.');
    // Rationale
    expect(html).toContain('Why this helps:');
    expect(html).toContain('Demonstrates quantified impact');
    // Verified skills badge
    expect(html).toContain('Verified against candidate skills');
    expect(html).toContain('PostgreSQL');
    expect(html).toContain('AWS Aurora');
    // Buttons
    expect(html).toContain('Accept &amp; Apply');
    expect(html).toContain('Dismiss');
  });

  test('renders applying spinner state when isApplying is true', () => {
    const rawHtml = renderToString(
      <SuggestionCard
        suggestion={sampleSuggestion}
        onAccept={() => {}}
        onReject={() => {}}
        isApplying={true}
      />
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain('Applying &amp; Re-scoring');
  });

  test('renders applied state when isApplied is true', () => {
    const rawHtml = renderToString(
      <SuggestionCard
        suggestion={sampleSuggestion}
        onAccept={() => {}}
        onReject={() => {}}
        isApplied={true}
      />
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain('Applied ✓');
    expect(html).toContain('Applied to tailored resume &amp; re-scored');
    // Should NOT show the Accept button when already applied
    expect(html).not.toContain('Accept &amp; Apply');
  });

  test('renders dismissed state when isRejected is true', () => {
    const rawHtml = renderToString(
      <SuggestionCard
        suggestion={sampleSuggestion}
        onAccept={() => {}}
        onReject={() => {}}
        isRejected={true}
      />
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain('Dismissed');
  });
});

describe('ScoreRecalculationBanner Component', () => {
  const previousScores = { atsScore: 74, semanticScore: 61 };
  const updatedScores = { atsScore: 86, semanticScore: 75 };
  const scoreDelta = { atsDelta: 12, semanticDelta: 14 };
  const pdfUrl = '/api/v1/resumes/tailored-123/file';
  const downloadUrl = '/api/v1/resumes/tailored-123/download';

  test('renders before-and-after score deltas and live badges', () => {
    const rawHtml = renderToString(
      <ScoreRecalculationBanner
        previousScores={previousScores}
        updatedScores={updatedScores}
        scoreDelta={scoreDelta}
        pdfUrl={pdfUrl}
        downloadUrl={downloadUrl}
        onPreviewPdf={() => {}}
      />
    );
    const html = cleanHtml(rawHtml);

    // Title
    expect(html).toContain('Resume Tailored &amp; Re-Scored in Real Time');
    expect(html).toContain('Live Delta');

    // ATS Readiness delta: 74 -> 86 (+12 pts)
    expect(html).toContain('ATS Readiness');
    expect(html).toContain('74');
    expect(html).toContain('86');
    expect(html).toContain('+12 pts');

    // Semantic Job Fit delta: 61% -> 75% (+14%)
    expect(html).toContain('Semantic Job Fit');
    expect(html).toContain('61%');
    expect(html).toContain('75%');
    expect(html).toContain('+14%');

    // Action buttons
    expect(html).toContain('Preview Tailored PDF');
    expect(html).toContain('Download PDF');
    expect(html).toContain('href="/api/v1/resumes/tailored-123/download"');
  });
});

describe('PdfPreviewModal Component', () => {
  const pdfUrl = '/api/v1/resumes/tailored-modal-123/file';
  const downloadUrl = '/api/v1/resumes/tailored-modal-123/download';

  test('returns null when isOpen is false', () => {
    const rawHtml = renderToString(
      <PdfPreviewModal
        isOpen={false}
        onClose={() => {}}
        pdfUrl={pdfUrl}
      />
    );

    expect(rawHtml).toBe('');
  });

  test('renders iframe with pdfUrl and download button when isOpen is true', () => {
    const rawHtml = renderToString(
      <PdfPreviewModal
        isOpen={true}
        onClose={() => {}}
        pdfUrl={pdfUrl}
        downloadUrl={downloadUrl}
        title="Tailored Resume: Senior Engineer"
      />
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain('Tailored Resume: Senior Engineer');
    expect(html).toContain(`src="${pdfUrl}"`);
    expect(html).toContain(`href="${downloadUrl}"`);
    expect(html).toContain('Download PDF');
    expect(html).toContain('Close');
  });
});

describe('ResumeTailorStudio Component Initial State & Zero-Prompt UX', () => {
  test('renders studio panel with zero-prompt indicator and role heading', () => {
    const rawHtml = renderToString(
      <ResumeTailorStudio
        resumeId="test-res-123"
        jobId="test-job-456"
        jobTitle="Staff Platform Engineer"
        companyName="Stripe"
      />
    );
    const html = cleanHtml(rawHtml);

    // Header & Target Role
    expect(html).toContain('In-Place Resume Studio');
    expect(html).toContain('Tailoring for');
    expect(html).toContain('Staff Platform Engineer');
    expect(html).toContain('at Stripe');

    // Zero-prompt initial loading state
    expect(html).toContain('Analyzing role requirements against verified resume evidence…');
    expect(html).toContain('Enforcing zero-hallucination guardrail on candidate skills');

    // Buttons
    expect(html).toContain('Regenerate');
  });
});
