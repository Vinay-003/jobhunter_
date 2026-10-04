import { test, expect } from 'bun:test';
import { stripHtml, deduplicateJobs } from '../providers/jobs/jobStore.js';
import { recommendationCacheValid, recommendationDiagnostics, recommendationSnapshot } from '../services/recommendationPersistence.js';

const job = (source: string, externalId: string, location: string, description: string, url: string) => ({ source, externalId, title:'Backend Engineer', company:'Acme', location, description, url, descriptionQuality: description.length > 200 ? 'full' : 'snippet' });

test('HTML structure survives plain-text sanitization', () => {
  expect(stripHtml('<h2>Requirements</h2><ul><li>TypeScript</li><li>PostgreSQL</li></ul><p>Apply now</p><script>secret()</script>')).toBe('Requirements\n- TypeScript\n- PostgreSQL\nApply now');
});

test('overlapping cross-feed descriptions merge and retain richer source; geographic requisitions stay distinct', () => {
  const full = 'Build TypeScript services and PostgreSQL databases for internal developer tools. Collaborate with engineers on API reliability and observability. '.repeat(3);
  const jobs = [job('jooble','a','Toronto, Canada',full.slice(0,150),'https://feed.example/a'),job('adzuna','b','Toronto, Canada',full,'https://redirect.example/b')];
  const merged = deduplicateJobs(jobs as any);
  expect(merged).toHaveLength(1);
  expect(merged[0].description).toBe(full);
  expect(merged[0].source).toBe('adzuna');
  expect(merged[0].provenance).toHaveLength(2);
  expect(deduplicateJobs([...jobs,job('remotive','c','Berlin, Germany',full,'https://redirect.example/c')] as any)).toHaveLength(2);
});

test('cache requires current ranker/profile and bounded age, with explicit refresh and date window expiry', () => {
  const run = { ranker_version:'rank-1', profile_version:'profile-1', completed_at:'2026-10-04T00:00:00Z' };
  const now = new Date('2026-10-04T00:01:00Z');
  expect(recommendationCacheValid(run, 'rank-1','profile-1', 7, now, false)).toBe(true);
  expect(recommendationCacheValid(run, 'rank-2','profile-1', 7, now, false)).toBe(false);
  expect(recommendationCacheValid(run, 'rank-1','profile-2', 7, now, false)).toBe(false);
  expect(recommendationCacheValid(run, 'rank-1','profile-1', 7, now, true)).toBe(false);
  expect(recommendationCacheValid(run, 'rank-1','profile-1', 1, new Date('2026-10-06T00:00:00Z'), false)).toBe(false);
});

test('snapshot and diagnostics serialize for readback', () => {
  expect(recommendationSnapshot({ title:'Engineer', scoreDetails:{ seniorityPenalty:35 } }).scoreDetails).toEqual({seniorityPenalty:35});
  expect(recommendationDiagnostics({provider_status_json:[{status:'error'}],query_plan_json:{queries:['Engineer'],rejectedReasons:{seniority:2}}})).toMatchObject({sources:[{status:'error'}],queries:['Engineer'],rejectedReasons:{seniority:2}});
});
