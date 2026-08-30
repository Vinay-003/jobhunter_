# Security — JobHunter V2

## 1. Authentication Model

- **JWT Bearer** is the primary auth mechanism. `authenticateToken` (`backend/src/middleware/auth.ts`) reads `Authorization: Bearer <token>` and verifies with `JWT_SECRET` (≥32 chars, `zod` enforced; production `env.ts` exits if missing). Expired/invalid tokens return 401/403.
- **Sessions table** (`sessions`) persists `token_hash = sha256(token)`, `expires_at`, `last_used_at`, `revoked_at`. Revoked or expired sessions are rejected even if JWT is still cryptographically valid — enabling server-side logout/invalidation.
- **Session TTL** is `SESSION_TTL_DAYS` (default 7). Cookie name is `SESSION_COOKIE_NAME` (`jobhunter_session`). Cookies are intended to be `httpOnly`, `secure` (in production), `SameSite=Lax` (or `None` only when cross-site is required — see CSRF below).
- **Password storage:** `argon2` / `bcrypt` hashes (repo uses `argon2` primary); plaintext passwords never logged or returned.

## 2. Session & Cookie Hardening

- On login/signup the server sets the session cookie with `httpOnly`, `secure` (when `NODE_ENV=production`), `sameSite` and `maxAge` derived from `SESSION_TTL_DAYS`.
- `token_hash` is stored, not the raw token. Logouts set `revoked_at`.
- Session lookup checks `revoked_at IS NULL AND expires_at > now()`.

## 3. CORS

- `backend/src/server.ts` builds `allowedOrigins` from `CORS_ALLOWED_ORIGINS` (comma-separated) or `FRONTEND_URL` and passes `origin: allowedOrigins.length ? allowedOrigins : true, credentials: true` to `cors()`. In production, **always set `CORS_ALLOWED_ORIGINS`** to the exact frontend origin(s) (e.g. `https://jobhunter-frontend.onrender.com`); wildcard `true` is dev-only.
- `getCorsOrigins()` (`config/env.ts`) is reused by CSRF validation.

## 4. CSRF

- `backend/src/middleware/csrf.ts` implements double-submit + Origin validation:
  - Safe methods (`GET, HEAD, OPTIONS`) only validate `Origin` when present.
  - State-changing methods validate `Origin` against `CORS_ALLOWED_ORIGINS`; if a CSRF cookie (`csrf_token` / `jobhunter_csrf` / `_csrf`) exists, the request must send a matching `X-CSRF-Token` (or `X-XSRF-Token`) header.
- When `SameSite=None` is required (cross-site Render frontend → API), the frontend **must** read the CSRF cookie and echo it in `X-CSRF-Token`. Without the cookie, CSRF enforcement is permissive but Origin is still checked.

## 5. Rate Limiting

- `express-rate-limit`:
  - `authLimiter`: `windowMs: 15 min, max: 20` on `/api/auth` and `/api/v1/auth` (brute-force mitigation).
  - `uploadLimiter`: `windowMs: 1 min, max: 10` on upload endpoints.
- Extend limiters to `/api/v1/resumes` and `/api/v1/recommendations` in production if abuse is observed.

## 6. Input Validation

- `backend/src/middleware/validate.ts` uses `zod` schemas; malformed bodies return 400 with structured errors.
- `helmet` sets `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security` (when applicable), `XSS` headers.
- JSON body limit `1mb`; `urlencoded` limit `1mb`.

## 7. Upload Security

- `multer` in-memory storage; MIME allowlist `application/pdf` only; filename sanitized via `replace(/[^a-zA-Z0-9._-]/g, '_').slice(0,120)`.
- Size cap enforced by multer `limits.fileSize` (configure per route).
- `sha256` computed server-side for integrity/dedup; client-supplied hashes are ignored.
- Object path is `userId/resumeId/safeFilename` — no user-controlled directory traversal.
- Processing is synchronous in-request for MVP; consider async queue + virus scan (ClamAV) for hardening.

## 8. Storage & Object-Level Authorization

- **Bucket is private** (`resumes` bucket, no public read). All access goes through `supabaseStorage.ts` using `SUPABASE_SERVICE_ROLE_KEY` server-side.
- **Owner checks** on every read/write/delete: `resumes.user_id` must equal `req.user.id` (IDOR guard). Direct object-path guessing is useless without a valid session and ownership.
- Presigned URLs, if introduced, must be short-lived and owner-gated.

## 9. Secret Handling

- Secrets (`JWT_SECRET`, `PG_DATABASE_STRING`, `SUPABASE_SERVICE_ROLE_KEY`, `JOOBLE_API_KEY`, `AWS_*`) are **never committed**. They are:
  - Declared with `sync: false` in `render.yaml` (Render dashboard-only).
  - Listed as placeholders in `backend/.env.example` and `frontend/project/.env.example`.
  - Validated at boot by `config/env.ts` (`zod`); production fails fast on missing `JWT_SECRET` / `PG_DATABASE_STRING`.
- `.env` files are gitignored (`backend/.env`, `/.env*`). CI uses ephemeral `JWT_SECRET` and `PG_DATABASE_STRING` values.

## 10. AWS IAM (SageMaker)

- SageMaker access uses `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` scoped to `sagemaker:InvokeEndpoint` on the specific endpoint ARN. Prefer an IAM role with least-privilege if deploying on AWS infra; long-lived keys are for Render-hosted backend only.
- Endpoint name is `AWS_SAGEMAKER_ENDPOINT_NAME`; region is `AWS_REGION`. Credentials are lazy-used only inside `AwsSageMakerEmbeddingProvider.hasAwsCreds()` and passed to `SageMakerRuntimeClient`.

## 11. Logging & Redaction

- Error handler in `server.ts` logs `err.stack` server-side but only returns `err.message` to the client; stack traces are included only when `NODE_ENV=development`.
- Never log `JWT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `AWS_SECRET_ACCESS_KEY`, raw `Authorization` headers, or `Jooble` keys. Structured loggers should redact keys matching `*SECRET*`, `*KEY*`, `*TOKEN*`.

## 12. Data Deletion & Retention

- `DELETE /api/v1/resumes/:id` (owner-only) calls `supabaseStorage.deleteFile(ref)` (`storage.remove`) and deletes the DB row.
- User deletion cascades via FK `ON DELETE CASCADE` (`sessions`, `resumes`, `user_job_preferences`, `analyses`, `recommendation_runs`).
- Supabase Storage objects for deleted resumes are removed immediately; no soft-delete retention by default.

## 13. Known Limitations & Roadmap

| Area | Status | Next step |
|---|---|---|
| `cors.origin: true` fallback | Currently permissive when `CORS_ALLOWED_ORIGINS` unset | Require explicit allowlist in prod; fail boot if missing when `NODE_ENV=production` |
| `multer` in-memory | Large PDFs consume heap | Switch to streaming + disk spill or S3 multipart threshold |
| No virus scan | PDFs not scanned | Add ClamAV / Supabase malware scan hook |
| No WAF | No edge firewall | Add Render / Cloudflare WAF + IP allowlist |
| Long-lived AWS keys | Static creds in env | Move to IAM role / STS short-lived creds |
| No audit log | Actions not centrally logged | Add append-only audit table + redacted event log |
| Rate limits narrow | Only auth + upload | Expand to recommendations + search endpoints |
