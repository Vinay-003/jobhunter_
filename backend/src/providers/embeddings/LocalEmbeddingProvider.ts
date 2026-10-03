import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { validateVectors } from './validateVectors.js';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import crypto from 'node:crypto';

const MODEL = 'anass1209/resume-job-matcher-all-MiniLM-L6-v2';
const ADJACENT_SCRIPT = fileURLToPath(new URL('./local_embedding_worker.py', import.meta.url));
const SCRIPT = fs.existsSync(ADJACENT_SCRIPT) ? ADJACENT_SCRIPT : fileURLToPath(new URL('../../../src/providers/embeddings/local_embedding_worker.py', import.meta.url));
const MAX_BATCH = 32;
const TIMEOUT = 120_000;

type WorkerResponse = { id: number; vectors?: number[][]; modelId?: string; modelRevision?: string | null; dimension?: number; error?: string };
const shared = new Map<string, LocalEmbeddingProvider>();
export function getLocalEmbeddingProvider(): LocalEmbeddingProvider {
  const model = process.env.LOCAL_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL_ID || MODEL;
  let provider = shared.get(model);
  if (!provider) { provider = new LocalEmbeddingProvider({modelId:model}); shared.set(model,provider); }
  return provider;
}
export function closeLocalEmbeddingProviders() { for (const provider of shared.values()) provider.close(); shared.clear(); }

/** One persistent, bounded Python model per provider instance. No model substitution. */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimension = 384;
  private worker?: ChildProcessWithoutNullStreams;
  private lines?: readline.Interface;
  private pending = new Map<number, { resolve: (value: WorkerResponse) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }>();
  private sequence = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private revision: string | null = null;
  get modelRevision(): string | null { return this.revision; }
  private cache = new Map<string, number[]>();

  constructor(opts?: { modelId?: string }) { this.modelId = opts?.modelId || process.env.LOCAL_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL_ID || MODEL; }

  async embed(input: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }) {
    if (input.texts.length > 2000 || this.queued >= 16) throw new Error('Embedding request exceeds local queue limit');
    if (!input.texts.length) return { vectors: [], modelId: this.modelId, dimension: this.dimension };
    const work = async () => {
      const textsToEncode = input.texts.map(t => t.slice(0, 5000));
      const key = (text: string) => crypto.createHash('sha256').update(`${this.modelId}|token-chunks-v1|${input.purpose}|${text}`).digest('hex');
      const missing = [...new Set(textsToEncode.filter(t => !this.cache.has(key(t))))];
      // The cache is process-private, bounded and cleared with the model worker.
      const current = new Map(this.cache);
      for (let start = 0; start < missing.length; start += MAX_BATCH) {
        const texts = missing.slice(start, start + MAX_BATCH);
        const result = await this.request(texts);
        if (result.error) throw new Error(`Local embedding worker: ${result.error}`);
        if (result.modelId !== this.modelId || result.dimension !== this.dimension) throw new Error('Local embedding model identity mismatch');
        validateVectors(result.vectors, texts.length, this.dimension);
        this.revision = result.modelRevision ?? null;
        texts.forEach((text,i) => { current.set(key(text), result.vectors![i]); this.cache.set(key(text), result.vectors![i]); });
        while (this.cache.size > 4096) this.cache.delete(this.cache.keys().next().value!);
      }
      return { vectors: textsToEncode.map(t => current.get(key(t))!), modelId: this.modelId, dimension: this.dimension, modelRevision: this.revision };
    };
    this.queued++;
    const result = this.queue.then(work).finally(() => { this.queued--; });
    this.queue = result.catch(() => undefined);
    return result;
  }

  private start() {
    if (this.worker && !this.worker.killed) return;
    const candidates = [process.env.PYTHON_PATH, path.resolve(process.cwd(), 'backend/python/venv/bin/python'), path.resolve(process.cwd(), 'python/venv/bin/python')].filter(Boolean) as string[];
    const python = candidates.find(candidate => fs.existsSync(candidate)) ?? 'python3';
    const worker = spawn(python, ['-u', SCRIPT, this.modelId], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    this.worker = worker;
    this.lines = readline.createInterface({ input: worker.stdout });
    this.lines.on('line', line => {
      let reply: WorkerResponse;
      try { reply = JSON.parse(line); } catch { this.stop(new Error('Invalid worker response')); return; }
      const pending = this.pending.get(reply.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(reply.id);
      pending.resolve(reply);
    });
    worker.stderr.on('data', () => { /* never log user text or worker tracebacks */ });
    worker.on('error', () => { if (this.worker === worker) this.stop(new Error('Local embedding worker unavailable')); });
    worker.on('exit', () => { if (this.worker === worker) this.stop(new Error('Local embedding worker exited')); });
  }

  private stop(error: Error) {
    const worker = this.worker;
    this.worker = undefined;
    this.lines?.close();
    this.lines = undefined;
    if (worker && !worker.killed) worker.kill();
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.cache.clear();
  }

  private request(texts: string[]): Promise<WorkerResponse> {
    this.start();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.stop(new Error('Local embedding worker timed out')), TIMEOUT);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.stdin.write(JSON.stringify({ id, texts }) + '\n', error => { if (error) this.stop(new Error('Local embedding worker pipe failed')); });
    });
  }

  close() { this.stop(new Error('Local embedding worker closed')); }
}

export default LocalEmbeddingProvider;
