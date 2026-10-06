import {test,expect} from 'bun:test';
import {checkJobsAvailability,parseAvailability,allowedHost,isPublicAddress,verifySemanticAvailability,extractClosureCandidateSnippets} from '../modules/jobs/availability.js';
import {eligibleJob,effectivePreferences} from '../modules/jobs/eligibility.js';
const now=new Date().toISOString();
const job=(extra:any={})=>({source:'fixture',externalId:'1',title:'Frontend Engineer',company:'Example',description:'Build interfaces',descriptionQuality:'full',location:'Bengaluru, India',url:'https://www.indeed.com/viewjob?jk=test',postedAt:now,salary:null,workMode:null,...extra} as any);
const ld=(title:string,validThrough:string,directApply=true)=>`<script type="application/ld+json">${JSON.stringify({'@graph':[{'@type':'JobPosting',title,validThrough,directApply,hiringOrganization:{name:'Example'}}]})}</script>`;
test('expired original posting and matching expired JSON-LD are closed, not high-fit opportunities',()=>{
 expect(parseAvailability('This job has expired on Indeed',job(),'indeed',now).status).toBe('closed');
 expect(parseAvailability('Not currently accepting applications',job(),'linkedin',now).status).toBe('closed');
 expect(parseAvailability('Applications are closed',job(),'greenhouse',now).status).toBe('closed');
 expect(parseAvailability('',job(),'linkedin',now,'https://www.linkedin.com/jobs/search?trk=expired_jd_redirect').status).toBe('closed');
 expect(parseAvailability('',job({description:'Note: This job is closed'}),'adzuna',now).status).toBe('closed');
 expect(parseAvailability(ld('Frontend Engineer','2000-01-01'),job(),'indeed',now).status).toBe('closed');
 expect(parseAvailability(ld('Unrelated Backend Architect','2000-01-01'),job(),'indeed',now).status).toBe('unknown');
});
test('HTTP200, generic apply text or challenge never prove open; matching future active metadata does',()=>{
 expect(parseAvailability('Welcome. Apply to our newsletter',job(),'indeed',now).status).toBe('unknown');
 expect(parseAvailability('Verify you are human '+ld('Frontend Engineer','2099-01-01'),job(),'indeed',now).status).toBe('unknown');
 expect(parseAvailability(ld('Frontend Engineer','2099-01-01'),job(),'indeed',now).status).toBe('open');
 expect(parseAvailability(ld('Frontend Engineer','2099-01-01',false)+'<a href="https://example.test/apply" disabled>Apply</a>',job(),'indeed',now).status).toBe('unknown');
});
test('availability blocks unsafe URLs and reserved addresses',async()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','100.64.0.1','172.20.0.1','192.168.1.1','::1','::ffff:127.0.0.1','2001:db8::1'])expect(isPublicAddress(ip)).toBe(false);
 expect(isPublicAddress('8.8.8.8')).toBe(true);expect(allowedHost('indeed.com.evil.test')).toBe(false);
 let calls=0;
 const rows=await checkJobsAvailability(['http://indeed.com/x','https://127.0.0.1/x','https://user:pass@indeed.com/x','https://indeed.com:8443/x','https://indeed.com.evil.test/x'].map(url=>job({url})),{fetch:async()=>{calls++;return {status:200,body:ld('Frontend Engineer','2099-01-01')};}});
 expect(calls).toBe(0);expect(rows.every(x=>x.availability.status==='unknown')).toBe(true);
});
test('availability error/redirect stays unknown; bounded workers finish timed-out reads',async()=>{
 let active=0,peak=0;
 const rows=await checkJobsAvailability([0,1,2,3].map(i=>job({url:`https://indeed.com/viewjob?jk=concurrency-${i}`})),{concurrency:2,ttlMs:0,fetch:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {status:500,body:ld('Frontend Engineer','2099-01-01')};}});
 expect(peak).toBe(2);expect(rows.every(x=>x.availability.status==='unknown')).toBe(true);
 const timed=await checkJobsAvailability([job({url:'https://indeed.com/viewjob?jk=timeout-test'})],{deadlineMs:5,fetch:async(_u,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))))});expect(timed[0].availability.status).toBe('unknown');
});
test('strict freshness excludes unknown, updated-only, old and future dates; explicit opt-in stays uncertain',()=>{
 const p=effectivePreferences(null,{locations:['India'],daysPosted:7});
 for(const j of [job({postedAt:null}),job({dateSource:'updated'}),job({postedAt:'2000-01-01'}),job({postedAt:'2099-01-01'})])expect(eligibleJob(j,'entry',p).status).toBe('ineligible');
 expect(eligibleJob(job({postedAt:null}),'entry',{...p,includeUnknownDates:true}).status).toBe('uncertain');
 expect(eligibleJob(job(),'entry',p).status).toBe('eligible');
 expect(eligibleJob(job({availability:{status:'closed'}}),'entry',p).status).toBe('ineligible');
 expect(eligibleJob(job(),'entry',{...p,verifiedOpenOnly:true}).status).toBe('ineligible');
});
test('India search excludes US and LATAM restrictions instead of treating remote as worldwide',()=>{
 const p=effectivePreferences(null,{locations:['India']});
 for(const j of [job({location:'New York, NY'}),job({location:'Remote',title:'Frontend Engineer (Latin America)'}),job({location:'Remote',description:'US residents only'})])expect(eligibleJob(j,'entry',p).status).toBe('ineligible');
 expect(eligibleJob(job({location:'',title:'Backend Developer - Paris'}),'entry',p).status).toBe('ineligible');
 expect(eligibleJob(job({location:'Madurai, Tamil Nadu'}),'entry',p).status).toBe('eligible');
});

test('extractClosureCandidateSnippets finds closure-adjacent sentences', () => {
  const j = job({
    description: 'We are looking for a Senior Developer.\nApplications for this vacancy are now closed.\nRequirements: React and Node.js.'
  });
  const snippets = extractClosureCandidateSnippets(j);
  expect(snippets.some(s => s.includes('Applications for this vacancy are now closed'))).toBe(true);
  expect(snippets.some(s => s.includes('Senior Developer'))).toBe(false);
});

test('verifySemanticAvailability marks semantically closed jobs as closed', async () => {
  const closedJob = job({
    description: 'Great role at Acme Inc.\nApplications for this vacancy are now closed.\nGood luck.'
  });
  const activeJob = job({
    description: 'Great role at Acme Inc.\nWe are actively hiring and accepting applications for this open role.\nJoin us.'
  });

  const stubProvider = {
    embed: async ({ texts }: { texts: string[] }) => {
      const vectors = texts.map(t => {
        const lower = t.toLowerCase();
        if (lower.includes('closed') || lower.includes('no longer accepting')) {
          return [1, 0, 0, 0];
        }
        if (lower.includes('actively') || lower.includes('hiring') || lower.includes('apply now')) {
          return [0, 1, 0, 0];
        }
        return [0.1, 0.1, 0, 0];
      });
      return { vectors, modelId: 'test-semantic-384', dimension: 4 };
    }
  };

  const results = await verifySemanticAvailability([closedJob, activeJob], stubProvider as any);
  expect(results[0].availability?.status).toBe('closed');
  expect(results[1].availability?.status).not.toBe('closed');
});

