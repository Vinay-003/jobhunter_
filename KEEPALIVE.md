# Supabase Keepalive — Prevent 7-Day Pause

> Supabase free tier pauses a project after 7 days of **no database activity**. This keepalive creates a cheap `INSERT` every 12h via a public endpoint + Cloudflare Worker cron to reset that timer.

---

## Problem

- Supabase project `vaflmkhzyvqmglstmadg` (pooler `aws-0-ap-southeast-1.pooler.supabase.com:6543`) pauses after 7 days inactivity.
- `jobhunter-backend-lkkf.onrender.com` is on Render free tier — sleeps but does not keep DB alive on its own.
- Need a table + public HTTP endpoint that can be hit from anywhere (Cloudflare Worker) to generate DB activity without auth.

## Solution Overview

```
Cloudflare Worker (cron 0 */12 * * *) --POST--> https://jobhunter-backend-lkkf.onrender.com/api/keepalive
                                                        |
                                                        +-- INSERT INTO keepalive_pings (source, ip, method, user_agent)
                                                        +-- DELETE ... LIMIT 5  (keeps table ~500 bytes)
                                                        +-- return {success:true, ping:{id, pinged_at}, total_pings, recent}

Any INSERT/SELECT counts as activity for Supabase's inactivity check.
```

**Frequency:** `0 */12 * * *` = every 12 hours (00:00 & 12:00 UTC, 2x/day). <7 days is enough; 12h is safe and cheap. Change in Cloudflare Worker `Settings -> Triggers -> Cron Trigger` or `workers/keepalive-worker/wrangler.toml:8`.

**Storage:** ~70 bytes/row. At 12h, 5 rows retained = ~350 bytes total. Capped + pruned every ping, never fills 500MB limit. Initially we kept 30d/1000 rows, tightened to **7d/5 rows** (`backend/src/routes/keepalive.ts:75`) per request for minimal footprint.

---

## Files Created / Modified

| File | Purpose |
|------|---------|
| `backend/migrations/005_keepalive.sql:1` | Creates `keepalive_pings` table + indexes. Applied via `backend/src/db/migrate.ts:105`. |
| `backend/src/routes/keepalive.ts:1` | Public, no-auth handler. `GET|POST|PUT /` + `/ping` + `/health`, HEAD. Inserts row, prunes, returns stats. Optional `KEEPALIVE_TOKEN` check. |
| `backend/src/server.ts:45` | Mounts keepalive at `/keepalive` and `/api/keepalive` **before** other routers so cron never 404s. |
| `backend/src/routes/v1/index.ts:18` | Mounts keepalive at `/api/v1/keepalive` via v1 router. |
| `backend/.env.example:106` | Documents `KEEPALIVE_TOKEN` (optional). Leave empty for fully public. |
| `workers/keepalive-worker/worker.js:1` | Cloudflare Worker: `scheduled()` cron + `fetch()` manual trigger (`/`, `/ping`, `/health`). Not pushed to git — uploaded manually via Cloudflare Dashboard. |
| `workers/keepalive-worker/wrangler.toml:1` | Wrangler config (cron, `KEEPALIVE_URL` var). Reference only; dashboard Triggers are source of truth when deployed manually. |
| `workers/keepalive-worker/README.md:1` | Full worker deploy docs. |
| `workers/keepalive-worker/package.json:1` | Wrangler dev dep. |

**Migration SQL (`005_keepalive.sql:3`):**
```sql
CREATE TABLE IF NOT EXISTS keepalive_pings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pinged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT NOT NULL DEFAULT 'cron',
  ip          TEXT,
  method      TEXT,
  user_agent  TEXT
);
CREATE INDEX IF NOT EXISTS idx_keepalive_pings_pinged_at ON keepalive_pings (pinged_at DESC);
CREATE INDEX IF NOT EXISTS idx_keepalive_pings_source ON keepalive_pings (source);
```

---

## Endpoints (All Public, No Auth)

Mounted in `backend/src/server.ts:45` and `backend/src/routes/v1/index.ts:18`:

- `GET /keepalive`, `POST /keepalive`, `PUT /keepalive`, `GET /keepalive/ping`, `HEAD /keepalive`
- `GET /api/keepalive`, `POST /api/keepalive`
- `GET /api/v1/keepalive`, `POST /api/v1/keepalive`

**Optional protection:** Set `KEEPALIVE_TOKEN` in backend env. Then worker must send `x-keepalive-token: <token>` (or `?token=` or `Authorization: Bearer <token>`). If not set, endpoint is open.

**Response (success):**
```json
{
  "success": true,
  "message": "Supabase keepalive ping recorded",
  "ping": {"id":"uuid","pinged_at":"2026-09-22T16:54:55.307Z","source":"cron"},
  "latency_ms": 120,
  "total_pings": 3,
  "recent": [{"id":"...","pinged_at":"...","source":"cron","ip":"...","method":"POST"}],
  "timestamp":"2026-09-22T16:54:55.307Z",
  "uptime": 1234.5
}
```

Fallback if table missing (`42P01`): `SELECT 1` and returns `{success:true, fallback:true, message:"DB ping OK (fallback SELECT 1) — run migration 005..."}`.

---

## Cloudflare Worker — Manual Dashboard Deploy (No Git)

Worker code lives in `workers/keepalive-worker/worker.js:1` but is **not pushed** to GitHub by choice — deployed manually.

**Deployed to:** `jobhunter-supabase-keepalive.vinayjadam2003.workers.dev`

**Code:** `export default { scheduled(event,env,ctx){ ctx.waitUntil(doPing(env,'cron')) }, fetch(request,env,ctx){...} }`
- `doPing()` reads `env.KEEPALIVE_URL` (fallback `https://your-backend.onrender.com/api/keepalive`), appends `?source=cron|manual-fetch`, sends `POST` (fallback `GET` on 404), returns JSON.

**Dashboard steps already done (for reference):**

1. Cloudflare Dashboard -> `Workers & Pages` -> `Create Worker` -> name `jobhunter-supabase-keepalive` -> `Edit Code` -> paste `worker.js` -> `Save and Deploy`.
2. `Settings -> Variables and Secrets` -> add `KEEPALIVE_URL = https://jobhunter-backend-lkkf.onrender.com/api/keepalive`
3. `Settings -> Triggers -> Add Cron Trigger` -> `0 */12 * * *` (every 12h). Without this, only manual `GET /` works.
4. `Visit` -> `https://jobhunter-supabase-keepalive.vinayjadam2003.workers.dev/` -> should show `ok:true status:200 response:{success:true}` after backend redeploys.
5. Test cron manually: `https://jobhunter-supabase-keepalive.vinayjadam2003.workers.dev/ping`

---

## Backend Deploy (Render)

- Service: `jobhunter-backend` (`render.yaml:14`, region `oregon`, branch `dev`, `rootDir: backend`, `healthCheckPath: /health`)
- Frontend: `jobhunter` (`render.yaml:81`, static `frontend/project`, `jobhunter-r773.onrender.com`)

**Push already done on `dev`:**
```bash
git add backend/migrations/005_keepalive.sql backend/src/routes/keepalive.ts backend/src/server.ts backend/src/routes/v1/index.ts backend/.env.example
git commit -m "feat: keepalive endpoint minimal prune"
git push origin dev
```

Render auto-deploys backend. **Migration applied locally** on `2026-09-22`:
```
Migrations dir: /home/mylappy/Projects/jobhunter_/backend/migrations
Found 5 migration(s): 001_initial_v2.sql, ..., 005_keepalive.sql
Already applied: 001_initial_v2, 002_add_fts, 003_storage_metadata, 004_job_search_cache
-> applying 005_keepalive.sql ... ✔
```

On prod, verify via Render Shell or local: `PG_DATABASE_STRING='<prod-uri>' bun run src/db/migrate.ts` (idempotent, skips if already applied).

---

## Pruning / Minimal Storage

Per `backend/src/routes/keepalive.ts:75`:

```js
DELETE FROM keepalive_pings WHERE pinged_at < NOW() - INTERVAL '7 days'
DELETE FROM keepalive_pings WHERE id NOT IN (SELECT id FROM keepalive_pings ORDER BY pinged_at DESC LIMIT 5)
```

- Fire-and-forget (doesn't block response).
- Keeps **5 latest rows** (~500 bytes). Change `LIMIT 5` -> `LIMIT 1` for 1 row, or delete manually.
- Earlier 4 test rows inserted on `2026-09-22T15:03-15:04Z` can be cleared:
  ```sql
  -- Supabase Dashboard -> SQL Editor
  DELETE FROM keepalive_pings; -- or TRUNCATE keepalive_pings;
  SELECT COUNT(*) FROM keepalive_pings; -- 0
  ```

---

## Verification

**Backend directly:**
```bash
curl https://jobhunter-backend-lkkf.onrender.com/health
# {"status":"ok",...}

curl https://jobhunter-backend-lkkf.onrender.com/api/keepalive?source=manual-test
# {"success":true,"ping":{"id":"...","pinged_at":"...","source":"manual-test"},...}

curl -X POST https://jobhunter-backend-lkkf.onrender.com/api/keepalive
curl https://jobhunter-backend-lkkf.onrender.com/api/v1/keepalive
curl https://jobhunter-backend-lkkf.onrender.com/keepalive
```

**Worker:**
```bash
curl https://jobhunter-supabase-keepalive.vinayjadam2003.workers.dev/
curl https://jobhunter-supabase-keepalive.vinayjadam2003.workers.dev/ping
curl https://jobhunter-supabase-keepalive.vinayjadam2003.workers.dev/health
```

**Supabase SQL:**
```sql
SELECT COUNT(*) FROM keepalive_pings;
SELECT id, pinged_at, source, ip, method FROM keepalive_pings ORDER BY pinged_at DESC LIMIT 5;
```

**Expected after fixes:** All above return `200` + `success:true`. The earlier screenshot `404 Endpoint not found` was because backend code hadn't been pushed — fixed after `git push origin dev`.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `404 /api/keepalive` | Backend not redeployed | `git push origin dev` -> wait Render deploy |
| Worker preview `raw:""` `status:200` on `jobhunter-r773.onrender.com` | Hit frontend static, not backend | Change worker var to `https://jobhunter-backend-lkkf.onrender.com/api/keepalive` |
| `42P01 undefined_table` fallback | Migration not run | Run `005_keepalive.sql` in Supabase SQL Editor or `bun run src/db/migrate.ts` |
| `401 Invalid keepalive token` | `KEEPALIVE_TOKEN` mismatch | Set same secret in Render backend env + Cloudflare Worker `Secrets` |
| Worker `ok:false 562ms` | Render cold start (free tier ~30s) | Retries on next cron succeed; no action |

---

## Security Notes

- Endpoint is intentionally public (no session) so any cron can hit it. Rate-limited only by Render + prune cost.
- If you set `KEEPALIVE_TOKEN`, only callers with `x-keepalive-token` can insert. Recommended if you expose DB write surface.
- `pgcrypto` + `gen_random_uuid()` used; no PII stored beyond IP/UA. Table has no RLS — accessed via `service_role` pool only.

---

## Maintenance

- No maintenance needed. Cron runs itself. Check `keepalive_pings` count monthly via `SELECT COUNT(*)`.
- To disable, remove Cloudflare Cron Trigger or delete worker.
- To change frequency, edit Cron expression in Cloudflare Dashboard -> worker -> `Settings -> Triggers` (or `wrangler.toml:8` if using `wrangler deploy`).

*Last updated: 2026-09-22. Stack: `Node 20 + Express 4 + pg + Supabase pooler (6543) + Cloudflare Workers (compatibility_date 2024-01-01)`.*
