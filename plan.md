# Real-data end-to-end audit and correction plan

## Constraints
- Use the supplied resume, real Supabase database/storage, and actual provider results; no synthetic resume, seeded jobs, or substitute database.
- Use local embeddings for the initial audit and fix/retest cycles. Invoke SageMaker only for the final comparison.
- Complete the first end-to-end audit and record observed discrepancies before changing application behavior.
- Preserve existing users, uploads, preferences, and recommendation history. Do not delete or evict existing records for testing.
- Keep credentials, session state, resume text, contact details, and private response payloads out of this plan and other tracked artifacts.

## Preflight findings — first audit has not started

### SETUP-01: Real database lacks the required recommendation schema field
- Confirmed by read-only queries on 2026-10-04: migrations 001–008 are applied; migration 009 is absent.
- `recommendation_runs.profile_version` is absent.
- Current `backend/src/db/schemaReadiness.ts` requires both migration 009 and that column before serving requests.
- Existing `backend/migrations/009_recommendation_profile_version.sql` adds a nullable text column with `IF NOT EXISTS`; it does not delete or rewrite existing records.
- Blocker: the current app cannot be browser-tested against this database until this schema prerequisite is approved/applied. Do not bypass readiness checks.
- Status: user approved the prerequisite; migration 009 was applied successfully to real Supabase. No existing rows were deleted. No application fixes were made during the first audit.

### Access and model configuration
- Real Supabase database connectivity and storage configuration confirmed without exposing credentials.
- Application login credentials are not present in the checked environment. Signup of a fresh audit account is requested; do not reset an existing user's password or impersonate an account.
- The attachment exists in the workspace. It has not yet been uploaded during this audit.
- No SageMaker endpoint is set in the backend environment. AWS CLI configuration files exist, but credentials and endpoint access have not been verified. No AWS inference has run.

## First-round audit checklist
- [x] Signup, login, logout/relogin, signed-out route protection and reload/session handling exercised. Exhaustive malformed-input/security fuzzing is not claimed.
- [x] Actual PDF uploaded to Supabase; page metadata and downloaded SHA-256 verified; saved-resume view opened.
- [x] Education, future graduation, four-month internship, three projects, skills and leadership boundaries inspected against the document.
- [x] Resume Health categories, totals, detail messages, priorities and export controls inspected; discrepancies recorded below.
- [x] Three real source JDs tested; explicit required/optional skills, scope and tenure findings recorded.
- [x] Architect and Workday postings used as genuine negative controls, not invented JDs.
- [x] Every first-round recommendation selected and every source URL visited. External content verification remains blocked for 29 first-round sources.
- [x] Score filters, pagination, cached reload, saved preferences and stored snapshots exercised. Identical-input retry with a force-refresh idempotency key is outside this browser checklist.
- [x] Desktop/mobile rendering checked, including a desktop-to-mobile resize after selecting the last card.
- [x] Inaccessible source pages and untested destructive/security flows explicitly recorded as gaps.

## Fix and verification stages
1. Finish the first-round checklist; add evidence-backed findings with expected/actual behavior and affected files below.
2. Implement bounded fixes only after that audit, preserving existing work and unrelated data.
3. Run targeted regressions, backend checks and frontend checks.
4. Repeat the same real-data browser audit using local embeddings; investigate any remaining discrepancies.
5. Verify the configured SageMaker model and privacy boundary, then perform the final comparison on the same resume/JDs/jobs. Report model identity and any differences; do not claim exact equality across different models.

## First-round results (2026-10-04)

The first audit used the actual uploaded PDF, a newly signed-up audit account, real Supabase storage/database, and actual provider results. No seeded jobs or substituted database were used. Raw resume-bearing evidence and session state remain private under `/tmp/opencode/jobhunter-real-audit/`, not in the repository.

- Signup/login, logout/relogin, signed-out route protection: passed.
- Real PDF uploaded to Supabase; downloaded bytes match the upload SHA-256. Two-page metadata correct.
- Resume Health, its category/detail views, report download, clipboard export, print rendering, saved resume view and reload were exercised.
- Saved preferences were submitted in the browser and reloaded.
- Recommendation run retrieved 153 deduplicated candidates and stored 34 results. All 34 cards were selected; one crashed the detail page. Pagination and cached reload were exercised.
- All 34 source URLs were visited. Five LinkedIn source pages were readable; 28 Jooble pages returned a 403 challenge and one LinkedIn page returned a 429/authwall. These 29 sources remain **unverified**, not correct-by-assumption. No challenge or login barrier was bypassed.
- Real source JDs were tested in Tailored Match: a junior AI role, a Java architect role, and a Workday integration role. All three HTTP requests succeeded, exposing the scoring issues below.
- Local inference was confirmed in two JD reports. The initial recommendation run fell back to keyword-only after an embedding-cache database connection failure, despite successful local model warmup.
- Account/resume deletion was intentionally not performed. Live-provider results can change; source availability is not guaranteed. Final SageMaker validation has not run.

## Confirmed discrepancies and proposed fixes

### P1 — Resume skill-section boundary loss / contradictory ATS evidence
- Actual: Resume Health shows 14 skills, while `skills_focus` reports 0 normalized hard skills; the persisted profile has no declared skills. Java, JavaScript, SQL, Docker and other listed skills can be reported missing.
- Cause: `Languages:` inside Technical Skills is treated as a new top-level languages section, taking the rest of the technical inventory with it. Inspect hard-skill counting against the normalizer's canonical keys as well.
- Files: `modules/parsing/pdfParser.ts`, `resumeProfile.ts`, skill extraction/normalization and the Resume Health scorer.
- Fix: keep technical subcategories in the skills section; distinguish natural-language sections from programming-language lists; make counts and scoring use the same canonical inventory. Add generalized regressions without copying the private resume into git. Bump profile/scorer versions where behavior changes.

### P2 — Explicit experience requirements and senior roles incorrectly admitted
- Actual: recommendation entry 4 is a Java architect posting requiring 8–15 years (and 10+ years in qualifications), but is marked eligible for an internship-stage candidate. Entry 6 explicitly asks for 6+ years in Workday integration and is also marked eligible.
- Source checks: the displayed title can differ from the role stated in the description. `Experience: 8-15 years`, `Exp:6+ Years`, and `10+ years in software engineering` are missed.
- Files: `modules/jd/jdParser.ts`, `jobs/seniority.ts`, `jobs/eligibility.ts`, `analysis/jdRubric.ts`.
- Fix: parse bounded professional-experience labels and reversed phrasing; honor explicit role labels without promoting candidates based on coworker mentions. Use canonical seniority in JD qualification checks. Preserve harsh upward penalties; no downward penalty.

### P3 — JD requirements disappear and title-only evidence becomes 100% fit
- Actual: the junior AI JD's `Core Requirements` are not recognized (Python/Git and vector-database requirements disappear). The Java architect JD is `uncertain` instead of failing the explicit experience/scope requirement. The Workday JD displays **100%** from role alignment alone (15/15 applicable points) with no matched requirements or semantic evidence.
- Files: JD parser/matcher/rubric and analysis response construction.
- Fix: heading aliases including Core Requirements and Qualifications & experience, truthful AND/OR and partial coverage, deduplicated missing skills, scope/tenure checks, and insufficient-evidence handling rather than inflating a title-only denominator. Score and evidence must reconcile across direct response, persisted snapshot and UI.

### P4 — Job detail runtime crash
- Actual: selecting entry 19 (Labor Planning & Forecasting) throws `Objects are not valid as a React child (found: object with keys {raw})`.
- Files: `frontend/project/src/pages/JobsPage.tsx` and shared display helpers if needed.
- Fix: normalize provider salary/other untrusted structured fields to display strings, never render raw objects. Verify all 34 cards again.

### P5 — False confidence, source omissions and misleading model label
- Actual: short ~300-character snippets lacking qualification details display `No confirmed barrier`; specialized Workday/SAP jobs are treated as generic software roles. Provider fallback/error diagnostics are absent from the page. The header refers to SageMaker even though this audit uses local inference.
- Fix: flag missing qualification evidence as uncertain, retain specialty compatibility checks, show actual semantic status, provider fallbacks and exclusion counts. Don't claim external source verification from successful provider retrieval.

### P6 — Pagination disappears when minimum score hides loaded results
- Actual: setting minimum fit to 100 hides all loaded matches and also hides Load more, despite 34 stored results and a remaining page.
- Fix: render pagination independently of visible-result count. Distinguish an empty visible page from an empty stored run.

### P7 — Mobile overflow
- Actual: at 390px viewport, Jobs summary cards expand to about 524px due to long resume filename/grid min-content sizing.
- Fix: min-width constraints and safe wrapping/truncation across summary cards, job details and report filenames. Recheck actual PDF name on mobile, not only short synthetic names.

### P8 — Optional embedding-cache failure disables healthy local inference
- Actual: local model warmup succeeded; a Supabase `Connection terminated unexpectedly` during batch/cache work caused all 34 recommendations to use keyword-only scoring.
- Files: embedding cache, ranking and database lifecycle.
- Fix: bound cache reads/writes and allow validated model inference when optional cache I/O fails; preserve model/user cache boundaries and make fallback visible. Release the initial database connection after readiness probing. Do not suppress failures of required recommendation/result writes.

### P9 — Repeated/misleading skill gaps and incomplete source evidence
- Actual: one .NET job repeats C#, .NET and SQL in its missing-skill list. Some full provider descriptions are downgraded to snippet quality on DB fallback.
- Fix: canonical deduplication in public evidence lists; preserve description quality in fallback reads. Do not collapse same-title openings with distinct verified requisitions merely because they share a company.

## Implementation order and acceptance gates
1. Parsing + Resume Health consistency (P1), JD/relevance/eligibility correctness (P2/P3/P5 backend/P9), and safe UI rendering/diagnostics (P4/P5 UI/P6/P7) may be implemented independently.
2. Main integration handles cache/database reliability (P8), version consistency and real-data regression evidence.
3. Run tests/builds, restart only the audit app processes, then rerun the same stored PDF and the same source JDs locally. Compare every reported score component and previously failing card.
4. Review a new real-provider run, record each result/source status, and repeat if a concrete discrepancy remains. Unavailable external sources remain explicit gaps.
5. Only after local checks pass, identify/authorize the configured SageMaker endpoint and run the final provider comparison. No AWS inference before this stage.

## Implemented corrections and second-pass evidence
- P1: technical language/subcategory boundaries repaired; profile version 5.1.0 and scorer version 4.1.0. On the real PDF, recognized skills increased from 14 to 35. Health is now 80.5, not artificially increased: broader declared skills change the evidence ratio and focus score. Category points reconcile.
- P2/P3: explicit tenure labels, requirement headings and canonical scope checks repaired. The same architect JD now fails qualifications and scores 0 after the 50-point principal gap. The same Workday JD fails its six-year requirement and has unavailable fit instead of title-only 100. The junior AI JD recognizes Python/Git and vector-store alternatives and scored 71 with local inference.
- P4/P5/P6/P9: object-valued salaries render safely; source/fallback and exclusion diagnostics are visible; snippets are marked uncertain; missing skills are deduplicated; pagination is outside the score-filter empty state; fallback reads preserve description quality.
- P7: second browser pass still exposed min-content grid overflow after selecting the last card then resizing from desktop. Applied explicit one-column minmax grid/min-width constraints; the focused retest measured 390px content in a 390px viewport.
- P8: optional cache I/O is bounded to four concurrent requests; a cache outage no longer prevents validated model inference. Required analysis/recommendation writes still propagate errors. Database startup connection is released and idle pool errors are handled.
- Removed unused resume-derived role-title vectors from public job cache batches; private professional vectors remain owner-scoped.
- Recommendation cache identity now includes provider/model/endpoint configuration, so a local cached run cannot count as an AWS test.
- AWS preparation: authenticated CLI identity exists; listing endpoints is denied. The user supplied the exact existing endpoint name. SDK now uses the default credential chain (including shared profiles/workload roles) and cancels timed-out invokes rather than requiring pasted static keys. No keys were added to repository/config files.

### Actual checks so far
- Backend full suite: 117 passed, 3 opt-in skips; the real local model suite run separately: 2 passed.
- Backend TypeScript build: passed.
- Frontend formatter regression: 1 passed; TypeScript check and production build: passed.
- Frontend lint: 0 errors, 7 existing warnings. Build retains a bundle-size warning.
- Second real-data browser pass: all 13 current cards rendered, real local embeddings used, architect/Workday excluded, cached scores persisted. Mobile failure found and fixed as above; a third full pass is in progress.
- Public source ledger: `artifacts/real-audit/source-checks.csv` (34 first-round entries; blocked sources explicitly marked).

### External limitations (not papered over)
- Adzuna India requests return HTTP 404 and use database fallback. This is shown as a provider error/fallback, not live success. Provider configuration/access needs confirmation; do not silently switch the user's country to obtain unrelated jobs.
- Jooble challenge pages and the LinkedIn authwall remain inaccessible. Provider snippets are not independently verified full postings.
- No deployment or git push has been performed. These fixes run in the local app connected to the real Supabase database/storage.
- Third local round completed with 31 browser/data assertions passed and no browser errors. Twelve current recommendations were inspected; all used local semantic evidence. The additional HCL Commerce source link was visited and also returned a Jooble 403 challenge.
- Final SageMaker round completed: 31 checks passed, 0 failed, 0 browser errors. No deployment was initiated.

## Final local versus SageMaker comparison
- Same real Supabase-stored PDF, same three saved source JDs, same application code.
- AWS run used `AwsSageMakerEmbeddingProvider` against the explicitly supplied endpoint; recommendation logs confirm 12 jobs / 36 texts. The provider-specific run ID differed from the local run.
- Both semantic JD cases returned real, 384-dimensional embeddings with no mock fallback. The configured model is `anass1209/resume-job-matcher-all-MiniLM-L6-v2`; the AWS response does not expose an immutable model revision, so revision equality is not claimed.
- Junior AI JD: 71 locally and 71 on AWS; identical breakdown and qualification status.
- Architect JD: 0 locally and 0 on AWS after the principal-stage penalty; both ineligible with the explicit experience gap.
- Workday JD: fit unavailable on both (no substantive responsibilities/recognized skills to score), ineligible on both for the six-year requirement. No semantic inference is needed for this case; its unavailable embedding status is not an AWS failure.
- All 12 recommendation IDs matched across runs; all 12 fit scores were identical. Persisted reloads retained the scores/evidence and mobile rendering passed.
- These are observed agreements for the tested inputs, not a guarantee that all future model outputs or provider postings are identical.
- Redacted result summary: `artifacts/real-audit/verification-summary.json`.
- Source ledger covers all 35 distinct postings visited across the audit. Five pages were readable, 30 were blocked (29 Jooble challenges plus one LinkedIn authwall). Blocked postings remain unverified and snippet recommendations remain explicitly uncertain.

## Status at completion of the SageMaker audit
- Confirmed first-round application failures were fixed and the local-test/fix loop repeated before the final AWS pass.
- Code changes are uncommitted and not deployed. Migration 009 and audit account/data writes were made against real Supabase with authorization.
- Adzuna 404 resolved in the follow-up below; source-site access restrictions remain. No claim of universal correctness or complete external verification is made.
- Rotate credentials pasted in chat; they were not copied into repository artifacts or new configuration files. Raw audit files/session state remain in the restricted private audit directory.

## Adzuna follow-up — 2026-10-04

### Proven cause and official contract
- Official references: https://developer.adzuna.com/overview, https://developer.adzuna.com/docs/search and https://developer.adzuna.com/swagger/spec/test2.json.
- Search uses `GET /v1/api/jobs/{country}/search/{page}` with `app_id`, `app_key`, `what`, `where`, `results_per_page` and optional `max_days_old`. Country path values are lowercase.
- Same existing local credentials: `in` returned HTTP 200 (27,247 software-engineer results); `IN` returned HTTP 404 `UNSUPPORTED_COUNTRY`. `countryCodeForLocation('India')` supplies uppercase `IN`, which the old Adzuna provider passed straight into the URL. This was not a demonstrated credential/account-alert problem.
- Adzuna documents descriptions as excerpts capped at 500 characters. Returning exactly 500 characters is not proof of a full JD. The previous length-based `full` label was wrong.
- Screenshot shows a live Trial Access app. Local credentials work; Render's actual environment and deployed code were not inspected or changed.

### Implemented and tested
- Normalize config/query countries with trim + lowercase; validate documented country codes before reserving quota. No silent switch away from the requested country.
- Preserve API snippet text, label it `snippet`, retain zero-valued salaries, request JSON explicitly, and expose safe HTTP error codes without credentials or raw response payloads.
- Successful empty responses remain empty rather than silently returning unrelated cached jobs.
- Jobs detail identifies provider text versus API excerpts and explicitly warns about omitted requirements and independent source verification.
- Retrieval version now participates in search-cache and completed-run identity so old mislabeled Adzuna results are not reused after deployment.
- Direct call through the fixed provider with uppercase `IN`: status `ok`, four normalized junior-software-engineer jobs from 187 total matches. Every description was 500 characters, classified as snippet, and persisted unchanged to real Supabase.
- Real browser refresh: 15 recommendations, including two Adzuna entries; all 15 cards inspected, 0 browser errors. Adzuna pages 1–3 were successful cached provider responses during this browser pass; direct live retrieval was verified separately, not inferred from those cache hits.
- Latest backend suite: 122 passed, 3 opt-in skips; TypeScript build passed. Frontend formatter test: 1 passed; TypeScript and production build passed; lint: 0 errors, 7 existing warnings. Existing bundle-size warning remains.

### Retained-JD audit and remaining limitations
- All 15 response descriptions exactly match their immutable recommendation snapshots, and all 15 scores match persisted values. All descriptions match the jobs table after HTML/entity normalization; nine Jooble raw snippets contain markup that the jobs table strips. This is expected normalization, not lost JD text.
- All 11 excerpt descriptions (nine Jooble, two Adzuna) exactly match retained provider-cache text and are explicitly `uncertain`. The four JobsPipe descriptions are substantive provider text, not proof of current source-page accessibility.
- The Adzuna Navtech and Fortanix results contain mostly company introductions, so omitted skills/tenure cannot be verified from those excerpts. Higher retrieval coverage does not guarantee stronger qualification evidence.
- Two Bosch descriptions end with the bare text `4 to 8`, without units, and discuss Embedded C/Autosar. This remains a manual-review ambiguity, not a confirmed four-year requirement or a proven candidate fit. One is currently labeled eligible (30 fit); the other uncertain (25 fit). These expose a remaining limitation in incomplete provider requirements and specialization handling; universal scoring correctness is not claimed.
- The 30 previously blocked original pages are still unverified. Built-in browser opening timed out and tab inspection showed no open tab; no CAPTCHA was solved and no challenge bypass was attempted. Provider-text auditing proceeded as requested instead.
- Redacted follow-up receipt: `artifacts/real-audit/adzuna-verification.json`; per-result text audit: `artifacts/real-audit/retained-jd-checks.csv`. Raw text, screenshot, session and response files remain private and excluded from git.
- No Render deployment or git push is included. Rotate the key exposed in the screenshot/chat; configure replacement secrets privately.
- The requested local commit includes application fixes, migration 009, regression tests and redacted audit reports only. Credentials, attachments, session files and generated screenshots are excluded. Staged files were checked for configured secrets and common credential patterns; no matches found.
- After the cache-version change, backend build and the 122-test suite passed again; the restarted local backend health endpoint returned `ok`. No extra metered provider refresh was run solely for this cache-version change.

## Multi-role retrieval and evidence follow-up — 2026-10-05 (Asia/Calcutta)

### Scope and implementation
- User authorized local implementation and real-data verification, followed by a GitHub push if checks passed. AWS and Render configuration remain unchanged; no alternative embedding/reranker model was evaluated or installed.
- Apinex role discovery uses only `free/gpt-6-luna`. The backend sends contact-redacted professional text with numbered evidence passages, validates referenced passages and role support, and returns up to three distinct titles. Manual overrides remain available. Owner/input/version-scoped AI caches persist in the existing profile JSON; no schema migration was needed.
- Role inference no longer selects frontend merely because React occurs first, and the planner no longer discards the second/third target roles. All selected titles receive first-page provider coverage before deeper searches, subject to provider quotas and availability. No invented new-graduate status.
- Independent retrieval uses bounded waves: at most four concurrent requests and one per provider within a run, at most 18 planned calls. JobsPipe cursor chains stop at absent/repeated cursors; provider network timeouts own cancellation. Timings separate discovery, retrieval, local ranking, availability and persistence.
- The UI requires an explicit search after reviewing roles; it defaults to India and seven days, with visible newest/match, unknown-date, unknown-geography and verified-open controls. Unknown date/geography opt-ins are explicit. Jooble `updated` is no longer treated as posting time. Adzuna newest requests use its date sort.
- Availability checks use a bounded shortlist (maximum 20), HTTPS host allowlisting, public DNS validation with pinned connections, validated redirects and bounded bodies/timeouts. HTTP 200 or generic Apply text alone is insufficient. Challenges/authwalls remain unknown. Matching JobPosting metadata and application evidence can support open status. Rechecks and user-reported closure are persisted; user reports are not mislabeled as independent verification and suppress that URL for the account for 24 hours.
- The user-supplied expired Indeed screenshot was recorded as a user report on the existing audit recommendation. Automated HTTP 401 access was not represented as verification of closure.
- Reports preserve every loaded result's retained provider JD, evidence, source/provenance, searched titles, dates, availability, qualifications, component points, penalties/caps, confidence and actual run diagnostics. Export scope explicitly says loaded/filtered, not all results. Canonical skills are deduplicated. Unknown seniority/location earn no compatibility points; upward penalties remain harsh and downward seniority has no penalty.

### Actual verification
- Backend: 139 passing tests, zero failures; three opt-in skips in the default run. The opt-in real local embedding file was separately run: two tests passed. TypeScript build passed.
- Frontend: three tests passed; TypeScript and production build passed; lint zero errors/seven existing warnings. Existing bundle-size warning remains.
- Real-resume browser checklist: 20/20 passed, zero browser exceptions, mobile width 390 with no horizontal overflow. No seeded jobs or substitute database were used.
- Newest run: 23 results; every result within the requested seven-day window, sorted correctly across pagination; reported expired URL and observed Paris/US/LATAM leakage excluded. Verified-open-only returned three results. Every loaded retained JD appeared in the clipboard report. On-demand availability recheck persisted successfully.
- Live timing from that run: retrieval 15,978 ms, local ranking 3,115 ms, availability 3,661 ms, persistence 4,609 ms; backend total 27,858 ms. Provider diagnostic intervals demonstrated peak overlap of four. These are measurements, not a controlled speedup comparison against the older AWS run.
- Explicit empty-target-role acceptance was additionally tested, so saved/manual titles could not mask automatic discovery. Latest AI titles were Full Stack Developer, Backend Engineer and Frontend Engineer; 26 real results, all score arithmetic verified. Persisted preferences and same-input cache reuse passed. Response count differs as the live queries/feeds differ.
- Resume Health remained 80.5, and three retained real JDs remained 71/uncertain, 0/ineligible (architect), and unavailable/ineligible (Workday). Browser report reload passed for all four analyses with zero errors.
- Redacted receipt: `artifacts/real-audit/multi-role-verification.json`. Raw text, API responses, screenshots, sessions and scripts stay in the existing private audit directory, excluded from git.

### Honest remaining limitations and deployment notes
- Apinex returned empty/truncated/malformed responses during live testing before later successful responses. Bounded missing-final-delimiter repair is allowed, but missing fields, invalid evidence and other invalid JSON fail to the visible deterministic fallback; no automatic paid fallback or network retry. Provider responses reported zero cost tokens, which is not an independently verified billing statement or guaranteed daily allowance.
- Availability is time-sensitive, best-effort and shortlist-limited. Unverified results remain visible unless verified-only is selected. No challenge/CAPTCHA bypass occurred, and historical blocked source pages are still unverified. Users should recheck before applying.
- Remotive exhausted its existing daily quota during these tests; its fallback status was visible, not counted as successful live retrieval. Strict date filtering intentionally excludes Jooble records without a trustworthy posting date.
- First-seen time is left unavailable where the current schema/provider does not establish it; update/fetch dates are not fabricated as posting/first-seen dates.
- The key is stored only in ignored local backend configuration. The template documents `APINEX_API_KEY` and `APINEX_ROLE_MODEL=free/gpt-6-luna`; set a rotated key privately in Render when deployment configuration is authorized. No secret is included in the commit. The exposed key should be rotated.
