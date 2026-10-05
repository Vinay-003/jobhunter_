# JobHunter prototype integration — 2026-10-05

## Result

Integrated `jobhunter-ui-prototype-mobile-drag-v6.zip` on `dev`. Read its implementation prompt, README, design system, plan, route matrix and QA report before implementation. The supplied visual system is now used by every active public and authenticated route. React Router, session authentication, API contracts, PDF storage, scoring and job-provider implementation remain in place.

The ZIP's router, mock user/job fixtures, generated screenshots and dependencies were not installed into the application. Existing production functionality takes precedence over the prototype's demo inventory.

## Design and integration

- Shared theme-aware `UI`, `Icon`, `DragReturn`, public auth/legal layouts and authenticated navigation.
- Persistent dark/light preference, system fallback, Manrope/DM Sans typography and correct JobHunter document title.
- Four independently draggable hero layers, draggable sample/auth previews, desktop pinned three-scene story, mobile native-scroll motion and two-tap touch dragging. Reduced-motion and short-desktop fallbacks stay readable.
- Action-first Resume Health/Tailored Match input; custom keyboard-operable career selector, real PDF/JD validation, stored-file reuse and removable file selection.
- Distinct Health/Match reports; expandable editorial priorities and rubric rows; keyboard tabs; saved evidence, all recorded strengths/warnings/metrics, qualification safeguards, Markdown copy/download and print/PDF.
- Jobs use a selectable list/detail rail, mobile detail navigation, real multi-role search, freshness/location filters, ranking evidence, persisted pagination, availability recheck, closure reporting and match-report copy.
- Resume library/detail include actual scores and histories, authenticated byte-identical PDF download, confirmed deletion, missing-file recovery and reanalysis links.
- Profile preserves all seven preference fields, adds the already-supported display-name update, reset/save feedback, logout/all-device logout and confirmed latest-resume deletion. Unsupported notification and saved-job controls were not invented.
- Marketing and jobs are lazy-loaded; the largest production JS chunk is approximately 469 kB (144 kB gzip), with no chunk-size warning.

### Integration defects found and corrected

1. Auth input accessible names included decorative glyphs/button text; explicit labels now isolate the intended names.
2. Session refresh unmounted an authenticated profile form, losing save feedback. The initial guard still blocks; background refresh preserves the mounted form.
3. Existing 401 handling redirected public legal/404 pages to login. Redirects now apply only to protected `/app` routes.
4. Decorative hero orbits intercepted pointer input. They no longer participate in hit testing.
5. A closed mobile sidebar could expose overflowing identity text. It is hidden/inert to pointer input when closed and wraps long identities.
6. Short desktop windows received hidden scenes despite normal-flow CSS. JavaScript now follows the same fallback.
7. Shared select focus initially fell through from the selected option to the first option. Keyboard focus and dismissal are now predictable.
8. Job controls retained browser-default surfaces; they now use the blue role-fit system, open evidence rows and theme-aware text.
9. Resume-fetch errors on Jobs were presented as an empty account. They now show a retryable error.
10. Report navigation resets its saved view and tab state, preserves fractional score display, and retains production-only signals in progressive disclosure.

## Actual verification

The complete browser suite passed against both the Vite development server and the built production preview, using an isolated PostgreSQL cluster, synthetic PDF/accounts, real API handlers and the actual local embedding model.

| Check | Result |
|---|---|
| Backend `npm run build` | Pass |
| Backend `bun test` | 142 pass; 3 opt-in entries skipped in normal run |
| `RUN_LOCAL_MODEL_TESTS=1 bun test src/tests/localEmbeddings.integration.test.ts` | 2 real-model tests pass; normal-run skipped model coverage exercised |
| Frontend `npx tsc --noEmit` | Pass |
| Frontend `npm run lint` | 0 errors, 7 nonblocking warnings in existing mixed-export/legacy hook patterns |
| Frontend `bun test tests` | 3 pass |
| Frontend `npm run build` | Pass |
| `UI_REDESIGN_ISOLATED=1 python3 e2e/ui_redesign_acceptance.py` | 357 checks pass, including production preview |
| `python3 e2e/ui_redesign_motion.py` | 65 checks pass, including production preview |
| `git diff --check` | Pass |

The initial attempt to run the frontend Bun tests using Node failed because they import `bun:test`; rerunning with their actual Bun runner passed. Failed intermediate browser checks were fixed and the entire suite rerun, not waived.

### Browser/API coverage

Signup and login, password visibility, CSRF rejection, owner isolation, real PDF upload, file-type/size and JD validation, deterministic Health reconciliation, real local-model Tailored Match, exact saved-report copy parity, Markdown export, print output, byte-identical authenticated PDF downloads, report tabs/disclosures, actual analysis history IDs, profile persistence/reset, job-role discovery, 25 ranked fixture jobs, all stored pagination rows, list filtering/recovery, mobile detail navigation, availability recheck, closure persistence, invalid IDs/pagination, missing reports/resumes, retryable errors, structured report loading, deletion cascades, logout and all-device session revocation.

Active `/api/v1` endpoint families exercised: `csrf`, `health`, `keepalive`, `auth/signup`, `auth/login`, `auth/session`, `auth/logout`, `auth/logout-all`, `profile` GET/PATCH, `profile/job-preferences` GET/PUT, `resumes` GET/POST, `resumes/:id` GET/DELETE, `resumes/:id/download`, `analyses` GET, `analyses/:id` GET, `analyses/readiness`, `analyses/jd-match`, `recommendation-runs/roles`, `recommendation-runs` POST, run GET/results pagination, availability and report-closed POST.

Some 503/404 UI states were deliberately browser-fault-injected; these are not represented as successful live endpoint calls. Successful application workflows used the real local API/database, not browser response mocks.

## Route audit

All listed surfaces received dark/light layout checks at **360×800, 390×844, 768×1024, 1024×768, 1280×800, 1366×768, 1440×900, 1536×864, 1680×1050, and 1920×1200**, at normal browser zoom: 260 route/theme/viewport combinations, zero horizontal-overflow failures. Representative screenshots were inspected, not just measured. Public-route assertions additionally verify that the URL does not silently redirect.

| Route | Desktop/mobile | Loading coverage | Empty/error coverage | Real API | Legacy presentation |
|---|---|---|---|---|---|
| `/` | Both themes | Lazy route renders | Reduced-motion/short-height fallbacks | Not needed | Replaced |
| `/login` | Both themes | Real submission | Required-field validation, signed-out guard | Yes | Replaced |
| `/signup` | Both themes | Real submission | Existing validation retained | Yes | Replaced |
| `/privacy` | Both themes | Static | Public access confirmed | Not needed | Replaced; legal copy preserved |
| `/terms` | Both themes | Static | Public access confirmed | Not needed | Replaced; legal copy preserved |
| `/app/ats` | Both themes | Real upload/analysis chain | Missing file, wrong type, oversize, short JD | Yes | Replaced |
| `/app/analysis/:id` Health | Both themes | Skeleton explicitly asserted with delayed read | Missing report; disclosure/evidence/method | Yes | Replaced |
| `/app/analysis/:id` Match | Both themes | Real model completion and reload | JD validation; saved qualifications retained | Yes | Replaced |
| `/app/jobs` | Both themes; populated desktop/mobile detail additionally checked | Role discovery and ranking exercised | Filtered empty state, resume API failure/retry | Yes | Restyled; some existing utility classes retained |
| `/app/resumes` | Both themes | Read exercised; library skeleton not separately delayed | Empty account and post-deletion empty | Yes | Replaced |
| `/app/resumes/:id` | Both themes | Read exercised | Missing resume, confirmation cancel/delete | Yes | Replaced |
| `/app/profile` | Both themes | Save/read exercised | Injected API failure/retry, reset, saved feedback | Yes | Replaced |
| Unknown route | Both themes | Static | Branded recovery, no silent redirect | Not needed | Replaced |

Motion checks use actual Chromium mouse input and touch input in a newly launched test browser. They verify spring return, first-tap arming, second-touch dragging, ordinary swipe scrolling, card bounds, three desktop crossfade checkpoints, mobile scene readability and Privacy→CTA spacing. Static ZIP screenshots were not treated as proof of the integrated app.

## Boundaries and remaining caveats

- This verifies the active UI's endpoint contract locally, **not every legacy/deprecated backend route**, and not a deployed Render/Vercel environment.
- Provider results were explicitly synthetic **provider-cache fixtures**. Parsing, role fallback, local embeddings, ranking, database persistence and pagination were real. Live Jooble/Adzuna/JobsPipe/Remotive/Arbeitnow calls, APINEX availability, AWS SageMaker and Supabase-hosted storage were not revalidated or billed by this run.
- The isolated stack used the supported local development file-storage adapter. No existing user account or shared production record was modified.
- Evidence displays recorded checks/excerpts when the API lacks full parsed sections. It does not fabricate PDF-coordinate annotations, scores, hiring probabilities, notifications or saved jobs.
- Automated browser execution was Chromium; no Safari/Firefox or physical-device claim is made.
- Existing lint warnings remain nonblocking. No tests or lint rules were weakened.
- Inactive legacy files remain in the repository for compatibility; they are not routed into the redesigned application. The supplied stylesheet is retained as a reference-derived base with scoped production extensions.

## Reproduce safely

Do not aim the acceptance suite at a shared database. Its API/frontend/database ports and test database role are deliberately fixed. Dependencies are the project's installed Node/Bun toolchain plus Python Playwright and ReportLab, Chromium, PostgreSQL 16 and the existing local model venv.

1. Create `/tmp/opencode/jh-redesign-check`, initialize an isolated PostgreSQL data directory there with role `redesign`, and listen only on `127.0.0.1:55433`.
2. Build the backend and migrate using explicit `PG_DATABASE_STRING=postgresql://redesign@127.0.0.1:55433/postgres PG_SSL=false`.
3. Start `backend/dist/server.js` with **working directory `/tmp/opencode/jh-redesign-check`** (so the real backend `.env` is not loaded), `PORT=3002`, the explicit isolated DB URL, `NODE_ENV=development`, a generated ephemeral `JWT_SECRET`, `CORS_ALLOWED_ORIGINS=http://localhost:5174`, `FRONTEND_URL=http://localhost:5174`, `EMBEDDING_PROVIDER=local`, `PYTHON_PATH=<repo>/backend/python/venv/bin/python`, and `JOB_PROVIDERS=jooble`. Do not supply provider/cloud credentials.
4. In `frontend/project`, run:

```sh
VITE_API_BASE_URL=http://localhost:3002/api/v1 npm run build -- --outDir /tmp/opencode/jh-redesign-check/frontend-dist
npm run preview -- --outDir /tmp/opencode/jh-redesign-check/frontend-dist --host 127.0.0.1 --port 5174 --strictPort
```

5. From the repository:

```sh
UI_REDESIGN_ISOLATED=1 python3 e2e/ui_redesign_acceptance.py
python3 e2e/ui_redesign_motion.py
```

Raw synthetic screenshots/check receipts stay in `/tmp/opencode/jh-redesign-check/`, outside git. The uploaded ZIP and unrelated `artifacts/browser-acceptance/` files are not part of this change. The local preview is `http://localhost:5174`.
