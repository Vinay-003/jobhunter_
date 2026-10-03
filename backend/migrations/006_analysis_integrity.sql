-- Additive report integrity. Rollback: drop the newly added columns only after
-- exporting result_json; reverting readiness_score to INTEGER loses fractions.
ALTER TABLE analyses ALTER COLUMN readiness_score TYPE NUMERIC(5,1);
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS result_schema_version INTEGER;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS result_json JSONB;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS profile_version TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS profile_content_hash TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS embedding_status TEXT;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS embedding_dimension INTEGER;
ALTER TABLE analyses ADD COLUMN IF NOT EXISTS embedding_model_revision TEXT;
COMMENT ON COLUMN analyses.result_json IS 'Immutable canonical report snapshot. Contains parsed JD requirements, not the full raw JD; retained until the owning analysis/resume is deleted.';
