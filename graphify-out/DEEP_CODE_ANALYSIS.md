# jobhunter_ — Knowledge Graph + Deep Code Analysis

Date: 2026-11-04
Method: graphify graph first (structure), then **manual reading of source code** as the only
source of understanding. Documentation was ingested as graph nodes but never used to derive
behavioral claims below — every statement is backed by a file read.

---

# Part 1 — Knowledge Graph Deliverable

## Pipeline results
| Stage | Result |
|---|---|
| Detection | 210 files (185 code, 25 docs), 193,267 words |
| AST extraction | 1,228 nodes / 2,966 edges |
| Semantic extraction | 25 docs via 2 parallel subagents (139+113 nodes, 199+124 edges, 6 hyperedges) |
| Merge + graph build | **1,531 nodes, 3,193 edges, 104 communities** |
| Outputs | `graphify-out/graph.html`, `graph.json`, `GRAPH_REPORT.md`, `.graphify_labels.json` (all 104 community labels manual) |
| Benchmark | ~1,966 tokens/query vs raw corpus — 131.1x reduction |

Extraction warnings (graph limitations, not code issues): 13 `.sql` files skipped (no
`tree_sitter_sql`), `frontend/project/src/pages/AnalysisPage.tsx` AST error at line 881,
17 code files yielded no symbols.

## God Nodes (core abstractions)
1. `rankJobsBatch()` — 27 edges (the live scoring engine)
2. `ResumeAnalyzerML` — 24 (Python ATS engine)
3. `NormalizedJob` — 24 (provider contract)
4. `express` — 23, `pool` — 22 (infra hubs)
5. Frontend hubs: `Icon()`, `Eyebrow()`, `Button()`, `react`

## Hyperedges (group relationships)
- Recommendation retrieval, scheduling and ranking pipeline (query planner → wave executor → ranking discrimination)
- Alternative implementations of the EmbeddingProvider contract (SageMaker / local / mock)
- Concept → Implementation map (20 concept docs ↔ code)
- Keepalive subsystem preventing Supabase 7-day pause

## Knowledge gaps
- 115 isolated nodes (mostly docs with no code linkage)
- No import cycles detected

---

# Part 2 — How the System Actually Works (from code)

## 1. Routing map (verified in `server.ts`)
```
/api        → upload, analysis (legacy), jobs (legacy), auth
/api/v1     → auth, resumes, analyses, profile, recommendation-runs, recommendations, keepalive  (CSRF-protected)
Python Flask :5000 → /api/ml/* and /api/analyze-* (called by backend via analysisService)
```

## 2. Resume parsing (`modules/parsing/`)
- `resumeProfile.ts` (`PROFILE_VERSION 5.2.0`): builds `ResumeProfile` — normalized skills,
  declared vs demonstrated skills (demonstrated = appears in experience bullets, not just a
  skills list), months of experience via `unionMonths`, seniority from newest role titles
  else years-of-experience.
- `skillExtractor.ts`: longest non-overlapping alias spans + case-sensitive patterns
  (`REST`, `Go`, `TS`, `Express`, `C`), `ambiguousShortWords` guard.
- `skillNormalizer.ts`: `CANONICAL_SKILL_ALIASES` → canonical skill names
  (this is why `Java` never matches `JavaScript`).

## 3. Semantic vs keyword mechanics (the heart of the system)

**Embedding stack** (`providers/embeddings/`):
- `embedCached()` — pinned model identity cache; SageMaker / local Sentence-BERT / mock.
- Throws on mock or mixed-model/mixed-dimension vectors (guardrail against fake semantics).
- `MockEmbeddingProvider` — SHA256-derived 384-dim deterministic vectors: **not semantic**.

**Normalization** (`ranking.ts:92 to01()`): raw cosine is remapped piecewise —
`≤0.25 → 0`, `0.25–0.50 → 0–0.40`, `>0.50 → 0.40–1.0` — because sentence embeddings cluster
0.4–0.8 even for unrelated text. All semantic decisions downstream use this stretched value.

**Keyword path (always available):** exact normalized skill-set intersection via
`matcher.ts` — allOf/anyOf requirement groups, 70% required + 30% preferred coverage.

**Semantic path:** each JD skill is compared against job-description chunks and resume
chunks; `bestSim >= 0.40` (stretched) ≈ raw cosine ≥ 0.50 counts as a match. Matched
semantic skills are injected into `effectiveSkills` before `matchJd()` runs, so semantic
findings widen the deterministic matcher's input.

**Fallback:** if embeddings are unavailable, scoring degrades to keyword-only
(`scoreDetails.semanticStatus === 'keyword-only'`, surfaced in the UI).

## 4. The four scoring surfaces (must not be confused)

### A. Fit Score — `modules/jobs/ranking.ts` (`VERSION 5.0.0`) — LIVE recommendations
Weighted to 100:
| Component | Points |
|---|---|
| Required skill coverage | 30 (18 if JD descriptionQuality ≠ 'full') |
| Responsibility semantic coverage | 25 |
| Role/title alignment | 15 |
| Seniority fit | 15 |
| Domain / education | 10 |
| Location / work-mode | 5 |

Then: minus `seniorityPenalty` (matrix in `seniority.ts`), then caps:
- entry→senior mismatch cap 35/25, experienced→intern caps
- thin-evidence cap 55
- final `fitScore < 20` jobs are dropped in the route.

Responsibility 25: per-responsibility best resume-chunk cosine; `coverageRatio*0.70 +
min(1, avg/0.55)*0.30` scaled to 25. If no responsibilities parsed: top-3 chunk-vs-jobDesc
alignment / 0.55 × 25.

Skill 30: structured JD → `matchJd().overallScore/100 × (30|18)`; unstructured →
`matched/jobSkills × 18` (or ×15 when ≤2 skill signals).

### B. ATS Readiness — `modules/ats/readinessScorer.ts` (`VERSION 4.2.0`) — NO-JD report
Rule-based, 8 categories summing to exactly 100 (asserted at runtime):
parseability 20, completeness 15, impact 20, experience quality 15, skills 10,
writing 10, concision 5, hygiene 5. Exposed at `POST /api/v1/analyses/readiness`.

### C. JD Rubric — `modules/analysis/jdRubric.ts` (`VERSION 3.1.0`) — inside `/jd-match`
explicitMustHave 35 + responsibilitySemantic 30 + roleAlignment 15 + domain 10 + education 10;
eligibility ∈ {eligible, uncertain, ineligible}. Responsibility evidence threshold:
cosine ≥ 0.45 (in `routes/v1/analyses.ts`).

### D. Python ML — `backend/python/` — legacy `/api/analyze*` only
- `resume_analyzer_ml.py` hybrid ATS (v3.0): ML semantic 20 (vs 10 ideal sentences, ×22) +
  formatting 28 + content 24 + skills 18 + education 10 + language 8 + length 2,
  bonuses +4 / penalties −35; rule-based fallback.
- `job_matcher_ml.py`: Sentence-BERT
  `anass1209/resume-job-matcher-all-MiniLM-L6-v2` (fallback `all-mpnet-base-v2`);
  cosine → piecewise score (snippet vs full-description curves differ) + ATS contribution
  (10/15) − seniority penalty (0–50); match levels 80/65/50/35.

## 5. Recommendation run pipeline (`routes/v1/recommendations.ts`)
```
cached-run/idempotency check
→ ownedProfile (resume → buildResumeProfile)
→ roleSuggestions (LLM role discovery, roleDiscovery.ts 2.2.0, deterministic fallback)
→ JobQueryPlanner.plan (≤3 distinct queries, excluded roles, VERSION 4.0.0)
→ multi-provider retrieval: jooble/jobspipe/adzuna/remotive/arbeitnow
   retrievalVersion 9; budget/cache; wave scheduler (retrievalExecutor: global 4,
   per-provider 1, max 18 calls, 25s deadline, jobspipe cursor loop detection)
→ content-hash/dedup (jobStore.stripHtml, canonicalJobUrl, deduplicateJobs)
→ closure URL/pattern filters → eligibleJob gates (eligibility.ts blocker/uncertain/eligible)
→ rankJobsBatch (fit score above)
→ sort/compare → checkJobsAvailability (max 20, SSRF-safe fetch + JSON-LD JobPosting)
→ rescore newly enriched full JDs → verifySemanticAvailability (closure/active anchor
   embeddings, cosine ≥ 0.62; mock path = regex only)
→ drop closed / fitScore<20 / ineligible
→ persist ≤200 rows with breakdown + evidence + eligibility (recommendationPersistence.ts)
```
Cache validity: `ranker_version` + `profile_version` must match, max age
`min(5 min, daysPosted/4 days)`.

## 6. Where each score is displayed (frontend)
- `JobsPage.tsx` → live run results: `fitScore ?? matchScore`, plus full `scoreDetails`
  (seniority penalty, score caps, `keyword-only` banner, skill evidence, responsibility matches).
- `AtsPage.tsx` → `POST /analyses/readiness` (surface B).
- `AnalysisPage.tsx` → readiness + jd-match breakdown, responsibility evidence, gaps.
- `ResumeViewPage.tsx` / `ResumesPage.tsx` → Resume Health score ring (readiness).
- `Home.tsx` → **still calls legacy `/api/jobs/recommendations` (now 410)** and shows
  `matchScore` (surface D).

---

# Part 3 — Flagged Potential Issues

### Critical / functional
1. **`Home.tsx:281` calls a dead endpoint.** `GET /api/jobs/recommendations` returns
   `410 RECOMMENDATIONS_MOVED` (`routes/jobs.ts:104,120`), yet `Home.tsx` still fetches it and
   renders `response.data.recommendations` / `job.matchScore`. The home recommendation feed
   cannot work; JobsPage is the only live path.

2. **Fabricated `rawCosine` inflates responsibility coverage** — `ranking.ts:388-389`:
   ```ts
   const rawCosine = best ? Math.max(-1, Math.min(1, best * .6 + .35)) : 0;
   const supported = Boolean(bestChunk && (best >= 0.40 || rawCosine >= 0.48));
   ```
   `best` is already `to01()`-stretched (`pairScore`, line 249), and `to01` is **piecewise**,
   so `best*.6+.35` is not a valid inverse. `rawCosine >= 0.48` ⇔ `best >= 0.2167` ⇔ raw
   cosine ≥ ~0.385 — so `supported` is effectively `best >= 0.2167`, far weaker than the
   intended "raw cosine ≥ 0.48". Given embeddings cluster 0.4–0.8 for unrelated text,
   **nearly every responsibility counts as supported**, inflating the 25-point component.
   The emitted `rawCosine` field is also mislabeled (not a raw cosine).

3. **Evidence source mislabeled as `demonstrated`** — `ranking.ts:321-331`: `source` starts
   `'unverified'` but the final fallbacks at lines 327 and 329 end in `: 'demonstrated'`,
   so a skill found in *neither* the declared nor demonstrated set is reported as
   demonstrated evidence. (Line 353 does it correctly — inconsistent within the same file.)

### Architectural / consistency
4. **Four parallel scoring systems with no single authority.** fitScore (5.0.0),
   readiness (4.2.0), jdRubric (3.1.0), Python hybrid ATS (v3.0) + job_matcher — all labeled
   "score"/"ATS" in UI copy but computed with different methods, thresholds and versions.
   A user sees "Resume Health" (B) on one page and Python ATS (D) on the legacy page.

5. **Dead Python job-matching path.** `joobleService.getRecommendedJobs` →
   `calculateMatchScore` → `/api/ml/batch-match-jobs` has **no callers** from any route
   (legacy routes return 410). `job_matcher_ml.py` (1,052 lines) is unreachable in
   production; likewise `analysisService.old.ts`.

6. **Mock embeddings are non-semantic by construction.** `MockEmbeddingProvider` derives
   vectors from SHA256 — any "semantic" threshold (0.40, 0.45, 0.62) evaluated against mock
   vectors is meaningless. `embedCached` throws on mock/mixed vectors, and
   `availability.verifySemanticAvailability` drops to regex-only on mock, but
   `ranking.ts` keyword-only degradation path must be relied on to keep outputs honest.

7. **Skill-score ceiling changes silently with JD structure/quality.** The "30-point"
   component is really 30/18/15 depending on `requirementGroups`, `descriptionQuality`
   (`ranking.ts:345,364,370-371`) — two jobs with identical skill coverage can be scored on
   different scales, distorting cross-job comparison.

8. **Threshold drift across surfaces:** responsibility evidence uses cosine ≥ 0.45 in
   `analyses.ts` but `best >= 0.40` (stretched) in `ranking.ts`; skill semantic match is
   `bestSim >= 0.40`; availability closure is ≥ 0.62. No shared constant documents the
   intended raw-cosine equivalents.

### Minor / hygiene
9. **`deduplicateJobs` O(n²) scan** (`jobStore.ts:65`): linear `find` over all prior entries
   per job — fine at ≤ hundreds, risky if retrieval volume grows.
10. **`storeJobsToDb` swallows all per-row errors** (`jobStore.ts:169`) — silent data loss.
11. **Debug `print()` with emoji in `app.py:293-294`** and `debug=True` Flask server bound to
    `0.0.0.0:5000` — not production-safe.
12. **Graph extraction gaps:** 13 `.sql` files invisible to the AST layer;
    `AnalysisPage.tsx` syntax error at line 881 (worth checking — may be a real parse issue
    in the source file); 115 isolated doc nodes.
13. **`recommendationCacheValid`** derives `maxAge` from `daysPosted` but the formula
    `daysPosted*86400000/4` vs the `5 * 60 * 1000` min-cap means cache is effectively
    ≤5 minutes in all realistic cases — the `daysPosted` term is dead weight.
