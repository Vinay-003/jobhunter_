import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import * as Session from '../../modules/auth/session.js';
import jwt from 'jsonwebtoken';
import parsePdfBuffer from '../../modules/parsing/pdfParser.js';
import { buildResumeProfile } from '../../modules/parsing/resumeProfile.js';
import { scoreReadiness, VERSION as SCORER_VERSION } from '../../modules/ats/readinessScorer.js';
import { parseJd } from '../../modules/jd/jdParser.js';
import { matchJd } from '../../modules/jd/matcher.js';
import { downloadFile } from '../../modules/storage/supabaseStorage.js';
import { MockEmbeddingProvider } from '../../providers/embeddings/MockEmbeddingProvider.js';
import { AwsSageMakerEmbeddingProvider } from '../../providers/embeddings/AwsSageMakerEmbeddingProvider.js';
import { LocalEmbeddingProvider } from '../../providers/embeddings/LocalEmbeddingProvider.js';

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

const PARSER_VERSION='3.0.0';
const JD_MATCHER_VERSION='2.0.0';

function getEmbeddingProvider(){
  const p = (process.env.EMBEDDING_PROVIDER || 'auto').toLowerCase();
  if (p === 'local' || process.env.USE_LOCAL_EMBEDDINGS === 'true') {
    return new LocalEmbeddingProvider({ modelId: process.env.LOCAL_EMBEDDING_MODEL });
  }
  if (p === 'mock') return new MockEmbeddingProvider();
  // auto and aws both go through SageMaker provider — it will fallback to mock ONLY via hasAwsCreds check with warning
  return new AwsSageMakerEmbeddingProvider();
}

// helper to load resume buffer
async function loadResumeBuffer(resumeRow:any):Promise<Buffer>{
  const bucket = resumeRow.storage_bucket || 'resumes';
  const path = resumeRow.storage_object_path || resumeRow.file_path;
  if (!path) throw new Error('Resume storage path missing');
  try {
    const data = await downloadFile({bucket, path, sha256: ""});
    return Buffer.from(data);
  } catch(e){
    // fallback local file? try fs if path is local
    const fs = await import('node:fs');
    if (fs.existsSync(path)) return fs.readFileSync(path);
    throw e;
  }
}

router.post('/readiness', authenticateAny, validate({ body: z.object({ resumeId: z.string().min(1), targetLevel: z.string().optional() }) }), async (req:any,res)=>{
  const userId = String(req.user.id);
  const { resumeId, targetLevel } = req.body;
  try {
    const r = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [resumeId, userId]);
    let row = r.rows[0];
    if (!row) {
      const r2 = await pool.query('SELECT * FROM resumes WHERE id=$1',[resumeId]);
      if (r2.rows[0] && String(r2.rows[0].user_id)!==userId) return res.status(403).json({ success:false, message:'Forbidden'});
      if (!r2.rows[0]) return res.status(404).json({ success:false, message:'Resume not found'});
      row = r2.rows[0];
    }
    const buf = await loadResumeBuffer(row);
    const parsed = await parsePdfBuffer(buf);
    if (parsed.detectedAsScanned) {
      return res.status(400).json({ success:false, message:'We could not reliably extract text from this PDF. It may be scanned or image-based. Upload a text-based PDF for accurate ATS analysis.', code:'SCANNED_PDF' });
    }
    const profile = buildResumeProfile(parsed);
    const readiness = scoreReadiness(parsed, profile, targetLevel);
    // ensure profile stored
    await pool.query('INSERT INTO resume_profiles (resume_id, profile_json, profile_version) VALUES ($1,$2,$3) ON CONFLICT (resume_id) DO UPDATE SET profile_json=$2, profile_version=$3', [row.id, JSON.stringify(profile), PARSER_VERSION]).catch(()=>{});
    const analysisId = crypto.randomUUID();
    const breakdown = readiness.breakdown;
    const evidence = {
      rules: readiness.rules,
      strengths: readiness.strengths,
      warnings: readiness.warnings,
      priorityActions: readiness.priorityActions,
      metrics: readiness.metrics,
      scoreLabel: readiness.scoreLabel,
      scoreMessage: readiness.scoreMessage,
      issueCount: readiness.issueCount,
      highPriorityIssueCount: readiness.highPriorityIssueCount,
      methodology: readiness.methodology,
    };
    try {
      await pool.query(`INSERT INTO analyses (id, user_id, resume_id, analysis_type, readiness_score, score_breakdown_json, evidence_json, target_level, scorer_version, parser_version, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now())`, [analysisId, userId, row.id, 'readiness', readiness.score, JSON.stringify(breakdown), JSON.stringify(evidence), targetLevel||null, SCORER_VERSION, PARSER_VERSION]);
    } catch(e){ /* table may not exist yet, ignore */ }
    res.json({ success:true, analysisId, resumeId: row.id, readiness, profile, parserVersion: PARSER_VERSION, scorerVersion: SCORER_VERSION });
  } catch(e:any){
    console.error('readiness error', e);
    res.status(500).json({ success:false, message:e.message || 'Failed to analyze'});
  }
});

router.post('/jd-match', authenticateAny, validate({ body: z.object({ resumeId: z.string().min(1), jobDescription: z.string().min(20).max(20000), targetRole: z.string().optional(), targetLevel: z.string().optional() }) }), async (req:any,res)=>{
  const userId = String(req.user.id);
  const { resumeId, jobDescription, targetRole, targetLevel } = req.body;
  try {
    const r = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [resumeId, userId]);
    let row = r.rows[0];
    if (!row) {
      const r2 = await pool.query('SELECT * FROM resumes WHERE id=$1',[resumeId]);
      if (r2.rows[0] && String(r2.rows[0].user_id)!==userId) return res.status(403).json({ success:false, message:'Forbidden'});
      if (!r2.rows[0]) return res.status(404).json({ success:false, message:'Resume not found'});
      row = r2.rows[0];
    }
    const buf = await loadResumeBuffer(row);
    const parsed = await parsePdfBuffer(buf);
    if (parsed.detectedAsScanned) return res.status(400).json({ success:false, message:'Scanned PDF not supported for JD matching', code:'SCANNED_PDF'});
    const profile = buildResumeProfile(parsed);
    const readiness = scoreReadiness(parsed, profile, targetLevel);
    const jd = parseJd(jobDescription);
    // deterministic match
    const deterministic = matchJd(profile, jd);
    // semantic part - prepare redacted chunks
    const resumeChunks:string[] = [];
    // profile skills + experience bullets as chunks
    if (profile.skills.length) resumeChunks.push('Skills: ' + profile.skills.join(', '));
    for (const exp of profile.experience.slice(0,5)) {
      if (exp.title) resumeChunks.push(exp.title);
      if (exp.description) resumeChunks.push(exp.description.slice(0,500));
    }
    if (!resumeChunks.length) resumeChunks.push(parsed.normalizedText.slice(0,1000));

    const jdChunks:string[] = [];
    if (jd.title) jdChunks.push(jd.title);
    jdChunks.push(...jd.responsibilities.slice(0,10).map((s:string)=>s.slice(0,400)));
    jdChunks.push(...jd.requiredSkills.slice(0,10).map((s:string)=>s.slice(0,200)));
    if (!jdChunks.length) jdChunks.push(jobDescription.slice(0,1000));

    // embedding cache + batch - for now use provider directly with mock, deduplicate by hash
    const provider = getEmbeddingProvider();
    // deduplicate texts by content hash
    const allTexts = [...resumeChunks, ...jdChunks];
    const uniq = [...new Set(allTexts.map(t=>t.trim()).filter(Boolean))];
    let vectors: number[][] = [];
    let modelId = 'mock';
    let dimension = 384;
    let usedMock = true;
    try {
      const resp = await provider.embed({ texts: uniq, purpose:'jd' });
      vectors = resp.vectors;
      modelId = resp.modelId;
      dimension = resp.dimension;
      usedMock = modelId.includes('mock');
      if (usedMock) {
        console.warn(`[jd-match] using mock embeddings model=${modelId} dim=${dimension} texts=${uniq.length} — check EMBEDDING_PROVIDER/AWS creds`);
      } else {
        console.log(`[jd-match] SageMaker success model=${modelId} dim=${dimension} texts=${uniq.length} resumeChunks=${resumeChunks.length} jdChunks=${jdChunks.length}`);
      }
    } catch(e:any){
      console.warn(`[jd-match] embed failed fallback degraded mock: ${(e as Error).message}`);
      return res.json({ success:true, degraded:true, message:'Semantic matching temporarily unavailable. Resume readiness analysis is still available.', readiness, jd, deterministic, jdHash: crypto.createHash('sha256').update(jobDescription).digest('hex').slice(0,16) });
    }
    // build semantic responsibility coverage: for each jd responsibility find best cosine to resume chunks
    // simple cosine using mock vectors aligned to uniq order
    const textToVec = new Map<string, number[]>();
    uniq.forEach((t,i)=> textToVec.set(t, vectors[i]));
    function cosine(a:number[], b:number[]):number {
      let dot=0, na=0, nb=0;
      for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
      return dot / (Math.sqrt(na)*Math.sqrt(nb) || 1);
    }
    const responsibilityCoverage = jd.responsibilities.slice(0,10).map((resp:string)=>{
      const jv = textToVec.get(resp.slice(0,400).trim()) || textToVec.get(resp.trim());
      if (!jv) return { responsibility: resp, matchScore: 0, candidateEvidence: null };
      let best = -1; let bestChunk:string|null=null;
      for (const rc of resumeChunks){
        const rv = textToVec.get(rc);
        if (!rv) continue;
        const s = cosine(jv, rv);
        if (s>best){ best=s; bestChunk=rc; }
      }
      const score = Math.max(0, Math.min(1, best));
      return { responsibility: resp, matchScore: Number(score.toFixed(3)), candidateEvidence: bestChunk ? bestChunk.slice(0,200) : null };
    });
    const avgSem = responsibilityCoverage.length ? responsibilityCoverage.reduce((s:number,c:any)=>s+c.matchScore,0)/responsibilityCoverage.length : 0;
    const semanticScore = Math.round(avgSem * 30); // 30 points allocated

    const explicitPts = Math.round((deterministic.requiredCoverage || 0) * 35);
    const rolePts = jd.title && profile.skills.some((s:string)=> jd.title!.toLowerCase().includes(s.toLowerCase())) ? 15 : 5;
    const domainPts = 5;
    const eduPts = jd.requiredSkills.length===0 ? 10 : (deterministic.requiredCoverage>0.5 ? 8 : 2);
    const jdMatchScore = Math.min(100, explicitPts + semanticScore + rolePts + domainPts + eduPts);

    let confidence: 'High'|'Medium'|'Low' = 'Medium';
    if (jobDescription.length > 1000 && jd.requiredSkills.length>=3) confidence='High';
    else if (jobDescription.length < 300) confidence='Low';

    const analysisId = crypto.randomUUID();
    const jdHash = crypto.createHash('sha256').update(jobDescription).digest('hex');
    try {
      await pool.query(`INSERT INTO analyses (id, user_id, resume_id, analysis_type, readiness_score, jd_match_score, score_breakdown_json, evidence_json, target_level, jd_hash, scorer_version, parser_version, embedding_model_id, matching_version, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())`, [analysisId, userId, row.id, 'jd_match', readiness.score, jdMatchScore, JSON.stringify({ readiness: readiness.breakdown, jdMatch:{ explicitPts, semanticScore, rolePts, domainPts, eduPts }, deterministic }), JSON.stringify({
        rules: readiness.rules,
        strengths: readiness.strengths,
        warnings: readiness.warnings,
        priorityActions: readiness.priorityActions,
        metrics: readiness.metrics,
        scoreLabel: readiness.scoreLabel,
        scoreMessage: readiness.scoreMessage,
        issueCount: readiness.issueCount,
        highPriorityIssueCount: readiness.highPriorityIssueCount,
        methodology: readiness.methodology,
        responsibilityCoverage,
        deterministic,
      }), targetLevel||null, jdHash.slice(0,32), SCORER_VERSION, PARSER_VERSION, modelId, JD_MATCHER_VERSION]);
    } catch{}

    console.log(`[jd-match] done analysisId=${analysisId} model=${modelId}${usedMock ? ' (mock fallback)' : ''} score=${jdMatchScore} explicit=${explicitPts} semantic=${semanticScore} texts=${vectors.length}`);
    res.json({ success:true, analysisId, resumeId: row.id, readiness, jdMatch:{ score: jdMatchScore, breakdown:{ explicitMustHave: explicitPts, responsibilitySemantic: semanticScore, roleAlignment: rolePts, domain: domainPts, education: eduPts, confidence }, responsibilityCoverage, deterministic, jd }, versions:{ scorerVersion: SCORER_VERSION, parserVersion: PARSER_VERSION, matcherVersion: JD_MATCHER_VERSION, embeddingModelId: modelId, dimension, usedMock }, confidence });
  } catch(e:any){
    console.error('jd-match error', e);
    res.status(500).json({ success:false, message:e.message || 'JD match failed'});
  }
});

router.get('/', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  try {
    const r = await pool.query('SELECT * FROM analyses WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [userId]);
    res.json({ success:true, analyses: r.rows });
  } catch(e:any){ res.json({ success:true, analyses: []}); }
});

router.get('/:id', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const id = req.params.id;
  try {
    const r = await pool.query('SELECT * FROM analyses WHERE id=$1 AND user_id=$2', [id, userId]);
    if (!r.rows.length) return res.status(404).json({ success:false, message:'Analysis not found'});
    res.json({ success:true, analysis: r.rows[0]});
  } catch(e:any){ res.status(404).json({ success:false, message:'Analysis not found'}); }
});

export default router;
