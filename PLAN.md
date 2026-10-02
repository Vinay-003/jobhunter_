# PLAN — Bug Investigation & Fix Plan (2026-10-03)

> **Status (2026-10-03): fixes implemented on `dev`, NOT pushed.** Issues 2–4
> (non-breaking parts) and secondary S3/S4/S6/S7/S8 + S1 lost-file UX are done, each with
> local + scripted-browser evidence (§8 marks every step). **Still open:** Issue 1 (needs
> the §9 Render dashboard checks) and Q5–Q7 (Node version, frontend majors, lockfile).
> All commits from `2532a45` onward (through this docs refresh) sit ahead of `origin/dev`.
>
> **Line refs:** re-verified 2026-10-03 against current `HEAD`. Issue sections whose bugs
> are fixed label their evidence **[pre-fix @ `114773a`]** — those line numbers describe
> the code before the fix; current locations are listed in each section's status banner.
>
> **Branch:** `dev`. **Method:** code read first, then live probes against production
> (`https://jobhunter-backend-lkkf.onrender.com` = `https://api.vinaybuilds.me`, same instance)
> and the shared Supabase project (`vaflmkhzyvqmglstmadg`). All test rows created during
> investigation were deleted (verified 0 orphans — see §7). Render logs analyzed 2026-10-02
> (Issue 1 narrowed, new Issue 4 added).

---

## 0. Working agreement (process rules — binding for every fix below)

1. **Small, focused commits.** One logical change per commit with a proper message
   (what + why), e.g. `fix(api): log supabase import/createClient errors instead of
   silently falling back to disk`. Never mix refactors/formatting with fixes.
2. **Never push before everything is tested locally and green.** Per-commit gates:
   `cd backend && npm run build && npm test` · `cd frontend/project && npm run build` ·
   full local browser run of all features (rules 3–5). Red tests = no commit, no push.
3. **Local setup must store resumes in Supabase Storage too.** After a local upload,
   assert in the DB that `storage_bucket == 'resumes'` (local `.env` points at the shared
   project, so this must behave exactly like production). A local upload falling back to
   `local` is a bug, not "dev mode".
4. **Test every feature locally before calling any fix done:** login, resume upload,
   analysis (readiness → report), resumes list/view/download/delete, jobs list,
   recommendations, logout — via curl **and** via the UI.
5. **Drive the browser like a cursor — automate the UI.** Use Playwright (headless,
   scripted) to exercise the real pages: log in, upload, navigate, assert on visible
   content, capture screenshots as evidence. Keep the scripts (e.g. `e2e/`) so every fix
   is verified by re-running the browser suite, not by eyeballing. Run against local
   first; after each deploy, re-run the same suite against production.
6. **Test account** (owner-provided): `vinayjadam2003@gmail.com` — the password is
   **deliberately not stored in this repo** (never commit credentials); take it from the
   owner when a manual login is needed. Automated runs should prefer throwaway
   `qa.*@example.com` users that are deleted afterwards (cleanup verified, §7).
7. **Loading states = skeleton screens.** Any view waiting > ~300 ms for data must show a
   **skeleton** (shimmer placeholder mirroring the real layout) — preferred over spinners;
   spinners only for small inline actions. Mandatory targets: the login gate (blank div
   today), Resumes list, Analysis page, Jobs recommendations, ATS analysis progress
   (backend work measured at 25–50 s, see Issue 3). **Never ship a blank screen.**
8. **No secrets in the repo or commits** (`.env` stays gitignored — `.gitignore:22,29`).
   No force-push; no committing while tests are red.

---

## Issue 1 — Resumes uploaded in production never reach Supabase Storage

**Severity: high (data loss risk) · Confidence: confirmed by live test**

### Symptom
Uploads "succeed" in the UI, but the Supabase Storage bucket contains almost nothing.
The bucket `resumes` contains exactly **one** folder (`301b4e73-…`) holding a
**1,396-byte** test file — see §6 (orphan). The user's real uploads go to disk instead.

### Evidence (all probed 2026-10-02 22:10–22:12 UTC)
1. Fresh upload through **production** backend:
   ```
   POST /api/v1/resumes  →  200, resume id fc1767ac-65e2-42be-a8c8-e7a1d1ad7e64
   DB row: storage_bucket = "local"          ← should be "resumes"
   ```
2. Every row in the shared DB falls back:
   ```
   GET /rest/v1/resumes?select=storage_bucket
   → Counter({'local': 14})   total: 14      ← 100% local, incl. all Aug/Sep rows
   ```
3. Bucket root list (service key) → only `301b4e73-…` (orphan test folder, §5).
4. Contrast: **local** backend (same code, `backend/.env` + local `node_modules`) uploads fine:
   ```
   POST http://localhost:3001/api/v1/resumes → 200 in 2.3s
   DB row: storage_bucket = "resumes"
   bucket list → ['301b4e73-…', 'cb95d000-…']  (new folder created ✅)
   ```
   (Both test users/resumes deleted afterwards.)
5. **Render logs (provided 2026-10-02):** build of `114773a` succeeded
   (`npm ci --include=dev && npm run build` → `tsc`, 299 packages, "Build successful"),
   service live at `https://api.vinaybuilds.me` (+ domain alias; `/health` timestamps prove
   it is the same instance as `jobhunter-backend-lkkf.onrender.com`). The runtime log
   contains `⚠️ Node.js 20 and below are deprecated … @supabase/supabase-js` → the package
   **is installed and was imported** in the running process. The pasted logs show **no**
   `[supabaseStorage]` line.
6. **Re-probe after logs (22:31 UTC):** fresh production upload through
   `api.vinaybuilds.me` → still `storage_bucket = "local"`
   (row `037f616d-…`, test user deleted afterwards).

### Root cause (chain)
1. **Silent fallback by design:** `backend/src/modules/storage/supabaseStorage.ts:27-36`
   — `getSupabaseClient()` wraps `await import('@supabase/supabase-js')` in
   `try { … } catch { return null }`. If the package is missing at runtime, the upload
   **silently** writes to local disk (`supabaseStorage.ts:80-88`) and returns
   `{ bucket: 'local' }`. No error reaches the API response, so the upload "succeeds".
2. **Missing dependency until yesterday:** `@supabase/supabase-js` was only added to
   `backend/package.json` in commit `92f7116` (2026-10-02 20:02 UTC, message:
   *"add missing supabase-js dep (Render uploads hit disk)"*). Until that deploy, **every**
   Render upload fell into (1). This explains all pre-deploy rows — and is now
   **eliminated for the current image** by log evidence 5 (package loads). The fallback
   logic itself dates back to `8006a03` (V2 core).
3. **Response hides the failure:** `backend/src/routes/v1/resumes.ts:122` returns only
   `id/fileName/uploadDate/status/sha256/pageCount` — never `storage_bucket`. The list
   endpoint (`resumes.ts:140`) omits it too, so neither the UI nor an API consumer can tell
   local vs Supabase.
4. **The catch at `supabaseStorage.ts:33-34` swallows more than import errors:**
   `createClient(env.SUPABASE_URL!, …)` runs *inside* the same `try`. A malformed URL makes
   it **throw** — verified locally: `createClient('vaflmkhzyvqmglstmadg', key)` →
   `Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.` — the `catch` returns `null`
   **without logging anything**, and `uploadFile` then falls to disk with no warn at all
   (`:81` only warns when the *env vars* are missing). This path explains **all current
   evidence at once**: deprecation warning present (import ran) + zero `[supabaseStorage]`
   lines + `bucket=local`. Two rival paths remain (they do print a warn) — table below.

### Open (needs Render dashboard — cannot be probed remotely)
Logs narrowed the field (dep + package present), but the exact failing branch needs two
dashboard checks — Render → `jobhunter-backend` → **Logs** around **22:11 & 22:31 UTC**
and → **Environment**:

| Observation | Meaning | Action |
|---|---|---|
| `[supabaseStorage] Supabase upload failed, falling back to local: <msg>` | env set, import OK, storage API rejected the call (401 bad key / missing bucket / region) | fix per `<msg>` |
| `[supabaseStorage] Supabase not configured — writing to local uploads folder` | secrets missing (they are `sync: false`, `render.yaml:43-46`, must be set manually) — *contradicts the deprecation warning unless it came from an older deploy* | set both secrets, restart |
| **no `[supabaseStorage]` line at all** (**leading hypothesis**) | `createClient()` threw inside the silent catch (`supabaseStorage.ts:33-34`) → client `null` → disk, zero logging. Classic cause: `SUPABASE_URL` missing `https://` | fix URL format **and** make the catch log (fix 1.2 below); expected value `https://vaflmkhzyvqmglstmadg.supabase.co` |

**Environment tab check:** `SUPABASE_URL` (must start with `https://`), and
`SUPABASE_SERVICE_ROLE_KEY` (41-char `sb_secret_…`). Note: `backend/.env` is **not** in
git (`.gitignore:29`) and `env.ts:31-32` reads `process.env` — so Render sees **only**
dashboard values, nothing else.

### Proposed fix
1. **Verify prod state first** (dashboard): Render → `jobhunter-backend` → Logs, grep
   `supabaseStorage`; Environment → confirm `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`;
   Deploys → confirm a deploy for `92f7116`/`114773a` succeeded.
2. **Fail loudly, not silently** — `supabaseStorage.ts`:
   - `getSupabaseClient()`: log the import error before returning null
     (`console.error('[supabaseStorage] @supabase/supabase-js unavailable:', err)`).
   - `uploadFile()`: when Supabase is configured but the write lands on local disk in
     **production** (`NODE_ENV=production`), return/throw an error instead of pretending
     success — or at minimum attach `storageMode: 'local-fallback'` to the response.
3. **Surface storage state in the API** — `resumes.ts:122` and `:140`: include
   `storageBucket: row.storage_bucket`. UI can badge it (`saved: supabase | local(dev)`).
4. **Structured warning** — replace free-text warns with one greppable token, e.g.
   `[supabaseStorage] FALLBACK reason=import|env|upload-error`, so one log grep answers
   the table above forever.
5. **Health check** — extend `/health` (`backend/src/routes/v1/index.ts:20`) with an
   optional `?deep=1` that runs `storage.from(bucket).list('', {limit:1})` and reports
   `storage: ok|error <code>` (never leaking the key).
6. **Re-deploy + re-run the exact probe** from §7 (upload → assert
   `storage_bucket == 'resumes'` → bucket folder exists → DELETE cleans it).

### Consequence already realized (fix separately, §6)
All 14 existing rows say `bucket='local'` → their bytes live (or lived) only on an
ephemeral Render disk / this machine. Files from Aug 30–Sep 23 are **already gone**
(only 3 of them exist under `backend/uploads/`, see §6) → re-analysis and download for
those resumes will fail (`resumes.ts:213` → 404 "File not found in storage";
`analyses.ts:45-64` → **410** with re-upload copy since `8e4b127`; was a 500). Confirmed
live in Render logs: `readiness error Error: Local
file not found: /opt/render/project/src/backend/uploads/hc/test.pdf`.

---

## Issue 2 — Resumes "View" dead-ends in a misleading "Analysis not found"

**Severity: high (core flow broken/confused) · Confidence: root cause confirmed in code;
intent corrected per user — "View" must open the clicked resume, and the resume id in the
link is therefore CORRECT; the route/page/error are wrong**

> **Status: FIXED** — backend `30933e9`, frontend `9a58578`, E2E `8a7b506` (18/18, re-run
> green after Issue 3 as `0ba71a1`'s suite). Evidence below is **[pre-fix @ `114773a`]**.
> Current locations: `ResumesPage.tsx:123` (View → `/app/resumes/${id}`), `router.tsx:116`
> (route `resumes/:id` → `ResumeViewPage`), `analyses.ts:256` (`GET /analyses` with
> `resumeId`/`latest` filters), `analyses.ts:278/:283` (404 vs honest 500),
> `AtsPage.tsx` honors `?resumeId`, `ResumesPage.tsx:8` `id: string`.

### Symptom
Resumes page → **View** → error page "Analysis not found". Misleading: the id in the URL
is a valid **resume** id — nothing is missing except the assumption that it's an analysis id.

### Evidence / root cause
1. **Right id, wrong target.** `ResumesPage.tsx:102` builds
   `/app/analysis/${r.id}` from the **resume** id — correct for "open this resume" — but
   the only detail route is `analysis/:id` (`router.tsx:124`), and `AnalysisPage.tsx:339`
   fetches `GET /analyses/<id>` treating the param as an **analysis** id →
   `analyses.ts:244` → **404 "Analysis not found"** every time. (Genuine analysis ids
   reach the page only from AtsPage's SPA navigation state, `AtsPage.tsx:159`.)
2. **No resume view exists.** Routes (`router.tsx:121-128`): ats, analysis/:id, jobs,
   resumes, profile — nothing can "open a resume".
3. **Backend already has the pieces:**
   - `GET /resumes/:id` (`resumes.ts:143`) → `{fileName, uploadDate, status, sha256, pageCount}`
   - `GET /resumes/:id/download` (`resumes.ts:191`)
   - `GET /analyses` list (`analyses.ts:231`) → newest 50, `SELECT *` (includes `resume_id`)
   - `AnalysisPage` accepts `location.state.initialAnalysis` (`AnalysisPage.tsx:315`) — the
     report renderer can be reused with fetched data.
4. **Even a correct analysis id can dead-end:** some resumes have zero analyses rows
   (screenshot resume `1769d56b-…`, see §6), and "not found" is indistinguishable from
   "DB failed": `GET /analyses/:id`'s `catch` also returns **404 "Analysis not found"**
   (`analyses.ts:246`), while insert/list failures are swallowed
   (`analyses.ts:97`, `:221`, list `:236` → `[]`).
5. **AtsPage cannot re-analyze an existing resume** — its only flow is upload-new-file →
   analyze (`AtsPage.tsx:145-154`); no `?resumeId` handling exists, which an
   "Analyze this resume" CTA requires.
6. Minor: `ResumesPage.tsx:8` types `id: number` although ids are UUID strings (typing lie).

### Proposed fix (View opens the resume; resume id stays in the URL)
1. **New route + resume view:** add `/app/resumes/:id` (`router.tsx`):
   - `GET /resumes/:id` → 404 → friendly "Resume not found" + back link (never raw backend text);
   - fetch the resume's latest analysis (2) → if present, render the existing report UI
     (reuse AnalysisPage's renderer via `initialAnalysis` state, as AtsPage does);
   - if none → resume card: fileName, upload date, status, **Download**
     (`/resumes/:id/download`), and **"Analyze this resume"** CTA → `/app/ats?resumeId=<id>`.
   Keep `analysis/:id` for real report URLs (hard-refresh/back-nav).
2. **Backend:** add `resumeId` (+ optional `latest=true`) filter to `GET /analyses`
   (`analyses.ts:231`); in `GET /analyses/:id` return **500** on query failure and 404
   only for genuinely missing rows (`analyses.ts:239-247`).
3. **AtsPage:** honor `?resumeId=` — skip upload, call `/analyses/readiness|jd-match`
   with the given id (already keyed on resumeId, `AtsPage.tsx:153-154`) so the CTA
   re-analyzes the stored file.
4. **ResumesPage:** point View at `/app/resumes/${r.id}`; fix the `id` typing; show the
   list **skeleton** while loading (§0 rule 7) instead of spinner-only.
5. **Error handling:** `analyses.ts:97`/`:221` → `console.error` at minimum (an id handed
   to the SPA with no row is a guaranteed broken link — consider failing the request);
   list `:236` → log the error instead of silent `[]`.
6. **Copy:** AnalysisPage/ResumeView map fetch failures to contextual messages
   ("This resume hasn't been analyzed yet" / "Resume not found") — never show raw
   "Analysis not found" for a resume id.

### Verification (browser E2E, §0 rule 5)
- Resumes → View on an analyzed resume → report renders; hard refresh also renders.
- View on an un-analyzed resume → resume card + Download + Analyze CTA → AtsPage runs the
  analysis on the existing file (no re-upload) → report.
- Unknown id → "Resume not found" with back link; **never** "Analysis not found".
- `grep -rn "app/analysis/" frontend/project/src` → only AtsPage's `analysisId` navigation.
- Stop the DB → readiness/list log a 500 with a log line, not a silent 404 masquerade.

---

## Issue 3 — Login page slow to load

**Severity: medium · Confidence: mechanisms confirmed; exact share per visit not isolated**

> **Status: FIXED** — `165d7ba` (session cap + single-flight, optimistic `PublicOnly`,
> `SessionGuard` via context, font `<link>`, skeletons on Analysis/Jobs/ATS/Resumes) +
> E2E `0ba71a1` (2/2 with a 6 s-delayed `/auth/session`). Evidence below is
> **[pre-fix @ `114773a`]**. Current locations: `router.tsx:75-89` (optimistic `PublicOnly`),
> `router.tsx:62-70` (`SessionGuard` → `AppShellSkeleton`, no `/latest-resume`),
> `AuthContext.tsx:51` (single-flight `inflight`), `index.css:1` (fonts via `index.html`
> `<link>`, `grep fonts.googleapis dist/assets/*.css` → 0).

### What we measured (production, 2026-10-02 22:10–22:12 UTC, both services warm)
| Probe | Result |
|---|---|
| `GET https://jobhunter-r773.onrender.com/login` (cold-ish) | TTFB 1.01 s |
| same, warm | TTFB 0.53 s |
| main bundle `/assets/index-p3ll3DTJ.js` (gzip) | 138 kB, 0.71 s |
| `GET /api/v1/auth/session` (warm, 401 expected) | 1.02 s |

**Backend work observed in Render logs** (what the UI actually waits on, per request):
analysis readiness / jd-match **29.7 s** (SageMaker embed), recommendation ranking batch
embed **25.7 / 43.5 / 50.5 s** (on top of Jooble + 4 other provider scrapes), plus the
cold-start penalty above. So even after the login gate is fixed, the heavy screens still
wait tens of seconds — those are the mandatory **skeleton-screen** targets (§0 rule 7):
AtsPage analysis progress, JobsPage recommendations, ResumesPage list, AnalysisPage.

Warm numbers are fine — so the pain is the **cold / gated** path. Four contributors, in
likely order of impact:
1. **Blank-screen session gate on `/login`** — `frontend/project/src/app/router.tsx:77-93`
   (`PublicOnly`, `router.tsx:77-92`): renders `<div className="min-h-screen bg-[#0C0A09]" />`
   (**completely blank, no spinner**, `router.tsx:89`) until `GET /auth/session` resolves.
   If the Render free backend is asleep, that call waits out a cold start while the user
   stares at black. Axios `timeout: 60000` (`lib/api.ts:32`) is the worst case.
2. **Duplicate session calls** — `PublicOnly` (`router.tsx:82`) **and**
   `AuthProvider` mount refresh (`features/auth/AuthContext.tsx:51-53`) both hit
   `/auth/session`; `SessionGuard` adds a third (with a legacy fallback to
   `/latest-resume`, `router.tsx:43`). All must settle before usable UI.
3. **Render free-tier cold starts** — both services spin down when idle:
   static site (`jobhunter-r773`) and backend (`jobhunter-backend`). Backend cold start
   observed today (instance started ≈22:01:43 UTC, `/health` uptime probe).
4. **Render-blocking Google Fonts import** — `frontend/project/src/index.css:1`
   `@import url('https://fonts.googleapis.com/…')` as the *first line of the entry CSS*.
   CSS `@import` blocks rendering until the Google response arrives; on networks where
   `fonts.googleapis.com` is slow (common in IN), first paint waits on it.

### Proposed fix
1. **`PublicOnly`:** replace the empty div (`router.tsx:89`) with a **login-form
   skeleton** (§0 rule 7 — never a blank screen), and render the form immediately — only
   *redirect* after the session check resolves (optimistic render, gate only the redirect).
2. **Skeletize every slow view** (per §0 rule 7): Resumes list, Analysis page, Jobs
   recommendations, ATS progress — shimmer placeholders matching each layout instead of
   blank/spinner states while the 25–50 s backend work runs.
3. **Deduplicate session calls:** one source of truth — `AuthProvider.refresh()` only;
   `PublicOnly`/`SessionGuard` consume context instead of their own `api.get`.
   Remove the `/latest-resume` legacy fallback (`router.tsx:43`).
4. **Timeouts:** per-request timeout for `/auth/session` (e.g., 5–8 s) instead of the
   global 60 s; on timeout treat as guest and render the form.
5. **Fonts:** self-host Fraunces/Inter/JetBrains Mono (Vite `assets/` + `@font-face`) or
   at least `<link rel="preconnect">` + `display=swap` link in `index.html` instead of a
   CSS `@import` chain.
6. **Optional:** Render paid/always-on instance if cold starts remain the dominant cost
   (or keep-alive pings — the repo already has `KEEPALIVE.md` / `005_keepalive.sql`;
   verify what it actually pings and whether it covers the **backend**).

### Verification
- Lighthouse / WebPageTest on `/login` with cold cache: first paint before session
  response; blank-screen duration ≈ 0.
- With backend deliberately asleep: login page still shows the form within ~1 s
  (session check resolves in background, redirect happens when it completes).
- `grep -c "fonts.googleapis" frontend/project/dist/assets/*.css` → 0 after self-hosting.

---

## Issue 4 — Dependency vulnerabilities & deprecated runtime (from Render logs)

**Severity: medium (1 critical, prod-relevant) · Source: Render build/runtime logs + `npm audit`**

> **Status: PARTIAL** — fix 1 done (`2532a45`: backend audit clean, 0 vulns), fix 2 done
> (`f56492a`: frontend 11 → 4 vulns, all remaining are majors). Fixes 3–5 (majors Q6,
> lockfile Q7, `NODE_VERSION` Q5) await user decisions; evidence below is as-of 2026-10-02.

### Evidence (2026-10-02)
1. Render build log: `10 vulnerabilities (4 moderate, 5 high, 1 critical)` after `npm ci`,
   with the standard *"To address all (including breaking changes): npm audit fix --force"*
   hint (do **not** run `--force` blindly).
2. Local `cd backend && npm audit` — and **all 7 are prod-relevant** (`npm audit --omit=dev`
   reports the same set, so none are dev-only):
   | Severity | Package | Advisory |
   |---|---|---|
   | **critical** | `tar` ≤7.5.20 | arbitrary file creation/overwrite via hardlink path traversal |
   | high | `@mapbox/node-pre-gyp` ≤1.0.11 | sits on the `tar` chain |
   | high | `brace-expansion` ≤1.1.20 | quadratic-time CPU DoS (ReDoS-style) |
   | moderate | `express` 4.22.x | fix available |
   | moderate | `body-parser`, `qs` | array-limit bypass / parsing issues |
   | moderate | `ip-address` | `isInSubnet()` cross-family allowlist bypass |
   All 7 show `fixAvailable: true`.
3. **Frontend** — Render static-site build log confirms the same numbers as local
   (`11 vulnerabilities (3 low, 5 moderate, 3 high)`; `cd frontend/project && npm audit`):
   | Severity | Package | Advisory | Fix path |
   |---|---|---|---|
   | **high** | `vite` ≤6.4.2 (repo: 5.4.x) | path traversal in optimized-deps `.map` handling | **major** — `fixAvailable: via vite@8.3.2` |
   | **high** | `brace-expansion` | ReDoS (quadratic expansion) | non-breaking |
   | **high** | `browserslist` ≤4.28.6 | unbounded memory growth → OOM | non-breaking |
   | moderate | `react-router` + `react-router-dom` ≤7.17 | open redirect via backslash in `<Link>`/`useNavigate` (CVE-2025-68470 bypass) — **user-facing** | **major** — `via react-router-dom@7.18.4` (6 → 7) |
   | moderate | `esbuild` ≤0.24.2 | dev server accepts requests from any website | **major** (bundled with vite 8) |
   | moderate | `@vitejs/plugin-react` ≤4.3.3 | toolchain | non-breaking |
   | moderate | `@humanfs/node` <0.16.8 | recursive copy follows symlinks (eslint toolchain) | non-breaking |
   | low | `eslint` 9.10–9.26 · `@eslint/plugin-kit` · `postcss-selector-parser` | ReDoS / AST-recursion DoS (lint-only) | non-breaking |
   Runtime-relevant for users: `react-router-dom` (open redirect). `vite`/`esbuild` are
   build/dev-time only (not shipped), but keep them patched — CI/dev machines run them.
4. **Frontend Render specifics (from the static-site log):**
   - Node **24.14.1 (default)** — frontend service sets no `NODE_VERSION`
     (`render.yaml:117-122` only has `VITE_*`) → fine (matches local); **backend stays on
     20.11.0** — see evidence below.
   - Render runs its default **`bun install` first, then `npm ci`** (buildCommand) →
     double install, and bun printed **"Saved lockfile"** — i.e. the tracked `bun.lock`
     was stale vs `package.json` at deploy time. **Both** `bun.lock` and
     `package-lock.json` are committed → two lockfiles drift; builds are not fully
     reproducible (bun resolved `vite@5.4.8` while npm ci uses the npm lock).
   - Harmless noise: Rollup `@__PURE__` annotation warnings from `node_modules/zod`
     (comment placement); build still succeeds (2.78 s, bundle 459 kB / 138 kB gzip).
5. **Runtime deprecations in the Render logs:**
   - `NodeVersionSupportWarning` (AWS SDK v3): **node ≥ 22 required from Jan 2027**;
     Render backend runs `20.11.0` (`render.yaml:26-27`); local dev runs **v24** — version
     skew between test and prod.
   - `⚠️ Node.js 20 and below are deprecated … @supabase/supabase-js` — supabase-js will
     drop Node < 22 support.
   - (Harmless but noisy: `WEB_CONCURRENCY=1` default notice.)

### Proposed fix (separate commits, after Issue 1)
1. **Backend audit (non-breaking):** `cd backend && npm audit fix` (review the diff) →
   build + tests + browser E2E (§0) → **commit**. Re-run `npm audit`; if majors remain
   (e.g. express 5), list them here as accepted/follow-up — never `audit fix --force`
   without a review.
2. **Frontend audit (non-breaking first):** `cd frontend/project && npm audit fix` →
   fixes `brace-expansion`, `browserslist`, `@humanfs/node`, `@vitejs/plugin-react`,
   `eslint`/`@eslint/plugin-kit`, `postcss-selector-parser` → `npm run build` + browser
   E2E → **commit**.
3. **Frontend majors (own commits, each with full browser E2E):**
   - `react-router-dom` 6 → **7.18.4** (open-redirect CVE + route API changes —
     retest every route/guard: PublicOnly, SessionGuard, nested `/app` children);
   - `vite` 5 → **8.x** (pulls patched `esbuild`; rebuild + compare `dist/` output, check
     the zod/Rollup warnings still benign). If either major proves too risky, document it
     here as an accepted risk with a re-test date instead of forcing it.
4. **Lockfile single-sourcing:** pick **one** package manager — recommended: keep
   `package-lock.json`, set `installCommand: npm ci --include=dev` on the frontend service
   in `render.yaml` (stops Render's default `bun install` + "Saved lockfile" drift), then
   either delete `bun.lock` or regenerate it in the same commit if bun is still wanted
   locally. Verify the next deploy installs exactly once.
5. **Runtime bump:** `render.yaml:27` `NODE_VERSION: 20.11.0 → 22` (or 24 to match local),
   add `"engines": { "node": ">=22" }` to `backend/package.json` and
   `frontend/project/package.json` → redeploy → **verify both deprecation warnings are
   gone** from the logs and all flows still work → **commit** (blueprint + engines together).
6. **Verification:** backend/frontend `npm audit` → 0 critical/high (or accepted risks
   documented above), Render logs free of the Node-20 deprecation warnings, deploy log
   shows a single install, browser E2E green.

---

## 5. Secondary findings (fix alongside the above)

| # | Finding | Where (current @ HEAD) | Suggested fix | Status |
|---|---|---|---|---|
| S1 | 13 of 14 resume rows point at files that no longer exist (ephemeral disk) → download 404, re-analysis failed. **Live proof in prod logs:** `readiness error Error: Local file not found: /opt/render/project/src/backend/uploads/hc/test.pdf` (hand-crafted test row — path lacks the `<userId>/<resumeId>/` prefix — since deleted) | `resumes.ts:213`, `analyses.ts:45-64`; rows: all `storage_bucket='local'` | After Issue 1 fix: migration/backfill to re-upload any recoverable bytes; for unrecoverable rows mark `processing_status='lost'` and UI: "re-upload required" instead of 500/404 | **Partial** — lost-file UX done (`8e4b127`: analysis on a missing file → **410** + re-upload copy, live-probed; download already 404s with resume-view copy). Backfill/'lost' marking waits on Issue 1 |
| S2 | Orphaned storage object: `resumes/301b4e73-…/1769d56b-…/hc_resume.pdf`, 1,396 bytes, created 2026-10-02 19:50:13 UTC; owner not in `users`, no `resumes`/`analyses` rows | Supabase bucket | **Ask user before deleting** (likely test artifact of the previous sweep, but it's the file in their screenshot). Then: add a periodic orphan sweep (storage objects with no matching `resumes.storage_object_path`) | **Open** (Q2 — needs user go-ahead) |
| S3 | PDF parsed twice per upload (page count + profile) | `resumes.ts:61` (parse) → `:117` (reuse) | Parse once, reuse `parsed` | ✅ `d2d36b7` |
| S4 | `loadResumeBuffer` fallback did `fs.existsSync(path)` on a *relative* object path — never matches | `analyses.ts:45-64` (fallback removed) | Remove or resolve against `localUploadsDir()` | ✅ `8e4b127` (removed; `downloadFile` already resolves local paths; missing bytes now tagged `STORED_FILE_MISSING` → 410) |
| S5 | Resume delete cleans storage only for bucket≠local; for `bucket='local'` rows on Render it silently no-ops on missing file (fine) but leaves **no** way to clean real Supabase orphans if bucket was misrecorded | `resumes.ts:179` (already deletes by the recorded bucket) | After Issue 1: delete by recorded bucket; orphan sweep (S2) as backstop | **Open** (nothing meaningful until Issue 1 fixes bucket recording; sweep = S2) |
| S6 | Docs claim green: README "2026-10-02 green sweep" while prod storage is broken | `README.md` (status section), `SYSTEM_DESIGN.md` §17 | Re-verify & update **in the same commit** as the fixes | ✅ this docs commit — README audit note + `SYSTEM_DESIGN.md` §17 |
| S7 | `SessionGuard` legacy fallback `GET /latest-resume` can mark a user "authed" on a 200 from an unrelated endpoint | `router.tsx:62-70` (fallback removed) | Drop fallback; rely on `/auth/session` 401 → guest | ✅ `165d7ba` |
| S8 | Startup banner printed `💾 Database: Not configured` while the DB was actually connected (it checked only `DATABASE_URL`; the app connects via `PG_DATABASE_STRING`) | `server.ts:114-127`, `env.ts:67-69` | Use `getDatabaseUrl()` presence (or the pool) for the banner; print a masked DSN source instead of a misleading status | ✅ `c675764` — banner prints `configured via PG_DATABASE_STRING` (source name only, never the DSN); live-verified |

---

## 6. Orphan inventory (as of 2026-10-02 22:31 UTC)

- **Storage:** exactly one folder, `resumes/301b4e73-eeb7-4501-b981-eba4be5c4766/`
  → `1769d56b-…/hc_resume.pdf`, 1,396 B, created 2026-10-02T19:50:13Z.
  `301b4e73-…` does **not** exist in `users`; no `resumes` or `analyses` rows reference it.
  (Not deleted by us — pending user confirmation, S2.)
- **Local disk:** `backend/uploads/` holds 3 files, all for user `37de4290-…` (Sep 22–23);
  the other 11 historical rows' bytes are gone (S1).
- **DB:** no orphan rows found; all investigation test data removed (§7).

---

## 7. Investigation test data — cleanup log (verified)

| Test | Created | Removed |
|---|---|---|
| Render signup/login/upload/analysis (`qa.e2e.1790979078@…`, user `8df327f9-…`, resume `fc1767ac-…`, analysis `0b8eeb02-…`) | 22:11 UTC | `DELETE /resumes/fc1767ac…` (cascades analyses/profiles) + `DELETE /rest/v1/users?id=eq.8df327f9…` |
| Local signup/upload (`qa.local.1790979777@…`, user `cb95d000-…`, resume `ae893a43-…`) | 22:22 UTC | `DELETE /resumes/ae893a43…` (removes Supabase object too) + `DELETE /rest/v1/users?id=eq.cb95d000…` |
| Render re-probe after logs (`qa.v3.*@example.com`, user `c7b4e1d9-…`, resume `037f616d-…`) | 22:31 UTC | `DELETE` by `user_id` on `resumes`/`sessions` (204) + `DELETE /rest/v1/users?id=eq.c7b4e1d9…` (204); analysis list `[]` |

Final verification (all empty for the three test users):
```
users/resumes/analyses/sessions filtered by
  8df327f9…, cb95d000…, c7b4e1d9…            → [] each
storage bucket root list                      → ['301b4e73-…']  (pre-existing, §6)
overall counts (owner's real data, untouched): users 15, resumes 13, analyses 24, sessions 30
```
Local backend process stopped. No secrets committed; `.env`, cookies, and test artifacts
lived only in `/tmp/opencode/jh/`.

---

## 8. Execution order (when fixes start)

**§0 applies to every step: small commits · local-first · browser-E2E green before push.**

1. ⏳ **Render triage for Issue 1** (Environment check + log grep `supabaseStorage` around
   22:11/22:31 UTC) → apply fixes 1.2–1.6 → redeploy → rerun upload probe
   (assert `storage_bucket='resumes'` + object visible in bucket) → **commit**.
   *Blocked on Q1 (dashboard access).*
2. ✅/⏳ **Issue 4 (deps/runtime):** backend `npm audit fix` → **done** (`2532a45`, 0 vulns);
   frontend `npm audit fix` (non-breaking) → **done** (`f56492a`, 11 → 4);
   frontend majors (`react-router-dom@7`, `vite@8`) → *open, Q6*; lockfile
   single-source (`installCommand: npm ci`, bun.lock decision) → *open, Q7*;
   `NODE_VERSION` 22 + `engines` → *open, Q5*.
3. ✅ **Issue 2 (resume view):** `/app/resumes/:id` route + resume view (report if analyzed,
   card+Download+Analyze CTA if not) + `?resumeId` on AtsPage + backend `resumeId` filter
   + error-status/copy fixes → **done** (`30933e9`, `9a58578`); browser test: Resumes →
   View (analyzed → report; un-analyzed → resume card → Analyze without re-upload) →
   unknown id → friendly "Resume not found" → **E2E 18/18 green** (`8a7b506`, re-run
   `0ba71a1`).
4. ✅ **Issue 3** (login skeleton, session dedupe, fonts, **skeletize all slow views**) →
   **done** (`165d7ba`); browser test: cold-ish `/login` shows form immediately, no blank
   screen → **E2E 2/2 green** (`0ba71a1`).
5. ✅ **S1–S8 + docs** — banner fix (S8 `c675764`), lost-file UX (S1 partial `8e4b127`),
   S3 `d2d36b7`, S4 `8e4b127`, S7 (in `165d7ba`), README/SYSTEM_DESIGN re-verify (S6),
   full file:line re-check of this plan → **this commit**. S2/S5 await Issue 1 + Q2.
6. ✅ **Per-commit gates:** `cd backend && npm run build && npm test` (23/23 each time) ·
   `cd frontend/project && npx tsc --noEmit && npm run build` · local feature run (§0 rule 4) · scripted
   browser suite (§0 rule 5: 18/18 + 2/2) · live curl probes from Issues 1–2.
   **Push only when green — not pushed yet (Issue 1 open).**

## 9. Open questions for the user

1. **Render (two quick checks for Issue 1):** (a) *Environment* tab — are `SUPABASE_URL`
   and `SUPABASE_SERVICE_ROLE_KEY` set, and does the URL start with `https://`?
   (b) *Logs* — grep `supabaseStorage` around **22:11 & 22:31 UTC** (my two test uploads).
   Either answer decides the last unknown (table in Issue 1).
2. **Orphan file (S2):** delete `resumes/301b4e73-…/hc_resume.pdf`, or is it yours?
3. **Screenshot account:** your screenshots show resume records, but `301b4e73-…` (from
   your signed URL) has no rows in the DB — which login was the app using? (Determines
   whether your real account's data is among the 14 `local` rows.)
4. **Keep-alive:** is the backend on Render asleep often? If yes, decide whether to rely
   on `KEEPALIVE.md`'s cron or upgrade the instance (dominant factor in Issue 3).
5. **Node version for Issue 4:** bump Render to **22** (minimum for both deprecation
   warnings) or **24** (match your local machine)?
6. **Frontend majors (Issue 4 fix 3):** go to `react-router-dom@7` + `vite@8` now (with
   full E2E), or ship non-breaking fixes first and schedule majors separately?
7. **Package manager (Issue 4 fix 4):** recommended — Render installs with
   `npm ci` only (set `installCommand`), and we drop/regenerate the stale `bun.lock`.
   Keep bun as your local runner anyway?
