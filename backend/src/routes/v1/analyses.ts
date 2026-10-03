import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { requireSession as authenticateAny } from '../../middleware/requireSession.js';
import parsePdfBuffer from '../../modules/parsing/pdfParser.js';
import { buildResumeProfile } from '../../modules/parsing/resumeProfile.js';
import { scoreReadiness, VERSION as SCORER_VERSION } from '../../modules/ats/readinessScorer.js';
import { parseJd } from '../../modules/jd/jdParser.js';
import { matchJd } from '../../modules/jd/matcher.js';
import { downloadFile } from '../../modules/storage/supabaseStorage.js';
import { MockEmbeddingProvider } from '../../providers/embeddings/MockEmbeddingProvider.js';
import { AwsSageMakerEmbeddingProvider } from '../../providers/embeddings/AwsSageMakerEmbeddingProvider.js';
import { getLocalEmbeddingProvider } from '../../providers/embeddings/LocalEmbeddingProvider.js';
import { validateVectors } from '../../providers/embeddings/validateVectors.js';
import { embedCached } from '../../providers/embeddings/embeddingCache.js';
import { professionalEvidence } from '../../modules/matching/evidenceBuilder.js';
import { scoreJdRubric, JD_RUBRIC_VERSION } from '../../modules/analysis/jdRubric.js';
import { analysisSnapshot, REPORT_SCHEMA_VERSION, type ReportSnapshot } from '../../modules/analysis/reportSchema.js';

const router = Router();

const PARSER_VERSION='4.0.0';
const JD_MATCHER_VERSION=JD_RUBRIC_VERSION;
function hashProfile(profile: unknown) { return crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex'); }
function saveSnapshot(snapshot: ReportSnapshot) { return JSON.stringify(snapshot); }
function serializeRow(row: any) { return { ...row, readiness_score: Number(row.readiness_score), result_json: analysisSnapshot(row) ?? row.result_json }; }

function getEmbeddingProvider(){
  const p = (process.env.EMBEDDING_PROVIDER || 'auto').toLowerCase();
  if (p === 'local' || process.env.USE_LOCAL_EMBEDDINGS === 'true') {
    return getLocalEmbeddingProvider();
  }
  if (p === 'mock') return new MockEmbeddingProvider();
  // auto and aws both go through SageMaker provider — it will fallback to mock ONLY via hasAwsCreds check with warning
  return new AwsSageMakerEmbeddingProvider();
}

// helper to load resume buffer
async function loadResumeBuffer(resumeRow:any):Promise<Buffer>{
  const bucket = resumeRow.storage_bucket || 'resumes';
  const path = resumeRow.storage_object_path || resumeRow.file_path;
  if (!path) {
    const err:any = new Error('This resume has no stored file — re-upload it to run analyses again.');
    err.code = 'STORED_FILE_MISSING';
    throw err;
  }
  try {
    const data = await downloadFile({bucket, path, sha256: ""});
    return Buffer.from(data);
  } catch(e){
    // S4: the old fs.existsSync(path) fallback probed the RELATIVE object key
    // (never matches anything). downloadFile already resolves local paths
    // against localUploadsDir(), so a throw here means the bytes are gone —
    // surface an actionable 410 instead of a generic 500 (S1 lost-file UX).
    console.error(`[analyses] stored file missing bucket=${bucket} path=${path}:`, e);
    const err:any = new Error('The stored file for this resume is missing — re-upload it to run analyses again.');
    err.code = 'STORED_FILE_MISSING';
    throw err;
  }
}

router.post('/readiness', authenticateAny, validate({ body: z.object({ resumeId: z.string().uuid(), targetLevel: z.string().optional() }) }), async (req:any,res)=>{
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
    // ensure profile stored (cache only — analysis proceeds even if this fails, but the failure is visible)
    await pool.query('INSERT INTO resume_profiles (resume_id, profile_json, profile_version) VALUES ($1,$2,$3) ON CONFLICT (resume_id) DO UPDATE SET profile_json=$2, profile_version=$3', [row.id, JSON.stringify(profile), PARSER_VERSION]).catch((e)=>console.error('[analyses] resume_profile upsert failed:', e));
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
    const createdAt = new Date().toISOString();
    const snapshot: ReportSnapshot = { success:true, resultSchemaVersion: REPORT_SCHEMA_VERSION, analysisId, resumeId: row.id,
      fileName: row.original_filename ?? null, createdAt, readiness, profileContentHash: hashProfile(profile),
      versions: { scorerVersion: SCORER_VERSION, parserVersion: PARSER_VERSION } };
    try {
      await pool.query(`INSERT INTO analyses (id,user_id,resume_id,analysis_type,readiness_score,score_breakdown_json,evidence_json,target_level,scorer_version,parser_version,result_schema_version,result_json,profile_version,profile_content_hash,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [analysisId,userId,row.id,'readiness',readiness.score,JSON.stringify(breakdown),JSON.stringify(evidence),targetLevel||null,SCORER_VERSION,PARSER_VERSION,REPORT_SCHEMA_VERSION,saveSnapshot(snapshot),PARSER_VERSION,snapshot.profileContentHash,createdAt]);
    } catch(e) {
      console.error('[analyses] readiness insert failed:', e);
      return res.status(500).json({ success:false, message:'Failed to save analysis results' });
    }
    res.json(snapshot);
  } catch(e:any){
    if (e?.code === 'STORED_FILE_MISSING') {
      return res.status(410).json({ success:false, message: e.message });
    }
    console.error('readiness error', e);
    res.status(500).json({ success:false, message:e.message || 'Failed to analyze'});
  }
});

router.post('/jd-match', authenticateAny, validate({ body: z.object({ resumeId: z.string().uuid(), jobDescription: z.string().min(20).max(20000), targetRole: z.string().optional(), targetLevel: z.string().optional() }) }), async (req:any,res)=>{
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
    const resumeChunks = professionalEvidence(profile);
    const jdChunks = [...jd.responsibilities.map((s: string) => s.slice(0, 400))];
    if (!resumeChunks.length || !jdChunks.length) {
      // A missing evidence source is not permission to embed contact/header text.
      jdChunks.length = 0;
    }

    const provider = getEmbeddingProvider();
    const allTexts = [...resumeChunks, ...jdChunks];
    const uniq = [...new Set(allTexts.map(t => t.trim()).filter(Boolean))];
    let vectors: number[][] = [];
    let modelId: string | null = null;
    let dimension: number | null = null;
    let modelRevision: string | null = null;
    let embeddingStatus: 'real' | 'mock' | 'unavailable' = 'unavailable';
    if (uniq.length && jdChunks.length) {
      try {
        const identity = 'modelRevision' in provider && typeof provider.modelRevision === 'string' && provider.modelRevision
          ? { modelId: provider.modelId, modelRevision: provider.modelRevision } : null;
        const resp = await embedCached(pool, provider, [
          { purpose: 'resume', ownerId: userId, texts: resumeChunks.map(t => t.trim()).filter(Boolean) },
          { purpose: 'jd', texts: jdChunks.map(t => t.trim()).filter(Boolean) },
        ], identity);
        const byText = new Map<string, number[]>();
        [...resumeChunks, ...jdChunks].forEach((text, i) => byText.set(text.trim(), resp.groups.flat()[i]));
        vectors = uniq.map(text => byText.get(text)!);
        validateVectors(vectors, uniq.length, resp.dimension);
        modelId = resp.modelId;
        dimension = resp.dimension;
        modelRevision = resp.modelRevision;
        embeddingStatus = resp.modelId.includes('mock') ? 'mock' : 'real';
      } catch (e) {
        console.warn('[jd-match] embedding unavailable:', (e as Error).message);
      }
    }
    // Mock vectors are deterministic test data, never a semantic fit signal.
    if (embeddingStatus !== 'real') vectors = [];
    // build semantic responsibility coverage: for each jd responsibility find best cosine to resume chunks
    // simple cosine using mock vectors aligned to uniq order
    const textToVec = new Map<string, number[]>();
    uniq.forEach((t,i)=> textToVec.set(t, vectors[i]));
    function cosine(a:number[], b:number[]):number {
      let dot=0, na=0, nb=0;
      for(let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
      return dot / (Math.sqrt(na)*Math.sqrt(nb) || 1);
    }
    const responsibilityCoverage = jd.responsibilities.map((resp:string)=>{
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
    const rubric = scoreJdRubric(profile, jd, deterministic, responsibilityCoverage);
    const confidenceReasons = [embeddingStatus !== 'real' ? 'Semantic model unavailable; responsibility score is not inferred' : null,
      !jd.responsibilities.length ? 'No reliably parsed responsibilities' : null,
      !resumeChunks.length ? 'No professional resume evidence' : null,
      rubric.qualificationReasons.length ? 'Qualification gap is separate from technology overlap' : null].filter(Boolean) as string[];
    const confidence: 'High'|'Medium'|'Low' = confidenceReasons.length || !rubric.pointsPossible ? 'Low' : jd.responsibilities.length < 3 ? 'Medium' : 'High';
    const jdMatch = { ...rubric, responsibilityCoverage, deterministic,
      jd: { title: jd.title, seniority: jd.seniority, requiredSkills: jd.requiredSkills,
        preferredSkills: jd.preferredSkills, responsibilities: jd.responsibilities,
        yearsExperience: jd.yearsExperience, minYearsExperience: jd.minYears ?? jd.yearsExperience,
        requirementGroups: jd.requirementGroups ?? null, domainTerms: jd.domainTerms },
      score: rubric.score };
    const analysisId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const jdHash = crypto.createHash('sha256').update(jobDescription).digest('hex');
    const snapshot: ReportSnapshot = { success:true, resultSchemaVersion: REPORT_SCHEMA_VERSION, analysisId, resumeId: row.id,
      fileName: row.original_filename ?? null, createdAt, readiness, jdMatch, confidence, confidenceReasons,
      profileContentHash: hashProfile(profile),
      versions: { scorerVersion: SCORER_VERSION, parserVersion: PARSER_VERSION, matcherVersion: JD_MATCHER_VERSION,
        embeddingModelId: modelId, dimension, usedMock: embeddingStatus === 'mock', embeddingStatus, modelRevision, rubricVersion: JD_RUBRIC_VERSION } };
    try {
      await pool.query(`INSERT INTO analyses (id,user_id,resume_id,analysis_type,readiness_score,jd_match_score,score_breakdown_json,evidence_json,target_level,jd_hash,scorer_version,parser_version,embedding_model_id,matching_version,result_schema_version,result_json,profile_version,profile_content_hash,embedding_status,embedding_dimension,embedding_model_revision,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [analysisId,userId,row.id,'jd_match',readiness.score,rubric.score,JSON.stringify({readiness:readiness.breakdown,jdMatch:rubric.breakdown,deterministic}),JSON.stringify({ ...jdMatch, rules:readiness.rules }),targetLevel||null,jdHash,SCORER_VERSION,PARSER_VERSION,modelId,JD_MATCHER_VERSION,REPORT_SCHEMA_VERSION,saveSnapshot(snapshot),PARSER_VERSION,snapshot.profileContentHash,embeddingStatus,dimension,modelRevision,createdAt]);
    } catch(e) {
      console.error('[analyses] jd-match insert failed:', e);
      return res.status(500).json({ success:false, message:'Failed to save analysis results' });
    }
    res.json(snapshot);
  } catch(e:any){
    if (e?.code === 'STORED_FILE_MISSING') {
      return res.status(410).json({ success:false, message: e.message });
    }
    console.error('jd-match error', e);
    res.status(500).json({ success:false, message:e.message || 'JD match failed'});
  }
});

// GET /analyses[?resumeId=<uuid>][&latest=true] — resumeId filters to one resume;
// latest=true returns only the newest row (used by the resume view, PLAN Issue 2).
router.get('/', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const resumeId = req.query.resumeId ? String(req.query.resumeId) : '';
  if (resumeId && !z.string().uuid().safeParse(resumeId).success) return res.status(400).json({ success:false, message:'Invalid resume ID' });
  const latest = String(req.query.latest ?? '') === 'true';
  try {
    const params:any[] = [userId];
    let where = 'user_id=$1';
    if (resumeId) { params.push(resumeId); where += ` AND resume_id=$${params.length}`; }
    const limit = latest ? 1 : 50;
    const r = await pool.query(`SELECT * FROM analyses WHERE ${where} ORDER BY created_at DESC LIMIT ${limit}`, params);
    res.json({ success:true, analyses: r.rows.map(serializeRow) });
  } catch(e:any){
    console.error('[analyses] list failed:', e);
    res.status(500).json({ success:false, message:'Failed to list analyses' });
  }
});

router.get('/:id', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const id = req.params.id;
  if (!z.string().uuid().safeParse(id).success) return res.status(400).json({ success:false, message:'Invalid analysis ID' });
  try {
    const r = await pool.query('SELECT * FROM analyses WHERE id=$1 AND user_id=$2', [id, userId]);
    if (!r.rows.length) return res.status(404).json({ success:false, message:'Analysis not found'});
    res.json({ success:true, analysis: serializeRow(r.rows[0])});
  } catch(e:any){
    // a failing query is NOT "not found" — never mask DB errors as 404
    console.error('[analyses] get failed:', e);
    res.status(500).json({ success:false, message:'Failed to load analysis' });
  }
});

export default router;
