# Audit implementation status — 3 October 2026

Branch: **dev**. This is a verified corrective implementation, not a claim that every research/deployment item in the audit plan is complete. No production migrations, account changes, deployment, push, or SageMaker inference were performed.

The detailed input audit remains at `docs/audits/2026-10-03-jobhunter-audit-and-plan.md` (the existing repository ignores `docs/`). This tracked document records implementation and outstanding work without copying private resumes, credentials, reports or model payloads into Git.

## Commits

| Commit | Change |
|---|---|
| `111624c` | RED checkpoint: eight reproducible extraction/Health regressions |
| `b29106a` | Structured resume/JD evidence; month-based tenure; transparent Health v4 |
| `307727d` | Private professional evidence, validated embeddings, persistent local worker |
| `91988d5` | Revocable V1 sessions, CSRF, upload validation, working profile contracts |
| `f327a6e` | Canonical saved reports, fractional scores, explicit JD qualifications |
| `c77b769` | Transactional job/result persistence, eligibility, pagination, provider accounting |
| `f9ddd9a` | Frontend lint/typechecking repair and DTO cleanup |

Subsequent test/documentation commits contain the reproducible isolated acceptance harness and this status. Work stays on `dev`; nothing was pushed.

## What changed

### A — State integrity and authorization

- Recommendation run rows are created as running before retrieval, then results, real job foreign keys, immutable job snapshots and counts commit together. A failed insert rolls back the whole result set; response no longer claims persistence after an FK failure.
- Existing `(source, external_id)` upserts return the existing database ID. No generated-UUID fallback.
- Idempotency keys avoid duplicate logical runs; results are owner-scoped and paginated, default 20 with up to 200 stored candidates.
- Additive migrations `006_analysis_integrity.sql` and `007_recommendation_integrity.sql` preserve old rows. Health scores now support decimals.
- Saved reports retain the canonical report object, JD title/requirements, rubric, confidence reasons, qualification checks and actual embedding status. Fresh-tab and immediate Markdown exports are identical, including deterministic object-key ordering.
- V1 login no longer issues JWTs. All V1 protected routes use opaque, server-revocable sessions. JWT-shaped bearer values cannot bypass logout.
- Cookie mutations require a CSRF token; the frontend supports a separate API origin by retaining the CORS-approved token response in memory. Origin validation and the same header/cookie names are wired end to end.
- Rate limiting applies to login/signup, not normal session checks. V1 PDF upload has its own limiter. UUID, file-format, oversized and unreadable-document failures are mapped to client errors.
- Profile reads work without legacy `users.username`. Preference UI reads/saves the canonical endpoint, and delete-latest uses the supported resume list/delete flow.

### B — Extraction

- Symbol-aware skill extraction distinguishes C, C++ and C#, and recognizes spelled-out OOP and core CS aliases.
- Shared document bullet blocks join wrapped lines and retain section provenance. Resume profiles separate work/internships, projects and leadership; raw contact headers are no longer fallback summaries.
- Professional month intervals are unioned; editorial-club dates do not add professional years. Following-line internship roles and company names are separated.
- Graduation uses the end of an education date range; expected future completion remains incomplete.
- JD title controls seniority instead of mentions of senior coworkers/managers. Numeric ranges use the lower bound, including Unicode dashes and `4–7+ years`.
- Required/preferred groups support alternatives and nested lists. The supplied Junior JD has 12 responsibilities; Senior has 15. Headings no longer displace actual duties.

### C — Scoring and qualifications

- Health v4 is exactly the visible category sum. Removed hidden no-summary/work-count deductions and the non-monotonic 75-point cap. Metric and weak-phrase handling is corrected.
- JD fit has real required/preferred group coverage, supported responsibility evidence, role alignment, domain/education applicability and a disclosed raw/applicable-point normalization. It is a fit index, not an employer ATS probability.
- Qualification checks are separate: the supplied senior JD explicitly fails the junior resumes' years/scope requirement regardless of technology similarity. In-progress degree status is disclosed and does not receive full completed-degree points.
- Ranking uses shared skill extraction and structured groups where available; project evidence participates in semantics. School text/contact headers no longer influence role overlap, and Mastercard no longer counts as a master's degree.
- Confirmed senior/lead, professional-years, role-family, geographic and filter conflicts are removed from the default list; missing evidence is shown as uncertain. The score alone is not confidence.

### D — Retrieval and display

- Effective settings merge saved preferences with explicit request overrides. Work-mode, posting age, keywords, exclusions, level and available residency/experience constraints are evaluated.
- Provider normalization preserves work mode, salary, posting time and description quality. Numeric epoch dates are handled explicitly.
- Canonical URL dedup strips tracking parameters and selects richer same-identity evidence while retaining source provenance. Distinct geography is not collapsed merely by matching title/company.
- Same-source and cross-source DB fallbacks carry explicit retrieval metadata rather than masquerading as a provider success. Cache keys account for effective preferences and relevant provider limits/country.
- Daily/monthly quota reservations are atomic on a shared DB. JobsPipe reserves its bounded limit and reconciles known charged credits; missing quota infrastructure fails closed.
- Jobs UI supports persisted pagination, qualification labels and stale-response protection. It reports insufficient candidates rather than fabricating 50 jobs.

### E — Local embeddings

- One shared local worker per model keeps SentenceTransformer loaded. Inputs travel over stdin, not process arguments. Requests are serialized and queue/batch bounded; worker output is validated for count, dimensions, finiteness and nonzero norm.
- Structured professional evidence includes projects and redacts contacts. No raw-document/header fallback. Structured bullet objects are converted to their text, not `[object Object]`.
- Token-aware chunks cover bounded input beyond the original 256-token truncation; chunk embeddings are mean-pooled and normalized. This is a versioned engineering baseline, not a validated superiority claim.
- Process-private bounded embedding cache avoids repeated inference. It is **not** the persistent Postgres vector cache proposed in the longer plan.
- Local inference fails rather than silently switching models. Mock vectors cannot contribute semantic fit; unavailable semantics and model metadata remain explicit. Actual local model revision is stored when the transformer exposes it, otherwise unknown—not invented.

### F — Checks and rollout

- Backend regression suite and opt-in real-model tests added; frontend typecheck/build restored, lint executes with zero errors.
- `e2e/audit_integrity.py` tests the actual browser/API/database flow on an explicitly isolated stack, with caller-provided private PDF/JD fixtures and generated disposable-account credentials.
- Synthetic provider cache fixtures exercise pagination and persistence without charging live providers. They are not represented as real vacancies.

## Verified results

### Automated checks actually run

| Check | Result |
|---|---|
| Backend `npm run build` | Passed |
| Backend `bun test` | 61 passed; opt-in local-model suite disabled in this default invocation |
| `RUN_LOCAL_MODEL_TESTS=1 HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 bun test src/tests/localEmbeddings.integration.test.ts` | Both real-model tests passed, including repeated vectors and text beyond token truncation |
| Frontend `npx tsc --noEmit -p tsconfig.app.json` | Passed |
| Frontend `npm run build` | Passed |
| Frontend `npm run lint` | Passed with 0 errors / 7 existing warnings (Fast Refresh export structure and legacy Home hook dependencies) |
| Migrations 006 and 007, isolated PostgreSQL | Applied successfully |
| Isolated Playwright/API/SQL acceptance | **53 checks passed**, including visible senior-qualification warnings |

The browser acceptance run covered three actual supplied PDFs, all six JD flows with real local embeddings, exact fresh-tab clipboard parity, byte-identical downloads, fractional scores, profile preferences, malformed IDs, unreadable uploads, CSRF, logout and revoked opaque bearer rejection.

Recommendation acceptance used 65 explicitly synthetic eligible jobs: all 65 persisted and paginated with stable ranks; UI loaded all 65; repeat runs resolved existing job IDs; idempotent requests reused their run; a deliberate trigger failure at rank 3 produced HTTP 500 / `persisted:false` and **zero** partial result rows.

### Updated scores from the supplied resumes

| Resume | Health v4 | Junior fit index | Senior fit index | Senior qualification |
|---|---:|---:|---:|---|
| R1: Cognizant version | 77.5 | 71 | 53 | Ineligible: experience/scope gap |
| R2: one-page version | 79.5 | 70 | 50 | Ineligible: experience/scope gap |
| R3: older two-page version | 74 | 69 | 50 | Ineligible: experience/scope gap |

These are changed-rule outputs, not validation against hiring outcomes. Expected graduation is May 2027; the junior qualification remains uncertain where degree completion matters. R1/R2 tenure is 0.33 years; R3's March–Present tenure is 0.58 years at the October 2026 evaluation date.

A no-network replay of the original cached 74/74/78-job pools removed the previously top-ranked Senior React role from consideration and placed the Frontend Intern first for every resume. The smaller remaining pool is **not** proof of 50 real eligible opportunities, and unknown country/requirements still require verification.

## Outstanding phase work — not silently marked complete

| Plan area | Remaining work / release constraint |
|---|---|
| A1/A2 provenance | Run snapshots preserve returned jobs, queries and preferences, but do not yet retain an immutable full profile/candidate-pool snapshot or full raw JD. Historical results cannot be completely rescored from the database alone. |
| B1 extraction | PDF bounding metadata is item-level. Some wrapped project bullets still lose individual span linkage (notably R2 JobHunter); description fallback retains text, but bullet-to-source provenance is not fully validated. Layout confidence and image/table detection remain heuristics. |
| B2 education | Degree/field/completion parsing is heuristic; equivalent practical experience and institution-specific degree aliases need broader fixtures. |
| C scoring quality | New rubric/eligibility behavior is regression-tested, not statistically calibrated. Domain applicability, missing-evidence normalization and role-family taxonomy need labeled review. Scores remain an index, never hiring probability. |
| C/D geographic coverage | Explicit country restrictions and common Indian/German city cases are covered. No global city/country ontology or legal work-authorization inference exists. Unknown locations must remain uncertain and require user verification. |
| D1 provider contract | Per-job fallback metadata cannot fully explain an empty failed-provider result. Adapters need a result envelope with transport outcome even when zero jobs are returned. Live revised adapter payloads were not exercised in this implementation pass. |
| D2 multi-location | Eligibility considers requested locations, but retrieval currently sends the first location rather than bounded fan-out for every location. Minimum salary has no normalized currency/period eligibility implementation; do not assume it filters results. |
| D3 dedup | Canonical URL and exact content identities are supported. Different-source URLs with similar but nonidentical descriptions still need cautious requisition/fuzzy identity reconciliation. |
| D4 recall | Pagination is for persisted ranked results. Provider cursor traversal until 50 eligible jobs, bounded concurrent retrieval and production account quota reconciliation remain to implement. A small honest eligible pool is preferable to padding with senior/unrelated jobs. |
| E2 persistent caching | Current cache is bounded and process-private. Versioned, owner-scoped database embedding cache and cancellation of running inference remain outstanding. Deployments must include the Python worker source or copy it beside compiled provider code. |
| E3 evaluation | Requires a consented labeled dataset across different candidates/employers. No independent test set, NDCG/precision calibration, cross-encoder comparison or model replacement is claimed. Three variants of one person's resume do not establish general accuracy. |
| F deployment | Production migration/rollout, CI wiring for isolated browser fixtures, coverage threshold measurement and production cross-site browser verification remain unperformed. Seven existing frontend lint warnings remain. |

Recommended next implementation order: complete provider result envelopes and bounded multi-location/cursor retrieval; repair remaining project span linkage; persist versioned input/profile hashes and owner-scoped vector caches; then build the labeled evaluation set before changing model/weights further.

## Apply and reproduce safely

### Migration and rollout

1. Back up the intended database and inspect its applied versions. **Do not run against production implicitly through an existing `.env`.**
2. From `backend`, explicitly set `PG_DATABASE_STRING` and appropriate SSL settings, then run `npm run migrate`. That command now calls the existing versioned migration runner, rather than the obsolete single-table legacy runner.
3. Ensure migrations 001–007 are recorded before running the updated routes. A fresh database and repeat migration run were checked locally; reruns skip recorded versions.
4. Deploy backend and frontend together. V1 clients must use opaque cookies (or opaque session bearer), obtain `/api/v1/csrf`, and echo `X-CSRF-Token` for cookie mutations. Old V1 JWTs intentionally stop working; users sign in again.
5. Keep `EMBEDDING_PROVIDER=local` for local testing. Ensure the Python environment has the intended model, torch and sentence-transformers. Use `HF_HUB_OFFLINE=1` / `TRANSFORMERS_OFFLINE=1` to prevent downloads in offline checks.
6. Verify session login/logout, upload, new analysis, fresh-tab report, preference save and result read-back before exposure to users. Do not treat a successful bundle build as a deployment check.

The SQL migrations include rollback notes. Do not convert fractional scores back to INTEGER or discard result snapshots without a backup. Old analyses are read through a compatibility adapter; they are not silently recalculated under the new scorer.

### Isolated acceptance test

The test stack used frontend `http://localhost:5174`, backend `http://localhost:3002`, and PostgreSQL `127.0.0.1:55432`. The earlier audit stack at ports 5173/3001 is separate and may still contain the old process.

Prepare an isolated database with all migrations, local file storage (empty Supabase URL/service key), a generated test-only JWT secret, blank AWS/provider credentials, `JOB_PROVIDERS=jooble`, local offline embeddings, and CORS/frontend URL `http://localhost:5174`. **Never reuse the default shared Supabase connection for this test.**

Place private fixtures outside Git:

```text
fixture-directory/
  manifest.json     # [{"label":"R1","path":"/absolute/path/to/first.pdf"}, ...]
  junior.md
  senior.md
```

The harness expects the supplied JD fixtures' 12/15 responsibilities; substitute expectations deliberately for other JDs. It creates only generated QA accounts, stores private diagnostic output under the fixture directory, seeds synthetic jobs in the isolated cache, and temporarily installs/removes a failure trigger to prove rollback. Database port and API origins are deliberately fixed to avoid accidental production targeting.

```sh
AUDIT_ISOLATED=1 AUDIT_FIXTURES=/absolute/private/fixture-directory \
  python3 e2e/audit_integrity.py
```

The script requires installed Python Playwright/Chromium and `psql`. It does not install dependencies, invoke real provider APIs, read passwords from chat or submit job applications. Local QA rows are retained for inspection; delete the isolated database/storage when no longer needed, not any production account.

### Verification limitations

The 53-check integration run tested the isolated development cookie configuration and cached synthetic retrieval, not production `SameSite=None` across unrelated hosted domains. Frontend token handling supports the latter, but it still needs a deployment-origin acceptance test. The legacy `/api/*` system remains separate and has not been migrated to the new session model; restrict or retire it based on actual clients rather than assuming V1 fixes secure every legacy route.
