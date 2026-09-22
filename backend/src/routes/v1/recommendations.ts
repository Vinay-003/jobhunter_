import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import * as Session from '../../modules/auth/session.js';
import jwt from 'jsonwebtoken';
import { JoobleProvider } from '../../providers/jobs/JoobleProvider.js';
import { AdzunaProvider } from '../../providers/jobs/AdzunaProvider.js';
import { RemotiveProvider } from '../../providers/jobs/RemotiveProvider.js';
import { ArbeitnowProvider, arbeitnowCacheHours } from '../../providers/jobs/ArbeitnowProvider.js';
import { JobsPipeProvider } from '../../providers/jobs/JobsPipeProvider.js';
import { JobQueryPlanner } from '../../modules/jobs/queryPlanner.js';
import { rankJobsBatch } from '../../modules/jobs/ranking.js';
import parsePdfBuffer from '../../modules/parsing/pdfParser.js';
import { buildResumeProfile } from '../../modules/parsing/resumeProfile.js';
import { downloadFile } from '../../modules/storage/supabaseStorage.js';

const router = Router();

function authenticateAny(req:any,res:any,next:any){
  const cookies = req.cookies || {};
  const cookieName = process.env.SESSION_COOKIE_NAME || 'jobhunter_session';
  let token = cookies[cookieName] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ success:false, message:'Authentication required'});
  Session.verifySession(token).then(sess=>{
    if (sess) { req.user={ id:sess.user_id }; return next(); }
    try { const secret=process.env.JWT_SECRET; if(!secret) throw new Error(); const d:any=jwt.verify(token, secret); req.user={id:String(d.id)}; return next(); } catch { return res.status(401).json({ success:false, message:'Invalid session'}); }
  }).catch(()=> res.status(401).json({ success:false, message:'Invalid session'}));
}

const createRunSchema = z.object({
  resumeId: z.string().min(1),
  targetRoles: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  workModes: z.array(z.string()).optional(),
  daysPosted: z.number().optional(),
  keywords: z.string().optional(),
});

router.post('/', authenticateAny, validate({ body: createRunSchema }), async (req:any,res)=>{
  const userId = String(req.user.id);
  const { resumeId, targetRoles, locations, workModes, daysPosted } = req.body;
  try {
    // verify resume ownership
    const r = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [resumeId, userId]);
    let resumeRow = r.rows[0];
    if (!resumeRow) {
      const r2 = await pool.query('SELECT * FROM resumes WHERE id=$1',[resumeId]);
      if (r2.rows[0] && String(r2.rows[0].user_id)!==userId) return res.status(403).json({ success:false, message:'Forbidden'});
      if (!r2.rows[0]) return res.status(404).json({ success:false, message:'Resume not found'});
      resumeRow = r2.rows[0];
    }
    // load profile
    let profile:any = null;
    try {
      const pr = await pool.query('SELECT profile_json FROM resume_profiles WHERE resume_id=$1', [resumeId]);
      if (pr.rows[0]) profile = typeof pr.rows[0].profile_json==='string' ? JSON.parse(pr.rows[0].profile_json) : pr.rows[0].profile_json;
    } catch{}
    if (!profile) {
      try {
        const buf = await downloadFile({bucket: resumeRow.storage_bucket||'resumes', path: resumeRow.storage_object_path||resumeRow.file_path, sha256: ""}).then(b=>Buffer.from(b as any)).catch(async()=> {
          const fs = await import('node:fs'); return fs.readFileSync(resumeRow.file_path);
        });
        const parsed = await parsePdfBuffer(buf);
        profile = buildResumeProfile(parsed);
      } catch { profile = { skills:[], experience:[], education:[], skillsNormalized:[] }; }
    }
    const preferences = { targetRoles: targetRoles||[], locations: locations||[], workModes: workModes||[], emphasizedSkills: profile.skills?.slice(0,5)||[] };
    const planner = new JobQueryPlanner();
    const queriesObjs = planner.plan(preferences as any, profile);
    const queries = queriesObjs.map(q=>q.keywords);
    const maxQueries = Number(process.env.JOOBLE_MAX_QUERIES_PER_REFRESH||4);
    const limited = queries.slice(0, maxQueries);

    // provider search with cache — Jooble per planned query, every other
    // enabled provider once per run on the primary query (credit/budget safe).
    const enabled = (process.env.JOB_PROVIDERS || 'jooble,jobspipe,adzuna,remotive,arbeitnow')
      .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const loc = locations?.[0] || '';
    const primaryQuery = limited[0] || 'Software Engineer';
    const sourceCounts: Record<string, number> = {};

    const cacheGet = async (key: string, ttlMs: number): Promise<any[] | null> => {
      try {
        const ch = crypto.createHash('sha256').update(key.toLowerCase()).digest('hex');
        const cr = await pool.query('SELECT result_json, created_at FROM job_search_cache WHERE query_hash=$1 LIMIT 1', [ch]);
        if (cr.rows[0] && (Date.now() - new Date(cr.rows[0].created_at).getTime() < ttlMs)) {
          const v = cr.rows[0].result_json;
          return (typeof v === 'string' ? JSON.parse(v) : v) as any[];
        }
      } catch { /* cache miss */ }
      return null;
    };
    const cacheSet = async (key: string, jobs: any[]): Promise<void> => {
      try {
        const ch = crypto.createHash('sha256').update(key.toLowerCase()).digest('hex');
        await pool.query('INSERT INTO job_search_cache (query_hash, query_text, result_json, created_at) VALUES ($1,$2,$3,now()) ON CONFLICT (query_hash) DO UPDATE SET result_json=$3, created_at=now()', [ch, key, JSON.stringify(jobs)]);
      } catch { /* best-effort */ }
    };
    const trackUsage = async (name: string): Promise<void> => {
      try { await pool.query('INSERT INTO external_api_usage (id, provider, request_count, last_called_at) VALUES ($1,$2,1,now()) ON CONFLICT (provider) DO UPDATE SET request_count=external_api_usage.request_count+1, last_called_at=now()', [crypto.randomUUID(), name]); } catch { /* best-effort */ }
    };

    let allJobs: any[] = [];
    // Jooble: one call per planned query (existing behavior)
    if (enabled.includes('jooble')) {
      const provider = new JoobleProvider();
      for (const q of limited) {
        const key = `jooble:${q}|${loc}`;
        const cached = await cacheGet(key, 60 * 60 * 1000);
        if (cached) { allJobs.push(...cached); sourceCounts.jooble = (sourceCounts.jooble ?? 0) + cached.length; continue; }
        try {
          const jobs = await provider.search({ keywords: q, location: loc });
          allJobs.push(...jobs);
          sourceCounts.jooble = (sourceCounts.jooble ?? 0) + jobs.length;
          await cacheSet(key, jobs);
          await trackUsage('jooble');
        } catch (e) { console.warn('job search failed for', q, e); }
      }
    }

    // Other providers: single call each on the primary query.
    const extraProviders: Array<[string, { search: (q: import('../../providers/jobs/JobProvider.js').JobSearchQuery) => Promise<any[]> }, number]> = [];
    if (enabled.includes('jobspipe')) extraProviders.push(['jobspipe', new JobsPipeProvider(), 60 * 60 * 1000]);
    if (enabled.includes('adzuna')) extraProviders.push(['adzuna', new AdzunaProvider(), 60 * 60 * 1000]);
    if (enabled.includes('remotive')) extraProviders.push(['remotive', new RemotiveProvider(), 60 * 60 * 1000]);
    if (enabled.includes('arbeitnow')) extraProviders.push(['arbeitnow', new ArbeitnowProvider(), arbeitnowCacheHours() * 60 * 60 * 1000]);
    for (const [name, provider, ttlMs] of extraProviders) {
      const hint = name === 'jobspipe' ? `|${(profile as any)?.seniority ?? ''}` : '';
      const key = `${name}:${primaryQuery}|${loc}${hint}`;
      const cached = await cacheGet(key, ttlMs);
      if (cached) { allJobs.push(...cached); sourceCounts[name] = (sourceCounts[name] ?? 0) + cached.length; continue; }
      try {
        const jobs = await provider.search({ keywords: primaryQuery, location: loc, seniorityHint: (profile as any)?.seniority ?? null });
        allJobs.push(...jobs);
        sourceCounts[name] = (sourceCounts[name] ?? 0) + jobs.length;
        await cacheSet(key, jobs);
        await trackUsage(name);
      } catch (e) { console.warn(`job search failed for provider ${name}:`, (e as Error).message); }
    }
    console.log(`[recommendations] sources requested=[${enabled.join(',')}] fetchedBySource=${JSON.stringify(sourceCounts)}`);

    // dedupe by url/source+externalId, plus title+company to collapse the same
    // posting returned by multiple providers (e.g. Jooble + JobsPipe/Indeed).
    const seen = new Set<string>();
    const seenTitleCompany = new Set<string>();
    const deduped: any[] = [];
    for (const j of allJobs) {
      const key = (j.url || '') + '|' + (j.source || '') + '|' + (j.externalId || '');
      if (seen.has(key)) continue;
      seen.add(key);
      const tc = `${String(j.title || '').toLowerCase().replace(/\s+/g, ' ').trim()}|${String(j.company || '').toLowerCase().trim()}`;
      if (tc.length > 2 && seenTitleCompany.has(tc)) continue;
      seenTitleCompany.add(tc);
      deduped.push(j);
    }

    // ranking — single batched embed call for all jobs (NOT one InvokeEndpoint per
    // job: ~100 concurrent invokes throttle a Serverless MaxConcurrency=1 endpoint).
    const norms = deduped.map((j:any)=> ({ id: j.id, source: j.source||'jooble', externalId: j.externalId||j.id, title: j.title||'', company: j.company, location: j.location, description: j.description||j.snippet||'', descriptionQuality: (j.descriptionQuality||'snippet') as any, url: j.url||j.link||'', fetchedAt: new Date() } as any));
    const batchResults = await rankJobsBatch(profile, norms, { preferences: { locations: preferences.locations as any } });
    const rankedRaw = norms.map((norm:any, i:number)=>{
      const r = batchResults[i] as any;
      const conf = r.fitScore>=70 ? 'High' : r.fitScore>=40 ? 'Medium' : 'Low';
      return { ...norm, fitScore: r.fitScore, breakdown: r.breakdown, evidence: r.evidence, confidence: conf, embeddingModelId: r.embeddingModelId, usedMock: r.usedMock, matchedSkills: r.matchedSkills ?? [], missingSkills: r.missingSkills ?? [] };
    });
    const ranked = rankedRaw.sort((a,b)=> b.fitScore - a.fitScore);
    // derive embedding model for run — real model if any job used real, else mock
    const runEmbeddingModelId = ranked.find((r:any)=> !r.usedMock)?.embeddingModelId || ranked[0]?.embeddingModelId || 'mock';
    const runUsedMock = ranked.every((r:any)=> r.usedMock) && ranked.length>0;

    const runId = crypto.randomUUID();
    const rankerVersion = '2.0.0';
    console.log(`[recommendations] runId=${runId} queries=${limited.length} fetched=${allJobs.length} deduped=${deduped.length} ranked=${ranked.length} model=${runEmbeddingModelId}${runUsedMock ? ' (mock fallback)' : ''}`);
    try {
      await pool.query('INSERT INTO recommendation_runs (id, user_id, resume_id, preferences_snapshot_json, ranker_version, embedding_model_id, status, created_at, completed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now())', [runId, userId, resumeId, JSON.stringify(preferences), rankerVersion, runEmbeddingModelId, 'completed']);
      for (let i=0;i<ranked.slice(0,20).length;i++){
        const job = ranked[i];
        // ensure job exists in jobs table - upsert
        let jobId = job.id;
        if (!jobId) {
          try {
            const ins = await pool.query('INSERT INTO jobs (id, source, external_id, title, company, location, description, description_quality, url, fetched_at, content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now(),$10) ON CONFLICT DO NOTHING RETURNING id', [crypto.randomUUID(), job.source||'jooble', job.externalId||null, job.title, job.company||null, job.location||null, job.description||null, job.descriptionQuality||'snippet', job.url, crypto.createHash('sha256').update((job.title||'')+(job.description||'')).digest('hex')]);
            jobId = ins.rows[0]?.id || crypto.randomUUID();
          } catch{ jobId = crypto.randomUUID(); }
        }
        await pool.query('INSERT INTO recommendations (run_id, job_id, rank, fit_score, confidence, breakdown_json, evidence_json) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', [runId, jobId, i+1, job.fitScore, job.confidence, JSON.stringify(job.breakdown), JSON.stringify(job.evidence)]).catch(()=>{});
      }
    } catch(e){ console.warn('run persist warning', e); }

    res.json({ success:true, runId, totalFetched: allJobs.length, deduped: deduped.length, sources: sourceCounts, recommendations: ranked.slice(0,20), versions:{ rankerVersion, embeddingModelId: runEmbeddingModelId, usedMock: runUsedMock } });
  } catch(e:any){
    console.error('recommendation run error', e);
    res.status(500).json({ success:false, message:e.message });
  }
});

router.get('/:id', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const id = req.params.id;
  try {
    const r = await pool.query('SELECT * FROM recommendation_runs WHERE id=$1 AND user_id=$2', [id, userId]);
    if (!r.rows.length) return res.status(404).json({ success:false, message:'Run not found'});
    res.json({ success:true, run: r.rows[0] });
  } catch(e:any){ res.status(404).json({ success:false, message:'Run not found'}); }
});

router.get('/:id/results', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const id = req.params.id;
  try {
    const rr = await pool.query('SELECT * FROM recommendation_runs WHERE id=$1 AND user_id=$2', [id, userId]);
    if (!rr.rows.length) return res.status(404).json({ success:false, message:'Run not found'});
    const recs = await pool.query('SELECT r.*, j.title, j.company, j.location, j.description, j.url, j.salary FROM recommendations r LEFT JOIN jobs j ON r.job_id=j.id WHERE r.run_id=$1 ORDER BY r.rank ASC', [id]);
    res.json({ success:true, results: recs.rows });
  } catch(e:any){ res.status(500).json({ success:false, message:e.message}); }
});

export default router;
