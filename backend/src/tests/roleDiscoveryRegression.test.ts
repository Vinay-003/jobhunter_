import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { discoverRoles, inferRoleTitles, profileMaterial, parseRoleOutput } from '../modules/jobs/roleDiscovery.js';
import { JobQueryPlanner } from '../modules/jobs/queryPlanner.js';
const profile:any={summary:null,skills:['React','Express','PostgreSQL'],experience:[{title:'Software Development Intern',description:'Implemented REST APIs and React interfaces',kind:'internship'}],projects:[{title:'Hiring platform | React, Express, PostgreSQL',description:'Built authentication and payment integration with database persistence'}],education:[{degree:'B.Tech',completed:false,completionDate:'May 2027'}],seniority:'intern'};
const valid={roles:[{title:'Full Stack Developer',reason:'Both application layers evidenced.',evidence:['Implemented REST APIs and React interfaces']},{title:'Backend Developer',reason:'Server and persistence evidenced.',evidence:['Built authentication and payment integration']},{title:'Frontend Developer',reason:'Interfaces explicitly evidenced.',evidence:['React interfaces']}]};
const response=(x:unknown)=>JSON.stringify({choices:[{message:{content:JSON.stringify(x)}}]});
let key:string|undefined,model:string|undefined;
beforeEach(()=>{key=process.env.APINEX_API_KEY;model=process.env.APINEX_ROLE_MODEL;process.env.APINEX_API_KEY='unit-test-placeholder';process.env.APINEX_ROLE_MODEL='free/gpt-6-luna';});
afterEach(()=>{if(key===undefined)delete process.env.APINEX_API_KEY;else process.env.APINEX_API_KEY=key;if(model===undefined)delete process.env.APINEX_ROLE_MODEL;else process.env.APINEX_ROLE_MODEL=model;});
describe('role discovery',()=>{
  test('mixed demonstrated stacks give fullstack first; all three manual titles covered',()=>{
    expect(inferRoleTitles(profile)).toEqual(['Full Stack Developer','Backend Developer','Frontend Developer']);
    expect(new JobQueryPlanner().plan({targetRoles:valid.roles.map(r=>r.title)},profile).slice(0,3).map(q=>q.keywords)).toEqual(valid.roles.map(r=>r.title));
  });
  test('built is not UI; skill-only React does not override backend work',()=>{
    expect(inferRoleTitles({...profile,projects:[],experience:[{title:'Developer',description:'Built REST APIs using FastAPI and PostgreSQL'}]})).toEqual(['Backend Developer']);
  });
  test('material retains late projects, removes contacts, and retains education status',()=>{
    const p={...profile,summary:'Contact sample@example.test https://example.test +91 98765 43210',projects:[{title:'One',description:'x'.repeat(1500)},{title:'Last project',description:'tail-marker REST API'}]};
    const s=profileMaterial(p);expect(s).toContain('tail-marker');expect(s).toContain('completed=false');expect(s).not.toContain('sample@example.test');expect(s).not.toContain('98765');
  });
  test('valid AI output is owner-isolated and cached; no paid model allowed',async()=>{
    let calls=0;const transport=async(q:any)=>{calls++;expect(JSON.parse(q.body).model).toBe('free/gpt-6-luna');return response(valid);};
    const a=await discoverRoles(profile,{ownerId:'unit-valid-a',transport});expect(a.source).toBe('ai');
    expect((await discoverRoles(profile,{ownerId:'unit-valid-a',transport})).cacheKey).toBe(a.cacheKey);expect(calls).toBe(1);
    const b=await discoverRoles(profile,{ownerId:'unit-valid-b',cached:a,transport});expect(b.cacheKey).not.toBe(a.cacheKey);expect(calls).toBe(2);
    process.env.APINEX_ROLE_MODEL='gpt-6-luna';expect((await discoverRoles(profile,{ownerId:'unit-paid',transport})).source).toBe('fallback');expect(calls).toBe(2);
  });
  test('invalid Luna output retries once on MiMo and caches actual model identity per owner',async()=>{
    for (const [index, invalid] of ['not-json', JSON.stringify({choices:[{message:{content:''}}]}), response({roles:valid.roles.map(r=>({...r,evidence:['invented evidence outside the resume']}))})].entries()) {
      const models:string[]=[];
      const transport=async(q:any)=>{models.push(JSON.parse(q.body).model);expect(q.timeoutMs).toBeGreaterThan(0);expect(q.timeoutMs).toBeLessThanOrEqual(models.length%2===1?45_000:25_000);return models.length%2===1?invalid:response(valid);};
      const ownerId=`unit-mimo-${index}`;
      const result=await discoverRoles(profile,{ownerId,transport});
      expect(result.source).toBe('ai');expect(result.model).toBe('free/mimo-v2.6-pro');expect(result.warning).toContain('Luna returned invalid');
      expect(models).toEqual(['free/gpt-6-luna','free/mimo-v2.6-pro']);
      expect((await discoverRoles(profile,{ownerId,cached:result,transport})).model).toBe('free/mimo-v2.6-pro');expect(models.length).toBe(2);
      await discoverRoles(profile,{ownerId:`${ownerId}-other`,cached:result,transport});expect(models.length).toBe(4);
    }
  });
  test('both invalid outputs use local deterministic fallback with no raw content leaked',async()=>{
    const models:string[]=[];
    const result=await discoverRoles(profile,{ownerId:'unit-both-invalid',transport:async(q:any)=>{models.push(JSON.parse(q.body).model);return 'private-raw-invalid-output';}});
    expect(models).toEqual(['free/gpt-6-luna','free/mimo-v2.6-pro']);
    expect(result.source).toBe('fallback');expect(result.model).toBeNull();expect(result.roles.map(r=>r.title)).toEqual(inferRoleTitles(profile));
    expect(JSON.stringify(result)).not.toContain('private-raw-invalid-output');
  });
  test('missing configuration cannot use persisted cache or in-flight request',async()=>{
    let calls=0;const transport=async()=>{calls++;return response(valid);};
    const cached=await discoverRoles(profile,{ownerId:'unit-config-cache',transport});expect(calls).toBe(1);
    delete process.env.APINEX_API_KEY;
    const result=await discoverRoles(profile,{ownerId:'unit-config-cache',cached,transport});
    expect(result.source).toBe('fallback');expect(result.warning).toContain('NOT_CONFIGURED');expect(calls).toBe(1);
  });
  test('malformed JSON, hallucinated quotes, duplicates and premature seniority fail safely',async()=>{
    for(const [i,x] of [null,{roles:valid.roles.map(r=>({...r,evidence:['NOT IN THE RESUME AT ALL']}))},{roles:[valid.roles[0],valid.roles[0],valid.roles[2]]},{roles:valid.roles.map(r=>({...r,title:'Senior '+r.title}))}].entries()) {
      expect((await discoverRoles(profile,{ownerId:'unit-invalid-'+i,transport:async()=>response(x)})).source).toBe('fallback');
    }
  });
  test('transport failure does not retry or expose response/key',async()=>{
    let calls=0;const r=await discoverRoles(profile,{ownerId:'unit-failed',transport:async()=>{calls++;throw Error('secret-bearing arbitrary error');}});
    expect(calls).toBe(1);expect(r.source).toBe('fallback');expect(JSON.stringify(r)).not.toContain('secret-bearing');expect(JSON.stringify(r)).not.toContain('unit-test-placeholder');
  });
  test('numbered evidence maps to actual passages and rejects unknown passage IDs',async()=>{
    const input={roles:valid.roles.map(r=>({title:r.title,reason:r.reason,evidenceIds:['P2']}))};
    const r=await discoverRoles(profile,{ownerId:'unit-ids',transport:async()=>response(input)});expect(r.source).toBe('ai');expect(r.roles[0].evidence[0]).toBe(profile.experience[0].description);
    input.roles[0].evidenceIds=['P999'];expect((await discoverRoles(profile,{ownerId:'unit-bad-id',transport:async()=>response(input)})).source).toBe('fallback');
  });
  test('closing-delimiter repair never invents missing strings or properties',()=>{
    expect(parseRoleOutput('{"roles":[]}').repaired).toBe(false);
    expect(parseRoleOutput('{"roles":[]').value).toEqual({roles:[]});
    expect(()=>parseRoleOutput('{"roles":[{"title":"unfinished')).toThrow();
    expect(()=>parseRoleOutput('{"roles": nope')).toThrow();
  });
});
