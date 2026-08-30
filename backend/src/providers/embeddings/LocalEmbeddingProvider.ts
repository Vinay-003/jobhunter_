import type { EmbeddingProvider } from './EmbeddingProvider.js';
import crypto from 'node:crypto';
import { MockEmbeddingProvider } from './MockEmbeddingProvider.js';

/**
 * Local real inference provider.
 * Uses @xenova/transformers (ONNX) to run all-MiniLM-L6-v2 locally.
 * Falls back to MockEmbeddingProvider if model not installed / download fails.
 *
 * Env:
 *   EMBEDDING_PROVIDER=local   -> force local
 *   LOCAL_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2  (or anass1209/... if you have ONNX)
 *   HF_HUB_OFFLINE=1  -> skip download, fallback to mock
 *
 * First call downloads ~80MB to node_modules/.cache/huggingface
 * Subsequent calls are ~50-150ms per batch.
 */

const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
// anass1209 fine-tune is not on Xenova hub; base matches architecture (384d)
const FALLBACK_MODEL = process.env.LOCAL_EMBEDDING_MODEL || DEFAULT_MODEL;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimension = 384;
  private mock = new MockEmbeddingProvider();
  private pipe: any = null;
  private loading: Promise<any> | null = null;
  private failed = false;

  constructor(opts?: { modelId?: string }) {
    this.modelId = opts?.modelId ?? FALLBACK_MODEL;
  }

  async embed(input: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }): Promise<{ vectors: number[][]; modelId: string; dimension: number }> {
    if (this.failed) {
      const r = await this.mock.embed(input as any);
      return { vectors: r.vectors, modelId: `${this.modelId} (mock-fallback)`, dimension: this.dimension };
    }
    const texts = input.texts.map(t => t.length > 5000 ? t.slice(0, 5000) : t);
    if (texts.length === 0) return { vectors: [], modelId: this.modelId, dimension: this.dimension };
    // batch 32
    if (texts.length > 32) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 32) {
        const c = await this.embedChunk(texts.slice(i, i + 32));
        out.push(...c);
      }
      return { vectors: out, modelId: this.modelId, dimension: this.dimension };
    }
    const vectors = await this.embedChunk(texts);
    return { vectors, modelId: this.modelId, dimension: this.dimension };
  }

  private async embedChunk(texts: string[]): Promise<number[][]> {
    const pipe = await this.getPipe();
    if (!pipe) {
      const r = await this.mock.embed({ texts, purpose: 'jd' as any });
      return r.vectors;
    }
    try {
      // Xenova pipeline returns { data: Float32Array, dims: [1, 384] } per text
      const vectors: number[][] = [];
      for (const t of texts) {
        // mean pooling + normalize is done by pipeline option
        const out = await pipe(t, { pooling: 'mean', normalize: true });
        // out.data is Float32Array
        const arr = Array.from(out.data as Float32Array);
        // ensure 384
        if (arr.length !== this.dimension) {
          // pad/truncate (should not happen)
          const fixed = new Array(this.dimension).fill(0);
          for (let i = 0; i < Math.min(arr.length, this.dimension); i++) fixed[i] = arr[i];
          vectors.push(fixed);
        } else {
          vectors.push(arr);
        }
      }
      return vectors;
    } catch (e: any) {
      console.warn(`[LocalEmbeddingProvider] inference failed, falling back to mock: ${e.message}`);
      this.failed = true;
      const r = await this.mock.embed({ texts, purpose: 'jd' as any });
      return r.vectors;
    }
  }

  private async getPipe(): Promise<any> {
    if (this.pipe) return this.pipe;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        // dynamic import so not hard dep
        // @ts-ignore - optional dep, may not be installed
        const mod: any = await import('@xenova/transformers').catch((e) => {
          console.warn('[LocalEmbeddingProvider] @xenova/transformers not installed, fallback to mock. Install: npm i @xenova/transformers onnxruntime-node');
          throw e;
        });
        // optional: disable telemetry, set cache
        if (mod.env) {
          mod.env.allowLocalModels = true;
          // use node cache dir
          mod.env.cacheDir = './.cache/huggingface';
        }
        console.log(`[LocalEmbeddingProvider] loading ${this.modelId} ... (first run downloads ~80MB)`);
        const pipe = await mod.pipeline('feature-extraction', this.modelId);
        this.pipe = pipe;
        console.log(`[LocalEmbeddingProvider] loaded ${this.modelId}`);
        return pipe;
      } catch (e: any) {
        console.warn(`[LocalEmbeddingProvider] load failed: ${e.message} -> mock`);
        this.failed = true;
        return null;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  /** quick self-test for local dev */
  static async selfTest(): Promise<void> {
    const p = new LocalEmbeddingProvider();
    const r = await p.embed({ texts: ['hello world', 'hello world'], purpose: 'jd' });
    const same = r.vectors[0].every((v, i) => Math.abs(v - r.vectors[1][i]) < 1e-6);
    console.log(`[LocalEmbeddingProvider] selfTest same-text cosine ~1? ${same} dim=${r.dimension} model=${r.modelId}`);
  }
}

export default LocalEmbeddingProvider;
