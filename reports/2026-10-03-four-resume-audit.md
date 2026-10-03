# Four-resume isolated audit (2026-10-03)

Private PDFs and raw model/report outputs remain outside Git. S70/S90 and J70/J90 below refer to the supplied senior/junior mid/high examples, not verified hiring outcomes. Tested against the previously supplied Junior and Senior JD fixtures using offline local embeddings, disposable account, isolated PostgreSQL, and browser/API persistence.

| Fixture | Health (no JD) | Junior JD fit | Senior JD fit | Parsed professional years | Level | Projects |
|---|---:|---:|---:|---:|---|---:|
| S70 | 81 | 64 | 65 | 8.17 | senior | 2 |
| S90 | 90.5 | 64 | 71 | 9.08 | senior | 2 |
| J70 | 80.5 | 86 | 66 | 1.58 incl. internship | junior | 2 |
| J90 | 84.5 | 87 | 72 | 2.67 incl. internship | mid | 2 |

Manual evidence review: the two senior resumes show completed degrees, sustained full-time engineering work and senior scope; the stronger example has more quantified production impact, system architecture and mentoring. The junior examples show completed degrees, internships and production/project work; the stronger one has markedly more quantified outcomes, but its **2.67 elapsed years** (including internship) do not establish senior scope. Senior JD qualification was explicitly ineligible for both junior examples; the senior examples had no explicit experience/scope failure, but other unknown requirements may leave eligibility uncertain. A junior JD score for a senior candidate is a fit index, not a recommendation to down-level.

Issues found during review and fixed: the first project heading of the long senior and junior PDFs was dropped; wrapped bullets lost measurable numbers on continuation lines; numeric counts with `+` were missed; tenure >=8 years was incorrectly labeled `lead` without a lead role. Synthetic regression tests were added without copying private resume content. The stronger junior example still scores only 84.5 Health, despite its filename's `90`: **filename labels are not ground truth** and Health is a distinct rule-based parseability/evidence index. Neither the 70/90 filenames nor four resumes calibrate JD fit or employer ATS probability.

Verification: isolated browser checks completed for all four PDFs, both JDs, byte-identical PDF downloads, persisted and fresh-tab report parity, and real local embeddings; backend 85 tests passed with 3 default skips. Real provider APIs and production browser origins were not exercised. Recommendation persistence/pagination was previously exercised with 65 *synthetic* jobs, not 65 verified live vacancies. JobsPipe cursor behavior was tested using mocked responses and quota reservations; the provider account's live cursor/billing behavior remains to validate before production rollout.
