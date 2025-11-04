# Supabase Database Setup Guide

This guide will help you set up the database tables in Supabase for this project.

## Steps to Create Tables in Supabase

### 1. Access Supabase SQL Editor
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**

### 2. Run the Schema SQL
1. Open the file `backend/src/config/supabase_schema.sql`
2. Copy the entire contents
3. Paste it into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter)

### 3. Verify Tables Created
After running the SQL, you should see:
- ✅ `users` table with columns: id, username, email, password_hash, created_at, last_login
- ✅ `resumes` table with columns: id, user_id, file_name, file_path, pdf_content, upload_date, is_latest, status, analysis_data, created_at, updated_at

You can verify by going to **Table Editor** in Supabase dashboard.

## Tables Overview

### `users` Table
- Stores user authentication information
- Fields: id (auto-increment), username (unique), email (unique), password_hash, timestamps

### `resumes` Table
- Stores user-uploaded resumes
- Fields: id, user_id (foreign key to users), file metadata, PDF content (optional), analysis data (JSON), timestamps
- Has indexes for fast queries by user_id and is_latest flag
- Automatically updates `updated_at` timestamp on changes

## Row Level Security (RLS)

The schema file includes commented-out RLS policies. If you want to enable Row Level Security:

1. Uncomment the `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` lines
2. Uncomment the `CREATE POLICY` statements
3. **Note**: RLS policies assume you're using Supabase Auth. If you're using JWT authentication (as your code does), you may need to adjust the policies or keep RLS disabled.

## Connection Configuration

Make sure your `.env` file in the `backend` directory has:

```env
SUPABASE_DB_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres
PG_SSL=true
```

Or use:
```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@[YOUR-PROJECT-REF].supabase.co:5432/postgres
PG_SSL=true
```

You can find your connection string in Supabase Dashboard → Settings → Database → Connection String.

## Troubleshooting

- **Permission errors**: Make sure you're using the database password, not your Supabase account password
- **SSL errors**: Ensure `PG_SSL=true` is set in your `.env` file
- **Table already exists**: The SQL uses `CREATE TABLE IF NOT EXISTS`, so it's safe to run multiple times. If you need to recreate tables, uncomment the `DROP TABLE` statements (use with caution!).

