-- =============================================================================
-- 002_add_fts.sql — Full-text search & is_latest constraints
-- =============================================================================
-- Idempotent. Adds:
--   1) jobs.search_vector tsvector (GENERATED STORED) + GIN index
--   2) resumes.is_latest column (if missing) + partial unique index
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ensure pgcrypto still available (in case 001 was not run)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- Part 1: jobs.search_vector
-- =============================================================================

-- Add generated tsvector column if not exists.
-- Uses DO block because ADD COLUMN IF NOT EXISTS with GENERATED ALWAYS AS
-- varies across PG versions; we probe information_schema first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jobs' AND column_name = 'search_vector'
  ) THEN
    -- Use plain tsvector column + trigger approach for max compatibility,
    -- but prefer GENERATED if PG >= 12. We attempt GENERATED first,
    -- falling back to plain column + trigger.
    BEGIN
      EXECUTE $sql$
        ALTER TABLE jobs
        ADD COLUMN search_vector tsvector
        GENERATED ALWAYS AS (
          setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
          setweight(to_tsvector('english', coalesce(company, '')), 'B') ||
          setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
          setweight(to_tsvector('english', coalesce(location, '')), 'D')
        ) STORED
      $sql$;
    EXCEPTION WHEN others THEN
      -- Fallback: plain column + trigger population
      EXECUTE 'ALTER TABLE jobs ADD COLUMN search_vector tsvector';
    END;
  END IF;
END $$;

-- If search_vector is a plain column (fallback path), keep it fresh via trigger
CREATE OR REPLACE FUNCTION jobs_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.company, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(NEW.location, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create the trigger if search_vector is NOT a generated column.
-- Generated columns cannot have BEFORE INSERT/UPDATE triggers assigning them.
DO $$
DECLARE
  v_is_generated BOOLEAN;
BEGIN
  SELECT (c.is_generated = 'ALWAYS') INTO v_is_generated
  FROM information_schema.columns c
  WHERE c.table_name = 'jobs' AND c.column_name = 'search_vector';

  IF v_is_generated IS DISTINCT FROM true THEN
    -- Plain column — ensure trigger exists
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_jobs_search_vector'
    ) THEN
      EXECUTE '
        CREATE TRIGGER trg_jobs_search_vector
        BEFORE INSERT OR UPDATE OF title, company, description, location
        ON jobs
        FOR EACH ROW EXECUTE FUNCTION jobs_search_vector_update()
      ';
    END IF;

    -- Backfill existing rows where search_vector is null
    EXECUTE '
      UPDATE jobs
      SET search_vector =
        setweight(to_tsvector(''english'', coalesce(title, '''')), ''A'') ||
        setweight(to_tsvector(''english'', coalesce(company, '''')), ''B'') ||
        setweight(to_tsvector(''english'', coalesce(description, '''')), ''C'') ||
        setweight(to_tsvector(''english'', coalesce(location, '''')), ''D'')
      WHERE search_vector IS NULL
    ';
  END IF;
END $$;

-- GIN index for full-text queries
CREATE INDEX IF NOT EXISTS idx_jobs_search_vector ON jobs USING GIN (search_vector);

-- Optional: additional GIN indexes for direct column search (already in v1 schema)
-- kept idempotent — no-op if already exists
-- CREATE INDEX IF NOT EXISTS idx_jobs_title_fts ON jobs USING gin (to_tsvector('english', title));

COMMENT ON COLUMN jobs.search_vector IS 'Weighted tsvector for FTS over title/company/description/location';


-- =============================================================================
-- Part 2: resumes.is_latest — ensure column + partial unique index
-- =============================================================================

-- Ensure column exists (001 already creates it, but be idempotent for fresh DBs
-- that may have run legacy schema)
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS is_latest BOOLEAN NOT NULL DEFAULT true;

-- Backfill: if multiple rows per user have is_latest=true from legacy data,
-- keep only the most recent (by created_at) as latest. This makes the
-- subsequent partial unique index creation safe.
DO $$
BEGIN
  -- Clear duplicates: set all but newest to false per user
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
    FROM resumes
    WHERE is_latest = true
  )
  UPDATE resumes r
  SET is_latest = false
  FROM ranked
  WHERE r.id = ranked.id AND ranked.rn > 1;
EXCEPTION WHEN others THEN
  -- If resumes table does not exist yet, ignore
  NULL;
END $$;

-- Partial unique index: at most one is_latest=true per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_resumes_one_latest_per_user
  ON resumes (user_id)
  WHERE is_latest = true;

-- Helpful partial index for queries filtering latest resumes
CREATE INDEX IF NOT EXISTS idx_resumes_is_latest_partial
  ON resumes (user_id, created_at DESC)
  WHERE is_latest = true;

COMMENT ON COLUMN resumes.is_latest IS 'True for the active/latest resume per user; enforced by partial unique index';
