-- 004_job_search_cache.sql — job search cache for Jooble (shared across users)
CREATE TABLE IF NOT EXISTS job_search_cache (
  query_hash TEXT PRIMARY KEY,
  query_text TEXT,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_job_search_cache_created_at ON job_search_cache (created_at DESC);
