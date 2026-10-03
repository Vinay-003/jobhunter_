import crypto from 'node:crypto';
import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { validateVectors } from './validateVectors.js';

export const CHUNKER_VERSION = 'token-chunks-v1';
export const EVIDENCE_BUILDER_VERSION = 'professional-evidence-v1';

type Purpose = 'resume' | 'job' | 'jd';
type Query = { query(sql: string, params: unknown[]): Promise<{ rows: any[] }> };
export type CacheIdentity = {
  purpose: Purpose; ownerId?: string; modelId: string; modelRevision: string;
  chunkerVersion?: string; evidenceBuilderVersion?: string;
};
export type CacheItem = CacheIdentity & { text: string };

function key(item: CacheItem) {
  if (!item.text || !item.modelId || !item.modelRevision) throw new Error('Embedding cache requires text and pinned model identity');
  validateScope(item);
  return [item.purpose, item.ownerId ?? null, crypto.createHash('sha256').update(item.text).digest('hex'), item.modelId,
    item.modelRevision, item.chunkerVersion ?? CHUNKER_VERSION, item.evidenceBuilderVersion ?? EVIDENCE_BUILDER_VERSION];
}

function validateScope(item: { purpose: Purpose; ownerId?: string }) {
  if (item.purpose === 'resume' && !item.ownerId) throw new Error('Resume embedding requires owner');
  if (item.purpose !== 'resume' && item.ownerId) throw new Error('Public embedding must not carry owner');
}

export function embeddingCache(db: Query) {
  async function get(item: CacheItem): Promise<number[] | null> {
    const params = key(item);
    const result = await db.query(`SELECT vector, dimension FROM embedding_cache WHERE purpose=$1 AND owner_id IS NOT DISTINCT FROM $2
      AND content_hash=$3 AND model_id=$4 AND model_revision=$5 AND chunker_version=$6 AND evidence_builder_version=$7`, params);
    const row = result.rows[0];
    if (!row) return null;
    validateVectors([row.vector], 1, row.dimension);
    return row.vector;
  }
  async function set(item: CacheItem, vector: number[]): Promise<void> {
    validateVectors([vector], 1, vector.length);
    const params = key(item);
    await db.query(`INSERT INTO embedding_cache
      (purpose,owner_id,content_hash,model_id,model_revision,chunker_version,evidence_builder_version,dimension,vector)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
      ON CONFLICT (purpose, (COALESCE(owner_id::text, '')), content_hash, model_id, model_revision, chunker_version, evidence_builder_version)
      DO NOTHING`, [...params, vector.length, JSON.stringify(vector)]);
  }
  async function batch(items: CacheItem[]): Promise<(number[] | null)[]> {
    return Promise.all(items.map(get));
  }
  return { get, set, batch };
}

/** One identity across cached and fresh vectors; on ambiguity discard all semantic vectors. */
export async function embedCached(
  db: Query, provider: EmbeddingProvider, groups: { purpose: Purpose; texts: string[]; ownerId?: string }[],
  identity: { modelId: string; modelRevision: string } | null,
): Promise<{ groups: number[][][]; modelId: string; modelRevision: string | null; dimension: number }> {
  groups.forEach(validateScope);
  const cache = embeddingCache(db);
  const items = groups.flatMap(group => group.texts.map(text => ({ ...group, text, modelId: identity?.modelId ?? '', modelRevision: identity?.modelRevision ?? '' })));
  // Never look up an unpinned revision: an old vector might refer to a replaced model.
  const hits = identity ? await cache.batch(items) : items.map(() => null);
  const missing = items.map((item, index) => ({ item, index })).filter(({ index }) => !hits[index]);
  let modelId = identity?.modelId ?? '';
  let modelRevision: string | null = identity?.modelRevision ?? null;
  let dimension = hits.find(Boolean)?.length ?? 0;
  let observedRevision: string | null | undefined;
  if (missing.length) {
    // Embedding purpose is advisory to current providers; isolate purpose batches for future providers.
    for (const purpose of ['resume', 'job', 'jd'] as const) {
      const subset = missing.filter(({ item }) => item.purpose === purpose);
      if (!subset.length) continue;
      const response = await provider.embed({ texts: subset.map(({ item }) => item.text), purpose });
      validateVectors(response.vectors, subset.length, response.dimension);
      if (response.modelId.includes('mock')) throw new Error('Mock vectors are not semantic evidence');
      if (modelId && response.modelId !== modelId) throw new Error('Embedding model changed within batch');
      if (dimension && dimension !== response.dimension) throw new Error('Embedding dimension changed within batch');
      const revision = response.modelRevision ?? null;
      if (observedRevision !== undefined && revision !== observedRevision) throw new Error('Embedding revision changed within batch');
      if (modelRevision && revision !== modelRevision) throw new Error('Embedding revision changed within batch');
      if (identity && response.modelRevision !== identity.modelRevision) throw new Error('Embedding revision does not match pinned identity');
      observedRevision = revision;
      modelId = response.modelId;
      modelRevision = revision;
      dimension = response.dimension;
      subset.forEach(({ index }, i) => { hits[index] = response.vectors[i]; });
    }
    // Persist only when the provider reports an immutable revision, never a guessed one.
    if (modelRevision) {
      await Promise.all(missing.map(({ item, index }) => cache.set({ ...item, modelId, modelRevision: modelRevision! }, hits[index]!)));
    }
  }
  const vectors = hits as number[][];
  validateVectors(vectors, items.length, dimension);
  let offset = 0;
  return { groups: groups.map(({ texts }) => { const group = vectors.slice(offset, offset + texts.length); offset += texts.length; return group; }), modelId, modelRevision, dimension };
}
