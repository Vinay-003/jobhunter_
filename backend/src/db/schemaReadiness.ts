import type { QueryResult, QueryResultRow } from 'pg';

export interface Queryable {
  query<T extends QueryResultRow = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
}

/**
 * Checks the schema used by the running API without changing it. Migrations are
 * deliberately not run here: a web process must never race another deploy (or
 * write to a production database) while it is starting.
 */
export async function checkSchemaReadiness(db: Queryable): Promise<void> {
  const result = await db.query<{ version: string }>(
    `SELECT version FROM schema_migrations WHERE version = ANY($1::text[])`,
    [['006_analysis_integrity', '007_recommendation_integrity', '008_embedding_cache', '009_recommendation_profile_version']],
  );
  const applied = new Set(result.rows.map((row) => row.version));
  const missingMigrations = ['006_analysis_integrity', '007_recommendation_integrity', '008_embedding_cache', '009_recommendation_profile_version']
    .filter((version) => !applied.has(version));

  const columns = await db.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE (table_name = 'analyses' AND column_name IN ('result_schema_version', 'result_json'))
          OR (table_name = 'embedding_cache' AND column_name IN ('vector', 'model_id'))
          OR (table_name = 'recommendation_runs' AND column_name IN ('profile_version'))`,
  );
  const found = new Set(columns.rows.map((row) => `${row.table_name}.${row.column_name}`));
  const requiredColumns = ['analyses.result_schema_version', 'analyses.result_json', 'embedding_cache.vector', 'embedding_cache.model_id', 'recommendation_runs.profile_version'];
  const missingColumns = requiredColumns.filter((column) => !found.has(column));

  if (missingMigrations.length || missingColumns.length) {
    const details = [
      missingMigrations.length ? `migrations: ${missingMigrations.join(', ')}` : '',
      missingColumns.length ? `schema fields: ${missingColumns.join(', ')}` : '',
    ].filter(Boolean).join('; ');
    throw new Error(`Database schema is not ready (${details}). Run "npm run migrate" before starting the web service.`);
  }
}
