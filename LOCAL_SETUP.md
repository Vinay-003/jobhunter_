# JobHunter — Local Setup & Health Guide

Branch: `dev`. Last verified: 2026-10-02 (backend + frontend build clean, full
local + Render health sweep green — see table at the bottom).

> **Data vs compute split:** the model runs **locally** (Python venv, zero AWS
> calls), everything else is shared **Supabase** (`vaflmkhzyvqmglstmadg`):
> Postgres (pooler `:6543`) + private `resumes` storage bucket. Local and
> Render talk to the **same** database and bucket.

---

## 1. Prerequisites

| Need | Version / note |
|---|---|
| Node | 20.11.0 on Render (`render.yaml` pins it). Locally anything ≥20 works (24 verified) |
| npm | ships with Node |
| Python | 3.12 (venv lives at `backend/python/venv`, gitignored) |
| Supabase access | Connection string (pooler port `6543`), project URL, `service_role` key, bucket `resumes` (private). Ask the repo owner — values live in `backend/.env`, never in git |
| API keys (optional but recommended) | Jooble, Adzuna (`app_id` + `app_key`), JobsPipe. Without them the app still runs on DB cache + mock-free fallbacks |

No AWS account, no SageMaker, no Docker needed for local work.

## 2. Backend (terminal 1)

```bash
cd backend
cp .env.example .env   # then fill: PG_DATABASE_STRING, JWT_SECRET (32+ chars),
                       # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, JOOBLE_API_KEY,
                       # ADZUNA_APP_ID/ADZUNA_APP_KEY, JOBSPIPE_API_KEY
npm ci
npm run build          # tsc → dist/
```

Key local `.env` values (prod values differ — see §5):

```bash
PORT=3001
NODE_ENV=development
CORS_ALLOWED_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
EMBEDDING_PROVIDER=local        # ← local model, no AWS calls
EMBEDDING_MODEL_ID=anass1209/resume-job-matcher-all-MiniLM-L6-v2
JOB_PROVIDERS=jooble,jobspipe,adzuna,remotive,arbeitnow
```

## 3. Local model (one time, ~5 min, ~2 GB disk)

```bash
cd backend/python
python3 -m venv venv
./venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
./venv/bin/pip install sentence-transformers transformers
./venv/bin/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('anass1209/resume-job-matcher-all-MiniLM-L6-v2')"
```

What this does and where things live:

- `backend/python/venv/` — interpreter + `torch` (CPU) + `sentence-transformers`.
  Gitignored; the backend auto-discovers it (`LocalEmbeddingProvider` checks
  `backend/python/venv`, `python/venv`, then `PYTHON_PATH`).
- `~/.cache/huggingface/hub/models--anass1209--resume-job-matcher-all-MiniLM-L6-v2/`
  (~88 MB) — the model weights, downloaded once on first use.
- Every `embed()` spawns the venv Python, which loads the model and returns
  L2-normalized 384-dim vectors. **Cold load ≈ 60–95 s**; warm ≈ 13 s.
  The server pre-warms in the background on boot — wait for
  `[embeddings] local warmup done` before judging speed.
- Proof of "no AWS": with `EMBEDDING_PROVIDER=local` and no `AWS_*` vars the
  backend prints `SageMaker: not configured — no AWS calls will be made`, and
  every `[jd-match]` / `[ranking]` log names `provider=LocalEmbeddingProvider`.

## 4. Run it

```bash
# terminal 1 — backend
cd backend && node dist/server.js
# expect: Server is running on http://localhost:3001
#         Successfully connected to PostgreSQL database!
#         [embeddings] local warmup done model=anass1209/... dim=384

# terminal 2 — frontend
cd frontend/project
cp .env.example .env   # VITE_API_BASE_URL=http://localhost:3001/api/v1
npm ci && npm run dev  # http://localhost:5173
```

Open http://localhost:5173 → signup → upload a text PDF → Resume Health →
paste a JD → Tailored Match → Job Matches.

**Timeouts are normal:** first JD-match / recommendation run can take up to
~260 s cold (model load + 5 providers + batch embed). The UI allows 120–260 s
on ML routes; everything else stays at 60 s. If you see
`timeout of 60000ms exceeded` on a non-ML route, that's a real problem —
on ML routes it just means "still warming up, retry".

## 5. Using the Render deployment instead (no local setup)

| Piece | URL |
|---|---|
| App | https://jobhunter-r773.onrender.com |
| API | https://jobhunter-backend-lkkf.onrender.com (`/health`, `/api/v1/*`) |

Just sign up in the app — same Supabase behind it, so data you create locally
shows up on Render and vice versa. Differences to know:

- Render runs `EMBEDDING_PROVIDER=aws` → real SageMaker Serverless endpoint
  (same `anass1209` model). Scores match local within ±1 (verified: readiness
  58 = 58, jd-match 60 = 60 on the same resume+JD).
- Free tier sleeps after ~15 min idle → first request can take 30–60 s.
- Secrets (`JOOBLE_API_KEY`, `ADZUNA_*`, `JOBSPIPE_API_KEY`, `AWS_*`,
  `SUPABASE_*`, `JWT_SECRET`) live in **Render Dashboard → jobhunter-backend →
  Environment** (`sync: false` in `render.yaml`, never committed). Changing
  frontend `VITE_*` vars requires a rebuild/redeploy of the static site.

## 6. Health checklist (what "set up" means)

Run these; every row must pass. Authenticated calls need a session cookie
(signup, then login with `-c/-b cookies.txt`).

```bash
B=http://localhost:3001            # or the Render URL
curl $B/health                     # {"status":"ok",...}
curl $B/api/v1/health              # {"success":true,"status":"ok",...,"version":"v1"}
curl $B/api/keepalive              # {"success":true,...}
curl -b cookies.txt $B/api/v1/profile
curl -b cookies.txt -X POST $B/api/v1/analyses/readiness \
  -H 'Content-Type: application/json' -d '{"resumeId":"<id>"}'
# → {"success":true,"readiness":{"score": <0-100>}}  (zero ML)
curl -b cookies.txt -X POST $B/api/v1/analyses/jd-match \
  -H 'Content-Type: application/json' -d '{"resumeId":"<id>","jobDescription":"..."}'
# → versions.embeddingModelId = anass1209/... AND versions.usedMock = false
curl -b cookies.txt -X POST $B/api/v1/recommendation-runs \
  -H 'Content-Type: application/json' -d '{"resumeId":"<id>","locations":["India"]}'
# → sources:{jooble,jobspipe,adzuna,remotive,arbeitnow}, 20 recommendations
```

Storage check: `GET /api/v1/resumes/:id/download` must return bytes identical
to the uploaded PDF (`cmp` them).

### Verified 2026-10-02

| Check | Local (`:3001`, venv model) | Render (SageMaker) |
|---|---|---|
| `GET /health`, `/api/v1/health`, `/api/keepalive` | ok | ok |
| Signup → login → cookie session | ok | ok |
| Upload PDF → Supabase `resumes` bucket | ok | ok |
| Download == uploaded bytes | identical | (same bucket) |
| Readiness (no JD, no ML) | **58** | **58** |
| JD-match (same resume + JD) | **60**, Medium, real embeddings | **60**, Medium, real embeddings |
| Recommendations (5 providers) | ok, `usedMock: false` | ok, `usedMock: false`, top = intern/entry roles |
| `usedMock: false` everywhere | yes | yes |

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Missing database connection string` | `backend/.env` missing or wrong cwd — run from `backend/` |
| `[LocalEmbeddingProvider] Python anass failed` | venv incomplete — redo §3; or model still downloading (watch `~/.cache/huggingface`) |
| `timeout of 60000ms exceeded` on jd-match/recommendations | cold model; wait for warmup line, retry (260 s budget) |
| `SageMaker InvokeEndpoint timeout` (Render logs) | Serverless cold start; already 260 s timeout — retry, don't add infra |
| `fallback to mock` / `mock-384` in logs | creds missing (Render) or venv broken (local) — the one log line tells you which |
| Port / CORS errors in browser | backend `CORS_ALLOWED_ORIGINS` must exactly match frontend origin; restart backend after `.env` changes; restart `vite dev` after `frontend/project/.env` changes |

## 8. Rules

- **Never commit secrets.** `backend/.env`, `frontend/project/.env`, `output.json`,
  `*cookies.txt` are gitignored. If a key ever lands in git history, rotate it
  (the old Jooble key in history is already treated as dead).
- Local and Render share one Supabase project — test rows you create are visible
  in both. Delete temp users/runs after health sweeps.
- Budget-aware testing: JobsPipe bills per job returned (keep `JOBSPIPE_LIMIT`
  small locally), Remotive allows ~4 calls/day, Adzuna trial is capped —
  `job_search_cache` (1 h, Arbeitnow 12 h) absorbs repeats.
