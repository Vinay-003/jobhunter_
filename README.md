# JobHunter — local setup vs Render

Portfolio app: upload a PDF resume, get a **deterministic ATS readiness score**, optional **JD match** (embeddings), and **ranked job recommendations**.

**Working branch: `dev`.** Render Blueprint and CI track `dev`. Do not treat `master` / `main` as the working branch.

**Desired local shape:** embeddings model on this machine (`EMBEDDING_PROVIDER=local`), Postgres + private file storage on **Supabase**. Render is an optional hosted frontend + API pointing at the **same** Supabase project.

Deeper architecture lives in [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) (verified against code 2026-10-02).
Local setup + Render usage + health checklist: [LOCAL_SETUP.md](./LOCAL_SETUP.md).
Older notes: [ARCHITECTURE.md](./ARCHITECTURE.md) (pointer only), [DEPLOYMENT.md](./DEPLOYMENT.md), [SECURITY.md](./SECURITY.md), [KEEPALIVE.md](./KEEPALIVE.md).

---

## Verified status (2026-10-02 — supersedes the 2026-10-01 outage notes below)

> **Audit follow-up (2026-10-02/03):** the sweep below verified the analysis
> pipeline end-to-end, but a deeper audit found additional gaps — resume deep-link
> 404s, a blank/slow login gate, dependency audits, secondary fixes
> S3/S4/S7/S8, and **Issue 1 (prod uploads)** — all fixed on `dev` and
> **pushed** (through `64e66c3`), with scripted browser E2E (18/18 + 2/2) and
> 23/23 backend tests. Issue 1 root cause: Render ran Node 20 while
> `@supabase/supabase-js` ≥2.117 needs Node 22+ (native WebSocket) — fixed by
> fail-loud storage logging + `/health?deep=1` probe and `NODE_VERSION` 22.14.0;
> prod re-probed end-to-end (upload → `storage_bucket='resumes'` → object →
> download → delete). **Still open:** S1 lost-row marking, S2 orphan sweep,
> frontend majors (Q6), lockfile (Q7).

Full sweep today: local backend + Render backend, same Supabase, same resume+JD.
Test users/rows were created and **deleted afterwards** (0 orphans).

| Piece | Status | Evidence |
|---|---|---|
| Supabase Postgres + Storage (`vaflmkhzyvqmglstmadg`) | **Up** | pooler connects; `resumes` bucket lists objects; the 10-01 outage (paused project) is over |
| Backend local (`:3001`, `EMBEDDING_PROVIDER=local`) | **Up** | `/health` ok; warmup `local warmup done … dim=384`; **zero AWS calls** |
| Local model (venv `anass1209`, `~/.cache/huggingface`, 88 MB) | **Real, not mock** | same-text cosine 1.0; `usedMock: false` on every call |
| Supabase Storage via local backend | **Up** | upload → bucket object exists → download byte-identical (`cmp`) |
| Frontend local (`:5173`) | **Up** (unchanged) | Vite `200`; `.env` → `http://localhost:3001/api/v1` |
| Render frontend | **Up** | HTTP `200` |
| Render backend (+ SageMaker) | **Up** | `/health` ok; readiness **58** = local **58**; jd-match **60**/Medium, real embeddings; 5-provider run, top = intern/entry roles |
| `@supabase/supabase-js` packaging | **Fixed, pending deploy** | committed to `package.json`+lock; until Render redeploys, Render uploads land on ephemeral disk (bucket listing proved it) — re-verify post-deploy |

<details>
<summary>2026-10-01 outage notes (historical — Supabase project was paused)</summary>

Backend exited on boot (`tenant/user … not found`, `database.ts` calls
`process.exit(1)`); Supabase host did not resolve; Render backend 503
`hibernate-wake-error`. All resolved when the project unpaused. Lesson kept
in §6 footguns.
</details>

**Bottom line: the project IS set up — local model + shared Supabase + both
deployments green. One deploy left: Render backend must redeploy to pick up
`@supabase/supabase-js`, after which Render uploads reach Supabase too.**

---

## 1. Use the hosted Render app (no local API)

1. Open **https://jobhunter-r773.onrender.com**.
2. The SPA talks to **https://jobhunter-backend-lkkf.onrender.com/api/v1** (baked in at **build** time via `VITE_API_BASE_URL`).
3. If signup/login hangs or fails, the backend is likely still hibernated or crashing. Check:
   ```bash
   curl -sSI https://jobhunter-backend-lkkf.onrender.com/health
   # Healthy: HTTP 200 and JSON {"status":"ok",...}
   # Broken (observed 2026-10-01): HTTP 503 and x-render-routing: hibernate-wake-error
   ```
4. After you restore Supabase, in Render Dashboard set the **same** `PG_DATABASE_STRING` / `SUPABASE_*` as local, then **Manual Deploy** the backend. If you change `VITE_*`, rebuild the **frontend** (Vite inlines them at build time).
5. CORS on the backend must include `https://jobhunter-r773.onrender.com`.

You cannot point the Render frontend at your laptop API from a normal browser (mixed origins / no public tunnel). To develop, run **both** frontend and backend locally (section 2).

---

## 2. Run everything locally

### Prerequisites

- Node **20** (Render pins `20.11.0`; this machine also ran Node 24 for Vite — prefer 20 for the API).
- [Bun](https://bun.sh) (backend `npm run dev` / `migrate` / `test` are `bun` scripts).
- Python **3.12** + venv (local SentenceTransformer).
- A **live** Supabase project: Postgres pooler URI **and** Storage.

### 2.1 Supabase (already live — verify, don't recreate)

Project ref `vaflmkhzyvqmglstmadg` is up (pooler `:6543`, private bucket
`resumes`). If it ever goes dark again (pause/delete), create or unpause it, then:

1. **Settings → Database → Connection string → URI (pooler, port 6543).**  
   User should look like `postgres.<project-ref>`. Append `?pgbouncer=true` (and `sslmode=require` if not already implied):
   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
2. **Settings → API:** `SUPABASE_URL` + **service_role** key (server only, never frontend).
3. **Storage → New bucket** named `resumes`, **Private**.
4. Enable `pgcrypto` if migrations need it (001 uses it).

Copy keys into `backend/.env` (never commit). Templates: `backend/.env.example`, `frontend/project/.env.example`.

### 2.2 Backend

```bash
cd backend
cp .env.example .env   # if you do not already have .env
# Required: PG_DATABASE_STRING, JWT_SECRET (>=32 chars),
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_RESUME_BUCKET=resumes
# Local model:
#   EMBEDDING_PROVIDER=local
#   LOCAL_EMBEDDING_MODEL=anass1209/resume-job-matcher-all-MiniLM-L6-v2
# CORS for Vite:
#   CORS_ALLOWED_ORIGINS=http://localhost:5173
#   FRONTEND_URL=http://localhost:5173
# PORT=3001  NODE_ENV=development

npm ci
npm run migrate        # bun run src/db/migrations/run_migration.ts  (001–005)
# Confirm DB:
#   bun -e '...'  or  psql "$PG_DATABASE_STRING" -c 'select 1'

# Python venv for the anass fine-tune (once):
cd python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
# This checkout already had a venv; installed versions may be NEWER than requirements.txt
# (observed: torch 2.14.0+cpu, transformers 5.17.0, sentence-transformers 6.1.0).
cd ..

npm run dev            # bun src/server.ts  → http://localhost:3001
# Logs should show "Successfully connected to PostgreSQL database!"
# and later "[embeddings] local warmup done ..." (can take ~60–90s).
```

Do **not** start `backend/python/app.py` unless you are debugging the **legacy** Flask shim. V2 local embeddings spawn `backend/python/venv/bin/python` from `LocalEmbeddingProvider.ts`.

Optional job keys (`JOOBLE_API_KEY`, Adzuna, JobsPipe, …): recommendations still run using DB cache / public providers if keys are missing.

### 2.3 Frontend

```bash
cd frontend/project
cp .env.example .env
# VITE_API_BASE_URL=http://localhost:3001/api/v1
# VITE_API_URL=http://localhost:3001/api/v1
npm ci
npm run dev            # http://localhost:5173
```

Open `http://localhost:5173`, sign up, upload a PDF. Storage objects should appear under bucket `resumes` as `<userId>/<resumeId>/<file>`. If logs say `[supabaseStorage] … falling back to local`, the service role key, bucket, or `@supabase/supabase-js` install is wrong.

### 2.4 Smoke test after DB is back

```bash
# public
curl -sS http://localhost:3001/health
curl -sS http://localhost:3001/api/v1/health
curl -sS http://localhost:3001/api/keepalive   # INSERT keepalive_pings — proves Postgres

# protected should be 401 without a session, not 404
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3001/api/v1/resumes
```

---

## 3. Health-check catalog (local + Render)

Base URLs:

| Env | Frontend | API |
|---|---|---|
| Local | `http://localhost:5173` | `http://localhost:3001` |
| Render | `https://jobhunter-r773.onrender.com` | `https://jobhunter-backend-lkkf.onrender.com` |

### 3.1 Public (expect **200** JSON when the API process is healthy)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Root banner JSON |
| GET | `/health` | Render `healthCheckPath` |
| GET | `/api/v1/health` | `{ success, status, version: v1 }` |
| GET/POST/PUT | `/keepalive`, `/keepalive/ping`, `/keepalive/health` | Touches DB |
| GET/POST/PUT | `/api/keepalive` (+ `/ping`, `/health`) | Same router |
| GET/POST/PUT | `/api/v1/keepalive` (+ `/ping`, `/health`) | Same router |

If `KEEPALIVE_TOKEN` is set, send `x-keepalive-token` or `?token=`.

### 3.2 Auth (expect **400** on empty JSON, **201/200** with a valid body)

| Method | Path |
|---|---|
| POST | `/api/v1/auth/signup` |
| POST | `/api/v1/auth/login` |
| POST | `/api/v1/auth/logout` |
| POST | `/api/v1/auth/logout-all` |
| GET | `/api/v1/auth/session` |
| POST | `/api/auth/signup` (legacy) |
| POST | `/api/auth/login` (legacy) |

### 3.3 Authenticated v1 (expect **401** without cookie/Bearer, **200/201** with session)

Mounted in `backend/src/routes/v1/index.ts`:

| Method | Path |
|---|---|
| GET, PATCH | `/api/v1/profile` |
| GET, PUT | `/api/v1/profile/job-preferences` |
| GET, PATCH | `/api/v1/job-preferences` (same `profile` router mounted twice — see SYSTEM_DESIGN) |
| POST, GET | `/api/v1/resumes` |
| GET, DELETE | `/api/v1/resumes/:id` |
| GET | `/api/v1/resumes/:id/download` |
| POST | `/api/v1/analyses/readiness` |
| POST | `/api/v1/analyses/jd-match` |
| GET | `/api/v1/analyses` |
| GET | `/api/v1/analyses/:id` |
| POST | `/api/v1/recommendation-runs` |
| POST | `/api/v1/recommendations` (alias of runs) |
| GET | `/api/v1/recommendation-runs/:id` |
| GET | `/api/v1/recommendation-runs/:id/results` |

### 3.4 Legacy `/api/*` (deprecated; still mounted)

`POST /api/upload-resume`, `GET /api/latest-resume`, `GET /api/resume/:id`, `GET /api/latest-resume-content`, `POST /api/analyze`, `POST /api/analyze/:id`, `POST /api/jobs/search`, `GET /api/jobs`, `POST /api/jobs/refresh`, `GET /api/jobs/recommendations`, `GET /api/jobs/recommendations/stored`.

### 3.5 Results (2026-10-02 sweep — full authed flow, both deployments)

Same resume + JD on both. Local: signup → upload → readiness **58** →
jd-match **60**/Medium (`usedMock: false`, venv model) → 5-provider run
(`jooble 108 + jobspipe 5 + adzuna 15 + remotive 17 + arbeitnow 15 = 170
fetched, 105 deduped`, top = intern/entry roles) → download byte-identical.
Render: identical flow, readiness **58**, jd-match **60** (SageMaker, real
embeddings), run top = intern/entry roles. All temp rows deleted (0 orphans).
Only gap found: Render uploads miss Supabase until the redeploy carrying
`@supabase/supabase-js` lands (see table above).

---

## 4. Environment cheat sheet

Authoritative lists: `backend/.env.example`, `frontend/project/.env.example`, `backend/src/config/env.ts`.

| Intent | Keys |
|---|---|
| Postgres | `PG_DATABASE_STRING` (or `DATABASE_URL` / `SUPABASE_DB_URL`), `PG_SSL=true` |
| Storage | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_RESUME_BUCKET=resumes` |
| Local model | `EMBEDDING_PROVIDER=local`, `LOCAL_EMBEDDING_MODEL`, `EMBEDDING_MODEL_ID` |
| Render / AWS model | `EMBEDDING_PROVIDER=aws` (or `auto` + all `AWS_*`) |
| Sessions | `JWT_SECRET` (≥32), `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS` |
| CORS | `CORS_ALLOWED_ORIGINS`, `FRONTEND_URL` |
| Frontend | `VITE_API_BASE_URL` (must match the API you actually run) |

`EMBEDDING_PROVIDER=auto` on a machine **without** AWS still uses SageMaker provider code, which **falls back to mock vectors**. That is **not** the local anass model. For local real embeddings you must set `local`.

---

## 5. Tests / CI

```bash
cd backend && npm test
cd frontend/project && npx tsc --noEmit && npm run build
```

CI: `.github/workflows/ci.yml` on `dev` and `master`.

---

## 6. Footguns (docs vs code)

Cross-check these before trusting any guide (including this file):

1. `database.ts` **kills the process** if Postgres is down — `/health` never stays up.
2. Boot log `Database: Not configured` only looks at `DATABASE_URL`, not `PG_DATABASE_STRING` (`server.ts`). Misleading.
3. `@supabase/supabase-js` was missing from `package.json` until 2026-10-01; Storage import would silently fail → local `uploads/`.
4. `backend/python/README.md` describes Flask `:5000`. V2 local ML is `LocalEmbeddingProvider` + venv python, not that server.
5. `LocalEmbeddingProvider.ts` includes a **hardcoded** python path for this machine; also checks `python/venv` relative to cwd (`backend` vs repo root).
6. `npm run migrate` runs `src/db/migrations/run_migration.ts`. Some comments still say `src/db/migrate.ts` (file exists too — confirm which you ran).
7. Python venv versions may not match `backend/python/requirements.txt`.
8. Render Blueprint (`render.yaml`) tracks `branch: dev`. URLs above are the **current** Render hostnames; they can change if services are recreated.
