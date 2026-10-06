import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import type { JobAvailability, NormalizedJob } from '../../providers/jobs/JobProvider.js';

export type AvailabilityResponse={status:number;body:string;finalUrl?:string;location?:string};
export type AvailabilityOptions={fetch?:(url:string,init:{signal:AbortSignal;redirect:'manual'})=>Promise<AvailabilityResponse>; concurrency?:number; deadlineMs?:number; batchDeadlineMs?:number; ttlMs?:number; now?:()=>string; allowHosts?:string[]; maxChecks?:number};
export const DEFAULT_ALLOWED_HOSTS=['indeed.com','linkedin.com','jooble.org','adzuna.com','arbeitnow.com','greenhouse.io','lever.co','ashbyhq.com','myworkdayjobs.com','workday.com'];
const cache=new Map<string,{at:number;value:JobAvailability}>(); const MAX_CACHE=256;
export const CLOSURE_PATTERN = /(?:not\s+(?:currently\s+)?accepting\s+(?:any\s+)?applications|not\s+accepting\s+applications|no\s+longer\s+accepting(?:\s+(?:any\s+)?applications)?|applications\s+(?:are\s+)?closed|applications?\s+no\s+longer\s+accepted|position\s+(?:has\s+been\s+)?filled|role\s+(?:has\s+been\s+)?filled|this\s+job\s+has\s+expired|job\s+has\s+expired|posting\s+has\s+expired|this\s+job\s+is\s+no\s+longer\s+available|this\s+position\s+is\s+no\s+longer\s+available|this\s+posting\s+is\s+closed|this\s+listing\s+is\s+no\s+longer\s+available|listing\s+is\s+no\s+longer\s+available|not\s+open\s+for\s+applications|no\s+longer\s+open\s+for\s+applications|submissions?\s+(?:are\s+)?closed|position\s+closed|job\s+is\s+closed|role\s+is\s+closed|no\s+longer\s+taking\s+applications|closed\s+for\s+applications|this\s+opening\s+is\s+closed|job\s+listing\s+is\s+closed)/i;
const challenge=/captcha|cloudflare|access denied|verify you are human|bot detection|challenge/i;
const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function isPublicAddress(address:string): boolean {
  if (net.isIP(address) === 4) {
    const [a,b] = address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===0||b===168)||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
  }
  // Conservative IPv6 global-unicast only; mapped/transition/reserved forms fail closed.
  const a=address.toLowerCase();
  return net.isIP(a)===6 && /^[23][0-9a-f]{3}:/.test(a) && !/^(?:2001:(?:db8|0|10|20):|2002:)/.test(a);
}
export function allowedHost(host:string,allow=DEFAULT_ALLOWED_HOSTS){const h=host.toLowerCase().replace(/\.$/,''); return allow.some(x=>h===x||h.endsWith('.'+x));}
const uok=(raw:string,allow:string[])=>{try{const u=new URL(raw); if(u.protocol!=='https:'||u.port&&u.port!=='443'||u.username||u.password||!allowedHost(u.hostname,allow))return null; return u;}catch{return null;}};
function result(status:JobAvailability['status'],reason:string,source:string,now:string):JobAvailability{return {status,reason,source,checkedAt:now};}
export function parseAvailability(body:string,job:NormalizedJob,source:string,now:string,finalUrl?:string):JobAvailability{
 if(finalUrl && /(?:expired_jd_redirect|job_expired|job-expired|posting_expired)/i.test(finalUrl)) return result('closed','Redirected to expired job page',source,now);
 if(CLOSURE_PATTERN.test(body))return result('closed','Explicit closure notice',source,now);
 if(CLOSURE_PATTERN.test(job.description ?? '') || CLOSURE_PATTERN.test(job.title))return result('closed','Posting text indicates closed',source,now);
 if(/(?:verify you are human|access denied|cf-chl-|challenge-platform|just a moment)/i.test(body))return result('unknown','Bot challenge or access denied',source,now);
 const candidates:any[]=[]; for(const m of body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{const x=JSON.parse(m[1]); const add=(v:any)=>{if(v?.['@type']==='JobPosting'||(Array.isArray(v?.['@type'])&&v['@type'].includes('JobPosting')))candidates.push(v); else if(v?.['@graph'])v['@graph'].forEach(add);}; Array.isArray(x)?x.forEach(add):add(x);}catch{}}
 const title=norm(job.title); const match=(v:any)=>{const t=norm(String(v.title??v.name??'')); const words=title.split(' ').filter(x=>x.length>2); return t===title||(words.length>=3&&words.filter(x=>t.includes(x)).length/words.length>=.67);}; const matched=candidates.find(match); if(candidates.length&&!matched)return result('unknown','Job page identity does not match',source,now);
 if(matched?.validThrough&&Date.parse(matched.validThrough)<=Date.parse(now))return result('closed','JSON-LD validThrough expired',source,now);
 const org=matched?.hiringOrganization?.name;
 if(org && norm(job.company) && !norm(String(org)).includes(norm(job.company)) && !norm(job.company).includes(norm(String(org)))) return result('unknown','Employer identity does not match',source,now);
 const actionable=matched&&Date.parse(matched.validThrough)>Date.parse(now)&&(matched.directApply===true||/<(?:form|a)\b(?![^>]*(?:disabled|aria-disabled=["']true))[^>]*(?:href|action)=["']https?:\/\/[^"']*(?:apply|application)[^"']*["']/i.test(body));
 return actionable?result('open','Matching JobPosting has actionable application evidence',source,now):result('unknown','No conservative availability evidence',source,now);
}
async function nativeFetch(raw:string,signal:AbortSignal,allow:string[],maxBytes=524288):Promise<AvailabilityResponse> {
  let current=raw;
  for(let hops=0;hops<=3;hops++) {
    const u=uok(current,allow); if(!u||signal.aborted)throw Error('unsafe URL or aborted');
    const addrs=await dns.lookup(u.hostname,{all:true});
    if(!addrs.length||addrs.some(x=>!isPublicAddress(x.address))||signal.aborted)throw Error('unsafe address');
    const pinned=addrs[0];
    const r=await new Promise<AvailabilityResponse>((resolve,reject)=>{
      const req=https.get({hostname:u.hostname,path:u.pathname+u.search,port:443,servername:u.hostname,signal,
        headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36','Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'},
        lookup:((_h:unknown,opts:any,cb:any)=>opts?.all?cb(null,[pinned]):cb(null,pinned.address,pinned.family)) as any},res=>{
        let n=0,s='';res.setEncoding('utf8');
        res.on('data',c=>{n+=Buffer.byteLength(c);if(n>maxBytes)req.destroy(Error('too large'));else s+=c;});
        res.on('end',()=>resolve({status:res.statusCode??0,body:s,location:String(res.headers.location??'')}));res.on('error',reject);
      });req.once('error',reject);
    });
    if(r.status>=300&&r.status<400&&r.location){current=new URL(r.location,current).toString();continue;}
    return {...r,finalUrl:current};
  }
  throw Error('redirect limit');
}
export async function checkJobsAvailability(jobs:NormalizedJob[],o:AvailabilityOptions={}):Promise<NormalizedJob[]> {
  const now=o.now?.()??new Date().toISOString(),allow=o.allowHosts??DEFAULT_ALLOWED_HOSTS;
  const list=jobs.slice(0,Math.min(20,o.maxChecks??jobs.length));
  const transport=o.fetch??(async(u,i)=>nativeFetch(u,i.signal,allow));
  const deadline=Date.now()+(o.batchDeadlineMs??15000);let at=0;
  for(const j of jobs) j.availability ??= {status:'unknown',reason:'Not checked in bounded shortlist',source:j.source,checkedAt:null};
  const worker=async()=>{while(true){
    const i=at++;if(i>=list.length||Date.now()>=deadline)return;const j=list[i];
    const url=j.url&&uok(j.url,allow);
    if(!url){j.availability=result('unknown','URL is not an allowed public HTTPS URL',j.source,now);continue;}
    const key=url.toString()+'|'+norm(j.title)+'|'+norm(j.company),hit=cache.get(key);
    if(hit&&Date.now()-hit.at<(o.ttlMs??300000)){j.availability=hit.value;continue;}
    const ac=new AbortController();let timer:ReturnType<typeof setTimeout>;
    const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{ac.abort();reject(Error('timeout'));},Math.min(o.deadlineMs??4000,deadline-Date.now()));});
    try {
      const r=await Promise.race([transport(url.toString(),{signal:ac.signal,redirect:'manual'}),timeout]);
      const v=r.status!==200?result('unknown',`HTTP ${r.status}`,j.source,now):parseAvailability(r.body,j,j.source,now,r.finalUrl);
      cache.set(key,{at:Date.now(),value:v});if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value!);j.availability=v;
    } catch {j.availability=result('unknown','Fetch failed or timed out',j.source,now);} finally {clearTimeout(timer!);ac.abort();}
  }};
  await Promise.all(Array.from({length:Math.max(1,Math.min(8,o.concurrency??4))},worker));return jobs;
}
