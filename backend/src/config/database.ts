import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

// Prefer a single connection string for Supabase/hosted Postgres
const connectionString =
  process.env.PG_DATABASE_STRING ||
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('Missing database connection string. Set PG_DATABASE_STRING or DATABASE_URL.');
  process.exit(1);
}

// Enable SSL for hosted providers like Supabase (adjust if self-hosted)
const pool = new Pool({
  connectionString,
  ssl: process.env.PG_SSL?.toLowerCase() === 'true' || connectionString.includes('supabase')
    ? { rejectUnauthorized: false }
    : undefined
});

// Test the connection
pool.connect()
  .then(() => {
    console.log('Successfully connected to PostgreSQL database!');
  })
  .catch(err => {
    console.error('Error connecting to the database:', err);
    process.exit(1);
  });

export default pool;