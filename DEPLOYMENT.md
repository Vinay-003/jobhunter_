# Deployment — JobHunter V2

## Prereqs

- GitHub repo on `dev` (staging) and `master` (prod). Render blueprint points at `dev` by default.
- Supabase project (Postgres + Storage).
- AWS account with SageMaker access (optional — embeddings fall back to mock).
- Jooble API key (optional — recommendations fall back to DB search).

---

## 1. Render — Backend (`backend`)

Render type: **Web Service** (Node).

1. Connect repo to Render → **New → Blueprint** → select repo → Render reads `render.yaml`.
2. Confirm service `jobhunter-backend`:
   - **Root directory:** `backend`
   - **Build:** `npm ci && npm run build`  (runs `tsc` → `dist/`)
   - **Start:** `node dist/server.js`
   - **Health check:** `/health` (also `/api/v1/health`)
   - **Region:** `oregon` (change in `render.yaml` if colocating with Supabase)
   - **Branch:** `dev` (or `master` for prod blueprint)
3. Set env vars in **Environment** (all secrets `sync: false` in blueprint — must be set manually):
   ```
   PG_DATABASE_STRING / DATABASE_URL / SUPABASE_DB_URL   # from Supabase (pooler URI)
   PG_SSL=true
   JWT_SECRET                                            # >=32 chars, random
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_RESUME_BUCKET=resumes
   JOOBLE_API_KEY
   CORS_ALLOWED_ORIGINS=https://<frontend>.onrender.com
   FRONTEND_URL=https://<frontend>.onrender.com
   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SAGEMAKER_ENDPOINT_NAME
   EMBEDDING_MODEL_ID=anass1209/resume-job-matcher-all-MiniLM-L6-v2
   PYTHON_SERVICE_URL            # leave empty when using SageMaker
   ```
4. Deploy → verify `GET https://<backend>.onrender.com/health` returns `{status:"ok"}`.
5. Run migrations (one-off): Render **Shell** or local with prod URI:
   ```bash
   PG_DATABASE_STRING='<prod-uri>' npm run migrate
   # or: bun run src/db/migrations/run_migration.ts
   ```
   Migrations under `backend/migrations/` are idempotent.

**Notes:** Render free/starter dynos sleep; first request after idle is slow. `PORT` is injected by Render (service uses `process.env.PORT || 3001`).

---

## 2. Render — Frontend (`frontend/project`)

Render type: **Static Site**.

1. Same Blueprint flow creates `jobhunter-frontend`:
   - **Root directory:** `frontend/project`
   - **Build:** `npm ci && npm run build`
   - **Publish directory:** `dist`
   - **SPA rewrite:** `/* → /index.html` (in `render.yaml` routes)
   - **Region:** `oregon`
2. Set env vars in **Environment**:
   ```
   VITE_API_BASE_URL=https://<backend>.onrender.com/api/v1
   VITE_API_URL=https://<backend>.onrender.com/api   # legacy alias if needed
   ```
   `VITE_*` vars are **build-time** — changing them requires a rebuild.
3. Add `VITE_API_BASE_URL` to backend's `CORS_ALLOWED_ORIGINS` if not already.
4. Deploy → verify SPA loads and `POST /api/v1/auth/login` succeeds.

---

## 3. Supabase — Database & Storage

### 3.1 Database

1. Create Supabase project → **Project Settings → Database → Connection string → URI** (pooler, port 6543, `pgbouncer=true`).
2. Copy to `PG_DATABASE_STRING` (and Render env).
3. Apply migrations:
   ```bash
   cd backend
   PG_DATABASE_STRING='<uri>' bun run src/db/migrations/run_migration.ts
   ```
   Order: `001_initial_v2.sql` → `002_add_fts.sql` → `003_storage_metadata.sql`. All `IF NOT EXISTS` / `DO` guarded.
4. Verify tables: `users`, `sessions`, `user_job_preferences`, `resumes`, `jobs`, `analyses`, `recommendation_runs`, etc.; plus `pgcrypto`, `jobs.search_vector` GIN index, `resumes` partial unique index on `is_latest`.

### 3.2 Storage Bucket (private)

1. **Storage → New bucket** → name `resumes`, **Private** (no public access).
2. No extra RLS policy needed when using `service_role` key server-side; if using anon key, add policy restricting to `auth.uid()`-scoped paths.
3. Backend env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_RESUME_BUCKET=resumes`.
4. Test: upload a PDF via `POST /api/v1/resumes` (authenticated) → confirm object at `resumes/<userId>/<resumeId>/<file>` in Storage browser, and `resumes` row has `storage_bucket/path`, `sha256`.

**Local fallback:** if Supabase creds are absent, `supabaseStorage.ts` writes to `backend/uploads/<user>/<resume>/` — dev only.

---

## 4. AWS SageMaker Serverless — Embeddings

Embeddings use `AwsSageMakerEmbeddingProvider` → `InvokeEndpoint`. No credentials → deterministic `MockEmbeddingProvider` (dim 384) is used automatically.

### 4.1 Model Packaging

- Model: `anass1209/resume-job-matcher-all-MiniLM-L6-v2` (or any sentence-transformer) packaged as SageMaker inference container. Common path: HuggingFace `inference.py` with `requirements.txt` containing `sentence-transformers`, `transformers`, `torch`.
- Expected payload: `{ "inputs": ["text1", ...], "purpose": "resume|job|jd" }`
- Expected response: `{ "embeddings": [[...], ...] }` or `{ "vectors": [[...], ...] }` (both accepted).

### 4.2 IAM

Create an IAM user/role with minimal policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["sagemaker:InvokeEndpoint"],
    "Resource": "arn:aws:sagemaker:<region>:<account>:endpoint/<endpoint-name>"
  }]
}
```

Generate `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` for that principal, or use an instance role when hosting on AWS.

### 4.3 Endpoint Deployment (Serverless)

Via console or IaC (`infra/aws/`):

1. **Create model** → ECR image or HF container.
2. **Create serverless endpoint config** → `MemorySizeInMB` (e.g. 2048–4096), `MaxConcurrency` (e.g. 5), `ProvisionedConcurrency` guard.
3. **Create endpoint** with that config. Note endpoint name.
4. Set backend env: `AWS_REGION`, `AWS_SAGEMAKER_ENDPOINT_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.

See `infra/aws/README.md` for Terraform/CDK/SAM options.

### 4.4 Backend Credential Wiring

- Credentials read only by `AwsSageMakerEmbeddingProvider.hasAwsCreds()` at call time; SDK is lazy-imported (`@aws-sdk/client-sagemaker-runtime` is an optional peer dep).
- Timeouts: 15s per `InvokeEndpoint`; batching >32 texts; truncation at 5000 chars/text.

### 4.5 Cost Guardrails

- Serverless: pay per invocation + duration; cold starts expected.
- Guardrails: keep `MaxConcurrency` low, use `MockEmbeddingProvider` in non-prod, cache embeddings per `analysis`/`recommendation_run` if possible, respect `JOOBLE_*` budgets to avoid embedding fan-out.
- Monitor via CloudWatch `Invocations`, `ModelLatency`, `CPUUtilization`.

### 4.6 Testing

```bash
# With creds configured
curl -H "Authorization: Bearer <jwt>" https://<backend>/api/v1/recommendations
# Check logs: "[AwsSageMakerEmbeddingProvider] fallback to mock" should NOT appear
# Without creds → same call should still succeed via mock
```

Also run provider unit test: `backend/src/providers/embeddings/*` — mock path requires no AWS.

### 4.7 Teardown

- Delete SageMaker endpoint → endpoint config → model (console or `aws sagemaker delete-endpoint --endpoint-name <name>`).
- Revoke IAM user / delete access keys.
- Remove env vars from Render if retiring the integration — backend will silently use mock.

---

## 5. Post-Deploy Checklist

- [ ] `GET /health` and `GET /api/v1/health` return 200 on backend.
- [ ] `POST /api/v1/auth/signup` → `POST /api/v1/auth/login` → authenticated `GET /api/v1/profile` succeeds (CORS passes).
- [ ] Resume upload → Storage object exists → `GET /api/v1/resumes/:id` owner-only.
- [ ] Recommendations return (with or without Jooble/SageMaker — fallback paths work).
- [ ] `render.yaml` contains no plaintext secrets (`sync:false` for all secrets).

## 6. Rollback

- Render keeps previous deploys → **Manual Deploy → select previous commit**.
- DB: migrations are additive/idempotent; rollback is `DROP`/`ALTER` manually if needed — snapshot Supabase before major migrations.
