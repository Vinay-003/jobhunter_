import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { requireSession as authenticate } from '../../middleware/requireSession.js';
import { JoobleProvider } from '../../providers/jobs/JoobleProvider.js';
import { AdzunaProvider } from '../../providers/jobs/AdzunaProvider.js';
import { RemotiveProvider } from '../../providers/jobs/RemotiveProvider.js';
import { ArbeitnowProvider, arbeitnowCacheHours } from '../../providers/jobs/ArbeitnowProvider.js';
import { JobsPipeProvider } from '../../providers/jobs/JobsPipeProvider.js';
import { JobQueryPlanner } from '../../modules/jobs/queryPlanner.js';
import { rankJobsBatch, VERSION as rankerVersion } from '../../modules/jobs/ranking.js';
import { deduplicateJobs, upsertJob } from '../../providers/jobs/jobStore.js';
import { reserveDailyCall } from '../../providers/jobs/providerBudgets.js';
import type { NormalizedJob, JobProvider, ProviderSearchResult } from '../../providers/jobs/JobProvider.js';
import { retrievalPlan, sourceEnvelope } from '../../providers/jobs/retrievalPlan.js';
import { effectivePreferences, eligibleJob, countryCodeForLocation } from '../../modules/jobs/eligibility.js';
import parsePdfBuffer from '../../modules/parsing/pdfParser.js';
import { buildResumeProfile } from '../../modules/parsing/resumeProfile.js';
import { downloadFile } from '../../modules/storage/supabaseStorage.js';

const router = Router();
const list = z.array(z.string().trim().min(1).max(120)).max(10);
const createRunSchema = z.object({
  resumeId: z.string().uuid(), targetRoles: list.optional(), locations: list.optional(), workModes: list.optional(),
  emphasizedSkills: list.optional(), excludedRoles: list.optional(), seniority: list.optional(),
  daysPosted: z.number().int().min(1).max(365).optional(), keywords: z.string().trim().max(120).optional(),
  idempotencyKey: z.string().uuid().optional(),
});

function serialise(row: any) {
  const snapshot = row.job_snapshot_json || { title:row.title,company:row.company,location:row.location,description:row.description,url:row.url,salary:row.salary,workMode:row.work_mode,postedAt:row.posted_at,source:row.source };
  return { ...snapshot, id: row.job_id, jobId: row.job_id, rank: row.rank, fitScore: row.fit_score, confidence: row.confidence,
    breakdown: row.breakdown_json ?? {}, evidence: row.evidence_json ?? [], matchedSkills: row.matched_skills_json ?? [],
    missingSkills: row.missing_skills_json ?? [], eligibility: row.eligibility_json ?? { status: 'uncertain', reasons: ['Historical result lacks eligibility evidence'] } };
}
async function results(runId: string, offset: number, limit: number) {
  const { rows } = await pool.query('SELECT r.*,j.title,j.company,j.location,j.description,j.url,j.salary,j.work_mode,j.posted_at,j.source FROM recommendations r JOIN jobs j ON j.id=r.job_id WHERE r.run_id=$1 ORDER BY r.rank ASC LIMIT $2 OFFSET $3', [runId, limit, offset]);
  return rows.map(serialise);
}
const pagination = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) });

router.post('/', authenticate, validate({ body: createRunSchema }), async (req: any, res) => {
  const userId = String(req.user.id);
  const { resumeId, idempotencyKey } = req.body;
  let runId: string | null = null;
  try {
    const resume = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [resumeId, userId]);
    if (!resume.rows[0]) return res.status(404).json({ success: false, message: 'Resume not found' });
    const saved = await pool.query('SELECT * FROM user_job_preferences WHERE user_id=$1', [userId]);
    const preferences = effectivePreferences(saved.rows[0], req.body);
    if (idempotencyKey) {
      const previous = await pool.query('SELECT * FROM recommendation_runs WHERE user_id=$1 AND idempotency_key=$2', [userId, idempotencyKey]);
      if (previous.rows[0]) {
        const prior = previous.rows[0];
        return res.status(prior.status === 'completed' ? 200 : 202).json({ success: prior.status === 'completed', runId: prior.id, persisted: prior.status === 'completed', status: prior.status, returnedCount: prior.returned_count, recommendations: prior.status === 'completed' ? await results(prior.id, 0, 20) : [] });
      }
    }
    runId = crypto.randomUUID();
    const inserted = await pool.query(`INSERT INTO recommendation_runs (id,user_id,resume_id,preferences_snapshot_json,ranker_version,status,idempotency_key)
      VALUES ($1,$2,$3,$4,$5,'running',$6) ON CONFLICT (user_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id`, [runId,userId,resumeId,JSON.stringify(preferences),rankerVersion,idempotencyKey ?? null]);
    if (!inserted.rows.length) {
      const prior = await pool.query('SELECT id,status,returned_count FROM recommendation_runs WHERE user_id=$1 AND idempotency_key=$2', [userId,idempotencyKey]);
      return res.status(202).json({ success: false, persisted: false, runId: prior.rows[0].id, status: prior.rows[0].status, recommendations: [] });
    }
    let profile: any = null;
    const stored = await pool.query('SELECT profile_json,profile_version FROM resume_profiles WHERE resume_id=$1', [resumeId]);
    if (stored.rows[0]?.profile_version === '4.0.0') profile = stored.rows[0].profile_json;
    if (!profile) {
      const buf = await downloadFile({ bucket: resume.rows[0].storage_bucket || 'resumes', path: resume.rows[0].storage_object_path || resume.rows[0].file_path, sha256: '' });
      profile = buildResumeProfile(await parsePdfBuffer(Buffer.from(buf as any)));
      await pool.query('INSERT INTO resume_profiles(resume_id,profile_json,profile_version) VALUES($1,$2,$3) ON CONFLICT(resume_id) DO UPDATE SET profile_json=$2,profile_version=$3', [resumeId,JSON.stringify(profile),'4.0.0']);
    }
    if (!profile || !Array.isArray(profile.skills) || !Array.isArray(profile.experience)) throw new Error('PROFILE_UNAVAILABLE');
    const planned = new JobQueryPlanner().plan({ targetRoles: preferences.targetRoles, excludedRoles: preferences.excludedRoles, emphasizedSkills: preferences.emphasizedSkills }, profile);
    const maxQueries = Math.max(0, Math.min(4, Number(process.env.JOOBLE_MAX_QUERIES_PER_REFRESH || 4)));
    const queries = planned.slice(0, maxQueries).map((q) => q.keywords);
    const primary = queries[0] || planned[0]?.keywords || 'Software Engineer';
    const enabled = new Set((process.env.JOB_PROVIDERS || 'jooble,jobspipe,adzuna,remotive,arbeitnow').split(',').map((s) => s.trim().toLowerCase()));
    const sources: any[] = [];
    const all: NormalizedJob[] = [];
    const runSearch = async (name: string, provider: JobProvider, query: string, location: string, page: number, ttl: number) => {
        const cacheKey = crypto.createHash('sha256').update(JSON.stringify({ version: 5, name, query, location, page, preferences,
          providerLimit: name === 'jobspipe' ? process.env.JOBSPIPE_LIMIT ?? '15' : name === 'adzuna' ? process.env.ADZUNA_RESULTS_PER_PAGE ?? '15' : null,
          ...(name === 'jobspipe' || name === 'adzuna' ? {country:countryCodeForLocation(location) ?? (name === 'jobspipe' ? process.env.JOBSPIPE_COUNTRY ?? 'IN' : process.env.ADZUNA_COUNTRY ?? 'in')} : {}) })).digest('hex');
      const started = new Date().toISOString();
      let cacheHit = false;
      try {
        const cached = await pool.query('SELECT result_json,created_at FROM job_search_cache WHERE query_hash=$1', [cacheKey]);
        let result: ProviderSearchResult;
        if (cached.rows[0] && Date.now() - new Date(cached.rows[0].created_at).getTime() < ttl) {
          const data = cached.rows[0].result_json;
          if (data && !Array.isArray(data) && Array.isArray(data.jobs) && typeof data.status === 'string') {
            result = data; cacheHit = true;
          }
        }
        if (!cacheHit) {
          if (name === 'jooble' && !(await reserveDailyCall('jooble', Number(process.env.JOOBLE_CALL_BUDGET || 100)))) {
            result = { jobs: [], status: 'budgetLimited' };
          } else {
            result = await provider.searchResult({ keywords: query, location, page, country: countryCodeForLocation(location) ?? undefined, seniorityHint: profile.seniority, daysPosted: preferences.daysPosted });
          }
          await pool.query('INSERT INTO job_search_cache (query_hash,query_text,result_json,created_at) VALUES ($1,$2,$3,now()) ON CONFLICT (query_hash) DO UPDATE SET result_json=$3,created_at=now()', [cacheKey, `${name}:${query}`, JSON.stringify(result)]).catch(() => undefined);
        }
        const jobs = result!.jobs;
        sources.push({ provider: name, status: result!.status, cacheHit, fetchedCount: jobs.length,
          ...(result!.fallbackReason ? { fallbackReason: result!.fallbackReason } : {}),
          ...(result!.errorCode ? { errorCode: result!.errorCode } : {}),
          ...(result!.status === 'fallback' ? { fallbackSource: [...new Set(jobs.map(j => j.source))] } : {}),
          location, page, attemptedAt: started });
        all.push(...jobs);
       } catch { sources.push({ ...sourceEnvelope(name,[],cacheHit,'error'), location,page,errorCode: 'PROVIDER_UNAVAILABLE', attemptedAt: started }); }
    };
    const providers: Record<string,[JobProvider,number]> = {
      jooble:[new JoobleProvider(),3600000], jobspipe:[new JobsPipeProvider(),3600000],
      adzuna:[new AdzunaProvider(),3600000], remotive:[new RemotiveProvider(),3600000],
      arbeitnow:[new ArbeitnowProvider(),arbeitnowCacheHours() * 3600000],
    };
    const retrieval = retrievalPlan([...enabled], preferences.locations, queries.length ? queries : [primary]);
    for (const step of retrieval) {
      // Eligibility, not raw count, determines whether further bounded retrieval is useful.
      if (deduplicateJobs(all).filter(job => eligibleJob(job,profile.seniority,preferences,profile).status !== 'ineligible').length >= 50) break;
      const entry = providers[step.provider];
      if (entry) await runSearch(step.provider,entry[0],step.keywords,step.location,step.page,entry[1]);
    }
    const distinct = deduplicateJobs(all);
    const eligible = distinct.map((job) => ({ job, eligibility: eligibleJob(job,profile.seniority,preferences,profile) })).filter((entry) => entry.eligibility.status !== 'ineligible');
    const scored = await rankJobsBatch(profile, eligible.map((entry) => entry.job), { preferences: { locations: preferences.locations }, ownerId: userId });
    const ranked = eligible.map(({ job, eligibility }, i) => ({ ...job, eligibility, ...scored[i], confidence: (scored[i] as any).confidence ?? 'Low' }))
      .sort((a,b) => (a.eligibility.status === 'eligible' ? 0 : 1) - (b.eligibility.status === 'eligible' ? 0 : 1) || b.fitScore-a.fitScore || `${a.source}:${a.externalId}`.localeCompare(`${b.source}:${b.externalId}`))
      .slice(0, 200);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const still = await client.query('SELECT id FROM resumes WHERE id=$1 AND user_id=$2 FOR KEY SHARE', [resumeId,userId]);
      if (!still.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ success:false, message:'Resume removed during ranking', runId, persisted:false }); }
      for (let index=0; index<ranked.length; index++) {
        const job = ranked[index];
        const jobId = await upsertJob(job,client);
        const snapshot = { id:jobId, jobId, title:job.title, company:job.company, location:job.location, description:job.description, descriptionQuality:job.descriptionQuality ?? 'unknown', url:job.url, salary:job.salary, workMode:job.workMode, postedAt:job.postedAt, source:job.source, provenance:job.provenance };
        await client.query(`INSERT INTO recommendations (run_id,job_id,rank,fit_score,confidence,breakdown_json,evidence_json,job_snapshot_json,matched_skills_json,missing_skills_json,eligibility_json)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`, [runId,jobId,index+1,job.fitScore,job.confidence,JSON.stringify(job.breakdown),JSON.stringify(job.evidence),JSON.stringify(snapshot),JSON.stringify(job.matchedSkills),JSON.stringify(job.missingSkills),JSON.stringify(job.eligibility)]);
      }
      await client.query(`UPDATE recommendation_runs SET status='completed',completed_at=now(),embedding_model_id=$2,query_plan_json=$3,provider_status_json=$4,candidate_count=$5,returned_count=$6 WHERE id=$1`, [runId,scored[0]?.embeddingModelId ?? 'none',JSON.stringify(queries),JSON.stringify(sources),distinct.length,ranked.length]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    return res.json({ success:true, runId, persisted:true, totalFetched:all.length, deduped:distinct.length, candidateCount:distinct.length, returnedCount:ranked.length, insufficientEligibleJobs:ranked.length < 50, sources, preferences, recommendations:await results(runId,0,20), nextOffset:ranked.length > 20 ? 20 : null, versions:{ rankerVersion, embeddingModelId:scored[0]?.embeddingModelId ?? 'none' } });
  } catch (error) {
    if (runId) await pool.query("UPDATE recommendation_runs SET status='failed',completed_at=now(),error_code='RECOMMENDATION_FAILED' WHERE id=$1 AND status='running'",[runId]).catch(() => undefined);
    console.error('recommendation run failed', error);
    return res.status(500).json({ success:false, message:'Recommendation run failed', runId, persisted:false });
  }
});
router.get('/:id',authenticate,async (req:any,res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ success:false,message:'Invalid run ID' });
  const run = await pool.query('SELECT * FROM recommendation_runs WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
  if (!run.rows[0]) return res.status(404).json({success:false,message:'Run not found'});
  res.json({success:true,run:run.rows[0]});
});
router.get('/:id/results',authenticate,async (req:any,res) => {
  if (!z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({success:false,message:'Invalid run ID'});
  const page = pagination.safeParse(req.query);
  if (!page.success) return res.status(400).json({success:false,message:'Invalid pagination'});
  try {
    const run = await pool.query('SELECT * FROM recommendation_runs WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);
    if (!run.rows[0]) return res.status(404).json({success:false,message:'Run not found'});
    const {offset,limit} = page.data;
    const rows = await results(req.params.id,offset,limit);
    res.json({success:true,runId:req.params.id,total:run.rows[0].returned_count,results:rows,nextOffset:offset+rows.length<run.rows[0].returned_count ? offset+rows.length : null});
  } catch { res.status(500).json({success:false,message:'Could not read recommendations'}); }
});
export default router;
