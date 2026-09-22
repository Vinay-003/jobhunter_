import type { EmbeddingProvider } from './EmbeddingProvider.js';
import { MockEmbeddingProvider } from './MockEmbeddingProvider.js';
import { env } from '../../config/env.js';

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
  private mock = new MockEmbeddingProvider();

  constructor(opts?: { modelId?: string; dimension?: number }) {
    this.modelId = opts?.modelId ?? env.EMBEDDING_MODEL_ID ?? 'aws-sagemaker-mock';
    this.dimension = opts?.dimension ?? 384;
  }

  private hasAwsCreds(): boolean {
    return Boolean(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY && env.AWS_SAGEMAKER_ENDPOINT_NAME && env.AWS_REGION);
  }

  async embed(input: { texts: string[]; purpose: 'resume' | 'job' | 'jd' }): Promise<{ vectors: number[][]; modelId: string; dimension: number }> {
    // Truncate texts to limit
    const truncated = input.texts.map((t) => (t.length > MAX_CHARS ? t.slice(0, MAX_CHARS) : t));

    // Validate limit
    if (truncated.length > MAX_TEXTS) {
      // Batch into chunks of MAX_TEXTS
      const allVectors: number[][] = [];
      for (let i = 0; i < truncated.length; i += MAX_TEXTS) {
        const chunk = truncated.slice(i, i + MAX_TEXTS);
        const res = await this.embedChunk(chunk, input.purpose);
        allVectors.push(...res.vectors);
      }
      return { vectors: allVectors, modelId: this.modelId, dimension: this.dimension };
    }

    return this.embedChunk(truncated, input.purpose);
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
        SageMakerRuntimeClient: new (cfg: unknown) => { send: (cmd: unknown) => Promise<unknown> };
        InvokeEndpointCommand: new (args: unknown) => unknown;
      };

      const client = new SageMakerRuntimeClient({
        region: env.AWS_REGION,
        credentials: {
          accessKeyId: env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
        },
      });

      const payload = JSON.stringify({ inputs: texts, purpose });

      const command = new InvokeEndpointCommand({
        EndpointName: env.AWS_SAGEMAKER_ENDPOINT_NAME!,
        ContentType: 'application/json',
        Accept: 'application/json',
        Body: Buffer.from(payload),
      });

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SageMaker InvokeEndpoint timeout')), TIMEOUT_MS)
      );

      const resp = (await Promise.race([client.send(command), timeout])) as {
        Body?: Uint8Array | Buffer;
      };

      const bodyStr = Buffer.from(resp.Body as Uint8Array).toString('utf8');
      const parsed = JSON.parse(bodyStr) as { embeddings?: number[][]; vectors?: number[][]; dimension?: number };

      const vectors = parsed.embeddings ?? parsed.vectors;
      if (!vectors || !Array.isArray(vectors) || vectors.length !== texts.length) {
        throw new Error('Invalid SageMaker response shape');
      }

      const dim = vectors[0]?.length ?? this.dimension;
      return { vectors, modelId: this.modelId, dimension: dim };
    } catch (err: any) {
      // Log name + message: SDK throttling/validation errors otherwise surface as bare "UnknownError".
      console.warn(`[AwsSageMakerEmbeddingProvider] fallback to mock due to error: ${err?.name || 'Error'}: ${err?.message || err} (texts=${texts.length})`);
      const res = await this.mock.embed({ texts, purpose: purpose as 'resume' | 'job' | 'jd' });
      return { vectors: res.vectors, modelId: res.modelId, dimension: res.dimension };
    }
  }
}

export default AwsSageMakerEmbeddingProvider;
