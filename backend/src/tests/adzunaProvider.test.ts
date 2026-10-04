import { test, expect, mock, beforeEach, afterEach } from 'bun:test';
import axios from 'axios';

// Unit tests must never reserve real quotas or write fabricated jobs to Supabase.
const pool = { query: mock(async (sql: string) => ({ rows: sql.includes('INSERT INTO external_api_usage') ? [{ request_count: 1 }] : sql.includes('INSERT INTO jobs') ? [{ id: 'test-job' }] : [] })) };
mock.module('../config/database.js', () => ({ default: pool }));
const { AdzunaProvider } = await import('../providers/jobs/AdzunaProvider.js');
const originalGet = axios.get;
beforeEach(() => pool.query.mockClear());
afterEach(() => { axios.get = originalGet; });

const query = { keywords: 'Engineer' };

test('normalizes country casing and preserves Adzuna snippet text', async () => {
  const get = axios.get;
  (axios as any).get = mock(async (_url: string) => ({ data: { results: [{ id: '1', title: 'Engineer', company: { display_name: 'Co' }, description: 'A'.repeat(500), salary_min: 0, salary_max: 0 }] } }));
  try {
    const result = await new AdzunaProvider({ appId: 'id', appKey: 'key', country: '  gb ' }).searchResult({ ...query, country: '  IN ' });
    expect(result.status).toBe('ok');
    expect(result.jobs[0]).toMatchObject({ description: 'A'.repeat(500), descriptionQuality: 'snippet', salary: { min: 0, max: 0 } });
    expect((axios.get as any).mock.calls[0][0]).toContain('/in/');
  } finally { (axios as any).get = get; }
});

test('unsupported country is rejected before an HTTP request', async () => {
  const get = axios.get;
  (axios as any).get = mock(async () => { throw new Error('must not call'); });
  try {
    const result = await new AdzunaProvider({ appId: 'id', appKey: 'key', country: 'INX' }).searchResult(query);
    expect(result).toMatchObject({ status: 'error', fallbackReason: 'error', errorCode: 'ADZUNA_UNSUPPORTED_COUNTRY' });
    expect((axios.get as any).mock.calls).toHaveLength(0);
    expect(pool.query.mock.calls.some(([sql]) => sql.includes('external_api_usage'))).toBe(false);
  } finally { (axios as any).get = get; }
});

test('HTTP status is exposed as a safe Adzuna error code', async () => {
  const get = axios.get;
  (axios as any).get = mock(async () => { const error: any = new Error('private payload'); error.response = { status: 401, data: { secret: 'nope' } }; error.isAxiosError = true; throw error; });
  try {
    expect(await new AdzunaProvider({ appId: 'id', appKey: 'key' }).searchResult(query)).toMatchObject({ status: 'error', errorCode: 'ADZUNA_HTTP_401' });
  } finally { (axios as any).get = get; }
});

test('a successful empty response remains empty rather than using unrelated cache', async () => {
  const get = axios.get;
  (axios as any).get = mock(async () => ({ data: { results: [] } }));
  try { expect(await new AdzunaProvider({ appId: 'id', appKey: 'key' }).searchResult(query)).toEqual({ jobs: [], status: 'empty', fallbackReason: 'empty' }); }
  finally { (axios as any).get = get; }
});

test('configuration country and Austrian country are supported; missing description stays unknown', async () => {
  const get = mock(async () => ({ data: { results: [{ id: '2', title: 'Engineer', company: { display_name: 'Example' } }] } }));
  (axios as any).get = get;
  const result = await new AdzunaProvider({ appId: 'id', appKey: 'key', country: ' AT ' }).searchResult(query);
  expect(result.status).toBe('ok');
  expect((get.mock.calls[0] as unknown as [string])[0]).toContain('/at/');
  expect(result.jobs[0].descriptionQuality).toBe('unknown');
});
