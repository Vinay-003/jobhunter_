-- Cache only reproducible, revision-pinned vectors. Never store resume text.
CREATE TABLE IF NOT EXISTS embedding_cache (
  purpose TEXT NOT NULL CHECK (purpose IN ('resume', 'job', 'jd')),
  owner_id UUID,
  content_hash CHAR(64) NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  chunker_version TEXT NOT NULL,
  evidence_builder_version TEXT NOT NULL,
  dimension INTEGER NOT NULL CHECK (dimension > 0),
  vector JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((purpose = 'resume' AND owner_id IS NOT NULL) OR (purpose <> 'resume' AND owner_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS embedding_cache_identity_idx ON embedding_cache
  (purpose, COALESCE(owner_id::text, ''), content_hash, model_id, model_revision, chunker_version, evidence_builder_version);
