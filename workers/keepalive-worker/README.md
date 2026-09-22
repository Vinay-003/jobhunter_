# JobHunter Supabase Keepalive — Cloudflare Worker

Prevents Supabase free tier **pause after 7 days inactivity** by pinging `keepalive_pings` table on a cron.

Any `INSERT` into `keepalive_pings` counts as database activity for Supabase. The worker hits a public, no-auth endpoint on your backend which writes the row.

## Endpoints (backend)

All are **public, no auth** (optional `KEEPALIVE_TOKEN` if set):

- `GET /keepalive`
- `POST /keepalive`
- `GET /api/keepalive`
- `POST /api/keepalive`
- `GET /api/v1/keepalive` (via v1 router)
- `POST /api/v1/keepalive`

Response example:
```json
{
  "success": true,
  "message": "Supabase keepalive ping recorded",
  "ping": { "id": "uuid", "pinged_at": "2026-09-22T...", "source": "cron" },
  "latency_ms": 42,
  "total_pings": 123,
  "recent": [...],
  "timestamp": "2026-09-22T..."
}
```

## Setup — Backend (one-time)

1. **Run migration** — creates `keepalive_pings` table:

   ```bash
   # via backend migrate runner (uses PG_DATABASE_STRING from .env)
   cd backend
   bun run src/db/migrate.ts
   # or npm: bunx --bun src/db/migrate.ts
   ```

   Or manually in Supabase Dashboard → SQL Editor → run `backend/migrations/005_keepalive.sql`.

2. **Deploy backend** — push to Render (or wherever). Verify:
   ```bash
   curl https://your-backend.onrender.com/api/keepalive
   # should return {success:true, ...}
   ```

3. **(Optional) Add token protection**:

   In Render dashboard → backend service → Environment:
   ```
   KEEPALIVE_TOKEN=some-random-secret-32+chars
   ```

   Worker must send same `x-keepalive-token` header (via `wrangler secret put KEEPALIVE_TOKEN`).

## Setup — Cloudflare Worker (cron)

1. **Install wrangler**:
   ```bash
   npm i -g wrangler
   wrangler login
   ```

2. **Configure**:
   Edit `workers/keepalive-worker/wrangler.toml`:
   ```toml
   [vars]
   KEEPALIVE_URL = "https://jobhunter-r773.onrender.com/api/keepalive"
   ```

   Cron is `0 */12 * * *` = every 12 hours. Change if needed:
   - Every 24h: `0 3 * * *` (03:00 UTC daily)
   - Every 6h: `0 */6 * * *`

3. **(Optional) Set token secret** (only if backend has `KEEPALIVE_TOKEN`):
   ```bash
   cd workers/keepalive-worker
   wrangler secret put KEEPALIVE_TOKEN
   # paste same value as backend KEEPALIVE_TOKEN
   ```

4. **Deploy**:
   ```bash
   cd workers/keepalive-worker
   wrangler deploy
   ```

5. **Test manually**:
   ```bash
   curl https://jobhunter-supabase-keepalive.<your-subdomain>.workers.dev/ping
   curl https://jobhunter-r773.onrender.com/api/keepalive?source=manual-test
   wrangler tail  # live logs
   ```

   Also check cron runs: Cloudflare Dashboard → Workers → jobhunter-supabase-keepalive → Logs / Triggers.

## Local test (no Cloudflare)

Simulate cron with curl from anywhere:

```bash
# Any of these keep Supabase alive
curl -X POST https://your-backend.onrender.com/api/keepalive?source=cron
curl https://your-backend.onrender.com/keepalive
curl https://your-backend.onrender.com/api/v1/keepalive

# With token (if enabled)
curl -H "x-keepalive-token: $KEEPALIVE_TOKEN" https://your-backend.onrender.com/api/keepalive
```

Create a host cron if you don't want Cloudflare:

```bash
# crontab -e
0 */12 * * * curl -fsS https://your-backend.onrender.com/api/keepalive?source=host-cron >/dev/null 2>&1
```

## How it prevents pause

- Supabase pauses a project after **7 days with no DB queries/connections**.
- Each worker ping does `INSERT INTO keepalive_pings ...` → counts as activity → resets the 7-day timer.
- Pings older than 30 days are auto-deleted; table capped at 1000 rows.

## Troubleshooting

- `42P01 undefined_table` in worker response → migration not run. Run `backend/migrations/005_keepalive.sql`.
- Worker `401 Invalid keepalive token` → `KEEPALIVE_TOKEN` mismatch between backend and worker secret.
- Render backend cold start ~30s → worker may log 502 on first ping; next ping succeeds (Render wake).
