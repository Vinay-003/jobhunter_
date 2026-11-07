-- =============================================================================
-- 011_otp_attempts.sql — brute-force cap for OTP verification codes
-- =============================================================================

ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
