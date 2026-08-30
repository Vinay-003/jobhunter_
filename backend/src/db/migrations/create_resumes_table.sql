-- ======================================================================
-- WARNING: The DROP below is DESTRUCTIVE — it will delete all resume data.
-- DO NOT run this migration in production. In production, use only
-- CREATE TABLE IF NOT EXISTS and additive ALTER TABLE migrations.
-- This DROP is retained for local/dev resets and CI ephemeral databases only.
-- For production deploys, comment out or remove the DROP line.
-- ======================================================================
DROP TABLE IF EXISTS resumes CASCADE; -- DEV ONLY: destructive — remove for production

CREATE TABLE IF NOT EXISTS resumes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(255) NOT NULL,
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_latest BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'pending',
    analysis_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for faster queries
CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_resumes_is_latest ON resumes(is_latest);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column(); 