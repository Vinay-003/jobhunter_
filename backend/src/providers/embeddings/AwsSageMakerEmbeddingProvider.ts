import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { MockEmbeddingProvider } from './MockEmbeddingProvider.js';
import { env } from '../../config/env.js';
import { validateVectors } from './validateVectors.js';

/**
 * SageMaker embedding provider stub.
 * - Uses MockEmbeddingProvider internally if AWS creds missing.
 * - Otherwise lazy-imports @aws-sdk/client-sagemaker-runtime to call InvokeEndpoint.
 * - Enforces limits: max 32 texts per call, max 5000 chars per text.
 * - Timeout + batch handling, falls back to mock on error.
 */

const MAX_TEXTS = 32;
const MAX_CHARS = 5000;
const TIMEOUT_MS = 260000;

export class AwsSageMakerEmbeddingProvider implements EmbeddingProvider {
  readonly modelId: string;
  readonly dimension: number;
  readonly modelRevision: string | null = process.env.EMBEDDING_MODEL_REVISION || null;
  private mock = new MockEmbeddingProvider();

  constructor(opts?: { modelId?: string; dimension?: number }) {
    this.modelId = opts?.modelId ?? env.EMBEDDING_MODEL_ID ?? 'aws-sagemaker-mock';
    this.dimension = opts?.dimension ?? 384;
  }

  private hasAwsCreds(): boolean {
    // The SDK resolves environment, shared profiles and workload roles. Do not
    // reject a valid CLI/workload identity merely because static keys are absent.
    return Boolean(env.AWS_SAGEMAKER_ENDPOINT_NAME && env.AWS_REGION);
  }

  async embed(input: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }): Promise<{ vectors: number[][]; modelId: string; dimension: number; modelRevision?: string | null }> {
    // Truncate texts to limit
    const truncated = input.texts.map((t) => (t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t));

    // Validate limit
    if (truncated.length > MAX_TEXTS) {
      // Batch into chunks of MAX_TEXTS and invoke SageMaker concurrently (concurrency 3)
      const chunks: string[][] = [];
      for (let i = 0; i < truncated.length; i += MAX_TEXTS) {
        chunks.push(truncated.slice(i, i + MAX_TEXTS));
      }
      const results: Array<{ vectors: number[][]; modelId: string; dimension: number }> = [];
      const concurrency = 3;
      for (let i = 0; i < chunks.length; i += concurrency) {
        const batch = chunks.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map((chunk) => this.embedChunk(chunk, input.purpose)));
        results.push(...batchResults);
      }
      const allVectors: number[][] = [];
      let actualModelId: string | null = null;
      let actualDimension: number | null = null;
      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        validateVectors(res.vectors, chunks[i].length, res.dimension);
        if (actualModelId !== null && (actualModelId !== res.modelId || actualDimension !== res.dimension)) {
          throw new Error('Embedding batches have different models or dimensions');
        }
        actualModelId = res.modelId;
        actualDimension = res.dimension;
        allVectors.push(...res.vectors);
      }
      return { vectors: allVectors, modelId: actualModelId!, dimension: actualDimension!, modelRevision: this.modelRevision };
    }

    return { ...await this.embedChunk(truncated, input.purpose), modelRevision: this.modelRevision };
  }

  private async embedChunk(texts: string[], purpose: string): Promise<{ vectors: number[][]; modelId: string; dimension: number }> {
    if (!this.hasAwsCreds()) {
      // No creds — truthful mock fallback so callers can detect usedMock via modelId.
      console.warn('[AwsSageMakerEmbeddingProvider] no AWS creds — using mock embeddings (fallback only)');
      const res = await this.mock.embed({ texts, purpose: purpose as 'resume' | 'job' | 'jd' });
      return { vectors: res.vectors, modelId: res.modelId, dimension: res.dimension };
    }

    try {
      // Lazy import AWS SDK to avoid hard dependency when not configured
      // @ts-ignore - optional peer dep
      const mod: unknown = await import('@aws-sdk/client-sagemaker-runtime').catch(() => null);
      if (!mod || typeof mod !== 'object' || !('SageMakerRuntimeClient' in mod)) {
        throw new Error('AWS SDK not installed');
      }
      const { SageMakerRuntimeClient, InvokeEndpointCommand } = mod as {
        SageMakerRuntimeClient: new (cfg: unknown) => { send: (cmd: unknown, options?: { abortSignal: AbortSignal }) => Promise<unknown>; destroy: () => void };
        InvokeEndpointCommand: new (args: unknown) => unknown;
      };

      const client = new SageMakerRuntimeClient({
        region: env.AWS_REGION,
      });

      const payload = JSON.stringify({ inputs: texts, purpose });

      const command = new InvokeEndpointCommand({
        EndpointName: env.AWS_SAGEMAKER_ENDPOINT_NAME!,
        ContentType: 'application/json',
        Accept: 'application/json',
        Body: Buffer.from(payload),
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let resp: { Body?: Uint8Array | Buffer };
      try { resp = await client.send(command, { abortSignal: controller.signal }) as typeof resp; }
      finally { clearTimeout(timeout); client.destroy(); }

      const bodyStr = Buffer.from(resp.Body as Uint8Array).toString('utf8');
      const parsed = JSON.parse(bodyStr) as { embeddings?: number[][]; vectors?: number[][]; dimension?: number };

      const vectors = parsed.embeddings ?? parsed.vectors;
      if (!vectors || !Array.isArray(vectors) || vectors.length !== texts.length) {
        throw new Error('Invalid SageMaker response shape');
      }

      const dim = vectors[0]?.length ?? this.dimension;
      validateVectors(vectors, texts.length, dim);
      return { vectors, modelId: this.modelId, dimension: dim };
    } catch (err: any) {
      // Log name + message: SDK throttling/validation errors otherwise surface as bare "UnknownError".
      console.warn(`[AwsSageMakerEmbeddingProvider] embedding unavailable: ${err?.name || 'Error'} (texts=${texts.length})`);
      throw new Error('Configured SageMaker embedding unavailable');
    }
  }
}

export default AwsSageMakerEmbeddingProvider;
