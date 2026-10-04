import { test,expect } from 'bun:test';
import { retrievalPlan } from '../providers/jobs/retrievalPlan.js';
import { executeRetrieval } from '../providers/jobs/retrievalExecutor.js';
test('three titles cover all providers before deeper pages without duplicate calls',()=>{
  const roles=['Full Stack Developer','Backend Developer','Frontend Developer'];
  const p=retrievalPlan(['jooble','adzuna','jobspipe','remotive','arbeitnow'],['India'],roles);
  expect(p.slice(0,15).every(s=>s.page===1)).toBe(true);expect(new Set(p.map(s=>JSON.stringify(s))).size).toBe(p.length);
  for(const role of roles)expect(p.slice(0,15).filter(s=>s.keywords===role)).toHaveLength(5);
});
test('real overlap stays within global/per-provider bounds and awaits callbacks',async()=>{
  const p=retrievalPlan(['jooble','adzuna','jobspipe'],['India'],['Full Stack Developer','Backend Developer','Frontend Developer']);
  let active=0,peak=0;const providers=new Map<string,number>();let firstDone=0;
  const r=await executeRetrieval(p,async s=>{if(s.page>1)expect(firstDone).toBe(9);active++;peak=Math.max(peak,active);expect(providers.get(s.provider)??0).toBe(0);providers.set(s.provider,1);await new Promise(r=>setTimeout(r,5));providers.set(s.provider,0);active--;if(s.page===1)firstDone++;return {};},{globalConcurrency:3,perProviderConcurrency:1});
  expect(peak).toBe(3);expect(active).toBe(0);expect(r.filter(x=>x.step.provider==='jobspipe')).toHaveLength(3);expect(r.every(x=>x.ok)).toBe(true);
});
test('cursor ends on absence/repetition and errors never leak',async()=>{
  const steps=[1,2,3].map(page=>({provider:'jobspipe',keywords:'Engineer',location:'',page}));
  const seen:(string|undefined)[]=[];
  const r=await executeRetrieval(steps,async(s,c)=>{seen.push(c);return s.page===1?{nextCursor:'opaque-cursor'}:{};});
  expect(seen).toEqual([undefined,'opaque-cursor']);expect(r).toHaveLength(2);
  const repeated=await executeRetrieval(steps,async()=>({nextCursor:'same'}));expect(repeated).toHaveLength(2);
  const failed=await executeRetrieval(steps,async()=>{throw Error('private credential');});expect(failed).toHaveLength(1);expect(JSON.stringify(failed)).not.toContain('private credential');
});
