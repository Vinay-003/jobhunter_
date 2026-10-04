"""Local-only browser acceptance. Requires isolated DB and app servers.

Run: python3 e2e/recommendation_browser_acceptance.py
Never loads dotenv or production data. Uses synthetic fixtures and real app APIs.
"""
import json
import re
import uuid
from pathlib import Path

import psycopg2
from playwright.sync_api import sync_playwright, expect
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/browser-acceptance'
TMP = Path('/tmp/opencode/jobhunter-browser-acceptance')
APP = 'http://localhost:5174'
API = 'http://localhost:3003/api/v1'
DSN = 'postgresql://jobhunter@127.0.0.1:55432/jobhunter_browser_acceptance'
OUT.mkdir(parents=True, exist_ok=True)
TMP.mkdir(parents=True, exist_ok=True)
result = {'checks': [], 'failures': [], 'scope': 'Synthetic jobs, fresh local database, real local embeddings; no live job feeds'}


def check(name, condition):
    result['checks'].append({'name': name, 'passed': bool(condition)})
    if not condition:
        raise AssertionError(name)


def fixtures():
    pdf = TMP / 'synthetic-resume.pdf'
    c = canvas.Canvas(str(pdf))
    lines = [
        'Alex Example | alex@example.test',
        'Professional Experience',
        'Junior Backend Engineer | Example Systems | Jan 2026 - Sep 2026',
        '- Built Python FastAPI REST APIs backed by PostgreSQL for customer orders.',
        '- Improved API latency by 30 percent through Redis caching and query tuning.',
        '- Deployed Docker services and automated unit tests using Git workflows.',
        'Tools and Technologies',
        'Python, FastAPI, PostgreSQL, Docker, Redis, Git',
        'Projects',
        'Order Service',
        '- Designed REST endpoints with Python and PostgreSQL transaction handling.',
        'Education',
        'Bachelor of Technology in Computer Science | Graduated 2025',
    ]
    for i, line in enumerate(lines):
        c.drawString(40, 790-i*24, line)
    c.save()
    common = ('Responsibilities\n'
              '- Build Python FastAPI REST APIs backed by PostgreSQL for customer orders.\n'
              '- Improve API latency through Redis caching and query tuning.\n'
              '- Deploy Docker services and automate unit tests using Git workflows.\n'
              'Required Skills\n- Python and FastAPI\n- PostgreSQL and Docker\n'
              '0-2 years of professional software development experience.')
    jobs = [
        ('relevant', 'Junior Backend Engineer', 'Example APIs', common),
        ('relevant-two', 'Entry Backend Engineer', 'Example Services', common),
        ('senior', 'Senior Backend Engineer', 'Senior Barrier', common + '\nMinimum 8 years of professional experience required.'),
        ('principal', 'Principal Backend Engineer', 'Principal Barrier', common),
        ('unrelated', 'Marketing Manager', 'Unrelated Barrier', 'Backend Engineer recruitment marketing. Lead advertising campaigns and sales operations. Requires 8 years of professional marketing experience.'),
    ]
    with psycopg2.connect(DSN) as db, db.cursor() as cur:
        cur.execute('select current_database()')
        assert cur.fetchone()[0] == 'jobhunter_browser_acceptance'
        for key, title, company, description in jobs:
            cur.execute('''INSERT INTO jobs(source,external_id,title,company,location,description,
                description_quality,url,work_mode,posted_at,content_hash)
                VALUES ('browser-fixture',%s,%s,%s,'Bengaluru, India',%s,'full',%s,'onsite',now(),%s)
                ON CONFLICT(source,external_id) DO UPDATE SET description=excluded.description''',
                (key,title,company,description,'https://example.test/jobs/'+key,'browser-'+key))
    return pdf


def main():
    pdf = fixtures()
    email = 'browser.' + uuid.uuid4().hex[:12] + '@example.test'
    password = 'Synthetic-Only-Pass42!'
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        result['browserVersion'] = browser.version
        context = browser.new_context(viewport={'width':1440, 'height':1000})
        # Prevent the test browser from reaching anything except the local app.
        context.route(re.compile(r'^https?://(?!localhost[:/]|127\.0\.0\.1[:/])'), lambda route: route.abort())
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.set_default_timeout(30000)
        try:
            page.goto(APP+'/signup')
            page.get_by_placeholder('johndoe', exact=True).fill('browser_'+uuid.uuid4().hex[:6])
            page.locator('input[type="email"]').fill(email)
            page.locator('input[type="password"]').fill(password)
            page.locator('button[type="submit"]').click()
            page.wait_for_url('**/login')
            check('Browser signup', True)
            page.locator('input[type="email"]').fill(email)
            page.locator('input[type="password"]').fill(password)
            page.get_by_role('button', name='Sign in', exact=True).click()
            page.wait_for_url('**/app/ats')
            check('Browser login', True)
            page.locator('input[type="file"]').set_input_files(str(pdf))
            with page.expect_response(lambda r: r.url.endswith('/resumes') and r.request.method=='POST', timeout=120000) as upload:
                page.get_by_role('button', name='Build my report').click()
            uploaded = upload.value.json()
            check('PDF uploaded to isolated local storage', upload.value.ok and uploaded['resume']['storageBucket']=='local')
            resume_id = uploaded['resume']['id']
            page.wait_for_url('**/app/analysis/*', timeout=120000)
            expect(page.locator('body')).to_contain_text('Resume Health', timeout=30000)
            page.screenshot(path=str(OUT/'resume-health.png'), full_page=True)
            check('Browser analysis report displayed', True)
            with page.expect_response(lambda r: r.url.endswith('/recommendation-runs') and r.request.method=='POST', timeout=180000) as matching:
                page.goto(APP+'/app/jobs')
            match = matching.value.json()
            check('Recommendation HTTP success', matching.value.ok and match.get('success'))
            result['runId'] = match.get('runId')
            result['jobs'] = [{'title':j['title'], 'company':j['company'], 'fitScore':j['fitScore'], 'scoreDetails':j.get('scoreDetails')} for j in match.get('recommendations',[])]
            check('Relevant jobs returned', any(j['company']=='Example APIs' for j in match.get('recommendations',[])))
            check('Senior, principal, unrelated jobs excluded', all(j['company'] not in ['Senior Barrier','Principal Barrier','Unrelated Barrier'] for j in match['recommendations']))
            check('Real embeddings used', all(j.get('scoreDetails',{}).get('semanticStatus')=='embedded' for j in match['recommendations']))
            check('Responsibilities have supported resume evidence', any(m.get('supported') and m.get('evidence') for j in match['recommendations'] for m in j.get('scoreDetails',{}).get('responsibilityMatches',[])))
            expect(page.get_by_text('Example APIs', exact=True).first).to_be_visible()
            check('Relevant job visible at default threshold', True)
            page.get_by_role('button', name='Preferences', exact=True).click()
            page.locator('input[type="number"]').first.fill('0')
            expect(page.get_by_text('Example APIs', exact=True).first).to_be_visible()
            page.screenshot(path=str(OUT/'job-matches.png'), full_page=True)
            check('Browser displays matched jobs', True)
            result['rejectedReasons'] = match.get('rejectedReasons')
            with page.expect_response(lambda r: r.url.endswith('/recommendation-runs') and r.request.method=='POST', timeout=180000) as reload_response:
                page.reload()
            reloaded = reload_response.value.json()
            check('Reload reuses the persisted recommendation run', reloaded.get('runId')==match['runId'])
            check('Reload preserves scores and evidence', reloaded.get('recommendations')==match['recommendations'])
            first = context.request.get(API+f"/recommendation-runs/{match['runId']}/results?limit=1&offset=0").json()
            second = context.request.get(API+f"/recommendation-runs/{match['runId']}/results?limit=1&offset=1").json()
            check('Persisted API pagination has distinct consecutive ranks', first['results'][0]['rank']==1 and second['results'][0]['rank']==2 and first['results'][0]['jobId']!=second['results'][0]['jobId'])
            check('Paginated score evidence matches original', first['results'][0]['scoreDetails']==match['recommendations'][0]['scoreDetails'])
            with psycopg2.connect(DSN) as db, db.cursor() as cur:
                cur.execute('SELECT count(*) FROM recommendations WHERE run_id=%s', (match['runId'],))
                check('Results persisted in PostgreSQL', cur.fetchone()[0]==match['returnedCount'])
                cur.execute('SELECT profile_version FROM resume_profiles WHERE resume_id=%s', (resume_id,))
                check('Profile version persisted', cur.fetchone()[0]=='5.0.0')
            with page.expect_response(lambda r: r.url.endswith('/recommendation-runs') and r.request.method=='POST', timeout=180000) as refreshed_response:
                page.get_by_role('button', name='Refresh matches', exact=True).click()
            refreshed = refreshed_response.value.json()
            check('Browser refresh creates a new run', refreshed_response.value.ok and refreshed.get('runId')!=match['runId'])
            check('Refresh preserves deterministic matching', refreshed.get('recommendations')==match['recommendations'])
            # Mobile rendering is checked separately from desktop interactions.
            page.set_viewport_size({'width':390,'height':844})
            page.get_by_role('button', name='Preferences', exact=True).click()
            page.locator('input[type="number"]').first.fill('100')
            expect(page.get_by_role('heading', name='No matches above your threshold')).to_be_visible()
            check('Score filter displays empty state', True)
            page.locator('input[type="number"]').first.fill('0')
            expect(page.get_by_text('Example APIs', exact=True).first).to_be_visible()
            check('Lowering score filter restores matches', True)
            page.screenshot(path=str(OUT/'mobile-matches.png'), full_page=True)
            check('Mobile page has no horizontal overflow', page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
            check('No uncaught browser errors', not errors)
        except Exception as exc:
            result['failures'].append(str(exc))
            page.screenshot(path=str(OUT/'failure.png'), full_page=True)
        finally:
            result['browserErrors'] = errors
            (OUT/'results.json').write_text(json.dumps(result, indent=2))
            browser.close()
    print(json.dumps({'checks':result['checks'], 'failures':result['failures'], 'browserErrors':result.get('browserErrors')}, indent=2))
    return 1 if result['failures'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
