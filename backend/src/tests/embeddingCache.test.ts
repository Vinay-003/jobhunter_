import { describe, expect, test } from 'bun:test';
import { embeddingCache, embedCached } from '../providers/embeddings/embeddingCache.js';

function memoryDb() {
  const rows: any[] = [];
  return { query: async (sql: string, params: unknown[]) => {
    if (sql.startsWith('SELECT')) return { rows: rows.filter(row => row.key.every((value: unknown, index: number) => value === params[index])).map(row => row.data) };
    rows.push({ key: params.slice(0, 7), data: { dimension: params[7], vector: JSON.parse(params[8] as string) } });
    return { rows: [] };
  } };
}
const identity = { modelId: 'model-a', modelRevision: 'revision-1' };
const item = { purpose: 'resume' as const, ownerId: '9f110114-77f0-467a-80e0-56c6b32b64f7', text: 'project evidence', ...identity };

describe('persistent embedding cache', () => {
  test('hit, owner isolation, and key invalidation', async () => {
    const cache = embeddingCache(memoryDb());
    expect(await cache.get(item)).toBeNull();
    await cache.set(item, [0.6, 0.8]);
    expect(await cache.get(item)).toEqual([0.6, 0.8]);
    expect(await cache.batch([item, { ...item, text: 'different' }])).toEqual([[0.6, 0.8], null]);
    for (const changed of [
      { ownerId: '649e8313-0d99-4bd3-ab8d-08073dfe511b' }, { modelId: 'model-b' },
      { modelRevision: 'revision-2' }, { chunkerVersion: 'chunk-v2' },
      { evidenceBuilderVersion: 'evidence-v2' }, { text: 'modified evidence' },
    ]) expect(await cache.get({ ...item, ...changed })).toBeNull();
    await expect(cache.get({ ...item, ownerId: undefined })).rejects.toThrow();
    expect(await cache.get({ purpose: 'job', text: item.text, ...identity })).toBeNull();
  });

  test('only misses invoke provider, with unchanged model provenance', async () => {
    const db = memoryDb();
    const calls: string[][] = [];
    const provider = { embed: async ({ texts }: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }) => {
      calls.push(texts);
      return { vectors: texts.map(() => [0.6, 0.8]), dimension: 2, ...identity };
    } };
    const groups = [{ purpose: 'resume' as const, ownerId: item.ownerId, texts: [item.text] }, { purpose: 'jd' as const, texts: ['public description'] }];
    const first = await embedCached(db, provider, groups, identity);
    expect(first.groups).toEqual([[[0.6, 0.8]], [[0.6, 0.8]]]);
    const second = await embedCached(db, provider, groups, identity);
    expect(second).toEqual(first);
    expect(calls).toHaveLength(2);
    await embedCached(db, provider, [{ purpose: 'jd', texts: ['public description', 'new description'] }], identity);
    expect(calls[2]).toEqual(['new description']);
  });

  test('rejects mixed revisions and invalid vectors', async () => {
    const db = memoryDb();
    const groups = [{ purpose: 'jd' as const, texts: ['description'] }];
    await expect(embedCached(db, { embed: async () => ({ vectors: [[1]], dimension: 1, modelId: 'model-a', modelRevision: 'revision-2' }) }, groups, identity)).rejects.toThrow('revision');
    await expect(embedCached(db, { embed: async () => ({ vectors: [[Infinity]], dimension: 1, ...identity }) }, groups, identity)).rejects.toThrow('Invalid');
    await expect(embeddingCache(db).set(item, [NaN])).rejects.toThrow();
  });

  test('does not retroactively pin an unknown revision from a later purpose', async () => {
    const db = memoryDb();
    const groups = [{ purpose: 'resume' as const, ownerId: item.ownerId, texts: ['private'] }, { purpose: 'jd' as const, texts: ['public'] }];
    const provider = { embed: async ({ purpose }: { purpose: 'resume' | 'job' | 'jd'; texts: string[] }) => ({ vectors: [[1]], dimension: 1, modelId: identity.modelId, modelRevision: purpose === 'resume' ? null : identity.modelRevision }) };
    await expect(embedCached(db, provider, groups, null)).rejects.toThrow('revision');
    expect(await embeddingCache(db).get({ ...item, text: 'private' })).toBeNull();
  });

  test('returns unknown-revision vectors without caching them', async () => {
    const db = memoryDb();
    const groups = [{ purpose: 'resume' as const, ownerId: item.ownerId, texts: ['private'] }, { purpose: 'jd' as const, texts: ['public'] }];
    const result = await embedCached(db, { embed: async () => ({ vectors: [[1]], dimension: 1, modelId: identity.modelId, modelRevision: null }) }, groups, null);
    expect(result.modelRevision).toBeNull();
    expect(result.groups).toEqual([[[1]], [[1]]]);
    expect(await embeddingCache(db).get({ ...item, text: 'private' })).toBeNull();
    expect(await embeddingCache(db).get({ purpose: 'jd', text: 'public', ...identity })).toBeNull();
  });

  test('rejects pinned revision when provider reports unknown, without persistence', async () => {
    const db = memoryDb();
    await expect(embedCached(db, { embed: async () => ({ vectors: [[1]], dimension: 1, modelId: identity.modelId, modelRevision: null }) }, [{ purpose: 'jd', texts: ['public'] }], identity)).rejects.toThrow('revision');
    expect(await embeddingCache(db).get({ purpose: 'jd', text: 'public', ...identity })).toBeNull();
  });

  test('validates owner scope before calling provider even without identity', async () => {
    let calls = 0;
    const provider = { embed: async () => { calls++; return { vectors: [[1]], dimension: 1, ...identity }; } };
    await expect(embedCached(memoryDb(), provider, [{ purpose: 'resume', texts: ['private'] }], null)).rejects.toThrow('owner');
    await expect(embedCached(memoryDb(), provider, [{ purpose: 'jd', ownerId: item.ownerId, texts: ['public'] }], null)).rejects.toThrow('owner');
    expect(calls).toBe(0);
  });

  test('rejects inconsistent dimensions when every vector is a cache hit', async () => {
    const db = memoryDb();
    const cache = embeddingCache(db);
    await cache.set(item, [1, 0]);
    await cache.set({ purpose: 'jd', text: 'public', ...identity }, [1]);
    let calls = 0;
    await expect(embedCached(db, { embed: async () => { calls++; throw new Error('unexpected provider call'); } }, [
      { purpose: 'resume', ownerId: item.ownerId, texts: [item.text] }, { purpose: 'jd', texts: ['public'] },
    ], identity)).rejects.toThrow();
    expect(calls).toBe(0);
  });

  test('does not reuse another owner or revision in embedCached', async () => {
    const db = memoryDb();
    await embeddingCache(db).set(item, [1]);
    const seen: string[] = [];
    const provider = { embed: async ({ texts }: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }) => {
      seen.push(...texts); return { vectors: [[2]], dimension: 1, modelId: identity.modelId, modelRevision: 'revision-2' };
    } };
    const result = await embedCached(db, provider, [{ purpose: 'resume', ownerId: '649e8313-0d99-4bd3-ab8d-08073dfe511b', texts: [item.text] }], { ...identity, modelRevision: 'revision-2' });
    expect(result.groups).toEqual([[[2]]]);
    expect(seen).toEqual([item.text]);
    expect(await embeddingCache(db).get(item)).toEqual([1]);
  });
});
