-- =============================================================================
-- 003_storage_metadata.sql — Supabase Storage metadata for resumes
-- =============================================================================
-- Idempotent. Ensures the resumes table can store Supabase Storage references
-- and file-integrity metadata. All ALTERs use IF NOT EXISTS.
--
-- Supabase Storage maps to: storage_bucket + storage_object_path
-- e.g. bucket = 'resumes', object_path = 'user_id/resume_id/filename.pdf'
-- =============================================================================

-- Ensure pgcrypto available (gen_random_uuid already used in 001)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- Add missing columns idempotently (covers legacy V1 schemas where resumes
-- was created with file_name/file_path/pdf_content instead of V2 layout)
-- ---------------------------------------------------------------------------
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS original_filename   TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS storage_bucket      TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS storage_object_path TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS sha256              TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS file_size_bytes     INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS page_count          INTEGER;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS parser_version      TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS processing_status   TEXT;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS is_latest           BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS created_at          TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE resumes ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill storage_bucket default for existing rows that have no bucket
DO $$
BEGIN
  -- Only backfill when column exists and rows have null bucket
  UPDATE resumes
  SET storage_bucket = 'resumes'
  WHERE storage_bucket IS NULL
    AND storage_object_path IS NOT NULL;

  -- Backfill processing_status default
  UPDATE resumes
  SET processing_status = 'pending'
  WHERE processing_status IS NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- ---------------------------------------------------------------------------
-- Defaults & constraints (idempotent via DO blocks inspecting catalog)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  -- Ensure processing_status has a default (re-apply if table was created via legacy schema)
  BEGIN
    EXECUTE 'ALTER TABLE resumes ALTER COLUMN processing_status SET DEFAULT ''pending''';
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE resumes ALTER COLUMN storage_bucket SET DEFAULT ''resumes''';
  EXCEPTION WHEN others THEN NULL;
  END;

  BEGIN
    EXECUTE 'ALTER TABLE resumes ALTER COLUMN is_latest SET DEFAULT true';
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Indexes for storage lookups
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_resumes_storage_bucket      ON resumes (storage_bucket);
CREATE INDEX IF NOT EXISTS idx_resumes_storage_object_path ON resumes (storage_object_path);
CREATE INDEX IF NOT EXISTS idx_resumes_sha256              ON resumes (sha256);
CREATE INDEX IF NOT EXISTS idx_resumes_file_size_bytes     ON resumes (file_size_bytes);

-- Composite index for supabase bucket+path lookups
CREATE INDEX IF NOT EXISTS idx_resumes_bucket_path
  ON resumes (storage_bucket, storage_object_path);

-- ---------------------------------------------------------------------------
-- Ensure updated_at trigger exists (001 creates it, but legacy V1 schemas use
-- a different trigger name — make sure V2 name is present)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_resumes_updated_at ON resumes;
CREATE TRIGGER trg_resumes_updated_at
  BEFORE UPDATE ON resumes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Documentation
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN resumes.original_filename   IS 'Original client filename (e.g. MyResume.pdf)';
COMMENT ON COLUMN resumes.storage_bucket      IS 'Supabase Storage bucket name (default: resumes)';
COMMENT ON COLUMN resumes.storage_object_path IS 'Object key inside bucket (e.g. <user_id>/<uuid>.pdf)';
COMMENT ON COLUMN resumes.sha256              IS 'SHA-256 hex digest of original file for dedup/integrity';
COMMENT ON COLUMN resumes.file_size_bytes     IS 'File size in bytes';
COMMENT ON COLUMN resumes.page_count          IS 'PDF page count (null until parsed)';
COMMENT ON COLUMN resumes.parser_version      IS 'Parser version that produced profile/analysis';
COMMENT ON COLUMN resumes.processing_status   IS 'Pipeline status: pending|processing|completed|failed';
