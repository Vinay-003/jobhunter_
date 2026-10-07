-- =============================================================================
-- 010_auth_otp_and_verification.sql — Email Verification and OTPs for JobHunter
-- =============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;

-- Grandfather existing accounts created before OTP verification rollout
UPDATE users SET verified = true WHERE verified IS FALSE;

CREATE TABLE IF NOT EXISTS otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  value       TEXT NOT NULL,
  purpose     TEXT NOT NULL DEFAULT 'verification',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sent   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expiry      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_otps_email ON otps (email);
CREATE INDEX IF NOT EXISTS idx_otps_expiry ON otps (expiry);
CREATE INDEX IF NOT EXISTS idx_otps_purpose ON otps (purpose);
