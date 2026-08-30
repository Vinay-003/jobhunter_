# JobHunter V2 — Resume ATS + JD Match + Job Recommendations

Portfolio-ready, production-hardened rebuild of JobHunter: deterministic ATS readiness (no ML), chunked semantic JD matching via AWS SageMaker Serverless, controlled Jooble retrieval and ranking, private Supabase storage, secure sessions.

**Branch:** `dev` (this rebuild). Legacy `master` preserved.

## What it does

- **Resume Readiness (no JD):** 100-point deterministic rubric (layout 25 + sections 15 + experience 25 + skills 15 + consistency 10 + concision 5 + target level 5). No embeddings, no AWS call. Versioned `2.0.0`, rule IDs and evidence.
- **JD Match (with JD):** readiness + structured JD parsing (required/preferred, responsibilities, seniority) + exact canonical skill matching (`Java != JavaScript` strict) + redacted professional-chunk embeddings + responsibility-level semantic coverage. Returns `JD Match 0-100`, breakdown, missing requirements, evidence, confidence `High/Medium/Low`.
- **Job Recommendations:** user preferences (roles, seniority, locations, work mode) → focused query planner (3-4 queries, not `skills.join(' ')`) → cached Jooble + persistent `external_api_usage` budget → dedupe + deterministic filters → chunked semantic ranking (`30+25+15+15+10+5=100` without ATS/salary/freshness) → top 20 with evidence. Separate from ATS flow.
- **Privacy:** PDF in Supabase private bucket `resumes/<user>/<resume>/source.pdf`, derived embeddings cached, PII never sent to AWS, owner-scoped queries everywhere.

## Architecture

```
Browser (Vite) --HTTPS cookie--> Express (Render) --> Supabase PG + Private Storage
                                         |--> Jooble (via JobProvider, cached)
                                         `--> SageMaker Serverless (embeddings only, scale-to-zero)
```

Cost rule: `needs ML? NO=>Render, YES=>SageMaker batch+dedupe+cache`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for components/data flows/trust boundaries and [SECURITY.md](./SECURITY.md) for auth/session/CORS/CSRF/rate limits.

## Tech stack

- **Frontend:** React 18 + Vite + TypeScript + React Router (V2 routes `/`, `/login`, `/signup`, `/app/ats`, `/app/jobs`, `/app/resumes`, `/app/profile`), centralized `lib/api.ts` (`VITE_API_BASE_URL`, `credentials:include`), no `localStorage` JWT, no `dangerouslySetInnerHTML`.
- **Backend:** Node 20 + Express 4 + TypeScript + `pg` + Helmet + `zod` validation + `express-rate-limit` + `cookie-parser` + opaque sessions (SHA-256 hash, HttpOnly cookies).
- **Parsing/scoring:** `pdfjs-dist` positional parser, canonical skill map, deterministic ATS/JD logic (versioned).
- **ML:** `EmbeddingProvider` abstraction (`MockEmbeddingProvider` for tests/dev, `AwsSageMakerEmbeddingProvider` for prod), SHA-256 dedupe, batched 32 texts, cached in `job_embeddings`/`resume_embeddings`.
- **Jobs:** `JobProvider`/`JoobleProvider`, `JobQueryPlanner`, FTS `tsvector`, normalized jobs, dedupe.
- **DB:** Postgres/Supabase, versioned migrations `001-003`, FTS, partial index `one latest per user`.

## API (V2)

Base `/api/v1`:

- `POST /auth/signup` `{email,password,username|display_name}` → 201
- `POST /auth/login` → sets `jobhunter_session` HttpOnly cookie + optional JWT for compat
- `POST /auth/logout`, `POST /auth/logout-all`, `GET /auth/session`
- `POST /resumes` (multipart `resume` + `targetLevel`) → private storage, magic-byte check, owner-scoped
- `GET /resumes`, `GET /resumes/:id`, `DELETE /resumes/:id`, `GET /resumes/:id/download` (signed/streaming, owner-scoped)
- `POST /analyses/readiness` `{resumeId,targetLevel}` — **zero AWS calls** (tested)
- `POST /analyses/jd-match` `{resumeId,jobDescription,targetRole}` — redacted chunks + cached embeddings
- `GET /analyses`, `GET /analyses/:id`
- `GET /profile`, `PATCH /profile`, `GET/PUT /job-preferences`
- `POST /recommendation-runs` `{resumeId,targetRoles,locations,workModes}` → ranked jobs, `GET /recommendation-runs/:id`, `GET /recommendation-runs/:id/results`

Legacy `/api/*` routes remain for compat (deprecated).

## Local development

```bash
# 1. DB - apply migrations
psql "$PG_DATABASE_STRING" -f backend/migrations/001_initial_v2.sql
psql "$PG_DATABASE_STRING" -f backend/migrations/002_add_fts.sql
psql "$PG_DATABASE_STRING" -f backend/migrations/003_storage_metadata.sql
# or runner (needs DB)
cd backend && npm ci && npm run migrate

# 2. Backend
cd backend
cp .env.example .env  # fill PG_DATABASE_STRING, JWT_SECRET (32+ chars), JOOBLE_API_KEY, SUPABASE_*, AWS_*
npm ci
npm run build
npm run dev  # bun src/server.ts or node dist/server.js

# 3. Frontend
cd frontend/project
cp .env.example .env  # VITE_API_BASE_URL=http://localhost:3001/api/v1
npm ci
npm run dev
```

Env validation (`backend/src/config/env.ts` via `zod`) fails closed in production if secrets missing. No fallback `your-secret-key`.

## Supabase

- Enable `pgcrypto`, create `resumes` private bucket, set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (backend only, never frontend).

## AWS SageMaker Serverless

Only for embeddings: `texts[] -> vectors[]` (`modelId: anass1209/resume-job-matcher-all-MiniLM-L6-v2`, 384-dim). Backend calls via `AwsSageMakerEmbeddingProvider` with `sagemaker:InvokeEndpoint` least-privilege IAM. `MockEmbeddingProvider` used when creds missing, and for tests. Scale-to-zero, `maxConcurrency ~1`, batch + cache to conserve credits.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Render (frontend static + backend web, `render.yaml`), Supabase, and SageMaker deploy/teardown.

## Security model

Opaque sessions (256-bit, HttpOnly `Secure` cookies, DB stores `SHA-256(token)`), `authenticateSession` with Bearer fallback, owner-scoped `WHERE id=$1 AND user_id=$2`, `helmet`, strict CORS (`CORS_ALLOWED_ORIGINS`), CSRF Origin + token, `zod` validation, rate limiting (`/auth` 20/15m, upload 10/min), PDF magic-byte + size + page count, private storage, no secrets in Git, IAM least privilege.

## ATS & JD philosophy

- No-JD is deterministic rules, not ML vs “ideal resume” prose. Weights sum exactly 100, no `clamp(110→100)`. Unknown means unknown (no `B.Tech/CS` fabrication), `new Date().getFullYear()` not hardcoded `2025`.
- JD match is `35 explicit + 30 semantic (chunked) + 15 role + 10 domain + 10 education =100`, versioned, explainable. One strong responsibility does not hide missing ones.

## Recommendation methodology

Preferences → planner → 3-4 focused Jooble queries → `query_hash` cache (reused across users) → normalize → dedupe `(source,external_id)` + URL fallback → deterministic hard filters → exact skill coverage → cached job embeddings → semantic responsibility alignment → fit composer → evidence + confidence. Freshness/salary are filters/tie-breakers, not fit.

## Testing

```bash
cd backend && npm test        # bun test: security, readiness (100 totals, zero ML), jdMatch (Java≠JS)
cd frontend/project && npm run build  # typecheck + build
```

Evaluation placeholder in `backend/evaluation/README.md`. Rankings measured via `Precision@5/NDCG@20` on small labeled sets (to be expanded).

## Limitations

- Jooble quota (`JOOBLE_CALL_BUDGET` 450) and snippet-only jobs → `Medium/Low` confidence.
- Render free tier cold starts; SageMaker Serverless cold start ~seconds but cached.
- Evaluation datasets small; model `anass1209/...-MiniLM-L6-v2` 256-token chunk limit → chunking mandatory.
- No OCR for scanned PDFs (rejected with guidance).

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [SECURITY.md](./SECURITY.md)
- [DEPLOYMENT.md](./DEPLOYMENT.md)
- [infra/aws/README.md](./infra/aws/README.md)
- [backend/evaluation/README.md](./backend/evaluation/README.md)
