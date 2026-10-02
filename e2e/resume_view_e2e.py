#!/usr/bin/env python3
"""Resume View E2E (PLAN.md Issue 2) — browser run against local stack.

Covers, end to end:
  1. signup via API + login via UI with a qa.*@example.com user
  2. upload resume A + readiness analysis through the ATS page
  3. Resumes list → View on the ANALYZED resume → report renders at /app/resumes/:id
     (report content present, URL is the resume id — not an analysis id)
  4. resume B (stored, un-analyzed) → View → resume card + "Analyze this resume"
  5. Analyze CTA → /app/ats?resumeId=<B> banner, analyze enabled without any file
  6. unknown resume id → "Resume not found" (never "Analysis not found")
  7. unknown analysis id → contextual report-not-found copy
  8. cleanup: API delete (removes stored files) + SQL delete of rows/user,
     verified to leave 0 orphans  (§0 rule: qa users removed after run)

Requirements: backend :3001, frontend dev :5173, playwright chromium installed.
Run:          python3 e2e/resume_view_e2e.py
"""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright, expect

FE = os.environ.get("E2E_FE", "http://localhost:5173")
API = os.environ.get("E2E_API", "http://localhost:3001/api/v1")
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
SHOTS = Path("/tmp/opencode/jh/e2e_shots")
RESUME_A = Path("/tmp/opencode/jh/test_resume.pdf")

TS = str(int(time.time()))
EMAIL = f"qa.resumeview.{TS}@example.com"
PASS = "QaResumeView!2026"
USERNAME = f"qa_resumeview_{TS}"

checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, ok, detail))
    print(f"  {'✓' if ok else '✗ FAIL'} {name}" + (f" — {detail}" if detail and not ok else ""))


def shot(page: Page, name: str) -> None:
    SHOTS.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(SHOTS / f"{name}.png"), full_page=True)


def api(method: str, path: str, payload: dict | None = None) -> tuple[int, dict]:
    req = urllib.request.Request(
        API + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except Exception:
            return e.code, {}


def pg_url() -> str:
    for line in (BACKEND_DIR / ".env").read_text().splitlines():
        if line.startswith("PG_DATABASE_STRING="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("PG_DATABASE_STRING not found in backend/.env")


def psql(sql: str) -> str:
    out = subprocess.run(
        ["psql", pg_url(), "-At", "-c", sql],
        capture_output=True, text=True, timeout=60,
    )
    if out.returncode != 0:
        raise RuntimeError(f"psql failed: {out.stderr.strip()}")
    return out.stdout.strip()


def make_resume_b() -> Path:
    """Distinct-but-valid PDF: copy of A with a trailing comment (sha256 differs,
    %PDF header intact, still parseable)."""
    assert RESUME_A.exists(), f"missing base pdf {RESUME_A}"
    b = SHOTS / f"resumeB_{TS}.pdf"
    b.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(RESUME_A, b)
    with b.open("ab") as f:
        f.write(f"\n% e2e marker {TS}\n".encode())
    return b


def run() -> int:
    uid = None
    resume_ids: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        try:
            # 1 — signup (API) then login (UI)
            status, body = api("POST", "/auth/signup",
                               {"email": EMAIL, "password": PASS, "username": USERNAME})
            check("signup (API)", status in (200, 201), f"status {status} {body}")
            uid = (body.get("user") or {}).get("id")

            page.goto(f"{FE}/login", wait_until="domcontentloaded")
            page.fill("input[type=email]", EMAIL)
            page.fill("input[type=password]", PASS)
            page.get_by_role("button", name=re.compile("Sign in")).click()
            page.wait_for_url("**/app/**", timeout=20000)
            check("login (UI) → /app/ats", "/app/" in page.url, page.url)

            # 2 — upload resume A + run readiness analysis through the UI
            page.goto(f"{FE}/app/ats", wait_until="domcontentloaded")
            page.set_input_files("input[type=file]", str(RESUME_A))
            expect(page.get_by_text(RESUME_A.name)).to_be_visible(timeout=10000)
            page.get_by_role("button", name=re.compile("Build my report")).click()
            page.wait_for_url(re.compile(r".*/app/analysis/[0-9a-f-]+"), timeout=240000)
            analysis_id_a = page.url.rsplit("/", 1)[-1]
            expect(page.get_by_text("Resume health report").first).to_be_visible(timeout=60000)
            check("readiness analysis ran (UI)", True, f"analysis {analysis_id_a}")
            shot(page, "01-analysis-A")

            # 3 — Resumes list → View on ANALYZED resume
            page.goto(f"{FE}/app/resumes", wait_until="domcontentloaded")
            expect(page.get_by_text(RESUME_A.name).first).to_be_visible(timeout=15000)
            row_links = page.locator('a:has-text("View")')
            # href of the View link for resume A comes from the list payload:
            hrefs = [row_links.nth(i).get_attribute("href") for i in range(row_links.count())]
            check("View links point at /app/resumes/:id",
                  all(h and h.startswith("/app/resumes/") for h in hrefs),
                  f"hrefs={hrefs}")
            check("no View link points at /app/analysis/:id",
                  all("/app/analysis/" not in (h or "") for h in hrefs),
                  f"hrefs={hrefs}")
            # click the row whose View href matches A (need id: get from href containing uuid and filename row)
            # simplest deterministic: first View link (A uploaded first) if only one row,
            # else match by extracting from API list through the page context below.
            resume_ids_found = [h.rsplit("/", 1)[-1] for h in hrefs if h]
            resume_ids = resume_ids_found
            page.locator(f'a[href="/app/resumes/{resume_ids[0]}"]').first.click()
            page.wait_for_url(re.compile(r".*/app/resumes/[0-9a-f-]+"), timeout=15000)
            check("View navigates to /app/resumes/:id (not analysis id)",
                  f"/app/resumes/{resume_ids[0]}" in page.url, page.url)
            expect(page.get_by_text("Resume health report").first).to_be_visible(timeout=30000)
            expect(page.get_by_text(RESUME_A.name).first).to_be_visible(timeout=10000)
            check("analyzed resume shows its report at resume URL", True, page.url)
            shot(page, "02-resume-view-analyzed")

            # 4 — resume B: stored via API (no analysis), then View → un-analyzed card
            b_path = make_resume_b()
            cookies = context.cookies()
            csrf = next((c["value"] for c in cookies
                         if c["name"] in ("csrf_token", "jobhunter_csrf", "_csrf", "csrfToken")), None)
            headers = {"X-CSRF-Token": csrf} if csrf else {}
            up = context.request.post(
                f"{API}/resumes",
                headers=headers,
                multipart={"resume": {"name": b_path.name,
                                      "mimeType": "application/pdf",
                                      "buffer": b_path.read_bytes()}},
            )
            check("resume B uploaded (API, un-analyzed)", up.ok, f"status {up.status} {up.text()[:200]}")
            up_json = up.json() if up.ok else {}
            rid_b = str(((up_json.get("resume") or {}).get("id")) or up_json.get("id") or "")
            check("resume B has id", bool(rid_b), str(up_json)[:200])
            if rid_b:
                resume_ids.append(rid_b)

            page.goto(f"{FE}/app/resumes", wait_until="domcontentloaded")
            page.locator(f'a[href="/app/resumes/{rid_b}"]').first.click()
            page.wait_for_url(re.compile(r".*/app/resumes/[0-9a-f-]+"), timeout=15000)
            expect(page.get_by_text("Not analyzed yet").first).to_be_visible(timeout=15000)
            expect(page.get_by_text("Analyze this resume").first).to_be_visible(timeout=5000)
            check("un-analyzed resume → card (no 404, no dead end)", True, page.url)
            shot(page, "03-resume-view-unanalyzed")

            # 5 — Analyze CTA → ATS prefilled with ?resumeId, banner, no file needed
            page.get_by_role("link", name=re.compile("Analyze this resume")).click()
            page.wait_for_url(re.compile(rf".*/app/ats\?resumeId={rid_b}"), timeout=15000)
            expect(page.get_by_text("no re-upload needed").first).to_be_visible(timeout=10000)
            check("ATS banner shows stored resume", True, page.url)
            analyze_btn = page.get_by_role("button", name=re.compile("Build my report"))
            check("analyze enabled without a local file",
                  analyze_btn.is_enabled(), "button disabled")
            shot(page, "04-ats-resumeId-banner")

            # 6 — unknown resume id → "Resume not found"
            page.goto(f"{FE}/app/resumes/00000000-0000-4000-8000-000000000000",
                      wait_until="domcontentloaded")
            expect(page.get_by_text("Resume not found").first).to_be_visible(timeout=15000)
            body_txt = page.inner_text("body")
            check("unknown resume → 'Resume not found'", True)
            check("no misleading 'Analysis not found'",
                  "Analysis not found" not in body_txt, body_txt[:200])
            shot(page, "05-resume-not-found")

            # 7 — unknown analysis id → contextual report copy
            page.goto(f"{FE}/app/analysis/00000000-0000-4000-8000-000000000000",
                      wait_until="domcontentloaded")
            expect(page.get_by_text(re.compile("This report could not be found")).first).to_be_visible(timeout=15000)
            check("unknown analysis → contextual copy", True)
            shot(page, "06-analysis-not-found")

        finally:
            # 8 — cleanup: stored files via API (cookies live in this context), rows/user via SQL
            print("\n[cleanup]")
            try:
                for rid in resume_ids:
                    resp = context.request.delete(f"{API}/resumes/{rid}")
                    print(f"  DELETE /resumes/{rid} -> {resp.status}")
                    check(f"cleanup: delete resume {rid[:8]}…", resp.ok, resp.text()[:160])
                if uid:
                    # job_recommendations table is optional (not present on all envs)
                    for stmt in (
                        f"DELETE FROM analyses WHERE user_id='{uid}'",
                        f"DELETE FROM resume_profiles WHERE resume_id IN "
                        f"(SELECT id FROM resumes WHERE user_id='{uid}')",
                        f"DELETE FROM resumes WHERE user_id='{uid}'",
                        f"DELETE FROM sessions WHERE user_id='{uid}'",
                        f"DELETE FROM users WHERE id='{uid}'",
                    ):
                        try:
                            psql(stmt)
                        except RuntimeError as e:
                            if 'does not exist' not in str(e):
                                raise
                    counts = psql(
                        f"SELECT (SELECT count(*) FROM users WHERE id='{uid}') AS u, "
                        f"(SELECT count(*) FROM resumes WHERE user_id='{uid}') AS r, "
                        f"(SELECT count(*) FROM analyses WHERE user_id='{uid}') AS a"
                    )
                    check("cleanup: 0 orphans (user/resumes/analyses = 0 0 0)",
                          counts == "0|0|0", counts)
                # storage/orphan sanity: no resumes row may reference missing files is
                # out of scope here; qa user itself must be gone.
            except Exception as e:  # noqa: BLE001 — cleanup must not mask test result
                check("cleanup completed", False, repr(e))
            browser.close()

    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed"
          + (f"; {len(failed)} FAILED" if failed else ""))
    for name, _, detail in failed:
        print(f"  FAIL: {name} {detail}")
    print(f"screenshots: {SHOTS}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
