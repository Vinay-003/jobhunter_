/**
 * migrate.ts — Versioned migration runner for JobHunter V2
 *
 * - Discovers *.sql files in backend/migrations (sorted lexicographically)
 * - Tracks applied versions in schema_migrations table
 * - Applies pending migrations in order inside transactions
 * - Idempotent: safe to re-run; skips already-applied versions
 *
 * Usage:
 *   bun run src/db/migrate.ts
 *   PG_DATABASE_STRING="..." bun run src/db/migrate.ts
 *
 * Env (one required):
 *   PG_DATABASE_STRING | DATABASE_URL | SUPABASE_DB_URL
 *   PG_SSL=true        — force SSL (auto-enabled for supabase URLs)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

// ---------------------------------------------------------------------------
// env
// ---------------------------------------------------------------------------
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
// also try backend/.env when cwd is repo root
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });
// also try .env relative to this file's backend root
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function getConnectionString(): string {
  const cs =
    process.env.PG_DATABASE_STRING ||
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  if (!cs) {
    console.error(
      'Missing database connection string. Set one of PG_DATABASE_STRING, DATABASE_URL, SUPABASE_DB_URL',
    );
    process.exit(1);
  }
  return cs!;
}

function createPool(): Pool {
  const cs = getConnectionString();
  const forceSsl = process.env.PG_SSL?.toLowerCase() === 'true';
  const isSupabase = cs.includes('supabase');
  return new Pool({
    connectionString: cs,
    ssl: forceSsl || isSupabase ? { rejectUnauthorized: false } : undefined,
  });
}

// ---------------------------------------------------------------------------
// resolve migrations directory
// ---------------------------------------------------------------------------
function resolveMigrationsDir(): string {
  const candidates = [
    // when file is at backend/src/db/migrate.ts
    path.resolve(__dirname, '../../migrations'),
    // when cwd is backend/
    path.resolve(process.cwd(), 'migrations'),
    // when cwd is repo root
    path.resolve(process.cwd(), 'backend/migrations'),
    // explicit env override
    process.env.MIGRATIONS_DIR ? path.resolve(process.env.MIGRATIONS_DIR) : '',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p;
  }
  // default — create if missing (so error is not silent)
  const fallback = path.resolve(__dirname, '../../migrations');
  return fallback;
}

// ---------------------------------------------------------------------------
// schema_migrations table helpers
// ---------------------------------------------------------------------------
async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedVersions(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  return new Set(rows.map((r) => r.version));
}

// ---------------------------------------------------------------------------
// core runner
// ---------------------------------------------------------------------------
export async function migrate(opts?: { pool?: Pool; migrationsDir?: string }): Promise<void> {
  const pool = opts?.pool ?? createPool();
  const migrationsDir = opts?.migrationsDir ?? resolveMigrationsDir();
  const ownsPool = !opts?.pool;

  try {
    if (!fs.existsSync(migrationsDir)) {
      console.error(`Migrations directory not found: ${migrationsDir}`);
      process.exit(1);
    }

    await ensureMigrationsTable(pool);

    const applied = await getAppliedVersions(pool);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    if (files.length === 0) {
      console.log(`No .sql files in ${migrationsDir}`);
      return;
    }

    console.log(`Migrations dir: ${migrationsDir}`);
    console.log(`Found ${files.length} migration(s): ${files.join(', ')}`);
    if (applied.size > 0) {
      console.log(`Already applied: ${[...applied].join(', ')}`);
    }

    let appliedCount = 0;

    for (const file of files) {
      const version = path.basename(file, '.sql'); // e.g. 001_initial_v2

      if (applied.has(version) || applied.has(file)) {
        console.log(`  ⏭  skip ${file} (already applied)`);
        continue;
      }

      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');

      if (!sql.trim()) {
        console.warn(`  ⚠  ${file} is empty — marking as applied`);
        await pool.query('INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING', [
          version,
        ]);
        continue;
      }

      console.log(`  ▶  applying ${file} ...`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Execute the raw SQL (may contain multiple statements)
        await client.query(sql);
        // Record version
        await client.query(
          'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT DO NOTHING',
          [version],
        );
        await client.query('COMMIT');
        console.log(`  ✔  ${file} applied`);
        appliedCount++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  ✘  ${file} failed — rolled back`);
        throw err;
      } finally {
        client.release();
      }
    }

    if (appliedCount === 0) {
      console.log('Nothing to do — all migrations already applied.');
    } else {
      console.log(`Done. Applied ${appliedCount} new migration(s).`);
    }
  } finally {
    if (ownsPool) await pool.end();
  }
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------
const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMain) {
  migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}
