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
import { rankJobsBatch, VERSION as algorithmVersion } from '../../modules/jobs/ranking.js';
import { deduplicateJobs, upsertJob, upsertJobsBatch } from '../../providers/jobs/jobStore.js';
import { reserveDailyCall } from '../../providers/jobs/providerBudgets.js';
import type { NormalizedJob, JobProvider, ProviderSearchResult } from '../../providers/jobs/JobProvider.js';
import { retrievalPlan, sourceEnvelope } from '../../providers/jobs/retrievalPlan.js';
import { executeRetrieval } from '../../providers/jobs/retrievalExecutor.js';
import { effectivePreferences, eligibleJob, countryCodeForLocation } from '../../modules/jobs/eligibility.js';
import parsePdfBuffer from '../../modules/parsing/pdfParser.js';
import { buildResumeProfile, PROFILE_VERSION } from '../../modules/parsing/resumeProfile.js';
import { downloadFile } from '../../modules/storage/supabaseStorage.js';
import { recommendationCacheValid, recommendationDiagnostics, recommendationSnapshot } from '../../services/recommendationPersistence.js';
import { discoverRoles, ROLE_DISCOVERY_VERSION } from '../../modules/jobs/roleDiscovery.js';
import { checkJobsAvailability } from '../../modules/jobs/availability.js';
import rateLimit from 'express-rate-limit';

const router = Router();
const workLimiter=rateLimit({windowMs:60_000,max:15,standardHeaders:true,legacyHeaders:false,message:{success:false,message:'Too many recommendation operations; retry shortly.'}});
// Provider normalization changes invalidate both search payloads and completed
// recommendations (older Adzuna payloads mislabeled API excerpts as full JDs).
const retrievalVersion = 9;
// A local-model run is not an AWS validation receipt, even when the configured
// model name is the same. Keep recommendation snapshots provider-specific.
const scoringIdentity = [process.env.EMBEDDING_PROVIDER || 'auto', process.env.EMBEDDING_MODEL_ID || '',
  process.env.LOCAL_EMBEDDING_MODEL || '', process.env.EMBEDDING_MODEL_REVISION || '', process.env.AWS_SAGEMAKER_ENDPOINT_NAME || ''];
const rankerVersion = `${algorithmVersion}:retrieval-${retrievalVersion}:roles-${ROLE_DISCOVERY_VERSION}:${crypto.createHash('sha256').update(JSON.stringify(scoringIdentity)).digest('hex').slice(0, 12)}`;
const list = z.array(z.string().trim().min(1).max(120)).max(10);
const createRunSchema = z.object({
  resumeId: z.string().uuid(), targetRoles: list.max(3).optional(), locations: list.optional(), workModes: list.optional(),
  emphasizedSkills: list.optional(), excludedRoles: list.optional(), seniority: list.optional(),
  daysPosted: z.number().int().min(1).max(365).nullable().optional(), keywords: z.string().trim().max(120).optional(),
  sortBy: z.enum(['match','newest']).optional(), includeUnknownDates: z.boolean().optional(), verifiedOpenOnly: z.boolean().optional(),
  includeUnknownLocations:z.boolean().optional(),
  forceRefresh: z.boolean().optional(),
  idempotencyKey: z.string().uuid().optional(),
});

function serialise(row: any) {
  const snapshot = row.job_snapshot_json || { title:row.title,company:row.company,location:row.location,description:row.description,url:row.url,salary:row.salary,workMode:row.work_mode,postedAt:row.posted_at,source:row.source };
  return { ...snapshot, scoreDetails: snapshot.scoreDetails ?? null, id: row.job_id, jobId: row.job_id, rank: row.rank, fitScore: row.fit_score, confidence: row.confidence,
    breakdown: row.breakdown_json ?? {}, evidence: row.evidence_json ?? [], matchedSkills: row.matched_skills_json ?? [],
    missingSkills: row.missing_skills_json ?? [], eligibility: row.eligibility_json ?? { status: 'uncertain', reasons: ['Historical result lacks eligibility evidence'] } };
}
async function results(runId: string, offset: number, limit: number) {
  const { rows } = await pool.query('SELECT r.*,j.title,j.company,j.location,j.description,j.url,j.salary,j.work_mode,j.posted_at,j.source FROM recommendations r JOIN jobs j ON j.id=r.job_id WHERE r.run_id=$1 ORDER BY r.rank ASC LIMIT $2 OFFSET $3', [runId, limit, offset]);
  return rows.map(serialise);
}
async function cachedRowsCurrent(runId:string,preferences:ReturnType<typeof effectivePreferences>) {
  const rows=await results(runId,0,200);
  return rows.every((job:any)=>{
    const date=Date.parse(job.postedAt),age=Date.now()-date;
    if(preferences.includeUnknownDates===false&&(!Number.isFinite(age)||age<0||job.dateSource==='updated'))return false;
    if(preferences.daysPosted&&Number.isFinite(age)&&age>preferences.daysPosted*86400000)return false;
    if(job.availability?.status==='closed')return false;
    if(job.availability?.status==='open'&&Date.now()-Date.parse(job.availability.checkedAt)>300000)return false;
    return !preferences.verifiedOpenOnly||job.availability?.status==='open';
  });
}
const pagination = z.object({ offset: z.coerce.number().int().min(0).default(0), limit: z.coerce.number().int().min(1).max(100).default(20) });
async function recentClosedUrls(userId:string):Promise<Set<string>> {
  const rows=await pool.query(`SELECT DISTINCT ON (r.job_snapshot_json->>'url') r.job_snapshot_json->>'url' AS url, r.job_snapshot_json->'availability' AS availability
    FROM recommendations r JOIN recommendation_runs rr ON rr.id=r.run_id WHERE rr.user_id=$1 AND r.job_snapshot_json->'availability'->>'checkedAt'>=$2
    ORDER BY r.job_snapshot_json->>'url',r.job_snapshot_json->'availability'->>'checkedAt' DESC LIMIT 1000`,[userId,new Date(Date.now()-86400000).toISOString()]);
  return new Set(rows.rows.filter(r=>r.url&&r.availability?.status==='closed').map(r=>String(r.url)));
}

async function ownedProfile(resume: any) {
  const stored = await pool.query('SELECT profile_json,profile_version FROM resume_profiles WHERE resume_id=$1', [resume.id]);
  if (stored.rows[0]?.profile_version === PROFILE_VERSION) return stored.rows[0].profile_json;
  const buf = await downloadFile({ bucket: resume.storage_bucket || 'resumes', path: resume.storage_object_path || resume.file_path, sha256: '' });
  const profile = buildResumeProfile(await parsePdfBuffer(Buffer.from(buf as any)));
  await pool.query('INSERT INTO resume_profiles(resume_id,profile_json,profile_version) VALUES($1,$2,$3) ON CONFLICT(resume_id) DO UPDATE SET profile_json=$2,profile_version=$3', [resume.id,JSON.stringify(profile),PROFILE_VERSION]);
  return profile;
}
async function roleSuggestions(profile: any, resumeId: string, userId: string) {
  const roleDiscovery = await discoverRoles(profile, { ownerId: userId, cached: profile.roleDiscovery });
  if (roleDiscovery.source === 'ai') await pool.query("UPDATE resume_profiles SET profile_json=jsonb_set(profile_json,'{roleDiscovery}',$2::jsonb) WHERE resume_id=$1 AND EXISTS (SELECT 1 FROM resumes WHERE id=$1 AND user_id=$3)", [resumeId,JSON.stringify(roleDiscovery),userId]);
  return roleDiscovery;
}
router.post('/roles', authenticate, workLimiter, validate({ body: z.object({resumeId:z.string().uuid()}) }), async (req:any,res) => {
  try {
    const resume = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2',[req.body.resumeId,req.user.id]);
    if(!resume.rows[0]) return res.status(404).json({success:false,message:'Resume not found'});
    const profile = await ownedProfile(resume.rows[0]);
    return res.json({success:true,roleDiscovery:await roleSuggestions(profile,req.body.resumeId,String(req.user.id))});
  } catch { return res.status(503).json({success:false,message:'Could not prepare role suggestions'}); }
});

router.post('/', authenticate, workLimiter, validate({ body: createRunSchema }), async (req: any, res) => {
  const userId = String(req.user.id);
  const { resumeId, idempotencyKey, forceRefresh = false } = req.body;
  let runId: string | null = null;
  const startedAt = Date.now();
  const timings: Record<string, number> = {};
  try {
    const resume = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [resumeId, userId]);
    if (!resume.rows[0]) return res.status(404).json({ success: false, message: 'Resume not found' });
    const saved = await pool.query('SELECT * FROM user_job_preferences WHERE user_id=$1', [userId]);
    const preferences = effectivePreferences(saved.rows[0], req.body);
    // A normal page visit reuses the persisted report. Only an explicit refresh
    // is allowed to spend provider/API/embedding work again.
    if (!forceRefresh) {
      const cachedRun = await pool.query(
        `SELECT id,status,returned_count,completed_at,ranker_version,profile_version,provider_status_json,query_plan_json,preferences_snapshot_json FROM recommendation_runs
          WHERE user_id=$1 AND resume_id=$2 AND status='completed'
            AND preferences_snapshot_json = $3::jsonb
          ORDER BY completed_at DESC NULLS LAST LIMIT 1`,
        [userId, resumeId, JSON.stringify(preferences)],
      );
      if (cachedRun.rows[0] && recommendationCacheValid(cachedRun.rows[0],rankerVersion,PROFILE_VERSION,preferences.daysPosted ?? 30) && await cachedRowsCurrent(cachedRun.rows[0].id,preferences)) {
        const prior = cachedRun.rows[0];
        return res.json({ success: true, persisted: true, cached: true, runId: prior.id, status: prior.status, returnedCount: prior.returned_count, ...recommendationDiagnostics(prior), recommendations: await results(prior.id, 0, 20), nextOffset: prior.returned_count > 20 ? 20 : null });
      }
    }
    if (idempotencyKey) {
      const previous = await pool.query('SELECT * FROM recommendation_runs WHERE user_id=$1 AND idempotency_key=$2', [userId, idempotencyKey]);
      if (previous.rows[0]) {
        const prior = previous.rows[0];
        const reusable = prior.status === 'completed' && recommendationCacheValid(prior,rankerVersion,PROFILE_VERSION,preferences.daysPosted ?? 30,new Date(),forceRefresh) && await cachedRowsCurrent(prior.id,preferences);
        if (!reusable && prior.status === 'completed') return res.status(409).json({success:false,code:'STALE_IDEMPOTENCY_KEY',message:'Use a new idempotency key for a refreshed run'});
        return res.status(prior.status === 'completed' ? 200 : 202).json({ success: reusable, runId: prior.id, persisted: reusable, status: prior.status, returnedCount: prior.returned_count, ...recommendationDiagnostics(prior), recommendations: reusable ? await results(prior.id, 0, 20) : [] });
      }
    }
    runId = crypto.randomUUID();
    const inserted = await pool.query(`INSERT INTO recommendation_runs (id,user_id,resume_id,preferences_snapshot_json,ranker_version,profile_version,status,idempotency_key)
      VALUES ($1,$2,$3,$4,$5,$6,'running',$7) ON CONFLICT (user_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING RETURNING id`, [runId,userId,resumeId,JSON.stringify(preferences),rankerVersion,PROFILE_VERSION,idempotencyKey ?? null]);
    if (!inserted.rows.length) {
      const prior = await pool.query('SELECT id,status,returned_count FROM recommendation_runs WHERE user_id=$1 AND idempotency_key=$2', [userId,idempotencyKey]);
      return res.status(202).json({ success: false, persisted: false, runId: prior.rows[0].id, status: prior.rows[0].status, recommendations: [] });
    }
    const profile = await ownedProfile(resume.rows[0]);
    if (!profile || !Array.isArray(profile.skills) || !Array.isArray(profile.experience)) throw new Error('PROFILE_UNAVAILABLE');
    const roleDiscovery = await roleSuggestions(profile,resumeId,userId);
    const searchPreferences = { ...preferences, targetRoles: preferences.targetRoles.length ? preferences.targetRoles : roleDiscovery.roles.map(r=>r.title) };
    const planned = new JobQueryPlanner().plan({ targetRoles: searchPreferences.targetRoles, excludedRoles: preferences.excludedRoles, emphasizedSkills: preferences.emphasizedSkills }, profile);
    const queries = [...new Set(planned.map(q=>q.keywords))].slice(0,3);
    timings.rolesMs = Date.now() - startedAt;
    const retrievalStarted = Date.now();
    const enabled = new Set((process.env.JOB_PROVIDERS || 'jooble,jobspipe,adzuna,remotive,arbeitnow').split(',').map((s) => s.trim().toLowerCase()));
    const sources: any[] = [];
    const all: NormalizedJob[] = [];
    const runSearch = async (name: string, provider: JobProvider, query: string, location: string, page: number, ttl: number, cursor?: string): Promise<string | null> => {
        const cacheKey = crypto.createHash('sha256').update(JSON.stringify({ version: retrievalVersion, name, query, location, page, ...(cursor ? { cursorHash: crypto.createHash('sha256').update(cursor).digest('hex') } : {}), preferences,
          providerLimit: name === 'jobspipe' ? process.env.JOBSPIPE_LIMIT ?? '15' : name === 'adzuna' ? process.env.ADZUNA_RESULTS_PER_PAGE ?? '15' : null,
          ...(name === 'jobspipe' || name === 'adzuna' ? {country:countryCodeForLocation(location) ?? (name === 'jobspipe' ? process.env.JOBSPIPE_COUNTRY ?? 'IN' : process.env.ADZUNA_COUNTRY ?? 'in')} : {}) })).digest('hex');
      const started = new Date().toISOString();
      let cacheHit = false;
      try {
        const cached = await pool.query('SELECT result_json,created_at FROM job_search_cache WHERE query_hash=$1', [cacheKey]);
        let result: ProviderSearchResult;
        if (!forceRefresh && name !== 'jobspipe' && cached.rows[0] && Date.now() - new Date(cached.rows[0].created_at).getTime() < ttl) {
          const data = cached.rows[0].result_json;
          if (data && !Array.isArray(data) && Array.isArray(data.jobs) && typeof data.status === 'string') {
            result = data; cacheHit = true;
          }
        }
        if (!cacheHit) {
          if (name === 'jooble' && !(await reserveDailyCall('jooble', Number(process.env.JOOBLE_CALL_BUDGET || 100)))) {
            result = { jobs: [], status: 'budgetLimited' };
          } else {
            result = await provider.searchResult({ keywords: query, location, page, cursor, country: countryCodeForLocation(location || preferences.locations[0]) ?? undefined, seniorityHint: profile.seniority, daysPosted: preferences.daysPosted, sortBy: preferences.sortBy });
          }
          if (name !== 'jobspipe' && (result.status === 'ok' || result.status === 'empty')) await pool.query('INSERT INTO job_search_cache (query_hash,query_text,result_json,created_at) VALUES ($1,$2,$3,now()) ON CONFLICT (query_hash) DO UPDATE SET result_json=$3,created_at=now()', [cacheKey, `${name}:${query}`, JSON.stringify(result)]).catch(() => undefined);
        }
        const jobs = result!.jobs;
        sources.push({ provider: name, status: result!.status, cacheHit, fetchedCount: jobs.length,
          ...(result!.fallbackReason ? { fallbackReason: result!.fallbackReason } : {}),
          ...(result!.errorCode ? { errorCode: result!.errorCode } : {}),
          ...(result!.status === 'fallback' ? { fallbackSource: [...new Set(jobs.map(j => j.source))] } : {}),
           location, page, query, attemptedAt: started, durationMs: Date.now()-Date.parse(started) });
        all.push(...jobs.map(job=>({ ...job, foundByTitles:[...new Set([...(job.foundByTitles??[]),query])], lastFetchedAt:job.lastFetchedAt ?? (cacheHit ? new Date(cached.rows[0].created_at).toISOString() : started), dateSource:job.dateSource ?? (job.postedAt ? 'posted' : 'unknown') })));
        console.info(`[retrieval] provider=${name} page=${page} status=${result!.status} count=${jobs.length} cache=${cacheHit} ms=${Date.now()-Date.parse(started)}`);
        return result!.status === 'ok' && typeof result!.nextCursor === 'string' && result!.nextCursor ? result!.nextCursor : null;
       } catch { sources.push({ ...sourceEnvelope(name,[],cacheHit,'error'), location,page,query,errorCode: 'PROVIDER_UNAVAILABLE', attemptedAt: started,durationMs:Date.now()-Date.parse(started) }); return null; }
    };
    const providers: Record<string,[JobProvider,number]> = {
      jooble:[new JoobleProvider(),3600000], jobspipe:[new JobsPipeProvider(),3600000],
      adzuna:[new AdzunaProvider(),3600000], remotive:[new RemotiveProvider(),3600000],
      arbeitnow:[new ArbeitnowProvider(),arbeitnowCacheHours() * 3600000],
    };
    const retrieval = retrievalPlan([...enabled], preferences.locations, queries);
    await executeRetrieval(retrieval, async (step, cursor) => {
      const entry = providers[step.provider];
      if (!entry) return {};
      // Skip page > 1 if we already have sufficient candidates loaded
      if (step.page > 1 && deduplicateJobs(all).length >= 25) return {};
      // If retrieval has taken > 15s and we already have results, avoid starting further searches
      if (Date.now() - retrievalStarted >= 15_000 && all.length >= 15) return {};
      const next = await runSearch(step.provider, entry[0], step.keywords, step.location, step.page, entry[1], cursor);
      return { nextCursor: next };
    }, { globalConcurrency: 4, perProviderConcurrency: 1, maxCalls: 15, timeoutMs: 18_000 });
    const distinct = deduplicateJobs(all);
    const closedUrls=await recentClosedUrls(userId);
    for(const job of distinct) if(job.url&&closedUrls.has(job.url))job.availability={status:'closed',checkedAt:new Date().toISOString(),reason:'Previously confirmed/reported closed for this account within 24 hours',source:'saved-closure'};
    timings.retrievalMs = Date.now()-retrievalStarted;
    const checked = distinct.map((job) => ({ job, eligibility: eligibleJob(job,profile.seniority,{...searchPreferences,verifiedOpenOnly:false},profile) }));
    const rejectedReasons: Record<string,number> = {};
    for (const entry of checked.filter(entry => entry.eligibility.status === 'ineligible')) for (const reason of entry.eligibility.reasons) rejectedReasons[reason] = (rejectedReasons[reason] ?? 0) + 1;
    const eligible = checked.filter((entry) => entry.eligibility.status !== 'ineligible');
    if (sources.length && sources.every(source => ['error','budgetLimited'].includes(source.status))) {
      await pool.query('UPDATE recommendation_runs SET provider_status_json=$2,query_plan_json=$3 WHERE id=$1', [runId,JSON.stringify(sources),JSON.stringify({queries,rejectedReasons})]);
      throw new Error('ALL_PROVIDERS_FAILED');
    }
    const rankingStarted = Date.now();
    const scored = await rankJobsBatch(profile, eligible.map((entry) => entry.job), { preferences:searchPreferences, ownerId: userId });
    timings.rankingMs = Date.now()-rankingStarted;
    const compare = (a:any,b:any) => (preferences.sortBy==='newest' ? ((Date.parse(b.postedAt)||0)-(Date.parse(a.postedAt)||0)) : ((a.eligibility.status==='eligible'?0:1)-(b.eligibility.status==='eligible'?0:1))) || b.fitScore-a.fitScore || `${a.source}:${a.externalId}`.localeCompare(`${b.source}:${b.externalId}`);
    const candidates = eligible.map(({ job, eligibility }, i) => ({ ...job, eligibility, ...scored[i], confidence: (scored[i] as any).confidence ?? 'Low' })).sort(compare).slice(0,200);
    const availabilityStarted = Date.now();
    await checkJobsAvailability(candidates,{maxChecks:20,concurrency:4,batchDeadlineMs:15000});
    for(const job of candidates) job.eligibility=eligibleJob(job,profile.seniority,searchPreferences,profile);
    const ranked = candidates.filter(job=>{
      if(job.eligibility.status!=='ineligible') return true;
      for(const reason of job.eligibility.reasons) rejectedReasons[reason]=(rejectedReasons[reason]??0)+1;
      return false;
    }).sort(compare);
    timings.availabilityMs=Date.now()-availabilityStarted;
    timings.totalMs=Date.now()-startedAt;
    const versions={rankerVersion,profileVersion:PROFILE_VERSION,embeddingModelId:scored[0]?.embeddingModelId??'none'};
    const diagnostics={queries,roleDiscovery,searchRoles:searchPreferences.targetRoles,rejectedReasons,timings,versions,availabilityScope:{checked:Math.min(candidates.length,20),candidates:candidates.length}};
    const persistenceStarted=Date.now();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const still = await client.query('SELECT id FROM resumes WHERE id=$1 AND user_id=$2 FOR KEY SHARE', [resumeId,userId]);
      if (!still.rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ success:false, message:'Resume removed during ranking', runId, persisted:false }); }
      
      const jobIdMap = await upsertJobsBatch(ranked, client);

      const CHUNK_REC = 50;
      for (let c = 0; c < ranked.length; c += CHUNK_REC) {
        const chunk = ranked.slice(c, c + CHUNK_REC);
        const valPlaceholders: string[] = [];
        const recParams: any[] = [];
        let rIdx = 1;

        for (let i = 0; i < chunk.length; i++) {
          const job = chunk[i];
          const rank = c + i + 1;
          const jobId = jobIdMap.get(`${job.source}:${job.externalId}`);
          if (!jobId) continue;
          const snapshot = { id: jobId, jobId, ...recommendationSnapshot(job) };

          valPlaceholders.push(`($${rIdx},$${rIdx+1},$${rIdx+2},$${rIdx+3},$${rIdx+4},$${rIdx+5},$${rIdx+6},$${rIdx+7},$${rIdx+8},$${rIdx+9},$${rIdx+10})`);
          recParams.push(
            runId,
            jobId,
            rank,
            job.fitScore,
            job.confidence,
            JSON.stringify(job.breakdown),
            JSON.stringify(job.evidence),
            JSON.stringify(snapshot),
            JSON.stringify(job.matchedSkills),
            JSON.stringify(job.missingSkills),
            JSON.stringify(job.eligibility)
          );
          rIdx += 11;
        }

        if (valPlaceholders.length) {
          await client.query(`INSERT INTO recommendations (run_id,job_id,rank,fit_score,confidence,breakdown_json,evidence_json,job_snapshot_json,matched_skills_json,missing_skills_json,eligibility_json)
            VALUES ${valPlaceholders.join(', ')}`, recParams);
        }
      }
      timings.persistenceMs=Date.now()-persistenceStarted;timings.totalMs=Date.now()-startedAt;
      await client.query(`UPDATE recommendation_runs SET status='completed',completed_at=now(),embedding_model_id=$2,query_plan_json=$3,provider_status_json=$4,candidate_count=$5,returned_count=$6 WHERE id=$1`, [runId,scored[0]?.embeddingModelId ?? 'none',JSON.stringify(diagnostics),JSON.stringify(sources),distinct.length,ranked.length]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
    console.info(`[recommendations] completed count=${ranked.length} timings=${JSON.stringify(timings)}`);
    return res.json({ success:true, runId, persisted:true, totalFetched:all.length, deduped:distinct.length, candidateCount:distinct.length, returnedCount:ranked.length, insufficientEligibleJobs:ranked.length < 50, sources, ...diagnostics, preferences, recommendations:await results(runId,0,20), nextOffset:ranked.length > 20 ? 20 : null });
  } catch (error) {
    if (runId) await pool.query("UPDATE recommendation_runs SET status='failed',completed_at=now(),error_code=$2 WHERE id=$1 AND status='running'",[runId,(error as Error).message === 'ALL_PROVIDERS_FAILED' ? 'ALL_PROVIDERS_FAILED' : 'RECOMMENDATION_FAILED']).catch(() => undefined);
    console.error('[recommendations] run failed (details withheld to protect private data)');
    return res.status(503).json({ success:false, code:(error as Error).message === 'ALL_PROVIDERS_FAILED' ? 'ALL_PROVIDERS_FAILED' : 'RECOMMENDATION_FAILED', message:'Recommendation run failed', runId, persisted:false });
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
    res.json({success:true,runId:req.params.id,total:run.rows[0].returned_count,...recommendationDiagnostics(run.rows[0]),results:rows,nextOffset:offset+rows.length<run.rows[0].returned_count ? offset+rows.length : null});
  } catch { res.status(500).json({success:false,message:'Could not read recommendations'}); }
});
router.post('/:id/jobs/:jobId/availability',authenticate,workLimiter,async(req:any,res)=>{
  if(!z.string().uuid().safeParse(req.params.id).success||!z.string().uuid().safeParse(req.params.jobId).success)return res.status(400).json({success:false,message:'Invalid identifier'});
  try {
    const found=await pool.query(`SELECT r.job_snapshot_json FROM recommendations r JOIN recommendation_runs rr ON rr.id=r.run_id WHERE r.run_id=$1 AND r.job_id=$2 AND rr.user_id=$3`,[req.params.id,req.params.jobId,req.user.id]);
    if(!found.rows[0])return res.status(404).json({success:false,message:'Recommendation not found'});
    const job=found.rows[0].job_snapshot_json;
    const previous=job.availability;
    await checkJobsAvailability([job],{maxChecks:1,ttlMs:0,deadlineMs:4000});
    if(previous?.status==='closed'&&job.availability?.status==='unknown')job.availability=previous;
    await pool.query("UPDATE recommendations SET job_snapshot_json=jsonb_set(job_snapshot_json,'{availability}',$3::jsonb) WHERE run_id=$1 AND job_id=$2",[req.params.id,req.params.jobId,JSON.stringify(job.availability)]);
    if(job.availability?.status==='closed')await pool.query("UPDATE recommendation_runs SET ranker_version=ranker_version||':closed-check' WHERE user_id=$1 AND completed_at>now()-interval '5 minutes'",[req.user.id]);
    return res.json({success:true,availability:job.availability});
  }catch{return res.status(503).json({success:false,message:'Availability could not be checked'});}
});
router.post('/:id/jobs/:jobId/report-closed',authenticate,workLimiter,async(req:any,res)=>{
  if(!z.string().uuid().safeParse(req.params.id).success||!z.string().uuid().safeParse(req.params.jobId).success)return res.status(400).json({success:false,message:'Invalid identifier'});
  const availability={status:'closed',checkedAt:new Date().toISOString(),source:'user_report',reason:'User reports the original posting is no longer accepting applications; not independently verified by JobHunter'};
  try{
    const result=await pool.query(`UPDATE recommendations r SET job_snapshot_json=jsonb_set(r.job_snapshot_json,'{availability}',$4::jsonb)
      FROM recommendation_runs rr WHERE r.run_id=rr.id AND r.run_id=$1 AND r.job_id=$2 AND rr.user_id=$3 RETURNING r.job_id`,[req.params.id,req.params.jobId,req.user.id,JSON.stringify(availability)]);
    if(!result.rows.length)return res.status(404).json({success:false,message:'Recommendation not found'});
    // A newly reported closure must invalidate the completed-run cache immediately.
    await pool.query("UPDATE recommendation_runs SET ranker_version=ranker_version||':closed-report' WHERE user_id=$1 AND completed_at>now()-interval '5 minutes'",[req.user.id]);
    return res.json({success:true,availability});
  }catch{return res.status(503).json({success:false,message:'Could not record closure report'});}
});
export default router;
