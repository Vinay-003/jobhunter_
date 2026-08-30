import type { EmbeddingProvider } from './EmbeddingProvider.js';
import crypto from 'node:crypto';

/**
 * Deterministic mock embedding provider.
 * Produces L2-normalized 384-dim vectors derived from SHA256 hash of text.
 * Cached by hash to avoid recomputation.
 */
export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly modelId = 'mock-384';
  readonly dimension = 384;

  private cache = new Map<string, number[]>();

  async embed(input: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }): Promise<{ vectors: number[][]; modelId: string; dimension: number }> {
    const vectors = input.texts.map((t) => this.embedOne(t));
    return { vectors, modelId: this.modelId, dimension: this.dimension };
  }

  private embedOne(text: string): number[] {
    const key = crypto.createHash('sha256').update(text).digest('hex');
    const cached = this.cache.get(key);
    if (cached) return cached;

    // Derive 384 numbers from hash bytes deterministically.
    // Use repeated hashing with counter to get enough bytes.
    const nums: number[] = [];
    let counter = 0;
    while (nums.length < this.dimension) {
      const h = crypto.createHash('sha256').update(key + ':' + counter).digest();
      for (let i = 0; i < h.length && nums.length < this.dimension; i++) {
        // Map byte 0-255 -> [-0.5, 0.5)
        nums.push((h[i] / 255) - 0.5);
      }
      counter++;
    }

    // Mix in length signal and char sum to differentiate texts with same hash prefix pattern
    // (already deterministic via hash, but add slight variation)
    const lenFactor = Math.min(text.length / 5000, 1);
    for (let i = 0; i < nums.length; i++) {
      // small perturbation based on length to avoid exact collisions for empty vs non-empty
      nums[i] += lenFactor * 0.01 * Math.sin(i);
    }

    // L2 normalize
    const norm = Math.sqrt(nums.reduce((s, v) => s + v * v, 0)) || 1;
    const normalized = nums.map((v) => v / norm);

    this.cache.set(key, normalized);
    return normalized;
  }

  /** Utility for cosine similarity (for ranking fallback) */
  static cosine(a: number[], b: number[]): number {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    const denom = Math.sqrt(na) * Math.sqrt(nb) || 1;
    return dot / denom;
  }
}

export default MockEmbeddingProvider;
