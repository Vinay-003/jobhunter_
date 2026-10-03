export function validateVectors(vectors: unknown, count: number, dimension: number): asserts vectors is number[][] {
  if (!Number.isInteger(dimension) || dimension < 1 || !Array.isArray(vectors) || vectors.length !== count) {
    throw new Error('Invalid embedding shape');
  }
  for (const vector of vectors) {
    if (!Array.isArray(vector) || vector.length !== dimension || vector.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error('Invalid embedding vector dimension or value');
    }
    if (vector.every(v => v === 0)) throw new Error('Zero embedding vector');
  }
}
