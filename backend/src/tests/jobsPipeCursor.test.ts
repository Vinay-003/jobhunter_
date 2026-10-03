import { expect, mock, test } from 'bun:test';
import axios from 'axios';
import pool from '../config/database.js';
import { JobsPipeProvider } from '../providers/jobs/JobsPipeProvider.js';

test('JobsPipe uses the documented next cursor and reserves credits per page', async () => {
  const originalPost = axios.post, originalQuery = pool.query;
  const bodies: any[] = [], reservations: number[] = [];
  (pool as any).query = mock(async (sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO external_api_usage')) { reservations.push(params[2] as number); return { rows: [{ request_count: 15 }] }; }
    return { rows: [] };
  });
  (axios as any).post = mock(async (_url: string, body: any) => {
    bodies.push(body);
    return { data: { data: [{ id: bodies.length, job_title: 'Software Engineer', company: 'Example' }], metadata: { credits_charged: 1, next_cursor: bodies.length === 1 ? 'opaque-next' : null } } };
  });
  try {
    const provider = new JobsPipeProvider('fixture-only');
    const first = await provider.searchResult({ keywords: 'Software Engineer' });
    expect(first.nextCursor).toBe('opaque-next');
    const second = await provider.searchResult({ keywords: 'Software Engineer', cursor: first.nextCursor! });
    expect(second.nextCursor).toBeNull();
    expect(bodies[0].cursor).toBeUndefined();
    expect(bodies[1].cursor).toBe('opaque-next');
    expect(reservations).toEqual([bodies[0].limit, bodies[1].limit]);
  } finally { (axios as any).post = originalPost; (pool as any).query = originalQuery; }
});

test('JobsPipe quota exhaustion does not call API and reports budget limit', async () => {
  const originalPost = axios.post, originalQuery = pool.query;
  let requests = 0;
  (pool as any).query = mock(async () => ({ rows: [] }));
  (axios as any).post = mock(async () => { requests++; throw new Error('unexpected request'); });
  try {
    const result = await new JobsPipeProvider('fixture-only').searchResult({ keywords: 'Software Engineer', cursor: 'opaque' });
    expect(result).toMatchObject({ jobs: [], status: 'budgetLimited' });
    expect(requests).toBe(0);
  } finally { (axios as any).post = originalPost; (pool as any).query = originalQuery; }
});
