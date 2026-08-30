export interface EmbeddingProvider {
  embed(input: {
    texts: string[];
    purpose: 'resume' | 'job' | 'jd';
  }): Promise<{ vectors: number[][]; modelId: string; dimension: number }>;
}
