-- Additive run snapshots; deploy before the revised recommendation API.
ALTER TABLE recommendation_runs ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE recommendation_runs ADD COLUMN IF NOT EXISTS query_plan_json JSONB;
ALTER TABLE recommendation_runs ADD COLUMN IF NOT EXISTS provider_status_json JSONB;
ALTER TABLE recommendation_runs ADD COLUMN IF NOT EXISTS candidate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recommendation_runs ADD COLUMN IF NOT EXISTS returned_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE recommendation_runs ADD COLUMN IF NOT EXISTS error_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recommendation_run_idempotency ON recommendation_runs (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS job_snapshot_json JSONB;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS matched_skills_json JSONB;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS missing_skills_json JSONB;
ALTER TABLE recommendations ADD COLUMN IF NOT EXISTS eligibility_json JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS uq_recommendations_run_rank ON recommendations (run_id, rank);
-- Rollback: drop the two indexes above, then only the columns introduced here.
-- Existing recommendation and job records are intentionally retained.
