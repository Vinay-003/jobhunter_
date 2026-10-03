import { describe, test, expect, afterAll } from 'bun:test';
import { LocalEmbeddingProvider } from '../providers/embeddings/LocalEmbeddingProvider.js';

const enabled = process.env.RUN_LOCAL_MODEL_TESTS === '1';
describe.skipIf(!enabled)('real local model (opt-in, never AWS)', () => {
  const provider = new LocalEmbeddingProvider();
  afterAll(() => provider.close());
  test('valid normalized vectors and stable repeated calls through persistent worker', async () => {
    const input = { texts:['Build Python REST APIs with PostgreSQL.', 'Bake bread and prepare pastries.'], purpose:'jd' as const };
    const first = await provider.embed(input);
    const second = await provider.embed(input);
    expect(first.modelId).not.toContain('mock');
    expect(first.dimension).toBe(384);
    expect(first.vectors).toEqual(second.vectors);
    expect(first.vectors).toHaveLength(2);
    expect(Math.hypot(...first.vectors[0])).toBeCloseTo(1,4);
    expect(first.vectors[0]).not.toEqual(first.vectors[1]);
  },120000);
  test('retains meaningful text beyond original tokenizer truncation', async () => {
    const prefix = 'Build reliable software applications. '.repeat(80);
    const result = await provider.embed({texts:[prefix, prefix + ' baking pastries '.repeat(80)],purpose:'job'});
    expect(result.vectors[0]).not.toEqual(result.vectors[1]);
  },120000);
});
