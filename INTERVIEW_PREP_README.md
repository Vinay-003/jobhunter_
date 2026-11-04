# JOBHUNTER V2: SYSTEM SPECIFICATION & TECHNICAL KNOWLEDGE BASE

> **Document Class:** Autonomous Agent Technical Reference / System Architecture Specification  
> **Target Consumer:** AI Coding Agents, Automated Auditors, and Senior System Engineers  
> **Format Rules:** High-density technical specification; zero diagrams; zero conversational analogies; exhaustive component connectivity, data contracts, and implementation mechanics.

---

## 1. SYSTEM IDENTITY, PROCESS TOPOLOGY & INVARIANTS

### 1.1 Process & Runtime Matrix
- **Backend Production Runtime:** Node.js `>=22.14.0` (Render Web Service `jobhunter-backend-lkkf.onrender.com`). Native WebSocket support is required by `@supabase/supabase-js` v2.117+.
- **Backend Development Runtime:** Bun `1.4.0` (Local engine on `http://localhost:3001` running `src/server.ts`, executing tests via `bun test`, and running migrations via `bun run src/db/migrate.ts`).
- **Frontend SPA Runtime:** React 18.3.1 + Vite 5/8 (Render Static Site `jobhunter-r773.onrender.com` / Local Vite dev server on `http://localhost:5173`).
- **Edge Cron Runtime:** Cloudflare Workers (Cron trigger `0 */12 * * *` pinging `/api/keepalive`).
- **Serverless Relay Runtime:** Vercel Node.js Serverless Function (`api/internal/email.ts`) relaying SMTP traffic to Gmail port 587.
- **Local Machine Learning Worker:** Python 3.12 virtual environment (`anass1209`) executing `SentenceTransformer` over `stdin`/`stdout` JSON IPC.
- **Database Engine:** PostgreSQL 15+ hosted on Supabase (Pooler mode on TCP port 6543 running PgBouncer).
- **Object Storage:** Supabase Storage (Private S3-compliant bucket `resumes`).

### 1.2 Core Invariants
1. **Separation of Health and Fit:** The ATS Readiness / Resume Health diagnostic is 100% deterministic (100-point rubric v4.2.0), executes locally in memory, consumes zero ML/LLM tokens, and requires zero job description input. Semantic embeddings are strictly reserved for JD matching and job recommendation ranking.
2. **Fail-Loud Storage Policy:** In production (`NODE_ENV=production`), file uploads failing to reach Supabase Storage throw fatal exceptions immediately. Ephemeral container disk writes are strictly prohibited in production to prevent silent data loss across container restarts.
3. **Fail-Fast Schema Readiness:** The Express server asserts that all 10 schema migrations and required columns exist via `checkSchemaReadiness()` before `app.listen()` binds to the network.
4. **Data Privacy & Redaction:** Resume texts are stripped of Personal Identifiable Information (PII) via `redactProfessionalText()` (removing emails, phone numbers, and profile URLs) before dispatch to embedding providers or LLMs.
5. **Single Source of Truth:** Relational data and vector caches reside in PostgreSQL. External API credentials and service role keys are restricted to backend environment memory and never transmitted to the browser client.

---

## 2. REPOSITORY TOPOLOGY & ARTIFACT INVENTORY

- `backend/src/server.ts`: HTTP gateway, reverse proxy configuration, middleware pipeline, startup readiness hook, local model warmup.
- `backend/src/config/env.ts`: Zod schema validation for environment variables, database URL resolution, CORS origin regex matcher.
- `backend/src/config/database.ts`: `pg.Pool` instance configured with SSL and pooler options.
- `backend/src/db/migrate.ts`: Migration orchestrator applying SQL scripts sequentially with transactions.
- `backend/src/db/schemaReadiness.ts`: Startup assertion verifying migrations `006` through `010` and required database columns.
- `backend/src/middleware/csrf.ts`: Double-submit cookie verification and origin header validation.
- `backend/src/middleware/requireSession.ts`: Session extraction and authentication middleware.
- `backend/src/middleware/validate.ts`: Request validation middleware for Zod schemas (body, query, params).
- `backend/src/modules/auth/session.ts`: Cryptographic token generator (`crypto.randomBytes`), SHA-256 token hashing, session CRUD.
- `backend/src/modules/storage/supabaseStorage.ts`: Supabase Storage upload, download, delete, and health probe abstraction.
- `backend/src/modules/parsing/pdfParser.ts`: Binary `%PDF` magic validator, positional text extraction, scanned PDF detector.
- `backend/src/modules/parsing/documentBlocks.ts`: Section boundary identification and multiline bullet joining.
- `backend/src/modules/parsing/resumeProfile.ts`: Structured entity extraction (skills, experience, education, seniority).
- `backend/src/modules/parsing/skillExtractor.ts`: Regex skill extraction with boundary assertions and disambiguation logic.
- `backend/src/modules/parsing/skillNormalizer.ts`: Canonical skill dictionary mapping aliases and synonyms.
- `backend/src/modules/ats/readinessScorer.ts`: Deterministic 100-point ATS rubric scoring engine.
- `backend/src/modules/jd/jdParser.ts`: Job description text parser extracting responsibilities and requirements.
- `backend/src/modules/jd/matcher.ts`: Strict skill matching engine (`Java != JavaScript`), group logic (`allOf`, `anyOf`).
- `backend/src/modules/analysis/jdRubric.ts`: 100-point JD match composite rubric and qualification evaluator.
- `backend/src/modules/analysis/reportSchema.ts`: Canonical `ReportSnapshot` serializer.
- `backend/src/modules/matching/evidenceBuilder.ts`: Professional bullet extractor and PII sanitizer.
- `backend/src/modules/jobs/availability.ts`: Live vacancy checker, DNS IP validator (SSRF defense), Schema.org JSON-LD parser.
- `backend/src/modules/jobs/eligibility.ts`: Candidate career stage, tenure, and residency eligibility evaluator.
- `backend/src/modules/jobs/geography.ts`: Location normalizer and country inference.
- `backend/src/modules/jobs/queryPlanner.ts`: Partitioning profile into top 3 distinct job search queries.
- `backend/src/modules/jobs/ranking.ts`: Multi-factor job ranking engine (Skills, Semantic Vectors, Role, Seniority, Location).
- `backend/src/modules/jobs/roleDiscovery.ts`: APINEX LLM role discoverer with JSON delimiter repair and fallback.
- `backend/src/modules/jobs/seniority.ts`: Career level detector and mismatch penalty calculator.
- `backend/src/providers/embeddings/EmbeddingProvider.ts`: Interface contract for vector inference.
- `backend/src/providers/embeddings/AwsSageMakerEmbeddingProvider.ts`: AWS SageMaker Serverless runtime client.
- `backend/src/providers/embeddings/LocalEmbeddingProvider.ts`: Local Python SentenceTransformer wrapper.
- `backend/src/providers/embeddings/MockEmbeddingProvider.ts`: Deterministic hash-based 384-dimensional vector generator.
- `backend/src/providers/embeddings/embeddingCache.ts`: PostgreSQL vector caching module.
- `backend/src/providers/jobs/retrievalExecutor.ts`: Bounded wave scheduler managing external API concurrency.
- `backend/src/providers/jobs/providerBudgets.ts`: Atomic PostgreSQL rate-limiting and quota reservations.
- `backend/src/providers/jobs/jobStore.ts`: HTML sanitization, canonical URL normalization, and deduplication.
- `backend/src/utils/otp.ts`: 6-digit OTP generator and timing-safe validator (`crypto.timingSafeEqual`).
- `backend/src/utils/sendEmail.ts`: Mail dispatcher supporting Vercel HTTP relay and direct SMTP.
- `frontend/project/src/lib/api.ts`: Central Axios client, CSRF header attachment, 401 interceptor.
- `frontend/project/src/app/router.tsx`: React Router v7 configuration, `SessionGuard`, `PublicOnly`.
- `frontend/project/src/features/auth/AuthContext.tsx`: Authentication state provider.
- `frontend/project/api/internal/email.ts`: Vercel serverless function relaying emails to SMTP.
- `workers/keepalive-worker/worker.js`: Cloudflare Worker cron pinging `/api/keepalive`.

---

## 3. TECHNICAL CONNECTIVITY & DATA FLOW (PART A TO PART B TO PART C)

### 3.1 Network Gateway, Middleware Pipeline & Security Flow
```
Client (Browser)
  │ (HTTPS + Cookie: jobhunter_session + Cookie: jobhunter_csrf + Header: X-CSRF-Token)
  ▼
[Reverse Proxy: Render / Nginx]
  │ (Appends X-Forwarded-For)
  ▼
[server.ts: app.set('trust proxy', 1)]
  │ Extracts real client IP from the first reverse proxy hop.
  ▼
[helmet()]
  │ Injects HTTP security headers: X-Content-Type-Options: nosniff, X-Frame-Options: SAMEORIGIN.
  ▼
[cors({ origin: isAllowedOrigin })]
  │ Evaluates Origin header against config/env.ts rules (localhost, *.vercel.app, *.vinaybuilds.me).
  ▼
[cookieParser()]
  │ Parses raw Cookie header string into req.cookies object.
  ▼
[express.json({ limit: '1mb' }) + express.urlencoded({ extended: true, limit: '1mb' })]
  │ Buffers and parses JSON payloads; rejects payloads > 1 MB with HTTP 413.
  ▼
[express-rate-limit]
  │ /api/v1/auth/login, /api/v1/auth/signup: Max 20 requests per 15 minutes per IP.
  │ /api/v1/resumes (upload): Max 10 uploads per minute per IP.
  │ /api/v1/recommendation-runs: Max 15 calls per minute per IP.
  ▼
[csrfProtection (backend/src/middleware/csrf.ts)]
  │ Skips safe methods: GET, HEAD, OPTIONS.
  │ Skips Bearer token requests if Cookie header is absent.
  │ For cookie-bearing mutations (POST, PUT, PATCH, DELETE):
  │ Compares req.cookies['jobhunter_csrf'] against req.headers['x-csrf-token'].
  │ Executes crypto.timingSafeEqual(Buffer.from(headerToken), Buffer.from(cookieToken)).
  │ If tokens mismatch or format != /^[a-f0-9]{64}$/, returns HTTP 403 { message: 'CSRF token required' }.
  ▼
[Route Router: backend/src/routes/v1/index.ts]
```

### 3.2 Authentication & Session Lifecycle Connectivity
```
[POST /api/v1/auth/signup]
  │ Input: { email, password, displayName }
  │ Zod Schema: signupSchema (email validated, password min 8 chars).
  ▼
[Database Verification]
  │ SELECT id, verified FROM users WHERE email = normalizedEmail
  │ If user exists & verified == true -> HTTP 400 'User already exists'
  │ If user exists & verified == false -> bcrypt.hash(password, 10), UPDATE users credentials.
  │ If user does not exist -> bcrypt.hash(password, 10), INSERT INTO users (verified=false).
  ▼
[issueOtp(normalizedEmail, 'verification') in backend/src/utils/otp.ts]
  │ Checks SELECT last_sent FROM otps WHERE email=$1 AND purpose=$2.
  │ If Date.now() - last_sent < 60,000 ms -> Throws Error('OTP_RATE_LIMIT') -> HTTP 429.
  │ Generates code = crypto.randomInt(100000, 1000000).toString() (6 digits).
  │ Dispatches email via sendEmail() FIRST.
  │ If email accepted -> DB Transaction:
  │   UPDATE otps SET expiry = now() WHERE email=$1 AND purpose=$2 AND expiry > now()
  │   INSERT INTO otps (email, value, purpose, last_sent, expiry=now()+5min)
  │ Returns HTTP 201 { success: true, requiresVerification: true }
  ▼
[POST /api/v1/auth/verify-otp]
  │ Input: { email, otp, purpose }
  ▼
[consumeOtp(normalizedEmail, otp, purpose) in backend/src/utils/otp.ts]
  │ SELECT id, value, expiry FROM otps WHERE email=$1 AND expiry > now() ORDER BY last_sent DESC LIMIT 1
  │ Evaluates crypto.timingSafeEqual(Buffer.from(record.value), Buffer.from(code)).
  │ If match -> DELETE FROM otps WHERE id = record.id -> Returns true.
  │ Updates users: UPDATE users SET verified = true WHERE email = normalizedEmail.
  ▼
[Session.createSession(userId, userAgent) in backend/src/modules/auth/session.ts]
  │ token = crypto.randomBytes(32).toString('hex') (64 hex characters).
  │ tokenHash = crypto.createHash('sha256').update(token).digest('hex').
  │ userAgentHash = crypto.createHash('sha256').update(userAgent).digest('hex').
  │ expiresAt = now() + (SESSION_TTL_HOURS * 3600000) (Default: 24 hours).
  │ INSERT INTO sessions (user_id, token_hash, expires_at, user_agent_hash) VALUES (...)
  │ Session.setSessionCookie(res, token): Sets cookie 'jobhunter_session'
  │ Flags: httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax', path: '/'.
  ▼
[Subsequent Authenticated Requests]
  │ requireSession middleware:
  │ Token extracted from req.cookies['jobhunter_session'] (or Authorization Bearer fallback).
  │ tokenHash = crypto.createHash('sha256').update(token).digest('hex').
  │ SELECT id, user_id, expires_at, revoked_at FROM sessions WHERE token_hash = $1
  │ If row missing, revoked_at != null, or expires_at < now() -> HTTP 401 'Unauthorized'.
  │ Attaches req.user = { id: row.user_id }.
```

### 3.3 Resume Upload, Storage & Extraction Connectivity
```
[POST /api/v1/resumes]
  │ Middleware: uploadLimiter (10/min) -> csrfProtection -> requireSession -> multer.single('resume')
  │ Multer storage: memoryStorage(); file size limit: 10 MB.
  ▼
[File Validation]
  │ Buffer validation: isPdfMagic(req.file.buffer) -> verifies buffer[0..3] == '%PDF'.
  │ MIME validation: req.file.mimetype === 'application/pdf'.
  │ If invalid -> HTTP 415 'Only PDF files are allowed'.
  ▼
[PDF Parsing: parsePdfBuffer(buffer) in backend/src/modules/parsing/pdfParser.ts]
  │ Uses pdfjs-dist getDocument({ data: new Uint8Array(buffer) }).
  │ Iterates pages: extracts text content items preserving (x, y) coordinates.
  │ Detects line breaks based on y-coordinate shifts rather than collapsing into a single line.
  │ Computes layout signals: pageCount, avgCharsPerPage, textDensity, hasMultiColumnRisk.
  │ Checks scanned status: if totalChars < 50 || avgChars < 30 -> detectedAsScanned = true.
  │ If detectedAsScanned -> HTTP 400 { code: 'SCANNED_PDF', message: 'Scanned PDF not supported' }.
  ▼
[Binary Storage: uploadFile() in backend/src/modules/storage/supabaseStorage.ts]
  │ sha256 = crypto.createHash('sha256').update(buffer).digest('hex').
  │ objectPath = `${userId}/${resumeId}/${safeFilename}`.
  │ If SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY configured:
  │   supabase.storage.from('resumes').upload(objectPath, buffer, { contentType: 'application/pdf', upsert: true })
  │ If production and Supabase upload fails -> Throws Error -> HTTP 500.
  │ If development and Supabase unconfigured -> Writes to uploads/${objectPath} with bucket='local'.
  ▼
[Database Persistence: Transaction on resumes table]
  │ BEGIN;
  │ UPDATE resumes SET is_latest = false WHERE user_id = $1 AND is_latest = true;
  │ INSERT INTO resumes (id, user_id, original_filename, storage_bucket, storage_object_path, sha256,
  │                      file_size_bytes, page_count, parser_version, processing_status, is_latest)
  │ VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'uploaded', true) RETURNING *;
  │ COMMIT;
  ▼
[Retention Eviction Policy]
  │ SELECT id, storage_bucket, storage_object_path FROM resumes WHERE user_id=$1 AND id<>$2 ORDER BY created_at ASC;
  │ If count > 3 (MAX_RESUMES_PER_USER):
  │ Evicts oldest rows: DELETE FROM resumes WHERE id = old.id;
  │ Best-effort storage delete: supabase.storage.from(bucket).remove([path]);
  ▼
[Resume Profiling: buildResumeProfile(parsed) in backend/src/modules/parsing/resumeProfile.ts]
  │ Groups text into canonical sections via documentBlocks.ts:
  │   SECTION_ALIASES maps 'work experience', 'employment history' -> 'experience'.
  │   Maps 'technical skills', 'frameworks', 'tools' -> 'skills'.
  │ Extracts skills via skillExtractor.ts:
  │   Regex boundary rules: C++ (/\bC\+\+\b/i), C# (/\bC#\b/i), Go (standalone boundary).
  │   Disambiguates words: excludes 'Express' from 'American Express', 'REST' from 'restaurant'.
  │ Normalizes skills via skillNormalizer.ts: maps 'React.js' -> 'React', 'Postgres' -> 'PostgreSQL'.
  │ Extracts employment intervals & computes union of dates: prevents club activity overlap.
  │ Detects seniority: 'intern' | 'entry' | 'mid' | 'senior' | 'lead' | 'principal'.
  │ Inserts into resume_profiles:
  │   INSERT INTO resume_profiles (resume_id, profile_json, profile_version) VALUES ($1, $2, $3)
  │   ON CONFLICT (resume_id) DO UPDATE SET profile_json=$2, profile_version=$3;
  ▼
[Client Response]
  │ HTTP 200 JSON: { success: true, resume: { id, fileName, uploadDate, status, sha256, pageCount, storageBucket } }
```

### 3.4 ATS Readiness Diagnostic Scoring Connectivity
```
[POST /api/v1/analyses/readiness]
  │ Input: { resumeId, targetLevel }
  │ Middleware: authenticateAny (requireSession) -> validate({ body })
  ▼
[Resume Row & Buffer Resolution]
  │ SELECT * FROM resumes WHERE id=$1 AND user_id=$2 (IDOR protection).
  │ If missing -> HTTP 404.
  │ loadResumeBuffer():
  │   supabase.storage.from(storage_bucket).download(storage_object_path)
  │   If storage returns 404/error -> Throws STORED_FILE_MISSING -> HTTP 410 'Stored file missing'.
  ▼
[Document Parsing & Profile Assembly]
  │ parsePdfBuffer(buf) -> buildResumeProfile(parsed) -> buildParsedResumeSections(parsed, profile).
  ▼
[Rubric Evaluation: scoreReadiness() in backend/src/modules/ats/readinessScorer.ts]
  │ Version: 4.2.0. Pure deterministic calculation. Zero network/vector calls.
  │ Evaluates 8 discrete categories (Total 100 points):
  │ 1. Parseability & ATS Structure (20 pts):
  │    - Clean section headings, single-column flow, absence of complex tables.
  │ 2. Core Completeness (15 pts):
  │    - Email present (regex), phone present, LinkedIn/GitHub present, education detected.
  │ 3. Impact & Measurable Evidence (20 pts):
  │    - Counts bullets containing metrics: percentages (%), currencies ($), latencies (ms/s), numbers.
  │    - Ratio of quantified bullets to total experience bullets.
  │ 4. Experience & Project Quality (15 pts):
  │    - Action-verb led bullets, chronological dates, distinct role scopes.
  │ 5. Skills Clarity & Evidence (10 pts):
  │    - Categorized skills, framework-to-language balance, absence of keyword stuffing.
  │ 6. Writing & Bullet Quality (10 pts):
  │    - Detects weak passive phrases: 'helped with', 'responsible for', 'assisted'.
  │ 7. Concision & Readability (5 pts):
  │    - Length penalty if > 2 pages or word count < 200 or > 1200 words.
  │ 8. Consistency & Hygiene (5 pts):
  │    - Consistent date formatting, absence of repeated lead verbs (> 3 times).
  │ Outputs: score (0..100), breakdown (CategoryBreakdown[]), rules (RuleResult[]),
  │          priorityActions (PriorityAction[]), findings (ResumeFinding[]).
  ▼
[Report Packaging & Snapshot Serialization]
  │ Generates analysisId = crypto.randomUUID().
  │ Constructs ReportSnapshot (reportSchema.ts):
  │   { resultSchemaVersion: '3.1.0', analysisId, resumeId, readiness, parsedSections, contactInfo, profileContentHash }
  ▼
[Database Persistence]
  │ INSERT INTO analyses (id, user_id, resume_id, analysis_type, readiness_score,
  │                       score_breakdown_json, evidence_json, target_level, scorer_version,
  │                       parser_version, result_schema_version, result_json, profile_version,
  │                       profile_content_hash, created_at)
  │ VALUES ($1, $2, $3, 'readiness', $4, $5, $6, $7, '4.2.0', '4.0.0', '3.1.0', $8, '4.0.0', $9, now());
  ▼
[Client Response]
  │ HTTP 200 JSON ReportSnapshot.
```

### 3.5 Tailored JD Matching & Vector Inference Connectivity
```
[POST /api/v1/analyses/jd-match]
  │ Input: { resumeId, jobDescription, targetLevel }
  │ Validation: jobDescription min 20 chars, max 20,000 chars.
  ▼
[Resume Loading & JD Parsing]
  │ Resolves resume and profile as in 3.4.
  │ parseJd(jobDescription) in backend/src/modules/jd/jdParser.ts:
  │   Extracts title, seniority, requiredSkills, preferredSkills, responsibilities, requirementGroups.
  ▼
[Deterministic Keyword Matching: matchJd() in backend/src/modules/jd/matcher.ts]
  │ Evaluates normalized resume skills against JD requirements.
  │ Strict equality: 'Java' does not match 'JavaScript'; 'C' does not match 'C++'.
  │ Evaluates requirementGroups: allOf (must have all) and anyOf (must have at least one).
  │ Computes requiredCoverage (0..1) and preferredCoverage (0..1).
  ▼
[Evidence Chunking & Sanitization in backend/src/modules/matching/evidenceBuilder.ts]
  │ resumeChunks = professionalEvidence(profile):
  │   Extracts typed experience and project bullets.
  │   Executes redactProfessionalText(): scrubs emails, phones, profile URLs.
  │ jdChunks = jd.responsibilities.map(r => r.slice(0, 400)).
  │ allTexts = [...resumeChunks, ...jdChunks];
  │ uniq = Array.from(new Set(allTexts.map(t => t.trim()).filter(Boolean)));
  ▼
[Vector Inference & Caching in backend/src/providers/embeddings/embeddingCache.ts]
  │ embedCached(pool, provider, groups, identity):
  │ Checks PostgreSQL embedding_cache table:
  │   SELECT vector, dimension FROM embedding_cache WHERE purpose=$1 AND owner_id IS NOT DISTINCT FROM $2
  │   AND content_hash=$3 AND model_id=$4 AND model_revision=$5;
  │   - Resume vectors require owner_id = userId (Tenant isolation).
  │   - JD vectors use owner_id = null (Shared public cache).
  │ For cache misses:
  │   Provider hierarchy: LocalEmbeddingProvider (local venv worker) or AwsSageMakerEmbeddingProvider.
  │   AWS SageMaker: InvokeEndpoint({ EndpointName, Body: JSON.stringify({ inputs: missingTexts }) })
  │   Local Worker: JSON stringified payload piped over stdin to Python process -> stdout JSON response.
  │   Returns vectors: number[][] (dimension 384).
  │   validateVectors(): asserts vector.length === 384, no NaN values, finite numbers.
  │   Inserts missing vectors into embedding_cache:
  │     INSERT INTO embedding_cache (purpose, owner_id, content_hash, model_id, model_revision, dimension, vector)
  │     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) ON CONFLICT DO NOTHING;
  ▼
[Semantic Cosine Matrix & Discrimination Curve]
  │ For each JD responsibility vector jv:
  │   For each resume chunk vector rv:
  │     rawCosine = dotProduct(jv, rv) / (norm(jv) * norm(rv))
  │   bestCosine = max(rawCosine)
  │   candidateEvidence = matching resume chunk if bestCosine >= 0.45.
  ▼
[Rubric Assembly: scoreJdRubric() in backend/src/modules/analysis/jdRubric.ts]
  │ Score Components (Total 100 points):
  │ - Explicit Must-Have Skills: Up to 35 pts (requiredCoverage * 30 + preferredCoverage * 5).
  │ - Responsibility Semantic Alignment: Up to 30 pts (average responsibility match scores).
  │ - Role Title & Function Alignment: Up to 15 pts (role family matching: 'software' vs 'data').
  │ - Domain Knowledge: Up to 10 pts (regex matching domain terms e.g., 'fintech', 'e-commerce').
  │ - Education & Credentials: Up to 10 pts (degree requested vs candidate degree status).
  │ Seniority Gap Evaluation:
  │   If candidate is junior/entry and role is senior/principal -> seniorityPenalty applied (up to -40 pts).
  │   If candidate has 4+ years and role is intern -> low score cap applied.
  ▼
[Database Persistence]
  │ INSERT INTO analyses (id, user_id, resume_id, analysis_type, readiness_score, jd_match_score,
  │                       score_breakdown_json, evidence_json, jd_hash, embedding_model_id,
  │                       embedding_status, result_json, created_at)
  │ VALUES (...);
  ▼
[Client Response]
  │ HTTP 200 JSON ReportSnapshot with jdMatch object and LLM Tailoring evidence.
```

### 3.6 Multi-Provider Job Recommendation & Ranking Connectivity
```
[POST /api/v1/recommendation-runs]
  │ Input: { resumeId, forceRefresh, idempotencyKey, targetRoles, locations, workModes, ... }
  │ Middleware: workLimiter (15/min) -> csrfProtection -> requireSession -> validate()
  ▼
[Cache Validation: recommendationCacheValid()]
  │ If forceRefresh == false:
  │ Queries recommendation_runs for matching (user_id, resume_id, preferences_snapshot_json, status='completed').
  │ If valid completed run exists -> Returns persisted recommendations from database immediately.
  ▼
[Query Planning: JobQueryPlanner.plan()]
  │ Partitions resume profile & preferences into up to 3 distinct search queries (e.g. ['Full Stack Developer', 'Backend Engineer']).
  ▼
[Bounded Wave Scheduling: executeRetrieval() in backend/src/providers/jobs/retrievalExecutor.ts]
  │ Global concurrency: 4; Per-provider concurrency: 1; Hard timeout: 25,000 ms.
  │ Provider Execution:
  │ 1. JoobleProvider: POST https://jooble.org/api/{KEY} (Iterated per query).
  │ 2. AdzunaProvider: GET https://api.adzuna.com/v1/api/jobs/{country}/search/1.
  │ 3. JobsPipeProvider: GET https://api.jobspipe.com/v1/jobs (Cursor-based pagination).
  │ 4. RemotiveProvider: GET https://remotive.com/api/remote-jobs.
  │ 5. ArbeitnowProvider: GET https://arbeitnow.com/api/job-board-api.
  ▼
[Atomic Rate Limiting: providerBudgets.ts]
  │ Before issuing provider call, executes:
  │ reserveCall(providerKey, limit, credits):
  │   INSERT INTO external_api_usage (id, provider, request_count, last_called_at)
  │   VALUES ($1, $2, $3, now())
  │   ON CONFLICT (provider) DO UPDATE
  │   SET request_count = external_api_usage.request_count + $3, last_called_at = now()
  │   WHERE external_api_usage.request_count + $3 <= $4 RETURNING request_count;
  │ If query returns 0 rows (ceiling exceeded) -> Skips API call; executes fallbackFromDb().
  ▼
[Normalization, Sanitization & Deduplication]
  │ jobStore.ts:
  │ - stripHtml(): Strips script, style, and HTML markup from descriptions.
  │ - normalizeUrl(): Strips tracking query parameters (utm_*, ref, source).
  │ - Deduplicates by (source, external_id) and normalized (title | company).
  │ Upserts raw jobs into jobs table:
  │   INSERT INTO jobs (source, external_id, title, company, location, description, url, ...)
  │   ON CONFLICT (source, external_id) DO UPDATE ... RETURNING id;
  ▼
[Live Posting Availability Verification in backend/src/modules/jobs/availability.ts]
  │ For top candidate URLs:
  │ 1. SSRF Check: Resolves hostname via dns.lookup().
  │    isPublicAddress(ip): Rejects 127.0.0.1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254.
  │ 2. HTTP Probe: nativeFetch() with AbortSignal (manual redirect tracking).
  │ 3. URL Expiration Slugs: Detects 'job_expired', 'posting_expired' in redirect destination.
  │ 4. Regex Closure Patterns: Evaluates CLOSURE_PATTERN against page body.
  │ 5. JSON-LD Schema: Extracts <script type="application/ld+json">.
  │    Validates @type: 'JobPosting', validThrough > now(), directApply flag.
  │ Returns status: 'open' | 'closed' | 'unknown'.
  ▼
[Batch Ranking: rankJobsBatch() in backend/src/modules/jobs/ranking.ts]
  │ Single batched embedding call over unique resume and job description chunks.
  │ Calculates 6-Component Composite Fit Score:
  │   Required Technical Skills: 0..30 pts
  │   Responsibility Semantic Alignment: 0..25 pts (using to01() cosine stretching)
  │   Role Title & Function Fit: 0..15 pts
  │   Seniority & Career Scope: 0..15 pts (penalizes mismatch)
  │   Domain & Degree Credentials: 0..10 pts
  │   Location & Work Mode Compatibility: 0..5 pts
  │ Total Fit Score = Sum of components (0..100).
  ▼
[Transactional Persistence: recommendation_runs & recommendations]
  │ BEGIN;
  │ INSERT INTO recommendation_runs (id, user_id, resume_id, status, returned_count, query_plan_json, preferences_snapshot_json)
  │ VALUES ($1, $2, $3, 'completed', $4, $5, $6);
  │ For each ranked job (top 20):
  │   INSERT INTO recommendations (id, run_id, job_id, rank, fit_score, breakdown_json, evidence_json, job_snapshot_json)
  │   VALUES (...);
  │ COMMIT;
  ▼
[Client Response]
  │ HTTP 200 JSON: { runId, recommendations: [...] }
```

### 3.7 Cloudflare Keepalive Edge Cron Connectivity
```
[Cloudflare Edge Network]
  │ Trigger: Scheduled cron event (every 12 hours).
  ▼
[workers/keepalive-worker/worker.js]
  │ Generates request: POST https://jobhunter-backend-lkkf.onrender.com/api/keepalive
  │ Headers: x-keepalive-source: 'cron', x-keepalive-token: env.KEEPALIVE_TOKEN
  ▼
[Express Endpoint: backend/src/routes/keepalive.ts]
  │ Validates token if KEEPALIVE_TOKEN configured.
  │ Executes Database Write:
  │   INSERT INTO keepalive_pings (source, ip, method, user_agent)
  │   VALUES ($1, $2, $3, $4) RETURNING id, pinged_at;
  │ (This write transaction resets Supabase's 7-day inactivity pause counter).
  ▼
[Disk Pruning: Fire-and-Forget]
  │ DELETE FROM keepalive_pings WHERE pinged_at < NOW() - INTERVAL '7 days';
  │ DELETE FROM keepalive_pings WHERE id NOT IN (
  │   SELECT id FROM keepalive_pings ORDER BY pinged_at DESC LIMIT 5
  │ );
  │ (Ensures table never exceeds 5 rows / ~1 KB storage).
  ▼
[HTTP 200 Response back to Cloudflare Worker]
```

---


## 4. COMPLETE DATABASE SCHEMA & DATA DICTIONARY

The PostgreSQL database is composed of 17 tables created across 10 versioned, idempotent migrations in `backend/migrations/`.

### 4.1 Schema Migration Inventory
- `001_initial_v2.sql`: Core relational tables with UUID primary keys (`gen_random_uuid()` via `pgcrypto`), triggers for `updated_at`. Tables: `users`, `sessions`, `user_job_preferences`, `resumes`, `resume_profiles`, `analyses`, `jobs`, `job_embeddings`, `resume_embeddings`, `recommendation_runs`, `recommendations`, `external_api_usage`, `job_applications`.
- `002_add_fts.sql`: Full-text search configuration, `tsvector` columns on `jobs` (`title`, `description`), GIN indexes (`idx_jobs_fts_title`, `idx_jobs_fts_desc`).
- `003_storage_metadata.sql`: Adds storage tracking columns (`storage_bucket`, `storage_object_path`, `parser_version`, `file_size_bytes`) to `resumes`.
- `004_job_search_cache.sql`: Creates `job_search_cache` table for caching external provider query payloads with TTL.
- `005_keepalive.sql`: Creates `keepalive_pings` table to capture periodic activity pings.
- `006_analysis_integrity.sql`: Adds `result_schema_version`, `result_json`, `profile_version`, `profile_content_hash`, and alters `readiness_score` and `jd_match_score` to `NUMERIC(5,2)` for fractional scoring.
- `007_recommendation_integrity.sql`: Adds `job_snapshot_json` and `preferences_snapshot_json` to freeze recommendation state immutably against future provider deletions.
- `008_embedding_cache.sql`: Creates `embedding_cache` table with composite unique index across `(purpose, COALESCE(owner_id::text, ''), content_hash, model_id, model_revision, chunker_version, evidence_builder_version)`.
- `009_recommendation_profile_version.sql`: Adds `profile_version` column to `recommendation_runs` table.
- `010_auth_otp_and_verification.sql`: Adds `verified BOOLEAN NOT NULL DEFAULT false` to `users` and creates `otps` table.

### 4.2 Table Specifications & Column Definitions

#### 1. `users`
- `id` (UUID, PK, Default: `gen_random_uuid()`): Unique account identifier.
- `email` (TEXT, NOT NULL, UNIQUE): Normalized lowercase email. Indexed via `idx_users_email`.
- `password_hash` (TEXT, NOT NULL): 10-round Bcrypt hash string.
- `display_name` (TEXT): User's profile display name.
- `verified` (BOOLEAN, NOT NULL, Default: `false`): Email verification status.
- `created_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).
- `updated_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`): Managed via `trg_users_updated_at` trigger.

#### 2. `sessions`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `user_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE CASCADE): Owning user.
- `token_hash` (TEXT, NOT NULL, UNIQUE): SHA-256 hash of the 64-char hex session token. Indexed via `idx_sessions_token_hash`.
- `created_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).
- `expires_at` (TIMESTAMPTZ, NOT NULL): Absolute expiration timestamp. Indexed via `idx_sessions_expires_at`.
- `last_used_at` (TIMESTAMPTZ): Timestamp of most recent request.
- `revoked_at` (TIMESTAMPTZ): Nullable revocation timestamp. If non-null, session is invalid.
- `user_agent_hash` (TEXT): SHA-256 hash of the user-agent header.

#### 3. `otps`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `email` (TEXT, NOT NULL): Target email. Indexed via `idx_otps_email`.
- `value` (TEXT, NOT NULL): 6-digit numeric OTP string.
- `purpose` (TEXT, NOT NULL, Default: `'verification'`): `'verification'` | `'login'` | `'reset_password'`.
- `created_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).
- `last_sent` (TIMESTAMPTZ, NOT NULL, Default: `now()`): Timestamp of last dispatch for rate limiting.
- `expiry` (TIMESTAMPTZ, NOT NULL): Absolute expiration timestamp (Now + 5 minutes). Indexed via `idx_otps_expiry`.

#### 4. `resumes`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `user_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE CASCADE).
- `original_filename` (TEXT NOT NULL): Sanitized filename.
- `storage_bucket` (TEXT, NOT NULL, Default: `'resumes'`): Supabase bucket or `'local'`.
- `storage_object_path` (TEXT, NOT NULL): Path key `${userId}/${resumeId}/${safeFilename}`.
- `sha256` (TEXT, NOT NULL): SHA-256 binary hash of the raw PDF buffer.
- `file_size_bytes` (INTEGER, NOT NULL): Binary file size.
- `page_count` (INTEGER): Extracted page count.
- `parser_version` (TEXT, NOT NULL): Version of the PDF extraction engine (e.g. `'4.0.0'`).
- `processing_status` (TEXT, NOT NULL, Default: `'uploaded'`): `'uploaded'` | `'parsed'` | `'failed'`.
- `is_latest` (BOOLEAN, NOT NULL, Default: `true`): Flag identifying user's active resume.
- `created_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

#### 5. `resume_profiles`
- `resume_id` (UUID, PK, FK -> `resumes.id` ON DELETE CASCADE).
- `profile_json` (JSONB, NOT NULL): Serialized `ResumeProfile` entity containing skills, normalized skills, experience bullets, education records, and detected seniority.
- `profile_version` (TEXT, NOT NULL): Semantic schema version (e.g. `'4.0.0'`).
- `updated_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

#### 6. `analyses`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `user_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE CASCADE).
- `resume_id` (UUID, NOT NULL, FK -> `resumes.id` ON DELETE CASCADE).
- `analysis_type` (TEXT, NOT NULL): `'readiness'` | `'jd_match'`.
- `readiness_score` (NUMERIC(5,2), NOT NULL): Bounded score `0.00` to `100.00`.
- `jd_match_score` (NUMERIC(5,2)): Nullable role fit score `0.00` to `100.00`.
- `score_breakdown_json` (JSONB, NOT NULL): Granular category points and weights.
- `evidence_json` (JSONB, NOT NULL): Structured finding rules, actions, and bullet quotes.
- `result_json` (JSONB): Immutable snapshot of the full `ReportSnapshot` payload.
- `result_schema_version` (TEXT): Version of the report schema (`'3.1.0'`).
- `target_level` (TEXT): Optional candidate seniority level.
- `jd_hash` (TEXT): SHA-256 hash of the evaluated job description string.
- `embedding_model_id` (TEXT): Identifier of the vector model used (`'anass1209/resume-job-matcher-all-MiniLM-L6-v2'`).
- `embedding_status` (TEXT): `'real'` | `'mock'` | `'unavailable'`.
- `created_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

#### 7. `jobs`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `source` (TEXT, NOT NULL): `'jooble'` | `'adzuna'` | `'jobspipe'` | `'remotive'` | `'arbeitnow'`.
- `external_id` (TEXT, NOT NULL): Unique vacancy ID from the external provider.
- `title` (TEXT, NOT NULL): Job title.
- `company` (TEXT): Employer name.
- `location` (TEXT): Normalized geographical string.
- `description` (TEXT): Sanitized plaintext vacancy description.
- `url` (TEXT, NOT NULL): Canonical target application URL.
- `salary` (TEXT): Salary range or compensation details.
- `work_mode` (TEXT): `'remote'` | `'hybrid'` | `'on-site'`.
- `posted_at` (TIMESTAMPTZ): Vacancy posting date.
- `first_seen_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).
- Unique Constraint: `(source, external_id)` prevents duplicate inserts.

#### 8. `recommendation_runs`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `user_id` (UUID, NOT NULL, FK -> `users.id` ON DELETE CASCADE).
- `resume_id` (UUID, NOT NULL, FK -> `resumes.id` ON DELETE CASCADE).
- `status` (TEXT, NOT NULL): `'running'` | `'completed'` | `'failed'`.
- `returned_count` (INTEGER, Default: `0`): Number of recommendations generated.
- `query_plan_json` (JSONB): Queries generated by `JobQueryPlanner`.
- `preferences_snapshot_json` (JSONB): User preferences frozen at run execution time.
- `provider_status_json` (JSONB): Provider diagnostics, timings, and error codes.
- `ranker_version` (TEXT): Composite ranker version hash.
- `profile_version` (TEXT): Version of the resume profile used.
- `completed_at` (TIMESTAMPTZ).
- `created_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

#### 9. `recommendations`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `run_id` (UUID, NOT NULL, FK -> `recommendation_runs.id` ON DELETE CASCADE).
- `job_id` (UUID, NOT NULL, FK -> `jobs.id` ON DELETE CASCADE).
- `rank` (INTEGER, NOT NULL): Positional rank (`1` to `20`).
- `fit_score` (NUMERIC(5,2), NOT NULL): Composite score `0.00` to `100.00`.
- `breakdown_json` (JSONB, NOT NULL): 6-component scoring breakdown.
- `evidence_json` (JSONB, NOT NULL): Matched responsibilities and supporting bullets.
- `matched_skills_json` (JSONB): Array of matched technical skills.
- `missing_skills_json` (JSONB): Array of missing required technical skills.
- `eligibility_json` (JSONB): Career stage and residency evaluation.
- `job_snapshot_json` (JSONB, NOT NULL): Immutable copy of job data.

#### 10. `embedding_cache`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `purpose` (TEXT, NOT NULL): `'resume'` | `'job'` | `'jd'`.
- `owner_id` (UUID): Nullable user ID. Mandatory when `purpose='resume'` for tenant privacy; must be NULL for public job/JD chunks.
- `content_hash` (TEXT, NOT NULL): SHA-256 hash of the input text chunk.
- `model_id` (TEXT, NOT NULL): Model name string.
- `model_revision` (TEXT, NOT NULL): Model commit/version string.
- `chunker_version` (TEXT, NOT NULL, Default: `'token-chunks-v1'`).
- `evidence_builder_version` (TEXT, NOT NULL, Default: `'professional-evidence-v1'`).
- `dimension` (INTEGER, NOT NULL): Must equal `384`.
- `vector` (JSONB, NOT NULL): Dense vector array of 384 floating-point numbers.
- Unique Constraint: `(purpose, COALESCE(owner_id::text, ''), content_hash, model_id, model_revision, chunker_version, evidence_builder_version)`.

#### 11. `external_api_usage`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `provider` (TEXT, NOT NULL, UNIQUE): Provider quota key (e.g. `'jooble:2026-10-12'`, `'remotive:2026-10-12'`, `'jobspipe:2026-10'`).
- `request_count` (INTEGER, NOT NULL, Default: `0`): Aggregated call or credit counter.
- `last_called_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

#### 12. `keepalive_pings`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `source` (TEXT, NOT NULL): `'cron'` | `'manual-fetch'`.
- `ip` (TEXT): Client IP address.
- `method` (TEXT): HTTP method (`POST`, `GET`).
- `user_agent` (TEXT): Client user agent string.
- `pinged_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

#### 13. `user_job_preferences`
- `user_id` (UUID, PK, FK -> `users.id` ON DELETE CASCADE).
- `target_roles` (TEXT[]): Preferred job titles.
- `seniority` (TEXT[]): Preferred career levels.
- `locations` (TEXT[]): Preferred geographical locations.
- `work_modes` (TEXT[]): Preferred work modes (`'remote'`, `'hybrid'`, `'on-site'`).
- `emphasized_skills` (TEXT[]): Skills candidate prioritizes.
- `excluded_roles` (TEXT[]): Keywords/roles candidate excludes.
- `min_salary` (NUMERIC): Minimum compensation floor.
- `updated_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

#### 14. `job_search_cache`
- `id` (UUID, PK, Default: `gen_random_uuid()`).
- `query_hash` (TEXT, NOT NULL, UNIQUE): SHA-256 hash of provider name, query terms, and location.
- `provider` (TEXT, NOT NULL): Aggregator name.
- `payload_json` (JSONB, NOT NULL): Raw search results.
- `expires_at` (TIMESTAMPTZ, NOT NULL): Cache invalidation timestamp.
- `created_at` (TIMESTAMPTZ, NOT NULL, Default: `now()`).

---

## 5. COMPLETE API SPECIFICATION & DATA CONTRACTS

Base URL: `/api/v1`  
Protocol: HTTPS  
Headers: `Accept: application/json`, `Content-Type: application/json`, `X-CSRF-Token: <token>` (for mutations).

### 5.1 Authentication Endpoints

#### `POST /auth/signup`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!",
    "displayName": "Alex Candidate"
  }
  ```
- **Responses:**
  - `201 Created`: `{ "success": true, "requiresVerification": true, "email": "candidate@example.com", "message": "Account created. Verification code sent to your email.", "user": { "id": "uuid", "email": "...", "display_name": "..." } }`
  - `400 Bad Request`: `{ "success": false, "message": "User already exists" }`
  - `429 Too Many Requests`: `{ "success": false, "message": "Please wait 60 seconds before requesting a new code" }`
  - `503 Service Unavailable`: `{ "success": false, "message": "Unable to send verification email. Please check email configuration." }`

#### `POST /auth/verify-otp`
- **Auth:** Public
- **Request Body:**
  ```json
  {
    "email": "candidate@example.com",
    "otp": "492817",
    "purpose": "verification"
  }
  ```
- **Responses:**
  - `200 OK`: Sets `jobhunter_session` cookie; returns `{ "success": true, "message": "Verification successful", "user": { "id": "uuid", "email": "...", "display_name": "...", "verified": true } }`
  - `400 Bad Request`: `{ "success": false, "message": "Invalid or expired verification code" }`

#### `POST /auth/login`
- **Auth:** Public (Rate limit: 20 per 15 min)
- **Request Body:**
  ```json
  {
    "email": "candidate@example.com",
    "password": "SecurePassword123!"
  }
  ```
- **Responses:**
  - `200 OK`: Sets `jobhunter_session` cookie; returns `{ "success": true, "message": "Login successful", "user": { ... } }`
  - `401 Unauthorized`: `{ "success": false, "message": "Invalid credentials" }`

#### `POST /auth/logout`
- **Auth:** Session Cookie
- **Responses:**
  - `200 OK`: Clears cookie; returns `{ "success": true, "message": "Logged out" }`

#### `GET /auth/session`
- **Auth:** Session Cookie
- **Responses:**
  - `200 OK`: `{ "success": true, "user": { "id": "uuid", "email": "...", "display_name": "...", "verified": true } }`
  - `401 Unauthorized`: `{ "success": false, "message": "Invalid session" }`

#### `GET /csrf`
- **Auth:** Public
- **Responses:**
  - `200 OK`: Sets `jobhunter_csrf` cookie; returns `{ "success": true, "csrfToken": "64_char_hex_string" }`

---

### 5.2 Resume Endpoints

#### `POST /resumes`
- **Auth:** Session Cookie (Rate limit: 10 per min)
- **Content-Type:** `multipart/form-data`
- **Form Fields:** `resume` (PDF binary buffer, max 10 MB), `targetLevel` (optional string).
- **Responses:**
  - `200 OK`: `{ "success": true, "evicted": [], "resume": { "id": "uuid", "fileName": "resume.pdf", "uploadDate": "2026-10-12T00:00:00Z", "status": "uploaded", "sha256": "...", "pageCount": 2, "storageBucket": "resumes" } }`
  - `400 Bad Request`: `{ "success": false, "code": "SCANNED_PDF", "message": "We could not reliably extract text from this PDF..." }`
  - `413 Payload Too Large`: `{ "success": false, "message": "Upload exceeds size limit" }`
  - `415 Unsupported Media Type`: `{ "success": false, "message": "Only PDF files are allowed" }`

#### `GET /resumes`
- **Auth:** Session Cookie
- **Responses:**
  - `200 OK`: `{ "success": true, "resumes": [ { "id": "uuid", "fileName": "...", "uploadDate": "...", "status": "...", "pageCount": 2, "isLatest": true } ] }`

#### `GET /resumes/:id/download`
- **Auth:** Session Cookie
- **Responses:**
  - `200 OK`: `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="resume.pdf"`, binary stream.
  - `404 Not Found`: `{ "success": false, "message": "File not found in storage" }`
  - `403 Forbidden`: If resume belongs to another user.

#### `DELETE /resumes/:id`
- **Auth:** Session Cookie
- **Responses:**
  - `200 OK`: `{ "success": true, "message": "Resume deleted" }`
  - `404 Not Found` / `403 Forbidden`.

---

### 5.3 Analysis & Matching Endpoints

#### `POST /analyses/readiness`
- **Auth:** Session Cookie
- **Request Body:**
  ```json
  {
    "resumeId": "b1b0b57e-3467-4a0b-9366-267fb5a7be1b",
    "targetLevel": "entry"
  }
  ```
- **Responses:**
  - `200 OK`: Full `ReportSnapshot` object:
    ```json
    {
      "success": true,
      "resultSchemaVersion": "3.1.0",
      "analysisId": "uuid",
      "resumeId": "uuid",
      "fileName": "Alex_Resume.pdf",
      "createdAt": "2026-10-12T00:00:00Z",
      "readiness": {
        "score": 78,
        "scoreLabel": "Competitive",
        "scoreMessage": "Strong baseline evidence with minor formatting adjustments recommended.",
        "breakdown": [
          { "category": "parseability", "label": "Parseability & ATS Structure", "pointsAwarded": 18, "pointsPossible": 20, "percent": 90, "rules": [...] },
          { "category": "impact", "label": "Impact & Measurable Evidence", "pointsAwarded": 14, "pointsPossible": 20, "percent": 70, "rules": [...] }
        ],
        "priorityActions": [
          { "id": "act-1", "title": "Quantify bullet achievements", "category": "impact", "priority": "high", "potentialGain": 6 }
        ],
        "metrics": { "pageCount": 1, "wordCount": 450, "skillsCount": 14, "bulletCount": 12, "quantifiedBulletRatio": 0.42 }
      }
    }
    ```
  - `410 Gone`: `{ "success": false, "message": "The stored file for this resume is missing — re-upload it to run analyses again." }`

#### `POST /analyses/jd-match`
- **Auth:** Session Cookie
- **Request Body:**
  ```json
  {
    "resumeId": "b1b0b57e-3467-4a0b-9366-267fb5a7be1b",
    "jobDescription": "We are seeking a Backend Software Engineer with 2+ years experience in Node.js, TypeScript, and PostgreSQL. You will design event-driven microservices...",
    "targetLevel": "mid"
  }
  ```
- **Responses:**
  - `200 OK`: `ReportSnapshot` containing both `readiness` and `jdMatch` objects:
    ```json
    {
      "success": true,
      "resultSchemaVersion": "3.1.0",
      "analysisId": "uuid",
      "readiness": { "score": 78, ... },
      "jdMatch": {
        "score": 74,
        "explicitMustHave": 28,
        "responsibilitySemantic": 22,
        "roleAlignment": 15,
        "domain": 5,
        "education": 4,
        "confidence": "High",
        "deterministic": {
          "requiredCoverage": 0.85,
          "matchedRequired": ["Node.js", "TypeScript", "PostgreSQL"],
          "missingRequired": ["Kafka"]
        },
        "responsibilityCoverage": [
          { "responsibility": "Design event-driven microservices", "matchScore": 0.82, "candidateEvidence": "Engineered asynchronous message consumers..." }
        ]
      },
      "versions": {
        "embeddingModelId": "anass1209/resume-job-matcher-all-MiniLM-L6-v2",
        "embeddingStatus": "real",
        "dimension": 384
      }
    }
    ```

---

### 5.4 Recommendation Endpoints

#### `POST /recommendation-runs`
- **Auth:** Session Cookie (Rate limit: 15 per min)
- **Request Body:**
  ```json
  {
    "resumeId": "b1b0b57e-3467-4a0b-9366-267fb5a7be1b",
    "forceRefresh": false,
    "targetRoles": ["Backend Engineer", "Full Stack Developer"],
    "locations": ["Bangalore", "Remote"],
    "workModes": ["remote", "hybrid"]
  }
  ```
- **Responses:**
  - `200 OK`:
    ```json
    {
      "success": true,
      "runId": "uuid",
      "returnedCount": 20,
      "recommendations": [
        {
          "jobId": "uuid",
          "rank": 1,
          "fitScore": 86,
          "title": "Software Engineer II - Backend",
          "company": "Razorpay",
          "location": "Bangalore",
          "workMode": "hybrid",
          "url": "https://...",
          "breakdown": {
            "requiredSkill": 28,
            "responsibilitySemantic": 23,
            "roleTitle": 15,
            "seniority": 15,
            "domainEducation": 10,
            "location": 5
          },
          "matchedSkills": ["Node.js", "PostgreSQL", "Docker", "Redis"],
          "missingSkills": ["Kubernetes"],
          "availability": { "status": "open", "reason": "Matching JobPosting has actionable application evidence" }
        }
      ]
    }
    ```

---

## 6. CONFIGURATION, ENVIRONMENT VARIABLES & ENGINE RUNTIME MATRIX

Parsed and validated strictly via Zod in `backend/src/config/env.ts`:

```
+-----------------------------------------------------------------------------------------------------------------------+
|                                           ENVIRONMENT CONFIGURATION MATRIX                                            |
+------------------------------+--------+---------------------------------------+---------------------------------------+
| Variable Name                | Type   | Production Behavior                   | Development Default / Fallback        |
+------------------------------+--------+---------------------------------------+---------------------------------------+
| NODE_ENV                     | Enum   | 'production'                          | 'development'                         |
| PORT                         | Number | Render injected (e.g. 10000)          | 3001                                  |
| PG_DATABASE_STRING           | String | Required Supabase Pooler URI (:6543)  | postgresql://postgres:postgres@...    |
| DATABASE_URL                 | String | Alternative fallback DB URI           | None                                  |
| SUPABASE_DB_URL              | String | Alternative fallback DB URI           | None                                  |
| JWT_SECRET                   | String | Required min 32 chars (Process exits) | dev-only-insecure-secret-change-me... |
| CORS_ALLOWED_ORIGINS         | String | https://jobhunter-r773.onrender.com   | http://localhost:5173                 |
| SESSION_COOKIE_NAME          | String | 'jobhunter_session'                   | 'jobhunter_session'                   |
| SESSION_TTL_HOURS            | Number | 24                                    | 24                                    |
| EMAIL_PROVIDER               | Enum   | 'vercel_smtp'                         | 'mock' (in tests)                     |
| EMAIL_RELAY_URL              | String | Required HTTPS endpoint               | None                                  |
| EMAIL_RELAY_TOKEN            | String | Required shared secret token          | None                                  |
| SMTP_HOST                    | String | smtp.gmail.com (Used by relay)        | None                                  |
| SMTP_PORT                    | Number | 587 (TLS)                             | 587                                   |
| SMTP_USER                    | String | SMTP account email                    | None                                  |
| SMTP_PASSWORD                | String | App password (auto-stripped spaces)   | None                                  |
| SUPABASE_URL                 | String | https://<ref>.supabase.co             | None                                  |
| SUPABASE_SERVICE_ROLE_KEY    | String | Required secret key                   | None                                  |
| SUPABASE_RESUME_BUCKET       | String | 'resumes'                             | 'resumes'                             |
| EMBEDDING_PROVIDER           | Enum   | 'aws' or 'auto'                       | 'local'                               |
| EMBEDDING_MODEL_ID           | String | anass1209/resume-job-matcher-all-...  | anass1209/resume-job-matcher-all-...  |
| AWS_REGION                   | String | e.g. ap-south-1                       | None                                  |
| AWS_ACCESS_KEY_ID            | String | Required for AWS SageMaker calls      | None                                  |
| AWS_SECRET_ACCESS_KEY        | String | Required for AWS SageMaker calls      | None                                  |
| AWS_SAGEMAKER_ENDPOINT_NAME  | String | Serverless endpoint name              | None                                  |
| JOOBLE_API_KEY               | String | Required in production (Process exits)| None                                  |
| JOOBLE_CALL_BUDGET           | Number | 450                                    | 450                                    |
| ADZUNA_APP_ID                | String | Required for Adzuna calls             | None                                  |
| ADZUNA_APP_KEY               | String | Required for Adzuna calls             | None                                  |
| ADZUNA_CALL_BUDGET           | Number | 100                                    | 100                                    |
| JOBSPIPE_API_KEY             | String | Required for JobsPipe calls           | None                                  |
| JOBSPIPE_MONTHLY_BUDGET      | Number | 1000                                   | 1000                                   |
| APINEX_API_KEY               | String | Required for AI role discovery        | None                                  |
| APINEX_ROLE_MODEL            | String | 'free/deepseek-v4.1-flash'             | 'free/deepseek-v4.1-flash'             |
| KEEPALIVE_TOKEN              | String | Optional shared secret for cron       | None                                  |
+------------------------------+--------+---------------------------------------+---------------------------------------+
```

---

## 7. CRITICAL CODE ALGORITHMS & IMPLEMENTATION DETAILS

### 7.1 Cosine Similarity & Discrimination Stretching
- **Implementation File:** [`backend/src/modules/jobs/ranking.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/ranking.ts)
- **Problem Formulation:** Standard SentenceTransformer cosine similarities between career documents cluster in the $[0.40, 0.80]$ range. Naive linear normalization maps all jobs to $70\%-90\%$, eliminating ranking discrimination.
- **Mathematical Discrimination Function:**
  ```typescript
  export function to01(rawCosine: number): number {
    if (rawCosine <= 0.25) return 0;
    if (rawCosine <= 0.50) return (rawCosine - 0.25) / 0.25 * 0.40;
    return Math.min(1, 0.40 + (rawCosine - 0.50) / 0.40 * 0.60);
  }
  ```
- **Time Complexity:** $\mathcal{O}(D)$ where $D = 384$ per vector pair. $\mathcal{O}(M \times N \times D)$ across $M$ responsibilities and $N$ resume chunks.

### 7.2 Atomic Rate Limiting via Relational Row-Level Mutexes
- **Implementation File:** [`backend/src/providers/jobs/providerBudgets.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/providerBudgets.ts)
- **Problem Formulation:** Concurrent Node.js processes or clustered web containers making simultaneous requests to metered third-party APIs can cause race conditions, exceeding budget thresholds.
- **SQL Implementation:**
  ```sql
  INSERT INTO external_api_usage (id, provider, request_count, last_called_at)
  VALUES ($1, $2, $3, now())
  ON CONFLICT (provider) DO UPDATE
  SET request_count = external_api_usage.request_count + $3,
      last_called_at = now()
  WHERE external_api_usage.request_count + $3 <= $4
  RETURNING request_count;
  ```
- **Concurrency Guarantee:** PostgreSQL enforces row-level locking during `ON CONFLICT DO UPDATE`. The `WHERE` clause acts as an atomic guard. If concurrent transactions attempt to increment beyond `$4` (the limit), zero rows are returned, preventing the external network call before it executes.

### 7.3 Positional Stream PDF Extraction & Scanned Detection
- **Implementation File:** [`backend/src/modules/parsing/pdfParser.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/parsing/pdfParser.ts)
- **Implementation:**
  ```typescript
  const avgChars = totalChars / numPages;
  const detectedAsScanned = totalChars < 50 || avgChars < 30;
  ```
- **Rationale:** PDFs contain text objects positioned at exact $(x, y)$ coordinates. Naive extractors strip coordinate data and concatenate characters into a continuous string, merging side-by-side columns into gibberish. The JobHunter parser preserves line breaks based on $y$-delta shifts, preserving bullet boundaries for downstream regex analysis.

---
*End of Autonomous Agent Technical Specification.*
