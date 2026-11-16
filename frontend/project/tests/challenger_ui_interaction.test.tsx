/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { describe, expect, test, beforeEach, mock } from 'bun:test';

// Mock dependencies for happy-dom CJS/ESM interop
mock.module('buffer-image-size', () => ({
  default: () => ({ width: 100, height: 100, type: 'png' }),
}));
const entities = require(process.env.USERPROFILE + '/.bun/install/cache/entities@9.0.0@@@1/dist/index.js');
mock.module('entities', () => entities);
const mime = require(process.env.USERPROFILE + '/.bun/install/cache/whatwg-mimetype@5.0.0@@@1/lib/index.js');
mock.module('whatwg-mimetype', () => ({ default: mime, MIMEType: mime }));

// Setup DOM environment using happy-dom if running outside browser
if (typeof document === 'undefined') {
  const { Window } = require(process.env.USERPROFILE + '/.bun/install/cache/happy-dom@21.0.4@@@1/lib/index.js');
  const window = new Window({ url: 'http://localhost' });
  for (const key of Object.getOwnPropertyNames(window)) {
    if (!(key in globalThis)) {
      try {
        (globalThis as any)[key] = (window as any)[key];
      } catch {
        // Ignore unassignable properties
      }
    }
  }
  globalThis.window = window as any;
  globalThis.document = window.document as any;
  globalThis.navigator = window.navigator as any;
}

import React from 'react';
import ReactDOMClient from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import api from '../src/lib/api';
import { ResumeTailorStudio } from '../src/features/tailor/ResumeTailorStudio';
import JobsPage from '../src/pages/JobsPage';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Challenger Stress Suite: UI State & User Interaction', () => {
  let container: HTMLDivElement;
  let root: ReactDOMClient.Root;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    root = ReactDOMClient.createRoot(container);
  });

  describe('1. Zero-Prompt Triggering', () => {
    test('clicking "Tailor Resume for this Job" directly calls suggestion API without prompt textarea or inputs', async () => {
      let suggestionsCalled = false;
      let requestBody: any = null;

      api.get = (async (url: string) => {
        if (url === '/resumes') {
          return { data: { resumes: [{ id: 'res-test-1', fileName: 'TestResume.pdf' }] } };
        }
        if (url === '/profile/job-preferences') {
          return { data: { preferences: { target_roles: ['Staff Engineer'] } } };
        }
        if (url.includes('/tailor/')) {
          return { data: { success: true, tailoredResume: null } };
        }
        return { data: {} };
      }) as any;

      api.post = (async (url: string, body: any) => {
        if (url === '/recommendation-runs/roles') {
          return { data: { roleDiscovery: { roles: [{ title: 'Staff Engineer' }] } } };
        }
        if (url === '/recommendation-runs') {
          return {
            data: {
              recommendations: [
                {
                  id: 'job-zp-1',
                  title: 'Staff Engineer',
                  company: 'Acme Corp',
                  fitScore: 70,
                  matchScore: 70,
                },
              ],
            },
          };
        }
        if (url.includes('/suggestions')) {
          suggestionsCalled = true;
          requestBody = body;
          return {
            data: {
              success: true,
              suggestions: [
                {
                  id: 'sug-zp-1',
                  section: 'experience',
                  bulletIndex: 0,
                  originalText: 'Developed microservices.',
                  suggestedText: 'Engineered event-driven microservices in Go and Kafka, scaling throughput by 4x.',
                  rationale: 'Demonstrates distributed systems skills aligned with role.',
                  verifiedSkillsUsed: ['Go', 'Kafka'],
                  status: 'pending',
                },
              ],
            },
          };
        }
        return { data: {} };
      }) as any;

      root.render(
        <MemoryRouter>
          <JobsPage />
        </MemoryRouter>
      );

      // Wait for jobs to populate
      await sleep(250);
      const refreshBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Refresh matches')
      );
      expect(refreshBtn).toBeDefined();
      refreshBtn?.click();

      await sleep(350);
      const tailorBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Tailor Resume for this Job')
      );
      expect(tailorBtn).toBeDefined();

      // Trigger zero-prompt tailoring
      tailorBtn?.click();
      await sleep(350);

      // Assert suggestions API was invoked directly
      expect(suggestionsCalled).toBe(true);
      // Empty body indicates zero user prompt text was passed or requested
      expect(requestBody).toEqual({});

      // Assert DOM contains ZERO textareas or user prompt input fields
      const textareas = container.querySelectorAll('textarea');
      expect(textareas.length).toBe(0);

      const promptInputs = Array.from(container.querySelectorAll('input')).filter(
        (i) => i.placeholder?.toLowerCase().includes('prompt') || i.name?.includes('prompt')
      );
      expect(promptInputs.length).toBe(0);

      // Verify studio header and suggestion card are rendered
      expect(container.textContent).toContain('In-Place Resume Studio');
      expect(container.textContent).toContain('Tailored Suggestion');
      expect(container.textContent).toContain('Engineered event-driven microservices');
    });
  });

  describe('2. Accept / Reject Interactive State', () => {
    test('Accept flow: shows spinner, calls applySuggestion, updates applied badge, renders ScoreRecalculationBanner', async () => {
      let applyPayload: any = null;

      api.get = (async () => ({ data: { success: true, tailoredResume: null } })) as any;
      api.post = (async (url: string, body: any) => {
        if (url.includes('/suggestions')) {
          return {
            data: {
              success: true,
              suggestions: [
                {
                  id: 'sug-acc-1',
                  section: 'experience',
                  bulletIndex: 1,
                  originalText: 'Maintained SQL databases.',
                  suggestedText: 'Optimized PostgreSQL queries reducing P99 latency by 45%.',
                  rationale: 'Demonstrates quantifiable database tuning.',
                  verifiedSkillsUsed: ['PostgreSQL', 'Query Optimization'],
                  status: 'pending',
                },
              ],
            },
          };
        }
        if (url.includes('/apply-suggestion')) {
          applyPayload = body;
          return {
            data: {
              success: true,
              tailoredResumeId: 'tailored-res-456',
              storagePath: 'user/jobs/job-1/tailored-res-456/tailored.pdf',
              previousScores: { atsScore: 68, semanticScore: 60 },
              updatedScores: { atsScore: 85, semanticScore: 78 },
              scoreDelta: { atsDelta: 17, semanticDelta: 18 },
              pdfUrl: '/api/v1/resumes/tailored-res-456/file',
              downloadUrl: '/api/v1/resumes/tailored-res-456/download',
            },
          };
        }
        return { data: {} };
      }) as any;

      root.render(<ResumeTailorStudio resumeId="res-acc-1" jobId="job-acc-1" />);

      await sleep(250);
      const acceptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Accept & Apply')
      );
      expect(acceptBtn).toBeDefined();

      // Click Accept & Apply
      acceptBtn?.click();
      await sleep(250);

      // Verify payload passed to applySuggestion
      expect(applyPayload).not.toBeNull();
      expect(applyPayload.suggestionId).toBe('sug-acc-1');
      expect(applyPayload.section).toBe('experience');
      expect(applyPayload.bulletIndex).toBe(1);
      expect(applyPayload.acceptedText).toBe('Optimized PostgreSQL queries reducing P99 latency by 45%.');

      // Verify card status switched to Applied ✓
      expect(container.textContent).toContain('Applied ✓');
      expect(container.textContent).toContain('Applied to tailored resume & re-scored');
      expect(container.textContent).not.toContain('Accept & Apply');

      // Verify ScoreRecalculationBanner rendered with score deltas and action buttons
      expect(container.textContent).toContain('Resume Tailored & Re-Scored in Real Time');
      expect(container.textContent).toContain('ATS Readiness');
      expect(container.textContent).toContain('+17 pts');
      expect(container.textContent).toContain('Semantic Job Fit');
      expect(container.textContent).toContain('+18%');
      expect(container.textContent).toContain('Preview Tailored PDF');
      expect(container.textContent).toContain('Download PDF');
    });

    test('Reject flow: cleanly dismisses card without calling mutation API or side effects', async () => {
      let applyCalled = false;

      api.get = (async () => ({ data: { success: true, tailoredResume: null } })) as any;
      api.post = (async (url: string) => {
        if (url.includes('/suggestions')) {
          return {
            data: {
              success: true,
              suggestions: [
                {
                  id: 'sug-rej-1',
                  section: 'projects',
                  bulletIndex: 0,
                  originalText: 'Built a toy app.',
                  suggestedText: 'Architected scalable multi-tenant SaaS application in Next.js.',
                  rationale: 'Highlights architecture skills.',
                  verifiedSkillsUsed: ['Next.js', 'SaaS'],
                  status: 'pending',
                },
                {
                  id: 'sug-rej-2',
                  section: 'projects',
                  bulletIndex: 1,
                  originalText: 'Created unit tests.',
                  suggestedText: 'Implemented automated end-to-end integration test suites with 92% coverage.',
                  rationale: 'Demonstrates QA rigor.',
                  verifiedSkillsUsed: ['Integration Testing'],
                  status: 'pending',
                },
              ],
            },
          };
        }
        if (url.includes('/apply-suggestion')) {
          applyCalled = true;
          return { data: { success: true } };
        }
        return { data: {} };
      }) as any;

      root.render(<ResumeTailorStudio resumeId="res-rej-1" jobId="job-rej-1" />);

      await sleep(250);
      expect(container.textContent).toContain('2 available');

      const dismissButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('Dismiss')
      );
      expect(dismissButtons.length).toBe(2);

      // Dismiss the first suggestion
      dismissButtons[0].click();
      await sleep(150);

      // Assert no applySuggestion API was triggered
      expect(applyCalled).toBe(false);

      // Assert first card is marked as Dismissed with line-through styling
      expect(container.textContent).toContain('Dismissed');
      // Available counter decremented
      expect(container.textContent).toContain('1 available');
    });

    test('Concurrency guard: prevents duplicate in-flight requests when clicking multiple suggestions concurrently', async () => {
      let applyCount = 0;
      let resolveFirstPromise: ((value: any) => void) | null = null;

      api.get = (async () => ({ data: { success: true, tailoredResume: null } })) as any;
      api.post = (async (url: string) => {
        if (url.includes('/suggestions')) {
          return {
            data: {
              success: true,
              suggestions: [
                {
                  id: 'sug-race-1',
                  section: 'experience',
                  bulletIndex: 0,
                  originalText: 'Original text 1',
                  suggestedText: 'Suggested text 1',
                  rationale: 'Rationale 1',
                  verifiedSkillsUsed: ['SkillA'],
                  status: 'pending',
                },
                {
                  id: 'sug-race-2',
                  section: 'experience',
                  bulletIndex: 1,
                  originalText: 'Original text 2',
                  suggestedText: 'Suggested text 2',
                  rationale: 'Rationale 2',
                  verifiedSkillsUsed: ['SkillB'],
                  status: 'pending',
                },
              ],
            },
          };
        }
        if (url.includes('/apply-suggestion')) {
          applyCount++;
          return new Promise((resolve) => {
            resolveFirstPromise = resolve;
          });
        }
        return { data: {} };
      }) as any;

      root.render(<ResumeTailorStudio resumeId="res-race-1" jobId="job-race-1" />);

      await sleep(250);
      const acceptButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
        b.textContent?.includes('Accept & Apply')
      );
      expect(acceptButtons.length).toBe(2);

      // Click first Accept button -> triggers in-flight request
      acceptButtons[0].click();
      await sleep(50);

      // Verify button shows spinner and is disabled
      expect(acceptButtons[0].textContent).toContain('Applying & Re-scoring…');
      expect((acceptButtons[0] as HTMLButtonElement).disabled).toBe(true);
      expect(applyCount).toBe(1);

      // Concurrently click second Accept button and double-click first Accept button
      acceptButtons[1].click();
      acceptButtons[0].click();
      await sleep(100);

      // Assert that secondary requests were blocked by applyingId guard
      expect(applyCount).toBe(1);

      // Resolve the in-flight promise
      resolveFirstPromise?.({
        data: {
          success: true,
          tailoredResumeId: 'tailored-res-race-1',
          storagePath: 'path/tailored.pdf',
          previousScores: { atsScore: 65, semanticScore: 60 },
          updatedScores: { atsScore: 80, semanticScore: 75 },
          scoreDelta: { atsDelta: 15, semanticDelta: 15 },
          pdfUrl: '/api/v1/resumes/tailored-res-race-1/file',
        },
      });

      await sleep(150);

      // Verify first is applied and applyCount is still exactly 1
      expect(applyCount).toBe(1);
      expect(container.textContent).toContain('Applied ✓');
    });

    test('Error resilience: handles API failure cleanly and resets interactive state', async () => {
      api.get = (async () => ({ data: { success: true, tailoredResume: null } })) as any;
      api.post = (async (url: string) => {
        if (url.includes('/suggestions')) {
          return {
            data: {
              success: true,
              suggestions: [
                {
                  id: 'sug-err-1',
                  section: 'experience',
                  bulletIndex: 0,
                  originalText: 'Original text',
                  suggestedText: 'Suggested text',
                  rationale: 'Rationale',
                  verifiedSkillsUsed: ['SkillA'],
                  status: 'pending',
                },
              ],
            },
          };
        }
        if (url.includes('/apply-suggestion')) {
          throw new Error('500 Internal Server Error: Failed to render PDF');
        }
        return { data: {} };
      }) as any;

      root.render(<ResumeTailorStudio resumeId="res-err-1" jobId="job-err-1" />);

      await sleep(250);
      const acceptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Accept & Apply')
      );
      expect(acceptBtn).toBeDefined();

      acceptBtn?.click();
      await sleep(200);

      // Error alert banner should appear
      expect(container.textContent).toContain('Unable to complete request');

      // Button should be reset back from spinner to Accept & Apply
      const restoredBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Accept & Apply')
      );
      expect(restoredBtn).toBeDefined();
      expect((restoredBtn as HTMLButtonElement).disabled).toBe(false);
      expect(container.textContent).not.toContain('Applied ✓');
    });
  });

  describe('3. Score Propagation to JobDetail and JobCard', () => {
    test('accepting suggestion updates both JobDetail hero score and active JobCard badge in real time', async () => {
      api.get = (async (url: string) => {
        if (url === '/resumes') {
          return { data: { resumes: [{ id: 'res-prop-1', fileName: 'PropResume.pdf' }] } };
        }
        if (url === '/profile/job-preferences') {
          return { data: { preferences: { target_roles: ['Principal Architect'] } } };
        }
        if (url.includes('/tailor/')) {
          return { data: { success: true, tailoredResume: null } };
        }
        return { data: {} };
      }) as any;

      api.post = (async (url: string) => {
        if (url === '/recommendation-runs/roles') {
          return { data: { roleDiscovery: { roles: [{ title: 'Principal Architect' }] } } };
        }
        if (url === '/recommendation-runs') {
          return {
            data: {
              recommendations: [
                {
                  id: 'job-prop-100',
                  title: 'Principal Cloud Architect',
                  company: 'Enterprise Cloud Corp',
                  fitScore: 62,
                  matchScore: 62,
                },
              ],
            },
          };
        }
        if (url.includes('/suggestions')) {
          return {
            data: {
              success: true,
              suggestions: [
                {
                  id: 'sug-prop-1',
                  section: 'experience',
                  bulletIndex: 0,
                  originalText: 'Designed cloud systems.',
                  suggestedText: 'Designed multi-region AWS cloud infrastructure achieving 99.999% uptime.',
                  rationale: 'Directly demonstrates enterprise HA requirements.',
                  verifiedSkillsUsed: ['AWS', 'High Availability'],
                  status: 'pending',
                },
              ],
            },
          };
        }
        if (url.includes('/apply-suggestion')) {
          return {
            data: {
              success: true,
              tailoredResumeId: 'tailored-res-prop-100',
              storagePath: 'user/jobs/job-prop-100/tailored.pdf',
              previousScores: { atsScore: 68, semanticScore: 62 },
              updatedScores: { atsScore: 89, semanticScore: 84 },
              scoreDelta: { atsDelta: 21, semanticDelta: 22 },
              pdfUrl: '/api/v1/resumes/tailored-res-prop-100/file',
            },
          };
        }
        return { data: {} };
      }) as any;

      root.render(
        <MemoryRouter>
          <JobsPage />
        </MemoryRouter>
      );

      // Populate jobs
      await sleep(250);
      const refreshBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Refresh matches')
      );
      refreshBtn?.click();
      await sleep(350);

      // Verify initial score on JobCard and JobDetail
      const initialCardBadge = container.querySelector('.fit-badge p')?.textContent?.trim();
      const initialDetailScore = container.querySelector('.job-detail__score p')?.textContent?.trim();

      expect(initialCardBadge).toBe('62%');
      expect(initialDetailScore).toBe('62%');

      // Open ResumeTailorStudio
      const tailorBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Tailor Resume for this Job')
      );
      tailorBtn?.click();
      await sleep(350);

      // Accept suggestion
      const acceptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Accept & Apply')
      );
      expect(acceptBtn).toBeDefined();
      acceptBtn?.click();
      await sleep(350);

      // Verify real-time score propagation to BOTH JobCard and JobDetail
      const updatedCardBadge = container.querySelector('.fit-badge p')?.textContent?.trim();
      const updatedDetailScore = container.querySelector('.job-detail__score p')?.textContent?.trim();

      expect(updatedCardBadge).toBe('84%');
      expect(updatedDetailScore).toBe('84%');

      // Verify score delta banner shows ATS (+21 pts) and Semantic (+22%)
      expect(container.textContent).toContain('+21 pts');
      expect(container.textContent).toContain('+22%');
    });
  });
});
