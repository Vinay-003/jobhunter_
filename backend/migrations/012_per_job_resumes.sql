-- =============================================================================
-- 012_per_job_resumes.sql — In-place per-job resume tailoring and version isolation
-- =============================================================================

ALTER TABLE resumes ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS parent_resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS tailored_content_json JSONB;

ALTER TABLE analyses ADD COLUMN IF NOT EXISTS job_id UUID REFERENCES jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_resumes_user_job ON resumes (user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_resumes_parent ON resumes (parent_resume_id);
CREATE INDEX IF NOT EXISTS idx_analyses_job ON analyses (job_id);
