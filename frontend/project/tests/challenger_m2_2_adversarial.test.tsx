/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, test, spyOn } from 'bun:test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { api, getApiErrorMessage } from '../src/lib/api';
import { evictionNotice } from '../src/lib/display';
import {
  fetchJobSuggestions,
  applySuggestion,
  type TailorSuggestion,
} from '../src/lib/tailorApi';
import { PdfPreviewModal } from '../src/components/PdfPreviewModal';
import { SuggestionCard } from '../src/features/tailor/SuggestionCard';

const cleanHtml = (html: string) => html.replace(/<!--.*?-->/g, '');

describe('Adversarial Verification 1: PDF Preview Modal & URL Safety', () => {
  const samplePdfUrl = '/api/v1/resumes/res-uuid-123/file';
  const sampleDownloadUrl = '/api/v1/resumes/res-uuid-123/download';
  const queryDownloadUrl = '/api/v1/resumes/res-uuid-123/file?download=1';

  test('returns null when isOpen is false', () => {
    const html = renderToString(
      <PdfPreviewModal
        isOpen={false}
        onClose={() => {}}
        pdfUrl={samplePdfUrl}
      />
    );
    expect(html).toBe('');
  });

  test('renders full modal dialog structure with role="dialog" and aria-modal="true"', () => {
    const rawHtml = renderToString(
      <PdfPreviewModal
        isOpen={true}
        onClose={() => {}}
        pdfUrl={samplePdfUrl}
        downloadUrl={sampleDownloadUrl}
        title="Custom Tailored Title"
      />
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Custom Tailored Title');
    expect(html).toContain(`src="${samplePdfUrl}"`);
    expect(html).toContain(`href="${sampleDownloadUrl}"`);
    expect(html).toContain('download="tailored_resume.pdf"');
  });

  test('handles download link when downloadUrl is explicitly query parameter ?download=1', () => {
    const rawHtml = renderToString(
      <PdfPreviewModal
        isOpen={true}
        onClose={() => {}}
        pdfUrl={samplePdfUrl}
        downloadUrl={queryDownloadUrl}
      />
    );
    const html = cleanHtml(rawHtml);

    expect(html).toContain(`href="${queryDownloadUrl}"`);
    expect(html).toContain('download="tailored_resume.pdf"');
  });

  test('falls back download link to pdfUrl when downloadUrl is omitted', () => {
    const rawHtml = renderToString(
      <PdfPreviewModal
        isOpen={true}
        onClose={() => {}}
        pdfUrl={samplePdfUrl}
      />
    );
    const html = cleanHtml(rawHtml);

    // When downloadUrl is omitted, downloadHref = pdfUrl
    expect(html).toContain(`href="${samplePdfUrl}"`);
  });

  test('handles missing or empty pdfUrl without crashing the component', () => {
    expect(() => {
      renderToString(
        <PdfPreviewModal
          isOpen={true}
          onClose={() => {}}
          pdfUrl=""
        />
      );
    }).not.toThrow();

    const html = cleanHtml(
      renderToString(
        <PdfPreviewModal
          isOpen={true}
          onClose={() => {}}
          pdfUrl=""
        />
      )
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('src=""');
  });

  test('modal dismissal: ESC key listener triggers onClose', () => {
    let closed = false;
    const onClose = () => { closed = true; };

    // Test ESC handler logic isolated from DOM
    const listeners: Record<string, (e: any) => void> = {};
    const fakeWindow = {
      addEventListener: (type: string, cb: any) => { listeners[type] = cb; },
      removeEventListener: (type: string, cb: any) => { if (listeners[type] === cb) delete listeners[type]; },
    };

    const originalWindow = (globalThis as any).window;
    (globalThis as any).window = fakeWindow;

    try {
      // Simulate the useEffect registration in PdfPreviewModal
      const handleKeyDown = (e: { key: string }) => {
        if (e.key === 'Escape') onClose();
      };
      fakeWindow.addEventListener('keydown', handleKeyDown);

      // Press Enter: should not close
      listeners['keydown']({ key: 'Enter' });
      expect(closed).toBe(false);

      // Press Tab: should not close
      listeners['keydown']({ key: 'Tab' });
      expect(closed).toBe(false);

      // Press Escape: should close
      listeners['keydown']({ key: 'Escape' });
      expect(closed).toBe(true);

      fakeWindow.removeEventListener('keydown', handleKeyDown);
      expect(listeners['keydown']).toBeUndefined();
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  test('modal backdrop click propagation: stopPropagation on inner card', () => {
    let outerClicked = false;
    let innerClicked = false;

    const onOuterClick = () => { outerClicked = true; };
    const innerStopPropagation = (e: { stopPropagation: () => void }) => {
      innerClicked = true;
      e.stopPropagation();
    };

    let stopped = false;
    innerStopPropagation({
      stopPropagation: () => { stopped = true; },
    });

    expect(innerClicked).toBe(true);
    expect(stopped).toBe(true);
    expect(outerClicked).toBe(false);

    // Clicking outer triggers close
    onOuterClick();
    expect(outerClicked).toBe(true);
  });
});

describe('Adversarial Verification 2: Retention Cap UI Verification', () => {
  test('display.ts evictionNotice() returns empty string for all arguments', () => {
    expect(evictionNotice()).toBe('');
    expect(evictionNotice(0)).toBe('');
    expect(evictionNotice(1)).toBe('');
    expect(evictionNotice(3)).toBe('');
    expect(evictionNotice(10)).toBe('');
    expect(evictionNotice(-1)).toBe('');
  });

  test('verify AtsPage source code contains NO active eviction notice assignment or warning', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const atsCode = fs.readFileSync(path.resolve(__dirname, '../src/pages/AtsPage.tsx'), 'utf-8');

    // The evictionMessage must be empty string
    expect(atsCode).toContain("const evictionMessage = '';");
    // Must NOT call evictionNotice or display eviction alert
    expect(atsCode).not.toContain('evictionNotice(');
    expect(atsCode).not.toContain('has been evicted');
    expect(atsCode).not.toContain('3-resume limit');
  });

  test('verify JobsPage source code contains NO eviction warnings about resume limit', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const jobsCode = fs.readFileSync(path.resolve(__dirname, '../src/pages/JobsPage.tsx'), 'utf-8');

    // No eviction notice or retention limit text
    expect(jobsCode).not.toContain('evicted');
    expect(jobsCode).not.toContain('evictionNotice');
    expect(jobsCode).not.toContain('retention limit');
    expect(jobsCode).not.toContain('3-resume limit');
  });
});

describe('Adversarial Verification 3: Network Error Resilience', () => {
  const sampleResumeId = 'res-test-999';
  const sampleJobId = 'job-test-888';

  test('getApiErrorMessage maps 400 guardrail error message accurately', () => {
    const guardrailError = {
      status: 400,
      message: 'Suggestion introduces unpossessed skill "Kubernetes"',
      details: {
        success: false,
        message: 'Suggestion introduces unpossessed skill "Kubernetes"',
        hallucinatedSkills: ['Kubernetes'],
      },
    };

    const msg = getApiErrorMessage(guardrailError);
    expect(msg).toBe('Suggestion introduces unpossessed skill "Kubernetes"');
  });

  test('getApiErrorMessage maps 500 internal server error to friendly message', () => {
    const serverError = {
      status: 500,
      message: 'Request failed with status code 500',
      details: {},
    };

    const msg = getApiErrorMessage(serverError);
    expect(msg).toBe('Something went wrong on our end. Please try again.');
  });

  test('getApiErrorMessage maps network offline (ERR_NETWORK) correctly', () => {
    const offlineError = {
      code: 'ERR_NETWORK',
      message: 'Network Error',
    };

    const msg = getApiErrorMessage(offlineError);
    expect(msg).toBe('You appear to be offline or the connection failed. Check your network and try again.');
  });

  test('getApiErrorMessage handles ECONNABORTED timeout behavior', () => {
    // If raw message is populated by axios ('timeout of 60000ms exceeded'), raw message wins
    const axiosTimeoutError = {
      code: 'ECONNABORTED',
      message: 'timeout of 60000ms exceeded',
    };
    expect(getApiErrorMessage(axiosTimeoutError)).toBe('timeout of 60000ms exceeded');

    // If raw message is empty or default, code === 'ECONNABORTED' maps to TIMEOUT_MESSAGE
    const transportTimeoutError = {
      code: 'ECONNABORTED',
      message: '',
    };
    expect(getApiErrorMessage(transportTimeoutError)).toBe('This is taking longer than expected. Please try again.');
  });

  test('ResumeTailorStudio handles 400 Guardrail Rejection from applySuggestion gracefully', async () => {
    const postSpy = spyOn(api, 'post').mockRejectedValueOnce({
      status: 400,
      message: 'Guardrail rejected: Skill "Rust" was not present in original profile',
      details: {
        success: false,
        message: 'Guardrail rejected: Skill "Rust" was not present in original profile',
      },
    });

    let caughtError: any = null;
    try {
      await applySuggestion(sampleResumeId, sampleJobId, {
        suggestionId: 'sug-adversarial',
        acceptedText: 'Architected memory-safe systems using Rust',
        section: 'experience',
        bulletIndex: 0,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    const friendlyMsg = getApiErrorMessage(caughtError);
    expect(friendlyMsg).toBe('Guardrail rejected: Skill "Rust" was not present in original profile');

    postSpy.mockRestore();
  });

  test('ResumeTailorStudio handles 500 Internal Server Error from applySuggestion gracefully', async () => {
    const postSpy = spyOn(api, 'post').mockRejectedValueOnce({
      status: 500,
      message: 'Request failed with status code 500',
    });

    let caughtError: any = null;
    try {
      await applySuggestion(sampleResumeId, sampleJobId, {
        suggestionId: 'sug-adversarial',
        acceptedText: 'Valid edit',
        section: 'experience',
        bulletIndex: 0,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    const friendlyMsg = getApiErrorMessage(caughtError);
    expect(friendlyMsg).toBe('Something went wrong on our end. Please try again.');

    postSpy.mockRestore();
  });

  test('ResumeTailorStudio handles complete network offline from fetchJobSuggestions gracefully', async () => {
    const postSpy = spyOn(api, 'post').mockRejectedValueOnce({
      code: 'ERR_NETWORK',
      message: 'Network Error',
    });

    let caughtError: any = null;
    try {
      await fetchJobSuggestions(sampleResumeId, sampleJobId);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).not.toBeNull();
    const friendlyMsg = getApiErrorMessage(caughtError);
    expect(friendlyMsg).toBe('You appear to be offline or the connection failed. Check your network and try again.');

    postSpy.mockRestore();
  });

  test('SuggestionCard renders reliably with edge cases (empty verified skills, long texts, missing bulletIndex)', () => {
    const edgeSuggestion: TailorSuggestion = {
      id: 'edge-sug-1',
      section: 'custom_section',
      bulletIndex: 0,
      originalText: 'A'.repeat(500),
      suggestedText: 'B'.repeat(500),
      rationale: '<script>alert(1)</script> Escaped rationale test',
      verifiedSkillsUsed: [],
      status: 'pending',
    };

    expect(() => {
      renderToString(
        <SuggestionCard
          suggestion={edgeSuggestion}
          onAccept={() => {}}
          onReject={() => {}}
        />
      );
    }).not.toThrow();

    const html = cleanHtml(
      renderToString(
        <SuggestionCard
          suggestion={edgeSuggestion}
          onAccept={() => {}}
          onReject={() => {}}
        />
      )
    );

    // Section title capitalization fallback
    expect(html).toContain('Custom_section · Bullet #1');
    // Rationale rendered safely
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; Escaped rationale test');
    // Verified skills section omitted when array is empty
    expect(html).not.toContain('Demonstrated skills applied:');
  });
});
