import { test, expect, mock } from 'bun:test';
import axios from 'axios';
import { JoobleProvider } from '../providers/jobs/JoobleProvider.js';
import { ArbeitnowProvider } from '../providers/jobs/ArbeitnowProvider.js';
import pool from '../config/database.js';

const query = { keywords: 'Engineer' };

test('missing credentials distinguish unavailable from empty, legacy search remains an array', async () => {
  const provider = new JoobleProvider('');
  const db = pool.query;
  (pool as any).query = mock(async () => ({ rows: [] }));
  try {
    expect(await provider.searchResult(query)).toMatchObject({ status: 'unavailable', jobs: [], fallbackReason: 'unavailable' });
    expect(await provider.search(query)).toEqual([]);
  } finally { (pool as any).query = db; }
});

test('network failure with cached database rows reports fallback and reason', async () => {
  const provider = new JoobleProvider('test-key');
  const post = axios.post, db = pool.query;
  (axios as any).post = mock(async () => { throw new Error('offline'); });
  (pool as any).query = mock(async () => ({ rows: [{ source: 'other', external_id: '1', title: 'Engineer', company: 'Co' }] }));
  try {
    const result = await provider.searchResult(query);
    expect(result.status).toBe('fallback');
    expect(result.fallbackReason).toBe('error');
    expect(result.jobs[0].retrieval).toMatchObject({ status: 'fallback', requestedProvider: 'jooble', fallbackSource: 'other' });
  } finally { (axios as any).post = post; (pool as any).query = db; }
});

test('public provider distinguishes successful empty result from failed request', async () => {
  const provider = new ArbeitnowProvider();
  const get = axios.get, db = pool.query;
  (pool as any).query = mock(async () => ({ rows: [] }));
  try {
    (axios as any).get = mock(async () => ({ data: { data: [] } }));
    expect(await provider.searchResult(query)).toMatchObject({ status: 'empty', fallbackReason: 'empty' });
    (axios as any).get = mock(async () => { throw new Error('offline'); });
    expect(await provider.searchResult(query)).toMatchObject({ status: 'error', fallbackReason: 'error' });
  } finally { (axios as any).get = get; (pool as any).query = db; }
});
