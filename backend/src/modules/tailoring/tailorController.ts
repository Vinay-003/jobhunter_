import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import pool from '../../config/database.js';
import { generateResumePdf, type StructuredResumeData } from '../pdf/pdfGenerator.js';
import {
  generateTailorSuggestions,
  validateSuggestionGuardrail,
  buildCandidateSkillWhitelist,
  type CandidateContext,
  type JobContext,
  type TailorSuggestion,
} from './suggestionService.js';
import { parsePdfBuffer, type ParsedDocument } from '../parsing/pdfParser.js';
import {
  buildResumeProfile,
  buildParsedResumeSections,
  PROFILE_VERSION,
  type ResumeProfile,
} from '../parsing/resumeProfile.js';
import { scoreReadiness, VERSION as SCORER_VERSION } from '../ats/readinessScorer.js';
import { parseJd, type ParsedJobDescription } from '../jd/jdParser.js';
import { matchJd } from '../jd/matcher.js';
import { scoreJdRubric, JD_RUBRIC_VERSION } from '../analysis/jdRubric.js';
import { rankJob } from '../jobs/ranking.js';
import { professionalEvidence } from '../matching/evidenceBuilder.js';
import { embedCached } from '../../providers/embeddings/embeddingCache.js';
import { AwsSageMakerEmbeddingProvider } from '../../providers/embeddings/AwsSageMakerEmbeddingProvider.js';
import { MockEmbeddingProvider } from '../../providers/embeddings/MockEmbeddingProvider.js';
import { uploadFile, downloadFile } from '../storage/supabaseStorage.js';

function getEmbeddingProvider() {
  const p = (process.env.EMBEDDING_PROVIDER || 'auto').toLowerCase();
  if (p === 'mock') return new MockEmbeddingProvider();
  return new AwsSageMakerEmbeddingProvider();
}

async function loadResumeBuffer(resumeRow: any): Promise<Buffer> {
  const bucket = resumeRow.storage_bucket || 'resumes';
  const objectPath = resumeRow.storage_object_path || resumeRow.file_path;
  if (!objectPath) {
    throw new Error('Resume has no storage path');
  }
  const data = await downloadFile({ bucket, path: objectPath, sha256: '' });
  return Buffer.from(data);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function computeSemanticScore(
  profile: ResumeProfile,
  jd: ParsedJobDescription,
  userId?: string
): Promise<{ score: number; breakdown: any; responsibilityCoverage: any }> {
  const deterministic = matchJd(profile, jd);
  const resumeChunks = professionalEvidence(profile);
  const jdChunks = (jd.responsibilities || []).map((r) => r.slice(0, 400).trim()).filter(Boolean);

  if (!jdChunks.length || !resumeChunks.length) {
    const fallbackCoverage = (jd.responsibilities || []).map((resp) => ({
      responsibility: resp,
      matchScore: 0,
      candidateEvidence: null,
    }));
    const rubric = scoreJdRubric(profile, jd, deterministic, fallbackCoverage);
    return { score: rubric.score ?? 0, breakdown: rubric.breakdown, responsibilityCoverage: fallbackCoverage };
  }

  const provider = getEmbeddingProvider();
  const identity = {
    modelId: provider.modelId,
    dimension: provider.dimension,
    modelRevision: (provider as any).modelRevision,
  };

  let responsibilityCoverage = (jd.responsibilities || []).map((resp) => ({
    responsibility: resp,
    matchScore: 0,
    candidateEvidence: null as string | null,
  }));

  try {
    const uniq = Array.from(new Set([...resumeChunks, ...jdChunks]));
    const resp = await embedCached(
      pool,
      provider,
      [
        { purpose: 'resume', ownerId: userId, texts: resumeChunks.map((t) => t.trim()).filter(Boolean) },
        { purpose: 'jd', texts: jdChunks.map((t) => t.trim()).filter(Boolean) },
      ],
      identity
    );

    const byText = new Map<string, number[]>();
    [...resumeChunks, ...jdChunks].forEach((text, i) => byText.set(text.trim(), resp.groups.flat()[i]));

    responsibilityCoverage = jd.responsibilities.map((resp) => {
      const jv = byText.get(resp.slice(0, 400).trim()) || byText.get(resp.trim());
      if (!jv) return { responsibility: resp, matchScore: 0, candidateEvidence: null };
      let best = -1;
      let bestChunk: string | null = null;
      for (const rc of resumeChunks) {
        const rv = byText.get(rc.trim());
        if (!rv) continue;
        const s = cosine(jv, rv);
        if (s > best) {
          best = s;
          bestChunk = rc;
        }
      }
      const sc = Math.max(0, Math.min(1, best));
      return {
        responsibility: resp,
        matchScore: Number(sc.toFixed(3)),
        candidateEvidence: bestChunk && sc >= 0.45 ? bestChunk.slice(0, 200) : null,
      };
    });
  } catch (err: any) {
    console.warn('[tailorController] Embeddings calculation failed:', err.message);
  }

  const rubric = scoreJdRubric(profile, jd, deterministic, responsibilityCoverage);
  return { score: rubric.score ?? 0, breakdown: rubric.breakdown, responsibilityCoverage };
}

/**
 * Convert parsed sections and profile into StructuredResumeData
 */
export function extractStructuredResumeData(
  parsedDoc: ParsedDocument,
  profile: ResumeProfile
): StructuredResumeData {
  const sectionsData = buildParsedResumeSections(parsedDoc, profile);
  const contact = sectionsData.contactInfo || {};
  const linksList = Array.isArray(contact.links) ? contact.links : [];

  // Phone regex supporting both US and Indian (+91) formats
  const phone = contact.phone || parsedDoc.normalizedText.match(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/)?.[0] || null;

  // Find summary
  const summarySection = sectionsData.parsedSections.find(
    (s) => s.heading.toLowerCase().includes('summary') || s.title.toLowerCase().includes('summary')
  );
  const summary = summarySection?.content || summarySection?.text || profile.summary || null;

  // Skills
  const skills = profile.skills && profile.skills.length > 0 ? profile.skills : [];

  // Experience
  const experience = (profile.experience || []).map((exp) => {
    let bullets = exp.bullets ? exp.bullets.map((b) => (typeof b === 'string' ? b : b.text)) : [];
    if (exp.description) {
      const descBullets = exp.description.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 15);
      if (descBullets.length > bullets.length) bullets = descBullets;
    }
    return {
      title: exp.title || 'Role',
      company: exp.company || '',
      date: [exp.startDate, exp.endDate || (exp.isCurrent ? 'Present' : '')].filter(Boolean).join(' – '),
      startDate: exp.startDate,
      endDate: exp.endDate,
      description: exp.description,
      bullets,
    };
  });

  // Projects
  const projects = (profile.projects || []).map((proj) => {
    let bullets = proj.bullets ? proj.bullets.map((b) => (typeof b === 'string' ? b : b.text)) : [];
    if (proj.description) {
      const descBullets = proj.description.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter((s) => s.length > 15);
      if (descBullets.length > bullets.length) bullets = descBullets;
    }
    return {
      title: proj.title || 'Project',
      description: proj.description,
      bullets,
    };
  });

  // Education
  const education = (profile.education || []).map((edu) => ({
    degree: [edu.degree, edu.field].filter(Boolean).join(' in ') || 'Degree',
    institution: edu.institution || '',
    year: edu.year || '',
    raw: edu.raw,
  }));

  return {
    contactInfo: {
      name: contact.name,
      title: contact.title,
      email: contact.email,
      phone,
      location: contact.location || 'Gandhinagar, Gujarat',
      linkedin: linksList.find((l) => l.toLowerCase().includes('linkedin')) || 'LinkedIn',
      github: linksList.find((l) => l.toLowerCase().includes('github')) || 'GitHub',
      website: linksList.find((l) => !l.toLowerCase().includes('linkedin') && !l.toLowerCase().includes('github')) || (parsedDoc.normalizedText.match(/portfolio/i) ? 'Portfolio' : undefined),
    },
    summary,
    skills,
    experience,
    projects,
    education,
  };
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(val: string): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

/**
 * POST /api/v1/resumes/:resumeId/tailor/:jobId/suggestions
 * Generates tailor suggestions with zero user prompt.
 */
export async function getTailorSuggestionsHandler(req: Request, res: Response) {
  const userId = String((req as any).user?.id);
  const { resumeId, jobId } = req.params;

  if (!isUuid(resumeId) || !isUuid(jobId)) {
    return res.status(400).json({ success: false, message: 'Invalid resumeId or jobId: must be a valid UUID' });
  }

  try {
    // 1. Fetch base master resume to guarantee a clean starting point
    const rRes = await pool.query(
      `SELECT * FROM resumes 
       WHERE user_id=$2 AND (id=$1 OR (parent_resume_id IS NULL AND job_id IS NULL))
       ORDER BY (parent_resume_id IS NULL AND job_id IS NULL) DESC, created_at DESC 
       LIMIT 1`,
      [resumeId, userId]
    );
    let resumeRow = rRes.rows[0];
    if (!resumeRow) {
      const fallback = await pool.query('SELECT * FROM resumes WHERE id=$1', [resumeId]);
      if (fallback.rows[0] && String(fallback.rows[0].user_id) !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (!fallback.rows[0]) {
        return res.status(404).json({ success: false, message: 'Resume not found' });
      }
      resumeRow = fallback.rows[0];
    }

    // 2. Fetch job
    const jRes = await pool.query('SELECT * FROM jobs WHERE id=$1', [jobId]);
    const jobRow = jRes.rows[0];
    if (!jobRow) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const jobDescription = jobRow.description || jobRow.job_description || jobRow.snippet || '';
    const parsedJd = parseJd(jobDescription);

    // 3. Load & parse base resume
    const resumeBuf = await loadResumeBuffer(resumeRow);
    const parsedDoc = await parsePdfBuffer(resumeBuf);
    const profile = buildResumeProfile(parsedDoc);
    const sectionsData = buildParsedResumeSections(parsedDoc, profile);

    // 4. Compute current rank & identify specific gaps
    const rank = await rankJob(profile, jobRow as any, { ownerId: userId }).catch(() => null);
    const responsibilityMatches = rank?.scoreDetails?.responsibilityMatches || [];
    const unmatchedResponsibilities = responsibilityMatches
      .filter((r: any) => !r.supported || (typeof r.similarity === 'number' && r.similarity < 0.40))
      .map((r: any) => r.responsibility);
    const missingSkills = (rank?.missingSkills && rank.missingSkills.length > 0)
      ? rank.missingSkills
      : parsedJd.requiredSkills || [];

    const candidateContext: CandidateContext = {
      resumeText: parsedDoc.normalizedText,
      profile,
      parsedSections: sectionsData.parsedSections,
    };

    const jobContext: JobContext = {
      id: jobId,
      title: jobRow.title || parsedJd.title || 'Role',
      company: jobRow.company || '',
      requiredSkills: parsedJd.requiredSkills,
      preferredSkills: parsedJd.preferredSkills,
      responsibilities: parsedJd.responsibilities,
      description: jobDescription,
      unmatchedResponsibilities: unmatchedResponsibilities.length ? unmatchedResponsibilities : parsedJd.responsibilities.slice(0, 7),
      missingSkills,
    };

    // 5. Generate suggestions (zero prompt needed from user, targeted at gaps)
    const suggestions = await generateTailorSuggestions(candidateContext, jobContext);

    return res.json({
      success: true,
      jobId,
      resumeId,
      suggestions,
    });
  } catch (err: any) {
    console.error('[tailorController] getTailorSuggestionsHandler error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to generate suggestions' });
  }
}

/**
 * POST /api/v1/resumes/:resumeId/tailor/:jobId/apply-suggestion
 * Applies approved suggestion, updates PDF, uploads to job-isolated storage,
 * and recalculates ATS Readiness & Semantic Similarity scores.
 */
export async function applySuggestionHandler(req: Request, res: Response) {
  const userId = String((req as any).user?.id);
  const { resumeId, jobId } = req.params;

  if (!isUuid(resumeId) || !isUuid(jobId)) {
    return res.status(400).json({ success: false, message: 'Invalid resumeId or jobId: must be a valid UUID' });
  }

  const { suggestionId, acceptedText, section, itemIndex = 0, bulletIndex = 0, originalText } = req.body;

  if (!acceptedText || typeof acceptedText !== 'string' || acceptedText.trim().length === 0) {
    return res.status(400).json({ success: false, message: 'acceptedText is required' });
  }

  try {
    // 1. Fetch base master resume & job
    const rRes = await pool.query(
      `SELECT * FROM resumes 
       WHERE user_id=$2 AND (id=$1 OR (parent_resume_id IS NULL AND job_id IS NULL))
       ORDER BY (parent_resume_id IS NULL AND job_id IS NULL) DESC, created_at DESC 
       LIMIT 1`,
      [resumeId, userId]
    );
    let resumeRow = rRes.rows[0];
    if (!resumeRow) {
      const fallback = await pool.query('SELECT * FROM resumes WHERE id=$1', [resumeId]);
      if (fallback.rows[0] && String(fallback.rows[0].user_id) !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      if (!fallback.rows[0]) {
        return res.status(404).json({ success: false, message: 'Resume not found' });
      }
      resumeRow = fallback.rows[0];
    }

    const jRes = await pool.query('SELECT * FROM jobs WHERE id=$1', [jobId]);
    const jobRow = jRes.rows[0];
    if (!jobRow) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const jobDescription = jobRow.description || jobRow.job_description || jobRow.snippet || '';
    const parsedJd = parseJd(jobDescription);

    // 2. Load current resume content & profile
    const currentBuf = await loadResumeBuffer(resumeRow);
    const currentParsedDoc = await parsePdfBuffer(currentBuf);
    const currentProfile = buildResumeProfile(currentParsedDoc);

    // 3. Programmatic Whitelist Guardrail verification
    const whitelist = buildCandidateSkillWhitelist(currentParsedDoc.normalizedText, currentProfile);
    const guard = validateSuggestionGuardrail(originalText || '', acceptedText, whitelist);
    if (!guard.valid) {
      return res.status(400).json({
        success: false,
        message: `Suggestion rejected by integrity guardrail: introduces unpossessed skills (${guard.introducedUnpossessedSkills.join(
          ', '
        )})`,
        unpossessedSkills: guard.introducedUnpossessedSkills,
      });
    }

    // 4. Calculate previous scores
    const targetSeniority = (currentProfile.seniority as any) || undefined;
    const oldReadiness = scoreReadiness(currentParsedDoc, currentProfile, targetSeniority);
    const oldRank = await rankJob(currentProfile, jobRow as any, { ownerId: userId }).catch(() => null);
    const oldSemanticScore = oldRank?.fitScore ?? (await computeSemanticScore(currentProfile, parsedJd, userId)).score;
    const previousScores = {
      atsScore: oldReadiness.score,
      semanticScore: oldSemanticScore,
    };

    // 5. Build and update structured resume data (incrementally build on this job's existing tailored version if present)
    const existingTailored = await pool.query(
      `SELECT * FROM resumes WHERE user_id=$1 AND job_id=$2 ORDER BY created_at DESC LIMIT 1`,
      [userId, jobId]
    );
    let structured: StructuredResumeData;
    if (existingTailored.rows[0]?.tailored_content_json && typeof existingTailored.rows[0].tailored_content_json === 'object') {
      structured = existingTailored.rows[0].tailored_content_json as StructuredResumeData;
    } else if (resumeRow.tailored_content_json && typeof resumeRow.tailored_content_json === 'object') {
      structured = resumeRow.tailored_content_json as StructuredResumeData;
    } else {
      structured = extractStructuredResumeData(currentParsedDoc, currentProfile);
    }

    // Apply the edit
    const targetSection = section || 'experience';
    if (targetSection === 'experience') {
      structured.experience = structured.experience || [];
      const expItem = structured.experience[itemIndex] || structured.experience[0];
      if (expItem) {
        expItem.bullets = expItem.bullets || [];
        if (originalText && expItem.bullets.includes(originalText)) {
          const idx = expItem.bullets.indexOf(originalText);
          expItem.bullets[idx] = acceptedText.trim();
        } else if (expItem.bullets[bulletIndex]) {
          expItem.bullets[bulletIndex] = acceptedText.trim();
        } else {
          expItem.bullets.push(acceptedText.trim());
        }
      }
    } else if (targetSection === 'projects') {
      structured.projects = structured.projects || [];
      const projItem = structured.projects[itemIndex] || structured.projects[0];
      if (projItem) {
        projItem.bullets = projItem.bullets || [];
        if (originalText && projItem.bullets.includes(originalText)) {
          const idx = projItem.bullets.indexOf(originalText);
          projItem.bullets[idx] = acceptedText.trim();
        } else if (projItem.bullets[bulletIndex]) {
          projItem.bullets[bulletIndex] = acceptedText.trim();
        } else {
          projItem.bullets.push(acceptedText.trim());
        }
      }
    } else if (targetSection === 'summary') {
      structured.summary = acceptedText.trim();
    }

    // 6. Generate updated ATS-compliant PDF
    const updatedPdfBuffer = await generateResumePdf(structured);
    const updatedParsedDoc = await parsePdfBuffer(updatedPdfBuffer);
    const updatedProfile = buildResumeProfile(updatedParsedDoc);

    // 7. Recalculate new scores
    const newReadiness = scoreReadiness(updatedParsedDoc, updatedProfile, targetSeniority);
    const newRank = await rankJob(updatedProfile, jobRow as any, { ownerId: userId }).catch(() => null);
    const newSemanticScore = newRank?.fitScore ?? (await computeSemanticScore(updatedProfile, parsedJd, userId)).score;

    const updatedScores = {
      atsScore: newReadiness.score,
      semanticScore: newSemanticScore,
    };

    const scoreDelta = {
      atsDelta: updatedScores.atsScore - previousScores.atsScore,
      semanticDelta: updatedScores.semanticScore - previousScores.semanticScore,
    };

    // 8. Upload to Supabase Storage with Job Isolation
    const tailoredResumeId = crypto.randomUUID();
    const safeJobTitle = (jobRow.title || 'role').toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 40);
    const filename = `tailored_${safeJobTitle}_resume.pdf`;

    const storageRef = await uploadFile(userId, tailoredResumeId, updatedPdfBuffer, filename, {
      jobId,
    });

    const sha256 = crypto.createHash('sha256').update(updatedPdfBuffer).digest('hex');
    const parserVersion = PROFILE_VERSION;

    // 9. Insert into resumes table
    await pool.query(
      `INSERT INTO resumes (
        id, user_id, original_filename, storage_bucket, storage_object_path,
        sha256, file_size_bytes, page_count, parser_version, processing_status,
        is_latest, job_id, parent_resume_id, tailored_content_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready', false, $10, $11, $12)`,
      [
        tailoredResumeId,
        userId,
        filename,
        storageRef.bucket,
        storageRef.path,
        sha256,
        updatedPdfBuffer.length,
        updatedParsedDoc.layoutSignals.pageCount || 1,
        parserVersion,
        jobId,
        resumeRow.parent_resume_id || resumeRow.id,
        JSON.stringify(structured),
      ]
    );

    // 10. Insert into resume_profiles table
    await pool.query(
      `INSERT INTO resume_profiles (resume_id, profile_json, profile_version)
       VALUES ($1, $2, $3)
       ON CONFLICT (resume_id) DO UPDATE SET profile_json = $2, profile_version = $3, updated_at = now()`,
      [tailoredResumeId, JSON.stringify(updatedProfile), parserVersion]
    );

    // 11. Save snapshot in analyses table
    const analysisId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const breakdown = {
      readiness: newReadiness.breakdown,
      jdMatch: newRank?.breakdown || {},
      scoreDelta,
    };
    const evidence = {
      rules: newReadiness.rules,
      findings: newReadiness.findings,
      responsibilityCoverage: newRank?.scoreDetails?.responsibilityMatches || [],
      appliedSuggestionId: suggestionId,
      verifiedSkillsUsed: guard.verifiedSkillsUsed,
    };

    try {
      await pool.query(
        `INSERT INTO analyses (
          id, user_id, resume_id, job_id, analysis_type, readiness_score, jd_match_score,
          score_breakdown_json, evidence_json, scorer_version, parser_version,
          result_schema_version, profile_version, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          analysisId,
          userId,
          tailoredResumeId,
          jobId,
          'tailored_match',
          updatedScores.atsScore,
          updatedScores.semanticScore,
          JSON.stringify(breakdown),
          JSON.stringify(evidence),
          SCORER_VERSION,
          parserVersion,
          1,
          parserVersion,
          createdAt,
        ]
      );
    } catch (dbErr: any) {
      console.warn('[tailorController] Failed to save analysis snapshot (non-fatal):', dbErr.message);
    }

    return res.json({
      success: true,
      tailoredResumeId,
      storagePath: storageRef.path,
      previousScores,
      updatedScores,
      scoreDelta,
      updatedBreakdown: newRank?.breakdown || null,
      pdfUrl: `/api/v1/resumes/${tailoredResumeId}/file`,
      downloadUrl: `/api/v1/resumes/${tailoredResumeId}/download`,
      appliedSuggestion: {
        suggestionId: suggestionId || 'sug-applied',
        acceptedText,
        verifiedSkillsUsed: guard.verifiedSkillsUsed,
      },
    });
  } catch (err: any) {
    console.error('[tailorController] applySuggestionHandler error:', err);
    return res.status(500).json({ success: false, message: err.message || 'Failed to apply suggestion' });
  }
}

/**
 * GET /api/v1/resumes/:resumeId/tailor/:jobId
 * Fetch existing tailored resume and analysis for this user & job.
 */
export async function getTailoredResumeHandler(req: Request, res: Response) {
  const userId = String((req as any).user?.id);
  const { resumeId, jobId } = req.params;

  if (!isUuid(resumeId) || !isUuid(jobId)) {
    return res.status(400).json({ success: false, message: 'Invalid resumeId or jobId: must be a valid UUID' });
  }

  try {
    const rRes = await pool.query(
      `SELECT * FROM resumes 
       WHERE user_id=$1 AND job_id=$2 
       ORDER BY created_at DESC LIMIT 1`,
      [userId, jobId]
    );

    const tailoredRow = rRes.rows[0];
    if (!tailoredRow) {
      return res.json({ success: true, tailoredResume: null });
    }

    const aRes = await pool.query(
      `SELECT * FROM analyses 
       WHERE resume_id=$1 
       ORDER BY created_at DESC LIMIT 1`,
      [tailoredRow.id]
    );
    const analysisRow = aRes.rows[0];

    return res.json({
      success: true,
      tailoredResume: {
        id: tailoredRow.id,
        filename: tailoredRow.original_filename,
        storagePath: tailoredRow.storage_object_path,
        createdAt: tailoredRow.created_at,
        atsScore: analysisRow?.readiness_score != null ? Number(analysisRow.readiness_score) : null,
        semanticScore: analysisRow?.jd_match_score != null ? Number(analysisRow.jd_match_score) : null,
        pdfUrl: `/api/v1/resumes/${tailoredRow.id}/file`,
        downloadUrl: `/api/v1/resumes/${tailoredRow.id}/download`,
      },
    });
  } catch (err: any) {
    console.error('[tailorController] getTailoredResumeHandler error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
