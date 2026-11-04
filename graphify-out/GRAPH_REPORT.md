# Graph Report - jobhunter_  (2026-11-04)

## Corpus Check
- 210 files · ~193,267 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: .css 5, .example 3, (none) 3)

## Summary
- 1531 nodes · 3193 edges · 104 communities (80 shown, 24 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 211 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Auth Session Middleware
- Python Resume Analyzer ML
- ATS Readiness Scorer
- Analysis Page UI
- Job Query Planner
- Backend Dependencies
- Job Eligibility Filter
- Provider Retrieval Executor
- Backend Package Metadata
- Frontend UI Components
- JD Rubric & Report Schema
- Database Migrations
- Resume Parsing Blocks
- Job Ranking Engine
- Arbeitnow Provider
- Database Pool & Jooble
- Shared UI & API Client
- Python Flask API
- Python ML Job Matcher
- App Shell & Router
- Job Availability Check
- Legacy App Routes
- Jobs Page Display
- E2E Audit Tests
- Python ML Modules
- Embedding Cache
- Env Config & Adzuna
- Scoring & JD Match Docs
- Frontend TS Config
- Ranking Formula Docs
- E2E Login Gate Tests
- Analysis Controller
- JD Parser
- Backend TS Config
- Storage & Migration Docs
- Frontend Package Config
- SageMaker Embeddings
- JD Matcher
- PDF Parser
- Local Embeddings Provider
- Keepalive & V1 Routes
- Frontend Dev Dependencies
- Node TS Config
- Auth Session & CSRF Docs
- E2E Resume View Tests
- Keepalive & Schema Docs
- CSRF & CORS Protection
- Auth Controller & JWT
- Legacy Analysis Service
- Jooble Match Service
- Resume Context React
- Known Issues & Plan
- Resume Data Model
- Auth Form Components
- Graphify Tool Script
- Frontend Hosting Config
- AWS Embedding Docs
- Provider Budget Guards
- E2E Motion Tests
- ML API Docs
- Keepalive Worker Config
- ATS Audit Concepts
- Job Store & Dedup
- Ranking & Keyword Concepts
- Semantic Embedding Docs
- Resume Upload Route
- Frontend Dependencies
- Zod Validation Schemas
- Upload Flow & Validation Docs
- Architecture Rationale Docs
- Server Startup & Schema Check
- Deployment Checklists
- AWS IAM & Local Setup
- CI Pipeline
- Retention & Cleanup Docs
- ATS Page UI
- Match Report Client Lib
- Adzuna Provider
- PDF Parsing Docs
- Backend NPM Scripts
- ESLint Config
- Keepalive Worker Code
- Frontend NPM Scripts
- Eligibility Concepts
- JobsPipe Provider
- Graphify Tool Docs
- Vite Env Types
- Frontend Project TS
- Vercel Config
- Vite Config
- PDF Parse Types
- Xenova Types
- Session Config Docs
- Node Engine Pin
- Environment Cheat Sheet
- Predeploy Migrations
- Node 22 Pin Rationale
- Render Region Rationale
- Secrets Sync Rationale
- Bundle Budget
- Xenova Env Type
- OTP Email Concept

## God Nodes (most connected - your core abstractions)
1. `rankJobsBatch()` - 27 edges
2. `ResumeAnalyzerML` - 24 edges
3. `NormalizedJob` - 24 edges
4. `express` - 23 edges
5. `Icon()` - 23 edges
6. `pool` - 22 edges
7. `react` - 22 edges
8. `Eyebrow()` - 22 edges
9. `JobSearchQuery` - 21 edges
10. `Button()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Rationale: Embedding Cost Guardrails (cache, low concurrency)` --semantically_similar_to--> `Embedding Cache`  [INFERRED] [semantically similar]
  infra/aws/README.md → graphify/CONCEPTS.md
- `Health Index (Rule-Based Parseability and Evidence Index)` --semantically_similar_to--> `ATS Readiness`  [INFERRED] [semantically similar]
  reports/2026-10-03-four-resume-audit.md → graphify/CONCEPTS.md
- `Isolated Playwright and SQL acceptance harness with private fixtures` --conceptually_related_to--> `CI backend job: lint, typecheck, tests and build`  [INFERRED]
  IMPLEMENTATION_STATUS.md → .github/workflows/ci.yml
- `CI security job: npm audit and gitleaks secret scan` --implements--> `Secret handling: sync false render secrets, env examples, boot validation, gitignore`  [INFERRED]
  .github/workflows/ci.yml → SECURITY.md
- `Issue 4: dependency vulnerabilities and deprecated Node 20 runtime` --conceptually_related_to--> `CI security job: npm audit and gitleaks secret scan`  [INFERRED]
  PLAN.md → .github/workflows/ci.yml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Alternative implementations of the EmbeddingProvider contract** — system_design_embeddings_provider_contract, deployment_sagemaker_serverless_embeddings, local_setup_local_model_provisioning, system_design_mock_embedding_fallback [INFERRED 0.85]
- **Keepalive subsystem preventing the Supabase seven-day pause** — keepalive_cloudflare_worker_cron, keepalive_keepalive_endpoint, keepalive_keepalive_pings_table, system_design_keepalive_flow [INFERRED 0.90]
- **Recommendation retrieval, scheduling and ranking pipeline** — system_design_recommendation_flow, interview_prep_readme_recommendation_flow, interview_questions_bounded_wave_scheduler, interview_questions_atomic_quota_mutex, system_design_ranking_discrimination [INFERRED 0.80]
- **Concept to Implementation Map** — concepts_ats_banding, concepts_ats_readiness, concepts_auth_session, concepts_eligibility_filter, concepts_embedding_cache, concepts_evidence_selection, concepts_geography_filter, concepts_jd_parsing, concepts_jd_rubric, concepts_job_freshness, concepts_job_ranking, concepts_job_recommendation, concepts_keyword_matching, concepts_otp_email, concepts_pdf_parsing, concepts_score_aggregation, concepts_semantic_embedding, concepts_seniority_scoring, concepts_skill_normalisation, concepts_storage [EXTRACTED 1.00]
- **Embedding Provider Pipeline (local library to SageMaker endpoint)** — concepts_semantic_embedding, concepts_embedding_cache, requirements_sentence_transformers, readme_sagemaker_serverless_endpoint, readme_mock_embedding_fallback, readme_embedding_cost_guardrails, render_aws_env_config [INFERRED 0.85]
- **Supabase Keepalive Cron Flow** — readme_supabase_keepalive_worker, readme_keepalive_cron_schedule, readme_keepalive_endpoints, readme_keepalive_pings_table, readme_backend_service [EXTRACTED 0.95]

## Communities (104 total, 24 thin omitted)

### Community 0 - "Auth Session Middleware"
Cohesion: 0.05
Nodes (47): requireSession(), Schemas, validate(), authenticateSession(), createSession(), extractToken(), generateToken(), hashToken() (+39 more)

### Community 2 - "ATS Readiness Scorer"
Cohesion: 0.08
Nodes (39): ACTION_VERBS, actionFromRule(), BulletCandidate, category(), CategoryBreakdown, clamp(), COMMON_TYPOS, countDateTokens() (+31 more)

### Community 3 - "Analysis Page UI"
Cohesion: 0.07
Nodes (36): Tag(), Action, Actions(), actionsFromRules(), AnalysisLocationState, AnalysisRow, Breakdown(), Category (+28 more)

### Community 4 - "Job Query Planner"
Cohesion: 0.10
Nodes (31): JobPreferences, PlannedQuery, VERSION, ALLOWED_FREE_MODELS, cache, DiscoveredRole, discoverRoles(), fallback() (+23 more)

### Community 5 - "Backend Dependencies"
Cohesion: 0.06
Nodes (33): dependencies, argon2, @aws-sdk/client-sagemaker-runtime, axios, bcrypt, cookie-parser, cors, dotenv (+25 more)

### Community 6 - "Job Eligibility Filter"
Cohesion: 0.11
Nodes (18): CandidateQualification, countryCodeForLocation(), countryOf(), effectivePreferences, Eligibility, eligibleJob(), normalize(), cities (+10 more)

### Community 7 - "Provider Retrieval Executor"
Cohesion: 0.11
Nodes (21): JobQueryPlanner, executeRetrieval(), RetrievalExecutorOptions, RetrievalOutcome, RetrievalResult, safeError(), providerCapabilities, retrievalPlan() (+13 more)

### Community 8 - "Backend Package Metadata"
Cohesion: 0.07
Nodes (28): author, description, engines, node, axios, nodemailer, @types/nodemailer, typescript (+20 more)

### Community 9 - "Frontend UI Components"
Cohesion: 0.23
Nodes (21): DragReturn(), Icon(), paths, Button(), currentTheme(), Eyebrow(), Logo(), ProgressRow() (+13 more)

### Community 10 - "JD Rubric & Report Schema"
Cohesion: 0.12
Nodes (15): JD_RUBRIC_VERSION, roleFamily(), scoreJdRubric(), tokenize(), analysisSnapshot(), REPORT_SCHEMA_VERSION, ReportSnapshot, VERSION (+7 more)

### Community 11 - "Database Migrations"
Cohesion: 0.12
Nodes (21): createPool(), __dirname, ensureMigrationsTable(), __filename, getAppliedVersions(), getConnectionString(), migrate(), resolveMigrationsDir() (+13 more)

### Community 12 - "Resume Parsing Blocks"
Cohesion: 0.13
Nodes (19): buildDocumentBlocks(), canonical, DocumentBlocks, DocumentBullet, ParsedDocument, buildResumeProfile(), ContactInfo, EducationEntry (+11 more)

### Community 13 - "Job Ranking Engine"
Cohesion: 0.15
Nodes (17): cosine(), detectJobSeniority(), getRankingEmbeddingProvider(), locationScore(), normalizeSkillSet(), RankBreakdown, rankJob(), rankJobsBatch() (+9 more)

### Community 14 - "Arbeitnow Provider"
Cohesion: 0.19
Nodes (9): arbeitnowCacheHours(), ArbeitnowJob, ArbeitnowProvider, JobSearchQuery, ProviderSearchResult, markFallback(), searchJobsFromDb(), storeJobsToDb() (+1 more)

### Community 15 - "Database Pool & Jooble"
Cohesion: 0.13
Nodes (14): pool, JoobleJob, JoobleProvider, dedupedJobs, normalizedJobs, query, rawResults, seen (+6 more)

### Community 16 - "Shared UI & API Client"
Cohesion: 0.21
Nodes (20): EmptyState(), Modal(), ScoreRing(), api, analysisInfo(), apiStatus(), dateLabel(), resumeName() (+12 more)

### Community 17 - "Python Flask API"
Cohesion: 0.12
Nodes (10): analyze_pdf(), analyze_pdf_ml(), analyze_text(), analyze_text_ml(), batch_match_jobs_ml(), extract_text(), health_check(), match_job_ml() (+2 more)

### Community 19 - "App Shell & Router"
Cohesion: 0.14
Nodes (16): App(), AppShell(), initials(), nav, router, Toast(), AuthContext, AuthProvider() (+8 more)

### Community 20 - "Job Availability Check"
Cohesion: 0.14
Nodes (17): ACTIVE_SEMANTIC_ANCHORS, allowedHost(), AvailabilityOptions, AvailabilityResponse, cache, checkJobsAvailability(), CLOSURE_PATTERN, CLOSURE_SEMANTIC_ANCHORS (+9 more)

### Community 21 - "Legacy App Routes"
Cohesion: 0.19
Nodes (13): App(), PrivateRoute(), AppShellSkeleton(), LandingPage, PublicOnly(), SessionGuard(), PublicAuth(), PublicLegal() (+5 more)

### Community 22 - "Jobs Page Display"
Cohesion: 0.16
Nodes (18): JobsPage, displayValue(), formatMetricValue(), safeText(), BREAKDOWN_MAX, BreakdownItem, Job, JobCard() (+10 more)

### Community 23 - "E2E Audit Tests"
Cohesion: 0.20
Nodes (12): check(), seed(), sql(), check(), fixture(), overflow(), run(), csrf() (+4 more)

### Community 25 - "Embedding Cache"
Cohesion: 0.18
Nodes (17): boundedMap(), CacheIdentity, CacheItem, CHUNKER_VERSION, embedCached(), embeddingCache(), batch(), get() (+9 more)

### Community 26 - "Env Config & Adzuna"
Cohesion: 0.16
Nodes (11): env, envSchema, AdzunaJob, SUPPORTED_COUNTRIES, JobAvailability, JobProvider, JobsPipeJob, RemotiveJob (+3 more)

### Community 27 - "Scoring & JD Match Docs"
Cohesion: 0.13
Nodes (19): Model packaging payload and response contract for the inference container, Persistent shared local embedding worker with validated output and revision-pinned cache, Health v4 category-sum scoring and separated JD qualification checks, Tailored JD matching connectivity with chunking, caching and rubric assembly, ATS readiness diagnostic scoring connectivity with rubric version 4.2.0, Rationale for a deterministic 100-point rubric instead of LLM scoring, Three primary functional workflows: Resume Health, Tailored JD Match, Opportunities, Budget-aware testing rules and never-commit-secrets rules (+11 more)

### Community 28 - "Frontend TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 29 - "Ranking Formula Docs"
Cohesion: 0.12
Nodes (18): Offline ranking evaluation harness over strict JSONL judgments, Effective preference merge, provider envelopes, dedup and pagination fixes, Rationale for atomic row-level mutex quotas against concurrent provider calls, Multi-provider recommendation flow: query planning, bounded waves, ranking, transactional persistence, Rationale for the to01 cosine discrimination stretch replacing naive linear normalization, Answer explaining atomic PostgreSQL quota reservations before provider calls, Answer explaining bounded wave scheduling of external API fan-out, Answer explaining the six-component composite ranking formula (+10 more)

### Community 30 - "E2E Login Gate Tests"
Cohesion: 0.18
Nodes (5): check(), run(), check(), fixtures(), main()

### Community 31 - "Analysis Controller"
Cohesion: 0.15
Nodes (6): analyzeLatestResume(), analyzeResumeById(), resumeModel, router, AnalysisResult, AnalysisService

### Community 32 - "JD Parser"
Cohesion: 0.18
Nodes (14): DOMAINS, heading(), HEADINGS, parseJd(), RequirementGroup, yearRequirement(), CanonicalSeniority, aliases (+6 more)

### Community 33 - "Backend TS Config"
Cohesion: 0.12
Nodes (16): compilerOptions, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, lib, module, moduleResolution, noImplicitAny (+8 more)

### Community 34 - "Storage & Migration Docs"
Cohesion: 0.13
Nodes (17): Storage, Backend TypeScript/Bun Service, Database Migration Command, Backend Environment Configuration, Jooble Job API Key Configuration, 12-Hour Keepalive Cron (0 */12 * * *), Public No-Auth Backend Keepalive Endpoints, Rationale: Prevent Supabase 7-Day Inactivity Pause (+9 more)

### Community 35 - "Frontend Package Config"
Cohesion: 0.12
Nodes (16): axios, nodemailer, @types/nodemailer, typescript, zod, name, private, type (+8 more)

### Community 36 - "SageMaker Embeddings"
Cohesion: 0.22
Nodes (5): AwsSageMakerEmbeddingProvider, EmbeddingProvider, MockEmbeddingProvider, getEmbeddingProvider(), @aws-sdk/client-sagemaker-runtime

### Community 37 - "JD Matcher"
Cohesion: 0.20
Nodes (12): JD_MATCHER_VERSION, JdMatchResult, matchJd(), normalizeSet(), SKILL_FAMILIES, SkillMatch, aliasLowerMap, CANONICAL_SKILL_ALIASES (+4 more)

### Community 38 - "PDF Parser"
Cohesion: 0.21
Nodes (13): canonicalizeSections(), cleanText(), computeLayoutSignals(), detectSections(), escapeRegex(), extractWithPdfJs(), extractWithPdfParse(), isPdfMagic() (+5 more)

### Community 39 - "Local Embeddings Provider"
Cohesion: 0.18
Nodes (5): ADJACENT_SCRIPT, closeLocalEmbeddingProviders(), LocalEmbeddingProvider, shared, WorkerResponse

### Community 40 - "Keepalive & V1 Routes"
Cohesion: 0.17
Nodes (13): checkToken(), handlePing(), router, router, router, router, app, authLimiter (+5 more)

### Community 41 - "Frontend Dev Dependencies"
Cohesion: 0.12
Nodes (16): devDependencies, autoprefixer, eslint, @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, postcss (+8 more)

### Community 42 - "Node TS Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 43 - "Auth Session & CSRF Docs"
Cohesion: 0.16
Nodes (16): Transactional recommendation persistence, opaque sessions, CSRF and upload validation, Signup, OTP verification, session creation and requireSession connectivity flow, CSRF double-submit step in the middleware pipeline with timingSafeEqual comparison, Repository topology and artifact inventory of backend and frontend files, Answer explaining the double-submit cookie CSRF defense, Rationale for opaque database sessions over stateless JWTs, Answer explaining SSRF avoidance via DNS and isPublicAddress checks, Authentication model: JWT Bearer with sessions table and server-side revocation (+8 more)

### Community 44 - "E2E Resume View Tests"
Cohesion: 0.20
Nodes (7): api(), check(), make_resume_b(), pg_url(), psql(), run(), shot()

### Community 45 - "Keepalive & Schema Docs"
Cohesion: 0.16
Nodes (15): Additive migrations 006-008 for analysis integrity, recommendation integrity and embedding cache, Complete v1 API specification and data contracts, Complete database schema and data dictionary across 10 migrations, Cloudflare keepalive edge cron connectivity into the keepalive endpoint, Answer explaining the 12-hour keepalive cron against Supabase dormancy, Cloudflare Worker cron firing every 12 hours against the backend, Public no-auth keepalive endpoint inserting a ping row, keepalive_pings table and indexes created by migration 005 (+7 more)

### Community 46 - "CSRF & CORS Protection"
Cohesion: 0.20
Nodes (9): getCorsOrigins(), isAllowedOrigin(), csrfProtection(), issueCsrfToken(), safeMethods, router, cookie-parser, express-rate-limit (+1 more)

### Community 47 - "Auth Controller & JWT"
Cohesion: 0.21
Nodes (10): login(), signup(), authenticateToken(), Express, Request, router, resumeModel, router (+2 more)

### Community 48 - "Legacy Analysis Service"
Cohesion: 0.20
Nodes (5): AnalysisResult, AnalysisService, __dirname, execAsync, __filename

### Community 50 - "Resume Context React"
Cohesion: 0.22
Nodes (12): ResumeContext, ResumeContextType, ResumeProvider(), ResumeProviderProps, ResumeUpload(), useResume(), Home(), Job (+4 more)

### Community 51 - "Known Issues & Plan"
Cohesion: 0.18
Nodes (14): Execution order and per-commit gates for all fixes, Issue 2: resume View deep link dead-ends in a misleading Analysis not found error, Issue 3: slow login page from blank session gate, duplicate calls, cold starts and font import, Issue 4: dependency vulnerabilities and deprecated Node 20 runtime, Open questions for the user including keep-alive decision, P4: job detail runtime crash rendering an object as a React child, P7: mobile overflow of jobs summary cards at 390px, Working agreement process rules binding every fix: small commits, local-first, E2E gates (+6 more)

### Community 52 - "Resume Data Model"
Cohesion: 0.15
Nodes (3): Resume, ResumeContent, ResumeModel

### Community 53 - "Auth Form Components"
Cohesion: 0.29
Nodes (9): AuthForm(), AuthFormProps, SignupResponse, CreativeVisual(), Particle, User(), LoginPage(), SignupPage() (+1 more)

### Community 54 - "Graphify Tool Script"
Cohesion: 0.27
Nodes (7): build(), main(), module_key(), node_id(), render(), resolve_import(), walk()

### Community 55 - "Frontend Hosting Config"
Cohesion: 0.15
Nodes (13): React SPA Entry Point (#root, /src/main.tsx), Pre-Paint Theme Bootstrap (jh-theme localStorage), DM Sans and Manrope Google Fonts Loading, jobhunter Static Frontend Site (Vite React SPA), SPA Rewrite Route for react-router, Rationale: SPA Fallback Required for react-router, Accessibility Fixes (Explicit Labels, Predictable Select Focus), Shared Theme-Aware UI Design System (UI, Icon, DragReturn) (+5 more)

### Community 56 - "AWS Embedding Docs"
Cohesion: 0.18
Nodes (13): AWS CDK IaC Option, Console Provisioning Option (No IaC), Rationale: Embedding Cost Guardrails (cache, low concurrency), InvokeEndpoint Runtime Contract (inputs and purpose to embeddings), MockEmbeddingProvider Fallback When AWS Vars Missing, Render Environment Wiring for AWS SageMaker, Embedding Model resume-job-matcher-all-MiniLM-L6-v2, SageMaker Serverless Embedding Endpoint (+5 more)

### Community 57 - "Provider Budget Guards"
Cohesion: 0.33
Nodes (11): checkDailyBudget(), dayKey(), getCount(), getMonthlyCredits(), monthKey(), reconcileMonthlyCredits(), recordDailyCall(), recordMonthlyCredits() (+3 more)

### Community 58 - "E2E Motion Tests"
Cohesion: 0.20
Nodes (4): check(), drag(), main(), show()

### Community 59 - "ML API Docs"
Cohesion: 0.20
Nodes (12): Job Recommendation, Analysis Response Schema (score status insights recommendations metrics), Batch Job Matching Endpoint /api/ml/batch-match-jobs, Gunicorn WSGI Production Deployment, ML Resume Analysis Endpoints /api/ml/analyze-text and /api/ml/analyze-pdf, ML Job Matching Endpoint /api/ml/match-job, Python Resume Analysis Service, Resume Analysis Endpoints /api/analyze-text and /api/analyze-pdf (+4 more)

### Community 60 - "Keepalive Worker Config"
Cohesion: 0.17
Nodes (11): wrangler, description, devDependencies, wrangler, name, private, scripts, deploy (+3 more)

### Community 61 - "ATS Audit Concepts"
Cohesion: 0.20
Nodes (11): Health Index (Rule-Based Parseability and Evidence Index), Rationale: Filename Labels Are Not Ground Truth, Rationale: JD Fit Is an Index, Not a Down-Level Recommendation, Four-Resume Fixture Results S70 S90 J70 J90, ATS Banding, ATS Readiness, Evidence Selection, JD Parsing (+3 more)

### Community 62 - "Job Store & Dedup"
Cohesion: 0.44
Nodes (7): canonicalJobUrl(), contentHash(), deduplicateJobs(), normalizedPostedAt(), stripHtml(), upsertJob(), upsertJobsBatch()

### Community 63 - "Ranking & Keyword Concepts"
Cohesion: 0.24
Nodes (11): Job Freshness, Job Ranking, Keyword Matching, Skill Normalisation, ATS Readiness Fixtures, Offline Evaluation Framework for ATS JD Match and Ranking, JD Match Evaluation (jdMatch.test.ts), Job Ranking Evaluation (ranking.ts v2.0.0) (+3 more)

### Community 64 - "Semantic Embedding Docs"
Cohesion: 0.22
Nodes (10): Isolated Offline Test Method (local embeddings, disposable account, isolated PostgreSQL), Verification Scope and Limits, Embedding Cache, Semantic Embedding, HuggingFace Transformers Library, sentence-transformers Embedding Library, PyTorch 2.5 Deep Learning Stack, Rationale: Verification Boundaries and Remaining Caveats (+2 more)

### Community 65 - "Resume Upload Route"
Cohesion: 0.20
Nodes (6): resumeModel, router, storage, upload, uploadsDir, multer

### Community 66 - "Frontend Dependencies"
Cohesion: 0.20
Nodes (10): dependencies, axios, caniuse-lite, framer-motion, lucide-react, nodemailer, react, react-dom (+2 more)

### Community 67 - "Zod Validation Schemas"
Cohesion: 0.20
Nodes (8): AtsUploadInput, atsUploadSchema, LoginInput, loginSchema, ProfileInput, profileSchema, SignupInput, signupSchema

### Community 68 - "Upload Flow & Validation Docs"
Cohesion: 0.20
Nodes (10): Symbol-aware skill extraction and structured document block fixes, Five core invariants: deterministic health, fail-loud storage, fail-fast schema readiness, redaction, single source of truth, Fail-loud storage policy forbidding ephemeral disk writes in production, Rationale for coordinate-preserving PDF extraction and scanned detection, Resume upload, PDF validation, storage, persistence and retention eviction flow, Zod input validation and helmet security headers, Private bucket and owner checks guarding object-level access, Upload security: PDF MIME allowlist, sanitization, server-side sha256, object path (+2 more)

### Community 69 - "Architecture Rationale Docs"
Cohesion: 0.33
Nodes (9): Rationale for keeping ARCHITECTURE.md as a pointer so old links do not 404, Pointer naming SYSTEM_DESIGN.md as the canonical system design document, Process and runtime matrix across backend, frontend, cron, relay, ML worker and database, Data versus compute split: model runs locally, everything else shared Supabase, Documentation index linking SYSTEM_DESIGN, LOCAL_SETUP, ARCHITECTURE, DEPLOYMENT, SECURITY and KEEPALIVE, Footguns list of documentation versus code discrepancies to cross-check, Shared Supabase project as the single Postgres and Storage data layer for local and Render, Stale documentation claims that must not drive implementation (+1 more)

### Community 70 - "Server Startup & Schema Check"
Cohesion: 0.31
Nodes (6): getDatabaseUrl(), checkSchemaReadiness(), Queryable, startServer(), db(), pg

### Community 71 - "Deployment Checklists"
Cohesion: 0.22
Nodes (9): Post-deploy verification checklist, Render Blueprint deployment of the backend web service from render.yaml, Render static site deployment of the frontend with build-time VITE vars, Rollback procedure via previous Render deploys and additive migrations, Supabase Postgres provisioning and idempotent migration order, Private Supabase Storage bucket creation and service-role access, Hosted Render app usage: static SPA talking to the Render backend API, Logging and redaction rules for secrets, keys and tokens (+1 more)

### Community 72 - "AWS IAM & Local Setup"
Cohesion: 0.25
Nodes (9): IAM policy scoped to sagemaker:InvokeEndpoint on a single endpoint ARN, AWS SageMaker serverless endpoint deployment for embedding inference, Health checklist defining what set up means, verified 2026-10-02, One-time local model provisioning of the Python venv and SentenceTransformer weights, Run instructions for backend and frontend terminals, First-round real-data audit checklist and results, Final local versus SageMaker comparison showing identical scores for tested inputs, P1: skill section boundary loss and contradictory ATS skill evidence (+1 more)

### Community 73 - "CI Pipeline"
Cohesion: 0.31
Nodes (9): CI backend job: lint, typecheck, tests and build, CI frontend job: lint, typecheck and build, CI security job: npm audit and gitleaks secret scan, Isolated Playwright and SQL acceptance harness with private fixtures, Outstanding phase work explicitly not marked complete, Audit implementation scope statement: corrective work, no deploy or push, Automated checks actually run and recorded results, Scaling roadmap answer: Redis rate limits, BullMQ parsing, pgvector HNSW (+1 more)

### Community 74 - "Retention & Cleanup Docs"
Cohesion: 0.31
Nodes (9): Retention eviction policy capping resumes at three per user, Case study answer on the October 2 Render upload outage, Top 25 must-memorize questions with elevator and deep answers plus source files, Issue 1: production resumes never reach Supabase Storage, causing data loss, Orphan inventory and investigation test-data cleanup log, S10: per-user retention cap of three resumes with oldest eviction, S1: resume rows whose stored bytes became unreachable, Secondary findings table S1 through S10 with status (+1 more)

### Community 75 - "ATS Page UI"
Cohesion: 0.29
Nodes (6): SelectMenu(), AtsPage(), checks, levelOptions, Mode, TargetLevel

### Community 76 - "Match Report Client Lib"
Cohesion: 0.36
Nodes (6): BREAKDOWN_LABEL_MAP, BREAKDOWN_MAX_MAP, buildMatchReport(), list(), ReportJob, text()

### Community 78 - "PDF Parsing Docs"
Cohesion: 0.40
Nodes (6): PDF Parsing Defects Found and Fixed, Rationale: Private Resume Content Kept Out of Git, Synthetic Regression Tests for Parsing Fixes, PDF Parsing, PDF Text Extraction Endpoint /api/extract-text, PyMuPDF PDF Extraction Library

### Community 79 - "Backend NPM Scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, migrate, start, test

### Community 80 - "ESLint Config"
Cohesion: 0.33
Nodes (5): @eslint/js, eslint-plugin-react-hooks, eslint-plugin-react-refresh, globals, typescript-eslint

### Community 81 - "Keepalive Worker Code"
Cohesion: 0.60
Nodes (5): doPing(), fetch(), json(), safeJson(), scheduled()

### Community 82 - "Frontend NPM Scripts"
Cohesion: 0.40
Nodes (5): scripts, build, dev, lint, preview

### Community 83 - "Eligibility Concepts"
Cohesion: 0.50
Nodes (4): Explicit Senior-JD Ineligibility for Junior Candidates, Eligibility Filter, Geography Filter, Seniority Scoring

### Community 85 - "Graphify Tool Docs"
Cohesion: 0.67
Nodes (3): graphify.py Generator and query.py CLI, JobHunter Knowledge Graph (1043 nodes / 3245 edges), JobHunter Knowledge Graph (GRAPH.md duplicate of CONCEPTS.md)

## Ambiguous Edges - Review These
- `Rationale for keeping ARCHITECTURE.md as a pointer so old links do not 404` → `Stale documentation claims that must not drive implementation`  [AMBIGUOUS]
  SYSTEM_DESIGN.md · relation: conceptually_related_to
- `Environment configuration matrix parsed and validated by Zod` → `APInex role discovery chain with bounded JSON repair and deterministic fallback`  [AMBIGUOUS]
  plan.md · relation: conceptually_related_to
- `Answer explaining truncated LLM JSON delimiter repair in role discovery` → `APInex role discovery chain with bounded JSON repair and deterministic fallback`  [AMBIGUOUS]
  INTERVIEW_QUESTIONS.md · relation: references
- `Data deletion and retention via cascading FK deletes and immediate object removal` → `S1: resume rows whose stored bytes became unreachable`  [AMBIGUOUS]
  PLAN.md · relation: conceptually_related_to
- `Python Resume Analysis Service` → `scikit-learn ML Library`  [AMBIGUOUS]
  backend/python/requirements.txt · relation: references

## Knowledge Gaps
- **115 isolated node(s):** `argon2`, `axios`, `nodemailer`, `zod`, `@types/bcrypt` (+110 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 627 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **24 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `express` connect `Auth Controller & JWT` to `Auth Session Middleware`, `Resume Upload Route`, `Provider Retrieval Executor`, `Backend Package Metadata`, `Keepalive & V1 Routes`, `JD Rubric & Report Schema`, `CSRF & CORS Protection`, `Analysis Controller`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **What connects `argon2`, `axios`, `nodemailer` to the rest of the system?**
  _115 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth Session Middleware` be split into smaller, more focused modules?**
  _Cohesion score 0.054244306418219465 - nodes in this community are weakly interconnected._
- **Why does `react-router-dom` connect `App Shell & Router` to `Frontend Package Config`, `Analysis Page UI`, `Frontend UI Components`, `ATS Page UI`, `Shared UI & API Client`, `Resume Context React`, `Auth Form Components`, `Legacy App Routes`, `Jobs Page Display`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Should `Python Resume Analyzer ML` be split into smaller, more focused modules?**
  _Cohesion score 0.06666666666666667 - nodes in this community are weakly interconnected._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `Rationale for keeping ARCHITECTURE.md as a pointer so old links do not 404` and `Stale documentation claims that must not drive implementation`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Environment configuration matrix parsed and validated by Zod` and `APInex role discovery chain with bounded JSON repair and deterministic fallback`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._