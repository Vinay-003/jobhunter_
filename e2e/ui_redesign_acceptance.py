#!/usr/bin/env python3
"""Opt-in real-stack redesign acceptance with synthetic, isolated data only.

Requires frontend :5174, backend :3002, isolated PostgreSQL :55433 role redesign,
the migrated schema, local embeddings, JOB_PROVIDERS=jooble and no provider keys.
Run: UI_REDESIGN_ISOLATED=1 python3 e2e/ui_redesign_acceptance.py
Provider cache fixtures test retrieval/ranking/persistence, NOT live provider recall.
No passwords, cookies, resume contents or external user data enter the report.
"""
import hashlib
import json
import os
import re
import secrets
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from reportlab.pdfgen import canvas

assert os.environ.get('UI_REDESIGN_ISOLATED') == '1', 'Requires explicitly isolated stack'
ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/tmp/opencode/jh-redesign-check')
OUT.mkdir(parents=True, exist_ok=True)
BASE, API = 'http://localhost:5174', 'http://localhost:3002/api/v1'
checks, endpoints, errors = [], [], []

def check(name, passed, detail=None):
    checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
    (OUT/'results.json').write_text(json.dumps({'checks': checks, 'endpoints': endpoints, 'pageErrors': errors}, indent=2))
    print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    assert passed, name

def sql(query):
    result = subprocess.run(['psql', '-X', '-h', '127.0.0.1', '-p', '55433', '-U', 'redesign', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], input=query, text=True, capture_output=True, check=True)
    return result.stdout.strip()

def fixture():
    path = OUT/'resume_clg_cognizant_long_filename_for_responsive_layout_verification.pdf'
    c = canvas.Canvas(str(path)); c.setFont('Helvetica', 11)
    lines = ['Synthetic Test Candidate', 'Software Engineer', 'candidate@example.test | Bengaluru, India',
      'EXPERIENCE', 'Software Engineering Intern | Example Test Company | Jan 2025 - Jun 2025',
      '- Built Python REST APIs with PostgreSQL and reduced request latency by 30%.',
      '- Implemented React and TypeScript dashboards used by 200 test users.',
      '- Added 45 unit tests for Node.js services and automated Git deployments.',
      'PROJECTS', 'Application Tracker | Python, React, PostgreSQL',
      '- Built job discovery APIs with Python and SQL handling 1000 sample records.',
      '- Tested authentication and improved application response times by 25%.',
      'SKILLS', 'Python, JavaScript, TypeScript, React, Node.js, PostgreSQL, SQL, Git',
      'EDUCATION', 'Bachelor of Technology in Computer Science | Example University | 2020 - 2024']
    for i, line in enumerate(lines): c.drawString(44, 790-i*23, line)
    c.save(); return path

JD = '''Junior Software Engineer
Responsibilities
- Build Python REST APIs with PostgreSQL.
- Implement React and TypeScript dashboards.
- Write unit tests and automate Git deployments.
Required Skills
- Python and SQL.
- React and TypeScript.
Experience
0-2 years of professional software development experience. Remote within India.'''

def seed_provider_cache(resume_id, request):
    profile = json.loads(sql(f"SELECT profile_json FROM resume_profiles WHERE resume_id='{resume_id}';"))
    saved = json.loads(sql(f"SELECT row_to_json(p) FROM user_job_preferences p JOIN resumes r ON p.user_id=r.user_id WHERE r.id='{resume_id}';"))
    modules = (ROOT/'backend/dist').as_uri()
    code = f"""import fs from 'node:fs'; import crypto from 'node:crypto';
import {{effectivePreferences}} from '{modules}/modules/jobs/eligibility.js';
import {{JobQueryPlanner}} from '{modules}/modules/jobs/queryPlanner.js';
const x=JSON.parse(fs.readFileSync(0,'utf8')); const preferences=effectivePreferences(x.saved,x.request);
const queries=[...new Set(new JobQueryPlanner().plan({{targetRoles:preferences.targetRoles,excludedRoles:preferences.excludedRoles,emphasizedSkills:preferences.emphasizedSkills}},x.profile).map(q=>q.keywords))].slice(0,3);
const keys=[]; for(const query of queries)for(const location of preferences.locations)for(let page=1;page<=3;page++){{
keys.push(crypto.createHash('sha256').update(JSON.stringify({{version:9,name:'jooble',query,location,page,preferences,providerLimit:null}})).digest('hex'));}}
console.log(JSON.stringify(keys));"""
    code += "\nprocess.exit(0);"
    output = subprocess.run(['node','--input-type=module','-e',code],input=json.dumps({'profile':profile,'saved':saved,'request':request}),text=True,capture_output=True,cwd=OUT,env={**os.environ,'PG_DATABASE_STRING':'postgresql://redesign@127.0.0.1:55433/postgres','PG_SSL':'false','JWT_SECRET':'isolated-test-placeholder-not-a-deployed-secret'})
    if output.returncode: raise RuntimeError(output.stderr)
    jobs = [{'source':'jooble','externalId':f'ui-{resume_id}-{i}', 'title':'Junior Software Engineer',
       'company':f'Synthetic Employer {i:02d}', 'location':'Bengaluru, India', 'description':JD,
       'descriptionQuality':'full', 'url':f'https://example.test/redesign/{resume_id}/{i}',
       'salary': {'min': 500000, 'max': 800000, 'currency':'INR'}, 'workMode':'remote',
       'postedAt':datetime.now(timezone.utc).isoformat()} for i in range(25)]
    payload = json.dumps({'jobs':jobs,'status':'ok'}).replace("'", "''")
    for key in json.loads(output.stdout):
        sql(f"INSERT INTO job_search_cache(query_hash,query_text,result_json) VALUES('{key}','synthetic UI acceptance','{payload}') ON CONFLICT(query_hash) DO UPDATE SET result_json=excluded.result_json,created_at=now();")

def overflow(page):
    return page.evaluate('document.documentElement.scrollWidth <= innerWidth')

def shot(page, name):
    page.evaluate('scrollTo({top:0,left:0,behavior:"instant"})')
    page.wait_for_timeout(100)
    page.screenshot(path=str(OUT/(name+'.png')), full_page=True)

def run():
    pdf = fixture()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(viewport={'width':1440,'height':900}, permissions=['clipboard-read','clipboard-write'], color_scheme='dark')
        page = context.new_page(); page.on('pageerror', lambda e: errors.append(str(e)))
        def record(response):
            if response.url.startswith(API):
                path = response.url[len(API):].split('?')[0]
                endpoints.append({'method': response.request.method, 'path': re.sub(r'[0-9a-f]{8}-[0-9a-f-]{27,}', ':id', path), 'status': response.status})
        page.on('response', record)
        def request(method, path, expected=200, **kwargs):
            response = getattr(context.request, method)(API+path, **kwargs)
            endpoints.append({'method':method.upper(),'path':re.sub(r'[0-9a-f]{8}-[0-9a-f-]{27,}', ':id', path),'status':response.status})
            check(method.upper()+' '+path.split('?')[0]+' status',response.status==expected)
            return response
        def csrf(): return {'X-CSRF-Token':request('get','/csrf').json()['csrfToken']}
        page.goto(BASE+'/'); expect(page.get_by_role('heading',level=1)).to_be_visible()
        check('Landing has JobHunter title',page.title()=='JobHunter')
        page.get_by_role('button', name='Switch to light mode').click()
        page.reload(); check('Theme persists on reload',page.locator('html').get_attribute('data-theme')=='light')
        page.get_by_role('button', name='Switch to dark mode').click()
        shot(page,'landing-dark')
        page.goto(BASE+'/app/profile'); page.wait_for_url('**/login')
        check('Protected route redirects signed-out browser',True)
        page.get_by_role('button', name='Sign in',exact=True).click()
        check('Login validates empty form',page.get_by_role('alert').count()>0)
        email, password = 'redesign.'+uuid.uuid4().hex+'@example.test', secrets.token_urlsafe(22)
        page.goto(BASE+'/signup'); page.get_by_label('Username',exact=True).fill('DesignQA')
        page.get_by_label('Email',exact=True).fill(email); page.get_by_label('Password',exact=True).fill(password)
        with page.expect_response(lambda r:r.url.endswith('/auth/signup')) as result:
            page.get_by_role('button',name='Create workspace').click()
        check('Browser signup',result.value.status==201)
        page.goto(BASE+'/login'); page.get_by_label('Email',exact=True).fill(email); page.get_by_label('Password',exact=True).fill(password)
        page.get_by_role('button',name='Show password',exact=True).click()
        check('Show password changes input type',page.locator('input[autocomplete=current-password]').get_attribute('type')=='text')
        page.get_by_role('button',name='Hide password',exact=True).click()
        page.get_by_role('button',name='Sign in',exact=True).click(); page.wait_for_url('**/app/ats')
        headers=csrf(); request('get','/auth/session'); request('get','/profile')
        request('get','/health'); request('get','/keepalive')
        request('put','/profile/job-preferences',403,data={})
        page.goto(BASE+'/app/resumes'); expect(page.get_by_role('heading',name='Your resume workspace starts here.')).to_be_visible()
        shot(page,'resumes-empty-dark'); check('Empty library offers upload',page.get_by_role('link',name='Upload resume',exact=True).is_visible())
        page.goto(BASE+'/app/ats'); page.get_by_role('button',name='Build my report').click()
        expect(page.get_by_role('alert')).to_contain_text('Choose a PDF'); check('No-file validation',True)
        page.locator('input[type=file]').set_input_files({'name':'bad.txt','mimeType':'text/plain','buffer':b'not PDF'})
        expect(page.get_by_role('alert')).to_contain_text('Choose a PDF'); check('Wrong file type validation',True)
        page.locator('input[type=file]').set_input_files({'name':'large.pdf','mimeType':'application/pdf','buffer':b'0'*(5*1024*1024+1)})
        expect(page.get_by_role('alert')).to_contain_text('larger than 5 MB'); check('Oversized file validation',True)
        page.get_by_role('button',name='Career level',exact=True).click(); page.get_by_role('option',name='Mid-level',exact=True).click()
        page.get_by_role('button',name='Career level',exact=True).click(); page.keyboard.press('Home'); page.keyboard.press('Enter')
        check('Career select keyboard selection',page.get_by_role('button',name='Career level',exact=True).inner_text().startswith('Entry'))
        page.locator('input[type=file]').set_input_files(str(pdf)); shot(page,'ats-selected-dark')
        with page.expect_response(lambda r:r.url.endswith('/analyses/readiness'),timeout=120000) as result:
            page.get_by_role('button',name='Build my report').click()
        health=result.value.json(); check('Real upload and Resume Health',result.value.status==200)
        rid, hid = health['resumeId'], health['analysisId']; page.wait_for_url('**/app/analysis/*')
        check('Health score reconciles',abs(health['readiness']['score']-sum(c['pointsAwarded'] for c in health['readiness']['breakdown']))<.01)
        check('Authenticated download byte parity',request('get',f'/resumes/{rid}/download').body()==pdf.read_bytes())
        request('get','/resumes'); request('get',f'/resumes/{rid}'); request('get',f'/analyses/{hid}'); request('get',f'/analyses?resumeId={rid}&latest=true')
        shot(page,'health-overview-dark')
        first=page.locator('.priority-item__summary').first; was=first.get_attribute('aria-expanded'); first.click()
        check('Priority disclosure toggles',first.get_attribute('aria-expanded')!=was)
        if first.get_attribute('aria-expanded')!='true': first.click()
        page.get_by_role('button',name='Show affected section',exact=False).first.click()
        expect(page.get_by_role('tab',name='Resume evidence')).to_have_attribute('aria-selected','true'); check('Evidence action navigates tab',True)
        page.get_by_role('tab',name='How scoring works').click(); expect(page.get_by_text('A document-quality score you can inspect.')).to_be_visible()
        page.keyboard.press('Home'); expect(page.get_by_role('tab',name='Overview',exact=True)).to_have_attribute('aria-selected','true')
        check('Report tabs support keyboard navigation',True)
        page.get_by_role('tab',name='Overview',exact=True).click(); page.locator('.breakdown-row__summary').first.click()
        expect(page.locator('.analysis-category-detail').first).to_be_visible(); check('Rubric expands inline',True)
        page.get_by_role('button',name='Copy report for LLM').click(); expect(page.get_by_role('button',name='Copied for LLM')).to_be_visible()
        original=page.evaluate('navigator.clipboard.readText()'); page.reload()
        page.get_by_role('button',name='Copy report for LLM').click(); expect(page.get_by_role('button',name='Copied for LLM')).to_be_visible()
        check('Saved report copy parity',page.evaluate('navigator.clipboard.readText()')==original)
        with page.expect_download() as download: page.get_by_role('button',name='Export .md').click()
        check('Markdown export parity',Path(download.value.path()).read_text()==original)
        printed=page.pdf(print_background=True)
        check('Printable report generates PDF',printed.startswith(b'%PDF') and len(printed)>5000)
        page.emulate_media(media='print'); expect(page.locator('.sidebar')).not_to_be_visible()
        check('Print excludes workspace navigation',True); page.emulate_media(media='screen')
        page.goto(BASE+'/app/ats?resumeId='+rid)
        expect(page.get_by_text('Saved PDF · no re-upload needed')).to_be_visible()
        page.get_by_role('button',name=re.compile('Tailored Match.*Compare')).click()
        page.get_by_role('button',name='Analyze + match').click()
        expect(page.get_by_role('alert')).to_contain_text('at least 20'); check('JD validation',True)
        page.get_by_label('Job description',exact=True).fill(JD)
        with page.expect_response(lambda r:r.url.endswith('/analyses/jd-match'),timeout=260000) as result:
            page.get_by_role('button',name='Analyze + match').click()
        match=result.value.json(); check('Tailored Match uses real local inference',result.value.status==200 and match['versions']['embeddingStatus']=='real')
        mid=match['analysisId']; page.wait_for_url('**/app/analysis/*'); shot(page,'match-overview-dark')
        page.get_by_role('tab',name='Matched evidence').click()
        check('All responsibility evidence rendered',page.locator('.match-evidence-list article').count()==len(match['jdMatch']['responsibilityCoverage']))
        page.get_by_role('tab',name='How matching works').click(); expect(page.get_by_text('One role. A separate signal.')).to_be_visible()
        page.get_by_role('button',name='Copy report for LLM').click(); expect(page.get_by_role('button',name='Copied for LLM')).to_be_visible()
        original=page.evaluate('navigator.clipboard.readText()'); page.reload()
        page.get_by_role('button',name='Copy report for LLM').click(); expect(page.get_by_role('button',name='Copied for LLM')).to_be_visible()
        check('Saved Tailored Match copy parity',page.evaluate('navigator.clipboard.readText()')==original)
        page.goto(BASE+'/app/resumes/'+rid); expect(page.get_by_role('heading',name=pdf.name)).to_be_visible()
        check('Both analysis histories link real IDs',page.locator(f'.history-row[href="/app/analysis/{hid}"]').count()==1 and page.locator(f'.history-row[href="/app/analysis/{mid}"]').count()==1)
        with page.expect_download() as download: page.get_by_role('button',name='Download PDF').click()
        check('Browser PDF download byte parity',Path(download.value.path()).read_bytes()==pdf.read_bytes())
        page.get_by_role('button',name='Delete',exact=True).click(); expect(page.get_by_role('dialog')).to_be_visible()
        page.keyboard.press('Escape'); expect(page.get_by_role('dialog')).to_have_count(0)
        check('Delete confirmation escape preserves PDF',request('get',f'/resumes/{rid}').status==200)
        page.goto(BASE+'/app/profile'); expect(page.get_by_label('Target roles',exact=False)).to_be_visible()
        fields={'Target roles':'Junior Software Engineer','Preferred locations':'India','Seniority':'Junior','Work modes':'remote','Emphasized skills':'Python','Excluded roles':'Staff Engineer','Minimum salary':'500000'}
        for label,value in fields.items(): page.get_by_label(label,exact=False).fill(value)
        page.get_by_label('Display name').fill('Synthetic Design QA')
        page.get_by_role('button',name='Save changes').click(); expect(page.get_by_role('status')).to_have_text('Changes saved.')
        prefs=request('get','/profile/job-preferences').json()['preferences']
        check('All seven preferences persist',prefs=={'targetRoles':['Junior Software Engineer'],'locations':['India'],'seniority':['Junior'],'workModes':['remote'],'emphasizedSkills':['Python'],'excludedRoles':['Staff Engineer'],'minSalary':500000})
        check('Account name persists',request('get','/profile').json()['user']['display_name']=='Synthetic Design QA')
        page.get_by_label('Target roles',exact=False).fill('Unsaved role'); page.get_by_role('button',name='Reset',exact=True).click()
        expect(page.get_by_label('Target roles',exact=False)).to_have_value('Junior Software Engineer'); check('Profile reset restores saved values',True)
        payload={'resumeId':rid,'targetRoles':['Junior Software Engineer'],'locations':['India'],'workModes':['remote'],'daysPosted':7,'sortBy':'match','includeUnknownDates':False,'verifiedOpenOnly':False,'includeUnknownLocations':False}
        seed_provider_cache(rid,payload)
        page.goto(BASE+'/app/jobs'); expect(page.get_by_role('button',name='Find matches')).to_be_visible()
        expect(page.get_by_text('Reading professional evidence to suggest roles…')).to_have_count(0,timeout=90000)
        page.locator('input[type=number][max="100"]').fill('0')
        with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/recommendation-runs'),timeout=260000) as result:
            page.get_by_role('button',name='Find matches').click()
        jobs=result.value.json(); check('Real retrieval/ranking/persistence on synthetic provider cache',result.value.status==200 and jobs['returnedCount']==25)
        runid=jobs['runId']; request('get',f'/recommendation-runs/{runid}'); stored=request('get',f'/recommendation-runs/{runid}/results?limit=100').json()
        check('Stored recommendation pagination',len(stored['results'])==25 and stored['results'][:20]==jobs['recommendations'])
        page.get_by_role('button',name=re.compile('Load more')).click(); expect(page.locator('.job-card')).to_have_count(25)
        page.locator('.job-card').nth(1).click(); check('Job selection updates detail',page.locator('.job-detail').inner_text().find('Synthetic Employer')>=0)
        page.get_by_label('Search roles or companies in loaded matches').fill('impossible-string')
        expect(page.get_by_role('heading',name='No matches in this view')).to_be_visible()
        page.get_by_role('button',name='Clear list filters').click(); expect(page.locator('.job-card')).to_have_count(25)
        page.get_by_role('button',name='Copy report',exact=True).click()
        check('Job copy export includes real loaded rows','Synthetic Employer' in page.evaluate('navigator.clipboard.readText()'))
        shot(page,'jobs-populated-dark')
        # Capture populated master/detail on mobile, not a fake fixture page.
        page.set_viewport_size({'width':390,'height':844}); page.locator('.job-card').first.click()
        expect(page.locator('.jobs-back')).to_be_visible(); shot(page,'jobs-detail-mobile-dark')
        check('Mobile jobs detail has no horizontal overflow',overflow(page))
        page.locator('.jobs-back').click(); expect(page.locator('.job-card').first).to_be_visible()
        page.set_viewport_size({'width':1440,'height':900})
        # Check availability on a synthetic non-routable URL. Unknown is truthful.
        jid=jobs['recommendations'][0]['jobId']
        with page.expect_response(lambda r:r.url.endswith('/availability')) as result:
            page.get_by_role('button',name='Check current availability').click()
        check('Browser availability recheck',result.value.status==200)
        page.once('dialog',lambda dialog:dialog.accept())
        with page.expect_response(lambda r:r.url.endswith('/report-closed')) as result:
            page.get_by_role('button',name='Report expired / closed').click()
        check('Browser reports closed posting',result.value.status==200)
        check('Closed state persisted',request('get',f'/recommendation-runs/{runid}/results?limit=100').json()['results'][0]['availability']['status']=='closed')
        request('get','/analyses/not-a-uuid',400)
        request('get',f'/analyses/{uuid.uuid4()}',404)
        request('get',f'/resumes/{uuid.uuid4()}',404)
        request('get',f'/recommendation-runs/{runid}/results?limit=101',400)
        request('post','/analyses/jd-match',400,headers=headers,data={'resumeId':rid,'jobDescription':'short'})
        request('post','/resumes',415,headers=headers,multipart={'resume':{'name':'bad.pdf','mimeType':'application/pdf','buffer':b'not PDF'}})
        # Browser/API failure UI is deliberately fault-injected, separate from live checks.
        page.route('**/profile/job-preferences',lambda route:route.fulfill(status=503,json={'message':'Test service unavailable'}))
        page.goto(BASE+'/app/profile'); expect(page.get_by_role('alert')).to_contain_text('Test service unavailable')
        check('Profile API error visible with retry',page.get_by_role('button',name='Retry',exact=True).is_visible()); page.unroute('**/profile/job-preferences')
        page.get_by_role('button',name='Retry',exact=True).click(); expect(page.get_by_label('Target roles',exact=False)).to_have_value('Junior Software Engineer')
        page.route('**/analyses/'+hid,lambda route:route.fulfill(status=404,json={'message':'Test report missing'}))
        page.goto(BASE+'/app/analysis/'+hid); expect(page.get_by_role('heading',name='Report unavailable')).to_be_visible()
        check('Missing report offers recovery',page.get_by_role('link',name='Run a new analysis').is_visible()); page.unroute('**/analyses/'+hid)
        page.goto(BASE+'/app/resumes/'+str(uuid.uuid4())); expect(page.get_by_role('heading',name='Resume not found')).to_be_visible(); check('Missing resume recovery',True)
        # A transient API failure must not be misrepresented as an empty library.
        page.route('**/resumes',lambda route:route.fulfill(status=503,json={'message':'Test storage unavailable'}))
        page.goto(BASE+'/app/jobs'); expect(page.get_by_role('button',name='Retry loading resumes')).to_be_visible()
        check('Jobs resume-load failure is not an empty state',page.get_by_role('heading',name='Analyze a resume first').count()==0)
        page.unroute('**/resumes'); page.get_by_role('button',name='Retry loading resumes').click()
        expect(page.get_by_role('button',name='Retry loading resumes')).to_have_count(0)
        # Hold only the read request, observe the skeleton, then release to the real API.
        pending=[]
        page.route('**/analyses/'+hid,lambda route:pending.append(route))
        page.goto(BASE+'/app/analysis/'+hid,wait_until='domcontentloaded')
        expect(page.get_by_label('Loading your report')).to_be_visible()
        check('Report loading state is structured and visible',True)
        page.wait_for_function('document.querySelector(".analysis-loading") !== null')
        page.wait_for_timeout(150)
        for route in pending: route.continue_()
        page.unroute('**/analyses/'+hid); expect(page.locator('.report-tabs')).to_be_visible()
        # A second synthetic account must never read someone else's files/reports/runs.
        other=p.request.new_context()
        other_headers={'X-CSRF-Token':other.get(API+'/csrf').json()['csrfToken']}
        other_email='isolation.'+uuid.uuid4().hex+'@example.test'
        response=other.post(API+'/auth/signup',headers=other_headers,data={'display_name':'Isolation QA','email':other_email,'password':password})
        check('Second isolated test account',response.status==201)
        check('Second account login',other.post(API+'/auth/login',headers=other_headers,data={'email':other_email,'password':password}).status==200)
        for path in [f'/resumes/{rid}',f'/resumes/{rid}/download',f'/analyses/{hid}',f'/recommendation-runs/{runid}',f'/recommendation-runs/{runid}/results']:
            check('Owner isolation '+path.split('/')[1],other.get(API+path).status in [403,404])
        check('Logout endpoint',other.post(API+'/auth/logout',headers=other_headers).status==200)
        check('Logout revokes session',other.get(API+'/auth/session').status==401); other.dispose()
        # UI matrix runs real pages and real persisted reports at normal zoom.
        routes={'ats':'/app/ats','health':'/app/analysis/'+hid,'match':'/app/analysis/'+mid,'resumes':'/app/resumes','detail':'/app/resumes/'+rid,'profile':'/app/profile','jobs':'/app/jobs'}
        sizes=[(360,800),(390,844),(768,1024),(1024,768),(1280,800),(1366,768),(1440,900),(1536,864),(1680,1050),(1920,1200)]
        for theme in ['dark','light']:
            page.evaluate("t=>{localStorage.setItem('jh-theme',t);document.documentElement.dataset.theme=t;}",theme)
            for name,path in routes.items():
                page.goto(BASE+path)
                if name in ['health','match']: expect(page.locator('.report-tabs')).to_be_visible()
                elif name=='detail': expect(page.get_by_role('heading',name=pdf.name)).to_be_visible()
                elif name=='resumes': expect(page.locator('.resume-overview-card')).to_be_visible()
                elif name=='profile': expect(page.get_by_label('Target roles',exact=False)).to_be_visible()
                for width,height in sizes:
                    page.set_viewport_size({'width':width,'height':height}); page.wait_for_timeout(300)
                    check(f'{name} {theme} {width}x{height} overflow',overflow(page))
                    assert page.url.split('?')[0]==BASE+path, 'Route redirected unexpectedly'
                    if width<=900: expect(page.locator('.sidebar')).not_to_be_visible()
                    if width in [390,1440]: shot(page,f'{name}-{theme}-{width}')
        page.set_viewport_size({'width':390,'height':844}); page.goto(BASE+'/app/ats')
        page.get_by_role('button',name='Open navigation').click(); expect(page.locator('.sidebar--open')).to_be_visible()
        page.keyboard.press('Escape'); expect(page.locator('.sidebar--open')).to_have_count(0)
        check('Mobile navigation Escape restores focus',page.get_by_role('button',name='Open navigation').evaluate('e=>e===document.activeElement'))
        page.get_by_role('button',name='Open navigation').click(); page.get_by_role('link',name='Resumes Versions & reports').click()
        expect(page.locator('.sidebar--open')).to_have_count(0); check('Mobile navigation closes on route change',True)
        # Public routes must be tested without auth (auth pages redirect otherwise).
        public=browser.new_context(color_scheme='dark'); pub=public.new_page(); pub.on('pageerror',lambda e:errors.append(str(e)))
        for theme in ['dark','light']:
            pub.goto(BASE+'/'); pub.evaluate("t=>localStorage.setItem('jh-theme',t)",theme)
            for name,path in {'landing':'/','login':'/login','signup':'/signup','privacy':'/privacy','terms':'/terms','404':'/missing-route'}.items():
                pub.goto(BASE+path); expect(pub.get_by_role('heading',level=1)).to_be_visible()
                pub.wait_for_timeout(400)
                check(f'{name} {theme} stays on requested public route',pub.url==BASE+path)
                if name=='privacy': expect(pub.get_by_role('heading',name='Privacy Policy',exact=True)).to_be_visible()
                if name=='terms': expect(pub.get_by_role('heading',name='Terms of Service',exact=True)).to_be_visible()
                for width,height in sizes:
                    pub.set_viewport_size({'width':width,'height':height}); pub.wait_for_timeout(300)
                    check(f'{name} {theme} {width}x{height} overflow',overflow(pub))
                    if width in [390,1440]: shot(pub,f'{name}-{theme}-{width}')
        public.close()
        # Actual delete endpoint, then verify cascaded report removal and revoked session.
        page.set_viewport_size({'width':1440,'height':900}); page.goto(BASE+'/app/resumes/'+rid)
        page.get_by_role('button',name='Delete',exact=True).click(); page.get_by_role('dialog').get_by_role('button',name='Delete resume',exact=True).click()
        page.wait_for_url('**/app/resumes'); expect(page.get_by_role('heading',name='Your resume workspace starts here.')).to_be_visible()
        request('get',f'/resumes/{rid}',404); request('get',f'/analyses/{hid}',404); check('Deletion cascades through reports',True)
        page.goto(BASE+'/app/profile'); page.get_by_role('button',name='Log out on all devices').click(); page.wait_for_url('**/login')
        request('get','/auth/session',401); check('Logout-all revokes real session',True)
        check('No uncaught browser exceptions',not errors,errors)
        browser.close()

if __name__=='__main__':
    run()
    print(f'Completed {len(checks)} acceptance checks.',flush=True)
