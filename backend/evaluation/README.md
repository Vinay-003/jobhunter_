# Evaluation Framework (Placeholder)

Small offline evaluation for ATS, JD match, and job ranking.

## ATS fixtures

Located conceptually in `backend/src/tests/readiness.test.ts` and manual fixtures:
- entry-level single-column (expect high readiness)
- senior resume (longer char count still ok)
- two-column risk (should score lower)
- missing skills/education
- scanned PDF (should be rejected, not scored)

## JD match evaluation

`jdMatch.test.ts` covers:
- Java vs JavaScript strict matching
- alias JS -> JavaScript
- required coverage ordering

Full labeled set TODO: strong/medium/weak/skill-mismatch/seniority-mismatch cases to measure score ordering and evidence quality.

## Job ranking evaluation

`ranking.ts` VERSION 2.0.0. Metrics TODO (small dataset):
- Precision@5/10, Recall@20, NDCG@20 vs whole-doc baseline
- Currently ranking uses deterministic 30+25+15+15+10+5 =100 without ATS/salary/freshness

## How to run

```bash
cd backend && npm test
# or
bun test src/tests
```

Add larger datasets under `backend/evaluation/datasets/` later.
