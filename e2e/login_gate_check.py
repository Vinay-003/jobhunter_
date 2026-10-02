#!/usr/bin/env python3
"""Issue 3 verification — login gate + fonts (PLAN.md §Issue 3 "Verification").

1. PublicOnly must render the login form BEFORE /auth/session resolves
   (simulated: endpoint delayed 6 s via async route → form must be visible
   in well under that — proving the form no longer waits on the session).
2. Font loading: index.html carries preconnect+link; bundled CSS no longer
   references fonts.googleapis.com (checked separately against dist/).

Run: python3 e2e/login_gate_check.py   (frontend :5173 up; backend optional)
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import time

from playwright.async_api import async_playwright

FE = os.environ.get("E2E_FE", "http://localhost:5173")
SESSION_DELAY_S = 6

checks: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    checks.append((name, ok, detail))
    print(f"  {'✓' if ok else '✗ FAIL'} {name}" + (f" — {detail}" if detail and not ok else ""))


async def run() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        async def slow_session(route):
            await asyncio.sleep(SESSION_DELAY_S)
            await route.continue_()

        await page.route(re.compile(r".*/auth/session.*"), slow_session)

        t0 = time.time()
        await page.goto(f"{FE}/login", wait_until="domcontentloaded")
        try:
            await page.get_by_text("Welcome back").wait_for(timeout=3000)
            visible_after = time.time() - t0
            check(
                "login form visible without waiting for session",
                visible_after < SESSION_DELAY_S - 1,
                f"form at {visible_after:.2f}s while session still delayed {SESSION_DELAY_S}s",
            )
        except Exception as e:  # noqa: BLE001
            check("login form visible without waiting for session", False, repr(e))

        # the delayed session must eventually resolve and leave the page usable
        try:
            await page.wait_for_timeout(int(SESSION_DELAY_S * 1000) + 2000)
            check("page still usable after slow session resolves",
                  await page.get_by_text("Welcome back").is_visible())
        except Exception as e:  # noqa: BLE001
            check("page still usable after slow session resolves", False, repr(e))

        await browser.close()

    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
