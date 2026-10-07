import { describe, expect, it } from 'bun:test';
import { checkSchemaReadiness, type Queryable } from '../db/schemaReadiness.js';

function db(responses: unknown[][]): Queryable {
  return { query: async () => ({ rows: responses.shift() ?? [], command: '', rowCount: 0, oid: 0, fields: [] } as never) };
}

describe('database schema readiness', () => {
  it('accepts the schema required by analysis writes', async () => {
    await expect(checkSchemaReadiness(db([
       [
         { version: '006_analysis_integrity' },
         { version: '007_recommendation_integrity' },
         { version: '008_embedding_cache' },
         { version: '009_recommendation_profile_version' },
         { version: '010_auth_otp_and_verification' },
       ],
      [
        { table_name: 'analyses', column_name: 'result_schema_version' },
        { table_name: 'analyses', column_name: 'result_json' },
        { table_name: 'embedding_cache', column_name: 'vector' },
        { table_name: 'embedding_cache', column_name: 'model_id' },
        { table_name: 'recommendation_runs', column_name: 'profile_version' },
        { table_name: 'users', column_name: 'verified' },
      ],
    ]))).resolves.toBeUndefined();
  });

  it('fails clearly without attempting a write or migration', async () => {
    await expect(checkSchemaReadiness(db([[], []]))).rejects.toThrow('npm run migrate');
  });
});
