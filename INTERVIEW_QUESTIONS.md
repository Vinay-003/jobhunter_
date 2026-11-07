# JOBHUNTER V2: COMPREHENSIVE TECHNICAL INTERVIEW QUESTION BANK & MOCK INTERVIEW GUIDE

> **Target Audience:** B.Tech / Computer Science Students, Junior to Mid-Level Software Engineers preparing for Technical, Full-Stack, Backend, System Design, and SDE Behavioral Interviews.  
> **Source Grounding:** Based strictly on the verified architecture, source code, database migrations, and security models of the JobHunter V2 repository.

---

## TABLE OF CONTENTS

1. [Top 25 Must-Memorize Questions (30-Second Quick vs 2-Minute Deep Answers)](#1-top-25-must-memorize-questions)
2. [Category A — Basic Project Understanding & Product Intuition](#2-category-a--basic-project-understanding)
3. [Category B — Technology Stack & Engineering Choices](#3-category-b--technology-stack)
4. [Category C — System Architecture & Modular Design](#4-category-c--system-architecture)
5. [Category D — Frontend Engineering & React Architecture](#5-category-d--frontend-engineering)
6. [Category E — Backend Engineering, Express & Middleware](#6-category-e--backend-engineering)
7. [Category F — Database Design, PostgreSQL & Relational Modeling](#7-category-f--database-design)
8. [Category G — Networking, HTTP Protocols & RESTful APIs](#8-category-g--networking-and-apis)
9. [Category H — Security, Cryptography & Vulnerability Defenses](#9-category-h--security-and-cryptography)
10. [Category I — Performance, Caching & Scalability Systems](#10-category-i--performance-and-scalability)
11. [Category J — Debugging, Testing & Error Handling](#11-category-j--debugging-and-testing)
12. [Category K — Architectural Trade-offs & Engineering Decisions](#12-category-k--architectural-trade-offs)
13. [Category L — Difficult Cross-Questions & Trap Scenarios](#13-category-l--difficult-cross-questions)
14. [Category M — Machine Learning, Vector Spaces & Specialized AI](#14-category-m--machine-learning-and-ai)
15. [Advanced Senior Interviewer Simulation (20 Multi-Turn Dialogues)](#15-advanced-senior-interviewer-simulation)
16. [Behavioral & Experience Questions: Speaking Honestly About AI-Assisted Development](#16-behavioral--experience-questions)
17. [Whiteboard Drawing & Explanation Walkthrough](#17-whiteboard-drawing-walkthrough)
18. [Strategic Study Plans (2 Hours, 1 Day, 3 Days) & Self-Assessment Checklist](#18-strategic-study-plans)

---

## 1. TOP 25 MUST-MEMORIZE QUESTIONS

| # | Question | 30-Second Elevator Answer | 2-Minute Deep Technical Explanation | Relevant Source File |
|---|---|---|---|---|
| **1** | What is JobHunter? | A full-stack platform providing deterministic ATS resume scoring, semantic JD matching, and multi-provider job recommendations. | Explain the three pillars: 1) Deterministic 100-pt ATS rubric without AI tokens; 2) SentenceTransformer semantic JD matching with cosine discrimination; 3) 5-provider job aggregation with atomic quota locks and live availability checks. | [`SYSTEM_DESIGN.md`](file:///home/mylappy/Projects/jobhunter_/SYSTEM_DESIGN.md) |
| **2** | Why not use an LLM for ATS scoring? | LLMs are non-deterministic, expensive, and hallucinate scores. Our 100-pt rubric runs in milliseconds with 100% reproducibility. | Detail the 8 rubric categories: 20 Parseability, 20 Impact/Metrics, 15 Completeness, 15 Experience, 10 Skills, 10 Writing, 5 Concision, 5 Hygiene. Explain that resume health must evaluate universal writing standards, not specific job fit. | [`readinessScorer.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/ats/readinessScorer.ts) |
| **3** | How does semantic JD matching work? | Embeds resume bullets and JD duties into 384-dim vectors via MiniLM, calculating responsibility alignment using stretched cosine distance. | Detail PII scrubbing (`redactProfessionalText`), batched embedding generation, PostgreSQL vector caching, and the `to01()` discrimination curve mapping [0.35, 0.95] across the 0–100 score. | [`jdRubric.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/analysis/jdRubric.ts) |
| **4** | How do you prevent CSRF attacks? | Double-submit cookie pattern: the browser validates that the `X-CSRF-Token` header matches the `jobhunter_csrf` cookie. | Explain how Same-Origin Policy stops cross-origin sites from reading the cookie, combined with `crypto.timingSafeEqual()` validation on mutations and Origin header allowlisting. | [`csrf.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/middleware/csrf.ts) |
| **5** | Why opaque sessions over JWTs? | Opaque tokens stored in PostgreSQL allow instantaneous server-side session revocation on logout, unlike stateless JWTs. | Detail `crypto.randomBytes(32)` generation, SHA-256 database hashing, and why storing only hashes protects users even if the database is leaked. | [`session.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/auth/session.ts) |
| **6** | How do you prevent external API budget blowouts? | Atomic PostgreSQL row locks reserve credit quotas before making external network calls. | Explain `INSERT ... ON CONFLICT DO UPDATE ... WHERE usage + credits <= limit RETURNING request_count` preventing race conditions across concurrent user runs. | [`providerBudgets.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/providerBudgets.ts) |
| **7** | How do you check live job availability? | Probes URLs for expired redirects, closure regex notices, and Schema.org JSON-LD `validThrough` dates with SSRF protection. | Detail DNS resolution validating `isPublicAddress()` to reject loopback, RFC 1918 private IPs, and AWS metadata IPs (`169.254.169.254`) before making HTTP requests. | [`availability.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/availability.ts) |
| **8** | How is Supabase kept from pausing? | A Cloudflare Worker cron pings `/api/keepalive` every 12 hours, inserting a row to reset Supabase's 7-day dormancy timer. | Explain the Supabase free-tier pause rule, the database insert transaction, and the fire-and-forget pruning query keeping only the 5 newest rows to prevent disk bloat. | [`keepalive.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/routes/keepalive.ts) |
| **9** | What is your database schema? | 17 PostgreSQL tables with UUID primary keys and cascading foreign keys hosted on Supabase via PgBouncer. | Walk through `users`, `sessions`, `resumes`, `resume_profiles`, `analyses`, `jobs`, `recommendations`, `embedding_cache`, and `otps`. | [`001_initial_v2.sql`](file:///home/mylappy/Projects/jobhunter_/backend/migrations/001_initial_v2.sql) |
| **10** | How do you parse PDF resumes? | Coordinate-preserving stream extraction via `pdfjs-dist`, rejecting scanned image PDFs immediately. | Explain why collapsing line breaks ruins bullet analysis, and how character density thresholding (`avgChars < 30`) flags scanned PDFs with HTTP 400 `SCANNED_PDF`. | [`pdfParser.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/parsing/pdfParser.ts) |
| **11** | How do you prevent SQL Injection? | 100% Parameterized SQL queries via `pg.Pool`. Zero raw string concatenation in SQL statements. | Show how parameters `$1, $2` are sent out-of-band to the database query planner, neutralizing malicious inputs like `' OR 1=1 --`. | [`database.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/config/database.ts) |
| **12** | How do you prevent IDOR attacks? | Every read, delete, and analysis query explicitly includes `WHERE id = $1 AND user_id = $2`. | Explain that knowing another candidate's UUID cannot leak their resume because the query enforces ownership against the verified session `user_id`. | [`resumes.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/routes/v1/resumes.ts) |
| **13** | What is your skill extraction algorithm? | Symbol-aware regexes with negative lookaheads and boundary assertions mapping to a normalized dictionary. | Explain distinguishing C, C++, and C# without substring bugs, and excluding 'Go' in common English phrases like 'Good' or 'Go to'. | [`skillExtractor.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/parsing/skillExtractor.ts) |
| **14** | How do you handle email OTP verification? | Generates 6-digit cryptographically random OTPs, relayed through Vercel serverless function to Gmail SMTP. | Detail why Render blocks port 587, the shared-secret relay architecture, the 60s cooldown, 5-minute TTL, and `timingSafeEqual()` verification. | [`otp.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/utils/otp.ts) |
| **15** | What is the startup readiness probe? | `checkSchemaReadiness()` queries database catalogs to verify all migrations and columns exist before server listens. | Explain preventing startup race conditions: web processes must never run DDL migrations on boot in production. | [`schemaReadiness.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/db/schemaReadiness.ts) |
| **16** | What happened during the Oct 2 Render outage? | Render used Node 20 by default, but Supabase JS v2.117+ requires Node 22 native WebSockets, causing silent fallback to disk. | Explain pinning `NODE_VERSION=22.14.0`, adding fail-loud upload exceptions in production, and creating `/health?deep=1` storage probe. | [`README.md`](file:///home/mylappy/Projects/jobhunter_/README.md) |
| **17** | How does job recommendation ranking work? | Composite formula: Skill (30) + Semantic (25) + Role (15) + Seniority (15) + Domain (10) + Location (5) = 100 pts. | Explain seniority mismatch deductions (-40 pts), score caps, location containment logic (Indian metro vs country), and deduplication. | [`ranking.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/ranking.ts) |
| **18** | Why use SentenceTransformers over OpenAI? | Zero recurring API costs, offline execution on local machines, 384-dim efficiency, and strict candidate data privacy. | Compare 384 dimensions vs 1536 dimensions; explain privacy compliance by avoiding sending candidate PII to third-party proprietary LLMs. | [`EmbeddingProvider.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/embeddings/EmbeddingProvider.ts) |
| **19** | How do you prevent layout shifts (CLS) on the frontend? | `AppShellSkeleton` renders an exact pulsed SVG/CSS clone of the navigation and cards while auth state resolves. | Detail React Router v7 `SessionGuard`, eliminating layout jumps and flickering spinners. | [`router.tsx`](file:///home/mylappy/Projects/jobhunter_/frontend/project/src/app/router.tsx) |
| **20** | How are resumes retained and evicted? | Enforces a strict maximum of 3 resumes per user, evicting the oldest rows and cloud storage objects. | Detail database deletion followed by best-effort Supabase Storage object cleanup to prevent storage bloat. | [`resumes.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/routes/v1/resumes.ts) |
| **21** | What is bounded wave scheduling? | Manages external API fan-out with max 4 global concurrency, 1 per-provider concurrency, and a 25s deadline. | Explain why naive `Promise.all()` over 15 API calls causes rate-limiting bans and event loop starvation. | [`retrievalExecutor.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/retrievalExecutor.ts) |
| **22** | How do you handle timing attacks on OTPs? | Uses Node's `crypto.timingSafeEqual()` to compare user OTP buffers in constant CPU time. | Explain that standard `===` operators exit on the first mismatched character, allowing attackers to measure execution microseconds. | [`otp.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/utils/otp.ts) |
| **23** | How does query planning work? | `JobQueryPlanner` partitions resume profile into top 3 distinct career queries rather than one massive skill string. | Show why searching *"React Node PostgreSQL AWS Linux Docker"* returns zero results, while searching *"Full Stack Developer"* succeeds. | [`queryPlanner.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/queryPlanner.ts) |
| **24** | How do you scrub PII before vectorization? | `redactProfessionalText()` regex scrubs emails, phone numbers, and LinkedIn/GitHub links. | Explain data privacy compliance: raw candidate contact info is never passed to embedding models. | [`evidenceBuilder.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/matching/evidenceBuilder.ts) |
| **25** | How do you scale this from 1,000 to 100,000 users? | Shared Redis cluster for rate limits, async BullMQ workers for PDF parsing, and `pgvector` with HNSW indexes for vector search. | Explain replacing linear $\mathcal{O}(N)$ in-memory cosine scans with $\mathcal{O}(\log N)$ vector indexing, and caching external job queries in Redis. | [`SYSTEM_DESIGN.md`](file:///home/mylappy/Projects/jobhunter_/SYSTEM_DESIGN.md) |

---

## 2. CATEGORY A — BASIC PROJECT UNDERSTANDING

### Q1: What is the core problem JobHunter solves?
- **Difficulty:** Basic
- **Interviewer Intent:** Evaluates high-level product comprehension and engineering motivation.
- **Concept:** Automated hiring portals (ATS) and job boards are opaque, noisy, and inefficient.
- **Answer:** *"JobHunter addresses the lack of transparency in automated hiring. Candidates receive automated rejections without understanding why their resume failed ATS parsing, and commercial job aggregators flood candidates with stale or irrelevant vacancies. JobHunter solves this with a 100-point deterministic ATS diagnostic, semantic job description matching, and verified job aggregation."*
- **Follow-up:** *"How does JobHunter differ from existing tools like Jobscan or Resume Worded?"*
- **Answer to Follow-up:** *"Most commercial tools use proprietary, paywalled algorithms or generic LLM prompts that hallucinate different scores across runs. JobHunter is open, deterministic, separates document quality from role fit, and includes an active aggregation engine that verifies whether recommended jobs are still open."*
- **File Reference:** [`backend/src/modules/ats/readinessScorer.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/ats/readinessScorer.ts)

### Q2: What are the three primary functional workflows in the application?
- **Difficulty:** Basic
- **Answer:** *"1. Resume Health Diagnostic: Audits formatting, measurable metrics, and writing hygiene without a JD. 2. Tailored JD Match: Compares candidate experience against a specific job description using keyword rules and semantic vectors. 3. Opportunities: Dispatches queries across 5 external job boards, verifies live posting status, and ranks matches by candidate fit."*

### Q3: What is meant by the design rule "Explainable by design"?
- **Difficulty:** Intermediate
- **Answer:** *"In many platforms, if you upload a resume and ask for an ATS score, the tool docks points if your skills don't match a random job, or gives you a 100% score simply because you used ChatGPT to generate a summary. In JobHunter, Document Health (formatting, action verbs, quantified metrics) and Role Fit (skills, seniority, domain alignment) are strictly isolated. Every point awarded maps to an explicit, visible check returned in the JSON report."*

---

## 3. CATEGORY B — TECHNOLOGY STACK

### Q4: Why did you choose Express over NestJS or Fastify?
- **Difficulty:** Intermediate
- **Interviewer Intent:** Evaluates architectural trade-off reasoning and backend framework knowledge.
- **Concept:** Minimalist micro-framework vs opinionated enterprise framework.
- **Answer:** *"Express was selected for its minimalist, unopinionated architecture and low overhead. NestJS introduces heavy abstractions, decorators, and dependency injection containers that add unnecessary complexity for a modular monolith. While Fastify offers higher raw requests-per-second, our bottleneck is external I/O (network calls to job providers and database writes), where Express performs well within our performance budget."*

### Q5: Why is PostgreSQL preferable to MongoDB for JobHunter?
- **Difficulty:** Intermediate
- **Answer:** *"Our domain model is inherently relational: users own resumes; resumes own analyses; recommendation runs link to external jobs. PostgreSQL enforces strict relational integrity with foreign keys and `ON DELETE CASCADE`. Furthermore, PostgreSQL's JSONB column type gives us document database flexibility for storing semi-structured rubric breakdowns without sacrificing ACID transactional consistency."*

### Q6: Why did you use Vite instead of Next.js?
- **Difficulty:** Intermediate
- **Answer:** *"JobHunter is an authenticated, dashboard-driven web application where almost every screen requires active session authentication. Server-Side Rendering (SSR) offers little benefit for authenticated private portals and introduces server hosting costs. Vite compiles an optimized Single Page Application (SPA) deployed as static files on a CDN, reducing latency and infrastructure cost."*

---

## 4. CATEGORY C — SYSTEM ARCHITECTURE

### Q7: Describe the high-level architecture of JobHunter.
- **Difficulty:** Intermediate
- **Answer:** *"JobHunter is a decoupled client-server modular monolith. The frontend is a React 18 SPA hosted on Render Static Sites. The backend is an Express TypeScript API running on a Node.js 22 container. Data persistence is handled by PostgreSQL on Supabase (accessed via PgBouncer port 6543) and Supabase Storage for private PDF storage. Machine learning is abstracted behind an `EmbeddingProvider` interface supporting AWS SageMaker Serverless in production and local Python workers in development."*

### Q8: What are the primary trust boundaries in the system?
- **Difficulty:** Advanced
- **Answer:** *"The browser client is outside the trust boundary. It never receives or stores Supabase service role keys, AWS credentials, or third-party job API keys. All external services are accessed exclusively through authenticated backend API routes. Within the backend, user-uploaded resumes and generated vectors are isolated by tenant UUIDs."*

---

## 5. CATEGORY D — FRONTEND ENGINEERING

### Q9: How does the frontend handle authentication state and route protection?
- **Difficulty:** Intermediate
- **Answer:** *"We use React Router v7 with an `AuthProvider` context in `AuthContext.tsx`. On initial load, a single `GET /api/v1/auth/session` request verifies the session cookie. In `router.tsx`, `<SessionGuard>` checks if the user is authenticated. If the session check is in-flight, it displays `<AppShellSkeleton>` to prevent layout shifts. Unauthenticated requests are redirected to `/login`."*
- **File Reference:** [`frontend/project/src/app/router.tsx`](file:///home/mylappy/Projects/jobhunter_/frontend/project/src/app/router.tsx)

### Q10: How does your Axios client handle CSRF tokens and expired sessions?
- **Difficulty:** Intermediate
- **Answer:** *"In `src/lib/api.ts`, an Axios request interceptor attaches the `X-CSRF-Token` header read from the `jobhunter_csrf` cookie (or memory). A response interceptor catches HTTP 401 Unauthorized errors and redirects the browser to `/login` while avoiding redirect loops on public pages."*
- **File Reference:** [`frontend/project/src/lib/api.ts`](file:///home/mylappy/Projects/jobhunter_/frontend/project/src/lib/api.ts)

---

## 6. CATEGORY E — BACKEND ENGINEERING

### Q11: Walk through the middleware execution pipeline in `server.ts`.
- **Difficulty:** Intermediate
- **Answer:** *"1. `app.set('trust proxy', 1)` resolves client IP from reverse proxy headers. 2. `helmet()` injects security headers. 3. `cors()` validates the `Origin` header against our regex allowlist. 4. `cookieParser()` decodes cookies. 5. `express.json({ limit: '1mb' })` validates payload sizes. 6. `express-rate-limit` throttles brute-force attempts on auth and upload endpoints. 7. `csrfProtection` validates double-submit tokens. 8. Router routes requests to controllers. 9. Global error middleware formats unhandled exceptions."*
- **File Reference:** [`backend/src/server.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/server.ts)

### Q12: Why do you have a startup readiness probe (`checkSchemaReadiness`)?
- **Difficulty:** Advanced
- **Answer:** *"In production deployments, starting an API process against an unmigrated database leads to silent data corruption or runtime SQL errors. `checkSchemaReadiness()` queries `schema_migrations` and `information_schema.columns` before `app.listen()` binds to the network. If any required migration or column is absent, the process exits with code 1 immediately."*
- **File Reference:** [`backend/src/db/schemaReadiness.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/db/schemaReadiness.ts)

---

## 7. CATEGORY F — DATABASE DESIGN

### Q13: Explain your database schema relationships.
- **Difficulty:** Intermediate
- **Answer:** *"The schema consists of 17 tables. `users` is the parent entity. `sessions`, `resumes`, and `user_job_preferences` maintain foreign keys to `users.id` with `ON DELETE CASCADE`. Each `resume` has a one-to-one relationship with `resume_profiles` and one-to-many relationships with `analyses` and `recommendation_runs`. `recommendation_runs` connects to `jobs` through the `recommendations` junction table. Independent operational tables include `embedding_cache`, `otps`, `external_api_usage`, and `keepalive_pings`."*
- **File Reference:** [`backend/migrations/001_initial_v2.sql`](file:///home/mylappy/Projects/jobhunter_/backend/migrations/001_initial_v2.sql)

### Q14: Why do you store analysis reports in JSONB?
- **Difficulty:** Intermediate
- **Answer:** *"The core analysis scores (`readiness_score`, `jd_match_score`) are stored in numeric columns for B-Tree indexing and fast sorting. However, the 8-category breakdown, individual rule findings, and bullet evidence are complex, nested structures. Storing them in `score_breakdown_json` and `result_json` as JSONB avoids creating 8 separate relational tables while preserving sub-object querying capability."*

---

## 8. CATEGORY G — NETWORKING AND APIS

### Q15: How does CORS work, and how is it configured in JobHunter?
- **Difficulty:** Intermediate
- **Answer:** *"Cross-Origin Resource Sharing is a browser security mechanism that blocks web applications on one origin from making requests to another origin unless the server explicitly permits it. In `config/env.ts`, our `isAllowedOrigin()` function matches the `Origin` header against an allowlist supporting localhost, any `*.vercel.app` preview URL, and our production domain `vinaybuilds.me` with `credentials: true`."*
- **File Reference:** [`backend/src/config/env.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/config/env.ts)

### Q16: Why return HTTP 410 Gone instead of 404 for missing resume files?
- **Difficulty:** Advanced
- **Answer:** *"HTTP 404 implies the endpoint or resource was not found. HTTP 410 Gone explicitly tells the client that the resource previously existed but has been permanently purged from cloud storage. When the frontend receives a 410, it displays an actionable message prompting the candidate to re-upload their resume rather than reporting an unhandled error."*

---

## 9. CATEGORY H — SECURITY AND CRYPTOGRAPHY

### Q17: How does your opaque session implementation protect against database breaches?
- **Difficulty:** Advanced
- **Answer:** *"When a session is created, the user receives a 64-character random token in an HTTP-only cookie. In PostgreSQL, we only store the one-way SHA-256 hash of that token (`token_hash`). If an attacker extracts a database dump, the hashes cannot be reversed to forge active session cookies, neutralizing the breach."*
- **File Reference:** [`backend/src/modules/auth/session.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/auth/session.ts)

### Q18: What is Server-Side Request Forgery (SSRF) and how does JobHunter prevent it?
- **Difficulty:** Advanced
- **Answer:** *"SSRF occurs when an attacker tricks a backend server into making HTTP requests to internal network addresses, such as the cloud instance metadata service (`http://169.254.169.254`). In `availability.ts`, before probing any external job URL, our server resolves the domain via DNS and passes the IP address through `isPublicAddress()`. Any loopback (`127.0.0.1`), private RFC 1918 subnet, or cloud metadata IP is rejected before an HTTP connection is initiated."*
- **File Reference:** [`backend/src/modules/jobs/availability.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/availability.ts)

### Q19: Why use `crypto.timingSafeEqual()` for OTP verification?
- **Difficulty:** Advanced
- **Answer:** *"Standard string equality (`===`) short-circuits on the first non-matching character, returning faster for early mismatches. Attackers can measure response time variations in microseconds to guess OTP digits sequentially. `crypto.timingSafeEqual()` executes in constant CPU time regardless of character match positions, preventing timing attacks."*
- **File Reference:** [`backend/src/utils/otp.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/utils/otp.ts)

---

## 10. CATEGORY I — PERFORMANCE AND SCALABILITY

### Q20: How does JobHunter prevent redundant machine learning inference costs?
- **Difficulty:** Intermediate
- **Answer:** *"We use an `embedding_cache` table in PostgreSQL. Before calling AWS SageMaker or our local model, we compute the SHA-256 hash of the sanitized text chunk combined with the model identity. If the vector already exists in the database, it returns in under 5 milliseconds, saving compute time and cloud costs."*
- **File Reference:** [`backend/src/providers/embeddings/embeddingCache.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/embeddings/embeddingCache.ts)

### Q21: How does the bounded wave scheduler prevent event loop starvation?
- **Difficulty:** Advanced
- **Answer:** *"In `retrievalExecutor.ts`, instead of launching 15 unthrottled API requests with `Promise.all()`, our bounded wave scheduler groups queries into waves. It enforces a maximum global concurrency of 4 requests, a per-provider limit of 1 request, and a hard 25-second deadline. This prevents external API rate bans and keeps the Node.js event loop responsive."*
- **File Reference:** [`backend/src/providers/jobs/retrievalExecutor.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/retrievalExecutor.ts)

---

## 11. CATEGORY J — DEBUGGING AND TESTING

### Q22: What tests exist in the repository, and how do you execute them?
- **Difficulty:** Intermediate
- **Answer:** *"We have 31 backend test suites run via `bun test` in `backend/src/tests/` covering parsing regressions, ATS rubric bounds, JD strict matching, and atomic rate limits. We also have frontend unit tests in `frontend/project/tests/` and Python Playwright scripts in `e2e/` for full browser automation."*

### Q23: Explain the October 2, 2026 Render upload failure and how it was resolved.
- **Difficulty:** Advanced
- **Answer:** *"Render deployed containers with Node 20 by default. However, `@supabase/supabase-js` v2.117+ requires Node 22+ for native WebSocket support. The Supabase client threw an internal error, silently falling back to writing PDF files on the local ephemeral disk. When Render restarted containers, those uploaded files vanished. We fixed this by pinning `NODE_VERSION=22.14.0`, adding fail-loud upload logging that throws in production rather than writing to disk, and adding a `GET /health?deep=1` probe to verify Supabase Storage connectivity."*

---

## 12. CATEGORY K — ARCHITECTURAL TRADE-OFFS

### Q24: Why use a 100-point deterministic rubric instead of prompt engineering?
- **Difficulty:** Intermediate
- **Answer:** *"Prompting an LLM to 'Score this resume out of 100' produces non-deterministic, fluctuating scores with 5–10 second latency and per-token costs. A deterministic algorithmic rubric evaluates exact document signals—such as bullet quantification ratios and line density—in under 50 milliseconds with 100% reproducibility and zero operational cost."*

### Q25: Why use SentenceTransformers MiniLM-L6-v2 instead of OpenAI text-embedding-3?
- **Difficulty:** Intermediate
- **Answer:** *"OpenAI's embedding API costs money per token and requires sending personal candidate resume data to an external proprietary API. MiniLM-L6-v2 is an 88 MB model that runs locally on developer laptops or in serverless containers for zero inference cost, outputs compact 384-dimensional vectors, and protects user privacy."*

---

## 13. CATEGORY L — DIFFICULT CROSS-QUESTIONS

### Q26: If an attacker steals your session cookie, how can the user recover?
- **Difficulty:** Advanced
- **Answer:** *"The user can trigger `POST /api/v1/auth/logout-all`. This executes `UPDATE sessions SET revoked_at = now() WHERE user_id = $1`. The server immediately marks all active tokens for that user ID as revoked, invalidating the attacker's stolen cookie on their next request."*
- **File Reference:** [`backend/src/modules/auth/session.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/auth/session.ts)

### Q27: What happens if an uploaded PDF is 100 pages long?
- **Difficulty:** Intermediate
- **Answer:** *"Our Multer upload middleware enforces a 10 MB file size ceiling. In `pdfParser.ts`, our positional stream extractor limits parsing to the first 10 pages. Resumes exceeding normal length are capped, preventing CPU denial-of-service on the main thread."*

---

## 14. CATEGORY M — MACHINE LEARNING AND AI

### Q28: Why do you need the `to01()` cosine discrimination curve?
- **Difficulty:** Advanced
- **Answer:** *"Dense sentence embeddings for professional texts naturally cluster in the 0.40 to 0.80 range due to shared vocabulary. If you apply a naive linear formula `(cos + 1) / 2`, almost every job scores between 70% and 90%. Our `to01()` curve stretches the realistic band [0.35, 0.95] across the full 0–100 range, providing clear discrimination between close and generic matches."*
- **File Reference:** [`backend/src/modules/jobs/ranking.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/ranking.ts)

### Q29: How does AI role discovery handle truncated LLM JSON outputs?
- **Difficulty:** Advanced
- **Answer:** *"In `roleDiscovery.ts`, when querying free APINEX models (`deepseek-v4.1-flash`, `gpt-6-luna`), models sometimes hit token caps and omit closing JSON braces. Our `parseRoleOutput()` function detects unclosed arrays or objects, automatically appends missing closing delimiters, parses the JSON, and validates that suggested roles match evidence in the resume."*
- **File Reference:** [`backend/src/modules/jobs/roleDiscovery.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/roleDiscovery.ts)

---

## 15. ADVANCED SENIOR INTERVIEWER SIMULATION (20 MULTI-TURN DIALOGUES)

### Dialogue 1: Opaque Session Revocation vs Database Load
- **Interviewer:** *"You chose database-backed opaque sessions over stateless JWTs. Doesn't querying the database on every single HTTP request degrade performance at scale?"*
- **Candidate:** *"It does introduce database lookups, but in JobHunter we connect via PgBouncer with indexed lookups on `token_hash`. At our current scale of 100 to 1,000 users, indexed SHA-256 lookups resolve in under 1 millisecond. Stateless JWTs cannot be instantly revoked upon logout or security breach without maintaining a distributed revocation blocklist, which reintroduces state."*
- **Interviewer:** *"If traffic reaches 50,000 concurrent users, how would you prevent database connection bottlenecks?"*
- **Candidate:** *"I would introduce a Redis caching layer in front of the database. Active sessions would be stored in Redis as key-value pairs (`session:<token_hash> -> userId`) with a 24-hour TTL, serving session lookups in sub-millisecond memory time while writing revocation updates directly to Redis."*
- **Interviewer:** *"Show me where the current session verification is implemented in the repository."*
- **Candidate:** *"In [`backend/src/modules/auth/session.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/auth/session.ts) inside `verifySession()` and in [`backend/src/middleware/requireSession.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/middleware/requireSession.ts)."*

---

### Dialogue 2: Resilient External Job Aggregation
- **Interviewer:** *"Your recommendation engine queries five external job boards. What happens if Jooble or Adzuna times out or throws an HTTP 500?"*
- **Candidate:** *"In [`retrievalExecutor.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/retrievalExecutor.ts), external network calls are wrapped in individual try/catch handlers inside our bounded wave scheduler. If an individual provider times out after 10 seconds or returns an HTTP 500, the error is recorded in `provider_status_json` and the scheduler continues processing remaining providers."*
- **Interviewer:** *"What if all five job providers fail or your daily API budgets are exhausted?"*
- **Candidate:** *"The provider adapters implement `fallbackFromDb()`. If external APIs are unavailable, the system queries previously cached vacancies from our local `jobs` table matching the user's role preferences, allowing the ranking engine to output ranked recommendations rather than an HTTP 500 error."*
- **Interviewer:** *"Where is that fallback defined?"*
- **Candidate:** *"In [`backend/src/providers/jobs/JobProvider.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/JobProvider.ts) and [`jobStore.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/jobStore.ts)."*

---

### Dialogue 3: PDF Extraction Column Inversion
- **Interviewer:** *"PDFs often have two-column layouts. Many parsers read across columns horizontally, merging unrelated sentences. How does your parser prevent this?"*
- **Candidate:** *"We use `pdfjs-dist` to perform coordinate-based stream extraction in [`pdfParser.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/parsing/pdfParser.ts). Instead of concatenating raw text, we track the $(x, y)$ coordinates of each text element. If horizontal jumps indicate multiple columns, we flag `hasMultiColumnRisk`. Furthermore, in `documentBlocks.ts`, we join wrapped lines into discrete bullets based on line provenance rather than collapsing the entire page into a single paragraph."*
- **Interviewer:** *"How does that feed into your ATS scoring?"*
- **Candidate:** *"In `readinessScorer.ts`, the Parseability & Structure category (20 points possible) docks points if `hasMultiColumnRisk` is true or if table density is excessive, warning the user that automated ATS systems may misread their layout."*

---

### Dialogue 4: PII Redaction in Machine Learning
- **Interviewer:** *"You generate vector embeddings from resumes. How do you address privacy concerns regarding candidate contact information?"*
- **Candidate:** *"We never pass raw PDF text to our embedding models. In [`evidenceBuilder.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/matching/evidenceBuilder.ts), `professionalEvidence()` extracts only verified technical experience and project bullets. Before vectorization, `redactProfessionalText()` executes regex replacements to scrub email addresses, phone numbers, and profile URLs."*
- **Interviewer:** *"Why not redact candidate names as well?"*
- **Candidate:** *"Candidate names appear in header blocks, which are completely excluded by `professionalEvidence()`. Only typed experience and project achievement bullets are processed."*

---

### Dialogue 5: Atomic Quota Mutex vs In-Memory Counters
- **Interviewer:** *"Why do you track provider budgets in PostgreSQL rather than an in-memory variable in Node.js?"*
- **Candidate:** *"An in-memory variable only exists within that single Node.js process. In production, web applications run across multiple clustered instances or containers. In-memory counters would result in each container having its own budget counter, multiplying our external API calls and causing rate limit bans."*
- **Interviewer:** *"Show me the exact SQL query you use to guarantee atomicity."*
- **Candidate:** *"In [`providerBudgets.ts#L25`](file:///home/mylappy/Projects/jobhunter_/backend/src/providers/jobs/providerBudgets.ts#L25): `INSERT INTO external_api_usage (id, provider, request_count, last_called_at) VALUES ($1, $2, $3, now()) ON CONFLICT (provider) DO UPDATE SET request_count = external_api_usage.request_count + $3, last_called_at = now() WHERE external_api_usage.request_count + $3 <= $4 RETURNING request_count`."*

---

## 16. BEHAVIORAL & EXPERIENCE QUESTIONS

### How to Speak Transparently About AI-Assisted (Vibe) Coding
- **Interviewer:** *"Did you build this project using AI coding tools?"*
- **Candidate Answer Framework:**
  > *"Yes, I leveraged modern AI-assisted engineering tools like Claude, Cursor, and ChatGPT throughout development. However, building a reliable system with AI requires rigorous architectural ownership.*
  > 
  > *AI code generators frequently suggest naive implementations—such as sending raw resumes to OpenAI for scoring, using in-memory state that fails in production, or implementing insecure JWTs without revocation.*
  > 
  > *My role was serving as the lead software architect: designing the trust boundaries, validating the system design against real production failures, enforcing strict relational integrity, and writing regression test suites. I treat AI as a high-velocity pair programmer, while taking full responsibility for system correctness, security, and edge-case reliability."*

### Discussing the October 2, 2026 Production Outage
- **Interviewer:** *"Describe a difficult technical bug you encountered in this project and how you diagnosed it."*
- **Candidate Answer Framework:**
  > *"Our most significant bug occurred in production on Render on October 2nd. Resumes uploaded on our hosted site were vanishing after container restarts.*
  > 
  > *I investigated the logs and discovered that our Supabase client was silently failing to initialize because Render ran Node 20 by default, whereas `@supabase/supabase-js` v2.117+ requires Node 22 for native WebSockets. The upload handler was catching the error and falling back to saving files on Render's ephemeral disk, which was wiped on restart.*
  > 
  > *I resolved this by: 1) Pinning `NODE_VERSION=22.14.0` in Render; 2) Modifying `uploadFile()` to fail loud in production by throwing an exception instead of silently writing to disk; and 3) Implementing a `GET /health?deep=1` storage probe that verifies bucket connectivity before accepting uploads."*

---

## 17. WHITEBOARD DRAWING WALKTHROUGH

When asked to draw your project architecture on a whiteboard, follow this sequential order:

```
STEP 1: Draw the Client Layer on the far left.
  - Draw a box labeled "Browser SPA (React 18 + Vite)".
  - Label port :5173 (local) or CDN (prod).
  - Draw an arrow pointing right labeled "HTTPS (Cookie + X-CSRF-Token)".

STEP 2: Draw the API Gateway in the center.
  - Draw a container labeled "Express.js API Gateway (Node 22 / Bun)".
  - Inside, list the middleware chain vertically:
    [Proxy Trust] -> [Helmet] -> [CORS] -> [Rate Limiter] -> [CSRF Double-Submit] -> [Session Guard].

STEP 3: Draw the Database & Storage Layer on the top right.
  - Draw a cylinder labeled "Supabase PostgreSQL (Port 6543 PgBouncer)".
  - Draw a cloud bucket labeled "Supabase Storage (Private 'resumes' Bucket)".
  - Draw bidirectional arrows from Express to PostgreSQL and Storage.

STEP 4: Draw the Machine Learning Layer on the bottom center.
  - Draw a box labeled "EmbeddingProvider Interface".
  - Draw two arrows:
    - Arrow A: "AWS SageMaker Serverless (anass1209 384-dim)" (Production).
    - Arrow B: "Local Python Worker (SentenceTransformer)" (Development).
  - Connect ML to an arrow pointing to the "embedding_cache" table in PostgreSQL.

STEP 5: Draw External Services on the bottom right.
  - Draw an aggregation box: Jooble, Adzuna, JobsPipe, Remotive, Arbeitnow.
  - Draw an edge box: Cloudflare Worker Cron (12h keepalive) pointing to /api/keepalive.
  - Draw an email box: Vercel Serverless Relay -> Gmail SMTP.
```

---

## 18. STRATEGIC STUDY PLANS & SELF-ASSESSMENT

### 2-Hour Crash Plan
1. Rehearse the **Top 25 Quick vs Deep Answers** table in Section 1 out loud.
2. Review the **Whiteboard Drawing Walkthrough** in Section 17.
3. Read the **Behavioral & Experience Questions** in Section 16 to frame AI assistance professionally.

### 1-Day Focused Plan
1. Master Categories A through H in Sections 2–9.
2. Open [`readinessScorer.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/ats/readinessScorer.ts) and [`ranking.ts`](file:///home/mylappy/Projects/jobhunter_/backend/src/modules/jobs/ranking.ts) and trace the scoring math line-by-line.
3. Practice the 5 multi-turn senior interviewer dialogues in Section 15.

### 3-Day Complete Mastery Plan
- **Day 1:** Run `bun test` locally; trace the full upload-to-analysis workflow in your IDE.
- **Day 2:** Master system design trade-offs, scalability bottlenecks, and failure scenarios (Categories I through M).
- **Day 3:** Conduct a mock interview with a peer using Section 15 and practice drawing the whiteboard diagram from memory.

---
*End of JobHunter V2 Technical Interview Question Bank.*
