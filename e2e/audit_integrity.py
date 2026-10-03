#!/usr/bin/env python3
"""Opt-in isolated acceptance test: real local model + caller-owned PDF/JD fixtures.

AUDIT_FIXTURES must contain manifest.json [{label,path}], junior.md, senior.md.
Never point this at a shared database. The seed connection is hardcoded to the
isolated audit cluster, and explicit AUDIT_ISOLATED=1 is required. Provider
responses are synthetic cache fixtures, NOT a claim of live job recall.
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
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'http://localhost:5174'
API = 'http://localhost:3002/api/v1'
FIXTURES = Path(os.environ['AUDIT_FIXTURES'])
assert os.environ.get('AUDIT_ISOLATED') == '1', 'Requires isolated audit stack'
checks = []
def check(name, condition, detail=None):
    checks.append({'name':name, 'passed':bool(condition), 'detail':detail})
    print(('PASS ' if condition else 'FAIL ') + name, flush=True)
    (FIXTURES/'implementation-checks.json').write_text(json.dumps(checks,indent=2))
    assert condition, name

def sql(query):
    r = subprocess.run(['psql','-X','-h','127.0.0.1','-p','55432','-U','audit','-d','postgres','-At','-v','ON_ERROR_STOP=1'],input=query,text=True,capture_output=True,check=True)
    return r.stdout.strip()

def seed(profile, preferences, prefix):
    # Invoke the production planner, not a second guessed copy of its query logic.
    code = "import fs from 'node:fs';import {JobQueryPlanner} from './dist/modules/jobs/queryPlanner.js';const x=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(new JobQueryPlanner().plan(x.preferences,x.profile)));"
    run = subprocess.run(['node','--input-type=module','-e',code],input=json.dumps({'profile':profile,'preferences':preferences}),text=True,capture_output=True,cwd=ROOT/'backend',check=True)
    queries=json.loads(run.stdout)
    jobs=[]
    for i in range(65):
        jobs.append({'source':'jooble','externalId':f'{prefix}-{i}', 'title':'Junior Software Engineer', 'company':f'Audit Fixture {i}', 'location':'India', 'description':'Junior Software Engineer\nResponsibilities\n- Build Python and TypeScript REST APIs with PostgreSQL and unit tests.\nRequired Skills\n- At least one of Python or JavaScript.\n- SQL and Git.\nExperience\n0–2 years of professional development experience. Remote role available to candidates in India.', 'descriptionQuality':'full','url':f'https://example.test/jobs/{prefix}/{i}','salary':None,'workMode':'remote','postedAt':datetime.now(timezone.utc).isoformat()})
    for page in range(1,4):
        for query in queries:
            key={'version':5,'name':'jooble','query':query['keywords'],'location':'India','page':page,'preferences':preferences,'providerLimit':None}
            digest=hashlib.sha256(json.dumps(key,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
            payload=json.dumps({'jobs':jobs,'status':'ok'},ensure_ascii=False).replace("'","''")
            sql(f"INSERT INTO job_search_cache(query_hash,query_text,result_json) VALUES('{digest}','audit fixture','{payload}') ON CONFLICT(query_hash) DO UPDATE SET result_json=excluded.result_json,created_at=now();")

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True)
    ctx=browser.new_context(permissions=['clipboard-read','clipboard-write'])
    page=ctx.new_page()
    page.goto(BASE+'/login')
    token=ctx.request.get(API+'/csrf').json()['csrfToken']
    headers={'X-CSRF-Token':token}
    email='qa.integrity.'+uuid.uuid4().hex+'@example.test'
    password=secrets.token_urlsafe(24)
    r=ctx.request.post(API+'/auth/signup',headers=headers,data={'display_name':'Integrity Audit','email':email,'password':password})
    check('Isolated signup',r.status==201)
    page.locator('input[type=email]').fill(email);page.locator('input[type=password]').fill(password)
    page.get_by_role('button',name=re.compile('sign in',re.I)).click();page.wait_for_url('**/app/ats')
    check('Browser opaque login',True)
    token=ctx.request.get(API+'/csrf').json()['csrfToken'];headers={'X-CSRF-Token':token}
    check('Profile reads on V2 schema',ctx.request.get(API+'/profile').status==200)
    check('Cookie mutation without CSRF rejected',ctx.request.put(API+'/profile/job-preferences',data={}).status==403)
    uploaded=[];scores=[]
    for item in json.loads((FIXTURES/'manifest.json').read_text()):
        label=item['label'];path=Path(item['path'])
        page.goto(BASE+'/app/ats');page.locator('input[type=file]').set_input_files(str(path))
        with page.expect_response(lambda r:'/analyses/readiness' in r.url,timeout=120000) as result:
            page.get_by_role('button',name='Build my report').click()
        response=result.value;data=response.json()
        check(label+' Health UI and persistence',response.status==200,data.get('message'))
        rid=data['resumeId'];uploaded.append(rid)
        check(label+' Health reconciles',abs(data['readiness']['score']-sum(x['pointsAwarded'] for x in data['readiness']['breakdown']))<.01)
        check(label+' download bytes',ctx.request.get(API+'/resumes/'+rid+'/download').body()==path.read_bytes())
        row={'resume':label,'health':data['readiness']['score']}
        for kind in ['junior','senior']:
            page.goto(BASE+'/app/ats?resumeId='+rid)
            page.get_by_text('Using your stored PDF',exact=False).wait_for()
            page.get_by_role('button',name=re.compile('For a specific role')).click()
            page.locator('textarea').fill((FIXTURES/(kind+'.md')).read_text())
            with page.expect_response(lambda r:'/analyses/jd-match' in r.url,timeout=180000) as result:
                page.get_by_role('button',name='Analyze + match').click()
            response=result.value;data=response.json()
            check(label+' '+kind+' real inference',response.status==200 and data.get('versions',{}).get('embeddingStatus')=='real')
            page.wait_for_url('**/app/analysis/*')
            page.get_by_role('button',name='Copy report for LLM').click()
            page.get_by_role('button',name='Copied for LLM').wait_for()
            initial=page.evaluate('navigator.clipboard.readText()')
            fresh=ctx.new_page();fresh.goto(BASE+'/app/analysis/'+data['analysisId'])
            fresh.get_by_role('button',name='Copy report for LLM').click()
            fresh.get_by_role('button',name='Copied for LLM').wait_for()
            restored=fresh.evaluate('navigator.clipboard.readText()')
            if initial!=restored:
                (FIXTURES/'parity-initial.md').write_text(initial)
                (FIXTURES/'parity-restored.md').write_text(restored)
            check(label+' '+kind+' exact fresh-tab export parity',initial==restored)
            check(label+' '+kind+' all responsibilities covered',len(data['jdMatch']['responsibilityCoverage'])==(12 if kind=='junior' else 15))
            if kind=='senior':
                check(label+' senior qualification gap',data['jdMatch']['eligibility']=='ineligible')
                check(label+' senior warning visible',fresh.get_by_text('Not currently qualified for this role',exact=True).is_visible())
            row[kind]=data['jdMatch']['score'];fresh.close()
        scores.append(row)
    (FIXTURES/'implementation-scores.json').write_text(json.dumps(scores,indent=2))
    cache_rows=int(sql('SELECT count(*) FROM embedding_cache;'))
    check('Persistent embedding cache populated',cache_rows>0,cache_rows)
    rid=uploaded[-1]
    prefs={'targetRoles':['Audit Software Engineer'],'locations':['India'],'workModes':['remote'],'emphasizedSkills':['Python'],'excludedRoles':[],'seniority':['junior']}
    r=ctx.request.put(API+'/profile/job-preferences',headers=headers,data=prefs)
    check('Save preferences',r.status==200)
    check('Read saved preferences',ctx.request.get(API+'/profile/job-preferences').json()['preferences']['targetRoles']==prefs['targetRoles'])
    profile=json.loads(sql(f"SELECT profile_json FROM resume_profiles WHERE resume_id='{rid}';"))
    seed(profile,prefs,uuid.uuid4().hex)
    body={'resumeId':rid,'idempotencyKey':str(uuid.uuid4())}
    result=ctx.request.post(API+'/recommendation-runs',headers=headers,data=body,timeout=180000)
    data=result.json()
    check('65 synthetic eligible candidates saved',result.status==200 and data.get('returnedCount')==65,data)
    run_id=data['runId']
    stored=ctx.request.get(API+f'/recommendation-runs/{run_id}/results?limit=100').json()
    check('Persistence readback matches response',len(stored['results'])==65 and stored['results'][:20]==data['recommendations'])
    check('All recommendation UUIDs resolve',int(sql(f"SELECT count(*) FROM recommendations r JOIN jobs j ON r.job_id=j.id WHERE run_id='{run_id}';"))==65)
    again=ctx.request.post(API+'/recommendation-runs',headers=headers,data=body,timeout=180000).json()
    check('Idempotency returns original run',again['runId']==run_id and again['recommendations']==data['recommendations'])
    cache_after_first_recommendation=int(sql('SELECT count(*) FROM embedding_cache;'))
    second=ctx.request.post(API+'/recommendation-runs',headers=headers,data={'resumeId':rid},timeout=180000).json()
    check('Existing-job conflicts still persist',second.get('returnedCount')==65 and len(ctx.request.get(API+f"/recommendation-runs/{second['runId']}/results?limit=100").json()['results'])==65)
    check('Recommendation cache remains reusable',int(sql('SELECT count(*) FROM embedding_cache;'))==cache_after_first_recommendation)
    # Fail one insert deliberately in this isolated DB; all preceding rows must roll back.
    sql("""CREATE OR REPLACE FUNCTION audit_recommendation_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.rank=3 THEN RAISE EXCEPTION 'audit failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER audit_fail BEFORE INSERT ON recommendations FOR EACH ROW EXECUTE FUNCTION audit_recommendation_fail();""")
    try:
        failed=ctx.request.post(API+'/recommendation-runs',headers=headers,data={'resumeId':rid},timeout=180000)
        failed_data=failed.json()
        check('Failed insert returns truthful failure',failed.status==500 and failed_data.get('persisted') is False)
        check('Failed run has no partial rows',sql(f"SELECT count(*) FROM recommendations WHERE run_id='{failed_data['runId']}';")=='0')
    finally:
        sql('DROP TRIGGER audit_fail ON recommendations; DROP FUNCTION audit_recommendation_fail();')
    # Stored pages preserve order and do not rerun providers/model.
    pages=[]
    for offset in [0,20,40,60]:pages.extend(ctx.request.get(API+f'/recommendation-runs/{run_id}/results?offset={offset}&limit=20').json()['results'])
    check('Pagination preserves all65 ranks',pages==stored['results'])
    with page.expect_response(lambda r:r.request.method=='POST' and r.url.endswith('/recommendation-runs'),timeout=180000):
        page.goto(BASE+'/app/jobs')
    # Client-side threshold must not hide synthetic page counts from the UI check.
    page.get_by_role('button',name='Preferences',exact=True).click()
    page.locator('input[type=number][max="100"]').fill('0')
    load=page.get_by_role('button',name=re.compile('Load more',re.I))
    while load.is_visible():
        load.click();page.wait_for_timeout(150)
    check('UI displays65 persisted candidates',page.locator('main h3').filter(has_text='Junior Software Engineer').count()==65)
    check('Malformed ID is client error',ctx.request.get(API+'/analyses/not-a-uuid').status==400)
    check('Unreadable PDF rejected at upload',ctx.request.post(API+'/resumes',headers=headers,multipart={'resume':{'name':'invalid.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4\n'+b' '*10000}}).status==422)
    revoked=ctx.cookies()
    check('Logout all succeeds',ctx.request.post(API+'/auth/logout-all',headers=headers).status==200)
    check('Session revoked',ctx.request.get(API+'/auth/session').status==401)
    cookie=next(x['value'] for x in revoked if x['name']=='jobhunter_session')
    clean=p.request.new_context()
    check('Revoked bearer cannot bypass logout',clean.get(API+'/auth/session',headers={'Authorization':'Bearer '+cookie}).status==401)
    clean.dispose();browser.close()
print('All isolated integration checks passed.',flush=True)
