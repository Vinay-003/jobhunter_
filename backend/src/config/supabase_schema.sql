-- ============================================
-- Supabase Database Schema
-- ============================================
-- This file contains all the tables needed for the project
-- Run this in Supabase SQL Editor to create the schema
-- ============================================

-- Enable necessary extensions (if not already enabled)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS TABLE
-- ============================================
-- Drop existing table if it exists (use with caution in production)
-- DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Increased length for bcrypt
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP WITH TIME ZONE
);

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================
-- RESUMES TABLE
-- ============================================
-- Drop existing table if it exists (use with caution in production)
-- DROP TABLE IF EXISTS resumes CASCADE;

CREATE TABLE IF NOT EXISTS resumes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    pdf_content BYTEA, -- Binary data for PDF content (optional - for storing PDF directly in DB)
    upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_latest BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'pending',
    analysis_data JSONB, -- For storing analysis results as JSON
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for resumes table
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON resumes(user_id);
CREATE INDEX IF NOT EXISTS idx_resumes_is_latest ON resumes(is_latest);
CREATE INDEX IF NOT EXISTS idx_resumes_status ON resumes(status);
CREATE INDEX IF NOT EXISTS idx_resumes_created_at ON resumes(created_at DESC);

-- ============================================
-- TRIGGERS
-- ============================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at for resumes
DROP TRIGGER IF EXISTS update_resumes_updated_at ON resumes;
CREATE TRIGGER update_resumes_updated_at
    BEFORE UPDATE ON resumes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on tables (optional but recommended for Supabase)
-- Uncomment the following lines if you want to enable RLS

-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE resumes ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read their own data
-- CREATE POLICY "Users can view own profile" ON users
--     FOR SELECT USING (auth.uid()::text = id::text);

-- Policy: Users can update their own data
-- CREATE POLICY "Users can update own profile" ON users
--     FOR UPDATE USING (auth.uid()::text = id::text);

-- Policy: Users can view their own resumes
-- CREATE POLICY "Users can view own resumes" ON resumes
--     FOR SELECT USING (user_id = (SELECT id FROM users WHERE id = auth.uid()::integer));

-- Policy: Users can insert their own resumes
-- CREATE POLICY "Users can insert own resumes" ON resumes
--     FOR INSERT WITH CHECK (user_id = (SELECT id FROM users WHERE id = auth.uid()::integer));

-- Policy: Users can update their own resumes
-- CREATE POLICY "Users can update own resumes" ON resumes
--     FOR UPDATE USING (user_id = (SELECT id FROM users WHERE id = auth.uid()::integer));

-- Policy: Users can delete their own resumes
-- CREATE POLICY "Users can delete own resumes" ON resumes
--     FOR DELETE USING (user_id = (SELECT id FROM users WHERE id = auth.uid()::integer));

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON TABLE users IS 'User accounts for authentication';
COMMENT ON TABLE resumes IS 'User uploaded resumes with analysis data';
COMMENT ON COLUMN resumes.pdf_content IS 'Optional: PDF file content stored as binary data';
COMMENT ON COLUMN resumes.analysis_data IS 'JSON data containing resume analysis results';
COMMENT ON COLUMN resumes.is_latest IS 'Flag to mark the most recent resume for each user';

