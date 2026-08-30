-- =============================================================================
-- 001_initial_v2.sql — JobHunter V2 Initial Schema
-- =============================================================================
-- Idempotent, versioned migration. Safe to re-run.
-- Creates all core V2 tables with UUID PKs (gen_random_uuid via pgcrypto).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions & helpers (idempotent)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Generic updated_at trigger function (shared across tables)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- users
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE users IS 'JobHunter V2 user accounts (uuid PK)';

-- =============================================================================
-- sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash       TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL,
  last_used_at     TIMESTAMPTZ,
  revoked_at       TIMESTAMPTZ,
  user_agent_hash  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id     ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash  ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at  ON sessions (expires_at);

COMMENT ON TABLE sessions IS 'Hashed session tokens; revoked_at non-null = invalidated';

-- =============================================================================
-- user_job_preferences
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_job_preferences (
  user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  target_roles      TEXT[] ,
  seniority         TEXT[] ,
  locations         TEXT[] ,
  work_modes        TEXT[] ,
  emphasized_skills TEXT[] ,
  excluded_roles    TEXT[] ,
  min_salary        INTEGER,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_user_job_preferences_updated_at ON user_job_preferences;
CREATE TRIGGER trg_user_job_preferences_updated_at
  BEFORE UPDATE ON user_job_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE user_job_preferences IS 'Per-user job preference snapshot (1:1 with users)';

-- =============================================================================
-- resumes
-- =============================================================================
CREATE TABLE IF NOT EXISTS resumes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename     TEXT,
  storage_bucket        TEXT,
  storage_object_path   TEXT,
  sha256                TEXT,
  file_size_bytes       INTEGER,
  page_count            INTEGER,
  parser_version        TEXT,
  processing_status     TEXT NOT NULL DEFAULT 'pending',
  is_latest             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resumes_user_id         ON resumes (user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_sha256           ON resumes (sha256);
CREATE INDEX IF NOT EXISTS idx_resumes_storage_path     ON resumes (storage_object_path);
CREATE INDEX IF NOT EXISTS idx_resumes_processing_status ON resumes (processing_status);
CREATE INDEX IF NOT EXISTS idx_resumes_created_at       ON resumes (created_at DESC);

DROP TRIGGER IF EXISTS trg_resumes_updated_at ON resumes;
CREATE TRIGGER trg_resumes_updated_at
  BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE resumes IS 'Uploaded resume files with Supabase storage metadata';

-- =============================================================================
-- resume_profiles
-- =============================================================================
CREATE TABLE IF NOT EXISTS resume_profiles (
  resume_id       UUID PRIMARY KEY REFERENCES resumes(id) ON DELETE CASCADE,
  profile_json    JSONB NOT NULL,
  profile_version TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_resume_profiles_updated_at ON resume_profiles;
CREATE TRIGGER trg_resume_profiles_updated_at
  BEFORE UPDATE ON resume_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE resume_profiles IS 'Parsed/normalised profile extracted from resume';

-- =============================================================================
-- analyses
-- =============================================================================
CREATE TABLE IF NOT EXISTS analyses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id            UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  analysis_type        TEXT NOT NULL,
  readiness_score      INTEGER NOT NULL CHECK (readiness_score >= 0 AND readiness_score <= 100),
  jd_match_score       INTEGER CHECK (jd_match_score IS NULL OR (jd_match_score >= 0 AND jd_match_score <= 100)),
  score_breakdown_json JSONB,
  evidence_json        JSONB,
  target_level         TEXT,
  jd_hash              TEXT,
  scorer_version       TEXT NOT NULL,
  parser_version       TEXT NOT NULL,
  embedding_model_id   TEXT,
  matching_version     TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyses_user_id    ON analyses (user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_resume_id  ON analyses (resume_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_jd_hash    ON analyses (jd_hash);

COMMENT ON TABLE analyses IS 'ATS/readiness and JD-match analysis runs';

-- =============================================================================
-- jobs
-- =============================================================================
CREATE TABLE IF NOT EXISTS jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source               TEXT NOT NULL,
  external_id          TEXT NOT NULL,
  title                TEXT NOT NULL,
  company              TEXT NOT NULL,
  location             TEXT,
  description          TEXT,
  description_quality  TEXT,
  url                  TEXT,
  salary               JSONB,
  work_mode            TEXT,
  posted_at            TIMESTAMPTZ,
  fetched_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash         TEXT NOT NULL
);

-- Unique constraint source + external_id (idempotent via unique index)
CREATE UNIQUE INDEX IF NOT EXISTS uq_jobs_source_external_id
  ON jobs (source, external_id);

CREATE INDEX IF NOT EXISTS idx_jobs_company    ON jobs (company);
CREATE INDEX IF NOT EXISTS idx_jobs_location   ON jobs (location);
CREATE INDEX IF NOT EXISTS idx_jobs_posted_at  ON jobs (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_content_hash ON jobs (content_hash);
CREATE INDEX IF NOT EXISTS idx_jobs_source     ON jobs (source);

COMMENT ON TABLE jobs IS 'Job postings from external sources; deduped by (source, external_id)';

-- =============================================================================
-- job_embeddings
-- =============================================================================
CREATE TABLE IF NOT EXISTS job_embeddings (
  job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  dimension    INTEGER NOT NULL,
  embedding    REAL[] NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, content_hash, model_id)
);

CREATE INDEX IF NOT EXISTS idx_job_embeddings_model_id ON job_embeddings (model_id);

COMMENT ON TABLE job_embeddings IS 'Vector embeddings for job descriptions';

-- =============================================================================
-- resume_embeddings
-- =============================================================================
CREATE TABLE IF NOT EXISTS resume_embeddings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resume_id    UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  content_hash TEXT NOT NULL,
  model_id     TEXT NOT NULL,
  dimension    INTEGER NOT NULL,
  embedding    REAL[] NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_resume_embeddings_resume_hash_model
  ON resume_embeddings (resume_id, content_hash, model_id);

CREATE INDEX IF NOT EXISTS idx_resume_embeddings_resume_id ON resume_embeddings (resume_id);
CREATE INDEX IF NOT EXISTS idx_resume_embeddings_model_id  ON resume_embeddings (model_id);

COMMENT ON TABLE resume_embeddings IS 'Vector embeddings for resume content';

-- =============================================================================
-- recommendation_runs
-- =============================================================================
CREATE TABLE IF NOT EXISTS recommendation_runs (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id                   UUID NOT NULL REFERENCES resumes(id) ON DELETE CASCADE,
  preferences_snapshot_json   JSONB,
  ranker_version              TEXT NOT NULL,
  embedding_model_id          TEXT,
  status                      TEXT NOT NULL DEFAULT 'pending',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at                TIMESTAMPTZ,
  CHECK (status IN ('pending','running','completed','failed','canceled'))
);

CREATE INDEX IF NOT EXISTS idx_recommendation_runs_user_id   ON recommendation_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_runs_resume_id ON recommendation_runs (resume_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_runs_status    ON recommendation_runs (status);
CREATE INDEX IF NOT EXISTS idx_recommendation_runs_created_at ON recommendation_runs (created_at DESC);

COMMENT ON TABLE recommendation_runs IS 'A single recommendation generation run';

-- =============================================================================
-- recommendations
-- =============================================================================
CREATE TABLE IF NOT EXISTS recommendations (
  run_id         UUID NOT NULL REFERENCES recommendation_runs(id) ON DELETE CASCADE,
  job_id         UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  rank           INTEGER NOT NULL,
  fit_score      INTEGER NOT NULL CHECK (fit_score >= 0 AND fit_score <= 100),
  confidence     TEXT,
  breakdown_json JSONB,
  evidence_json  JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendations_job_id ON recommendations (job_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_rank   ON recommendations (run_id, rank);

COMMENT ON TABLE recommendations IS 'Ranked job recommendations per run';

-- =============================================================================
-- external_api_usage
-- =============================================================================
CREATE TABLE IF NOT EXISTS external_api_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL,
  request_count   INTEGER NOT NULL DEFAULT 0,
  last_called_at  TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_external_api_usage_provider
  ON external_api_usage (provider);

DROP TRIGGER IF EXISTS trg_external_api_usage_updated_at ON external_api_usage;
CREATE TRIGGER trg_external_api_usage_updated_at
  BEFORE UPDATE ON external_api_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE external_api_usage IS 'Rate-limit / quota tracking per external provider (e.g. jooble)';

-- =============================================================================
-- job_applications (optional — idempotent)
-- =============================================================================
CREATE TABLE IF NOT EXISTS job_applications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  resume_id   UUID REFERENCES resumes(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'applied',
  match_score INTEGER CHECK (match_score IS NULL OR (match_score >= 0 AND match_score <= 100)),
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_job_applications_user_job
  ON job_applications (user_id, job_id);

CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications (user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id  ON job_applications (job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_status   ON job_applications (status);

DROP TRIGGER IF EXISTS trg_job_applications_updated_at ON job_applications;
CREATE TRIGGER trg_job_applications_updated_at
  BEFORE UPDATE ON job_applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE job_applications IS 'User job applications (optional V2 feature)';
