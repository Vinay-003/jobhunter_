import type { EmbeddingProvider } from './EmbeddingProvider.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
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

const DEFAULT_MODEL = process.env.EMBEDDING_MODEL_ID || 'anass1209/resume-job-matcher-all-MiniLM-L6-v2';
// Xenova ONNX mirror for base; anass fine-tune is not on Xenova hub (needs Python)
// If DEFAULT_MODEL is anass, Local will try Python sentence_transformers first, then fallback to Xenova base
const FALLBACK_ONNX = 'Xenova/all-MiniLM-L6-v2';
const RESOLVED_MODEL = process.env.LOCAL_EMBEDDING_MODEL || DEFAULT_MODEL;

export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimension = 384;
  private mock = new MockEmbeddingProvider();
  private pipe: any = null;
  private loading: Promise<any> | null = null;
  private failed = false;
  private lastUsedMock = false;

  constructor(opts?: { modelId?: string }) {
    this.modelId = opts?.modelId ?? RESOLVED_MODEL;
  }

  async embed(input: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }): Promise<{ vectors: number[][]; modelId: string; dimension: number }> {
    if (this.failed) {
      const r = await this.mock.embed(input as any);
      return { vectors: r.vectors, modelId: r.modelId, dimension: r.dimension };
    }
    const texts = input.texts.map(t => t.length > 5000 ? t.slice(0, 5000) : t);
    if (texts.length === 0) return { vectors: [], modelId: this.modelId, dimension: this.dimension };
    this.lastUsedMock = false;
    // batch 32
    if (texts.length > 32) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 32) {
        const c = await this.embedChunk(texts.slice(i, i + 32));
        out.push(...c);
      }
      if (this.lastUsedMock) return { vectors: out, modelId: 'mock-384', dimension: 384 };
      return { vectors: out, modelId: this.modelId, dimension: this.dimension };
    }
    const vectors = await this.embedChunk(texts);
    if (this.lastUsedMock) return { vectors, modelId: 'mock-384', dimension: 384 };
    return { vectors, modelId: this.modelId, dimension: this.dimension };
  }

  private async embedChunk(texts: string[]): Promise<number[][]> {
    // If model is anass fine-tune, try Python sentence_transformers first (true fine-tune)
    if (this.modelId.includes('anass1209')) {
      const pyVectors = await this.embedViaPython(texts).catch(() => null);
      if (pyVectors) return pyVectors;
      // fallback to base ONNX (same arch, 384d) if Python unavailable
      console.warn(`[LocalEmbeddingProvider] anass Python failed, falling back to ${FALLBACK_ONNX} ONNX`);
      const basePipe = await this.getPipeForModel(FALLBACK_ONNX);
      if (basePipe) return this.runOnnx(basePipe, texts);
    }
    const pipe = await this.getPipe();
    if (!pipe) {
      this.lastUsedMock = true;
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
      this.lastUsedMock = true;
      const r = await this.mock.embed({ texts, purpose: 'jd' as any });
      return r.vectors;
    }
  }

  private async getPipe(): Promise<any> {
    return this.getPipeForModel(this.modelId);
  }

  private pipeCache = new Map<string, any>();
  private async getPipeForModel(modelId: string): Promise<any> {
    if (this.pipeCache.has(modelId)) return this.pipeCache.get(modelId);
    if (this.loading) return this.loading;
    this.loading = (async () => {
      try {
        // @ts-ignore - optional dep
        const mod: any = await import('@xenova/transformers').catch((e) => {
          console.warn('[LocalEmbeddingProvider] @xenova/transformers not installed, fallback to mock. Install: npm i @xenova/transformers onnxruntime-node');
          throw e;
        });
        if (mod.env) {
          mod.env.allowLocalModels = true;
          mod.env.cacheDir = './.cache/huggingface';
        }
        console.log(`[LocalEmbeddingProvider] loading ${modelId} ... (first run downloads ~80MB)`);
        const pipe = await mod.pipeline('feature-extraction', modelId);
        this.pipeCache.set(modelId, pipe);
        if (modelId === this.modelId) this.pipe = pipe;
        console.log(`[LocalEmbeddingProvider] loaded ${modelId}`);
        return pipe;
      } catch (e: any) {
        console.warn(`[LocalEmbeddingProvider] load failed: ${e.message} -> mock`);
        return null;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  private async runOnnx(pipe: any, texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (const t of texts) {
      const out = await pipe(t, { pooling: 'mean', normalize: true });
      const arr = Array.from(out.data as Float32Array);
      if (arr.length !== this.dimension) {
        const fixed = new Array(this.dimension).fill(0);
        for (let i = 0; i < Math.min(arr.length, this.dimension); i++) fixed[i] = arr[i];
        vectors.push(fixed);
      } else vectors.push(arr);
    }
    return vectors;
  }

  private async embedViaPython(texts: string[]): Promise<number[][] | null> {
    return new Promise((resolve) => {
      try {
        // Support both cwd=repo-root (backend/python/venv) and cwd=backend (python/venv),
        // plus explicit PYTHON_PATH override.
        const candidates = [
          process.env.PYTHON_PATH,
          path.resolve(process.cwd(), 'backend/python/venv/bin/python'),
          path.resolve(process.cwd(), 'python/venv/bin/python'),
          '/home/mylappy/Projects/jobhunter_/backend/python/venv/bin/python',
        ].filter(Boolean) as string[];
        let pyPath = 'python3';
        for (const c of candidates) {
          try { if (c && fs.existsSync(c)) { pyPath = c; break; } } catch { /* ignore */ }
        }
        const py = spawn(pyPath, ['-c', `
import sys, json
try:
    from sentence_transformers import SentenceTransformer
    model_id = sys.argv[1]
    texts = json.loads(sys.argv[2])
    m = SentenceTransformer(model_id)
    vecs = m.encode(texts, normalize_embeddings=True).tolist()
    print(json.dumps(vecs))
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`, this.modelId, JSON.stringify(texts)]);
        let out = '', err = '';
        // Cold SentenceTransformer load can take 60-90s; allow 120s per batch.
        const t = setTimeout(() => { try { py.kill(); } catch {} console.warn('[LocalEmbeddingProvider] Python embed timed out after 120s'); resolve(null); }, 120000);
        py.stdout.on('data', (d: Buffer) => out += d.toString());
        py.stderr.on('data', (d: Buffer) => err += d.toString());
        py.on('close', (code: number) => {
          clearTimeout(t);
          if (code !== 0) {
            console.warn('[LocalEmbeddingProvider] Python anass failed:', err.slice(0,400));
            resolve(null);
          } else {
            try {
              const vecs = JSON.parse(out);
              if (Array.isArray(vecs) && Array.isArray(vecs[0])) resolve(vecs as number[][]);
              else resolve(null);
            } catch { resolve(null); }
          }
        });
        py.on('error', () => resolve(null));
      } catch { resolve(null); }
    });
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
