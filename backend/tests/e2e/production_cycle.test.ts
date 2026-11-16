import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import request from 'supertest';
import dotenv from 'dotenv';
import path from 'node:path';

process.env.NODE_ENV = 'test';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import app from '../../src/server.js';
import pool from '../../src/config/database.js';
import { createSession } from '../../src/modules/auth/session.js';
import { generateResumePdf, sanitizePdfText, type StructuredResumeData } from '../../src/modules/pdf/pdfGenerator.js';
import { parsePdfBuffer } from '../../src/modules/parsing/pdfParser.js';
import { buildResumeProfile, PROFILE_VERSION } from '../../src/modules/parsing/resumeProfile.js';
import { scoreReadiness } from '../../src/modules/ats/readinessScorer.js';
import { uploadFile, downloadFile } from '../../src/modules/storage/supabaseStorage.js';
import {
  buildCandidateSkillWhitelist,
  validateSuggestionGuardrail,
} from '../../src/modules/tailoring/suggestionService.js';

describe('Milestone 3 Production Automated Cycle Verification Test', () => {
  const userId = crypto.randomUUID();
  const masterResumeId = crypto.randomUUID();
  const sampleJobId = crypto.randomUUID();
  let sessionToken: string;

  const sampleCandidateData: StructuredResumeData = {
    contactInfo: {
      name: 'Morgan Blake',
      title: 'Full Stack Cloud Engineer',
      email: 'morgan.blake@example.com',
      phone: '+1 555-0144',
      location: 'Austin, TX',
      linkedin: 'linkedin.com/in/morganblake',
      github: 'github.com/morganblake',
    },
    summary:
      'Full Stack Cloud Engineer with 4 years of experience building resilient backend APIs and distributed microservices using TypeScript, Node.js, Express, PostgreSQL, and Docker.',
    skills: [
      { category: 'Languages', skills: ['TypeScript', 'JavaScript', 'SQL', 'Python'] },
      { category: 'Frameworks & Systems', skills: ['Node.js', 'Express', 'React', 'PostgreSQL', 'Docker', 'Redis', 'REST'] },
    ],
    experience: [
      {
        title: 'Software Engineer',
        company: 'CloudScale Technologies',
        date: '2021 – Present',
        bullets: [
          'Worked on backend APIs using Node.js and PostgreSQL to handle user traffic.',
          'Built web application UI components using React and TypeScript.',
          'Maintained containerized microservices deployments with Docker and Redis caching.',
        ],
      },
    ],
    projects: [
      {
        title: 'High-Concurrency Event Worker',
        date: '2023',
        bullets: [
          'Engineered distributed task queue consuming event streams with Redis and Node.js.',
          'Containerized local dev environments utilizing Docker Compose.',
        ],
      },
    ],
    education: [
      {
        degree: 'Bachelor of Science in Computer Science',
        institution: 'University of Texas',
        year: '2020',
      },
    ],
  };

  const sampleJobDescription = `
    Job Title: Senior Backend Software Engineer
    Company: HyperScale Data Corp
    Location: Austin, TX (Hybrid)

    About Us:
    HyperScale Data Corp powers high-throughput data processing platforms for global fintech enterprises.

    Responsibilities:
    - Architect, build, and optimize high-throughput REST APIs using Node.js and Express.
    - Optimize complex PostgreSQL relational queries, indexing, and transactional integrity.
    - Design containerized microservices architecture with Docker and Redis caching layers.
    - Mentor engineering teammates and lead code reviews for reliability and performance.

    Qualifications:
    - 3+ years experience with Node.js, Express, and REST APIs.
    - Strong database skills in PostgreSQL query optimization.
    - Production experience with Docker containerization and Redis.
  `;

  let masterPdfBuffer: Buffer;
  let masterAtsScore: number;
  let candidateWhitelist: Set<string>;
  let generatedSuggestions: any[] = [];
  let acceptedSuggestion: any;
  let tailoredResumeId: string;
  let isolatedStoragePath: string;
  let updatedAtsScore: number;
  let updatedSemanticScore: number;

  it('Step 1: Parse a sample resume into structured profile & upload master resume', async () => {
    // 1. Generate ATS-compliant PDF
    masterPdfBuffer = await generateResumePdf(sampleCandidateData);
    assert.ok(masterPdfBuffer instanceof Buffer);
    assert.strictEqual(masterPdfBuffer.subarray(0, 4).toString('utf8'), '%PDF', 'Must start with %PDF magic bytes');

    // 2. Parse PDF buffer with ATS parser
    const parsed = await parsePdfBuffer(masterPdfBuffer);
    assert.strictEqual(parsed.detectedAsScanned, false, 'Generated PDF must not be detected as scanned');
    assert.ok(parsed.normalizedText.length > 500, 'Must extract meaningful text from PDF');

    // 3. Confirm 100% section extraction
    assert.ok(parsed.sections.summary, 'Summary section extracted');
    assert.ok(parsed.sections.skills, 'Skills section extracted');
    assert.ok(parsed.sections.experience, 'Experience section extracted');
    assert.ok(parsed.sections.projects, 'Projects section extracted');
    assert.ok(parsed.sections.education, 'Education section extracted');

    // 4. Build resume profile and baseline score
    const profile = buildResumeProfile(parsed);
    assert.ok(profile.skills.length > 0, 'Candidate skills recognized');
    const readiness = scoreReadiness(parsed, profile, 'mid');
    masterAtsScore = readiness.score;
    assert.ok(masterAtsScore >= 50, `Master ATS score should be reasonable (got ${masterAtsScore})`);

    // 5. Build candidate skill whitelist
    candidateWhitelist = buildCandidateSkillWhitelist(parsed.normalizedText, profile);
    assert.strictEqual(candidateWhitelist.has('node.js'), true);
    assert.strictEqual(candidateWhitelist.has('postgresql'), true);
    assert.strictEqual(candidateWhitelist.has('docker'), true);
    assert.strictEqual(candidateWhitelist.has('kubernetes'), false); // Candidate does NOT have Kubernetes
    assert.strictEqual(candidateWhitelist.has('rust'), false); // Candidate does NOT have Rust

    // 6. Seed test user & session
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name)
       VALUES ($1, $2, 'hash', 'Morgan Blake')
       ON CONFLICT (id) DO NOTHING`,
      [userId, `morgan_${Date.now()}@example.com`]
    );

    const sess = await createSession(userId);
    sessionToken = sess.token;
    assert.ok(sessionToken, 'User session token created');

    // 7. Seed job record
    const contentHash = crypto.createHash('sha256').update(sampleJobDescription).digest('hex');
    await pool.query(
      `INSERT INTO jobs (id, source, external_id, title, company, description, content_hash)
       VALUES ($1, 'custom', $2, 'Senior Backend Software Engineer', 'HyperScale Data Corp', $3, $4)
       ON CONFLICT (id) DO UPDATE SET description=$3, content_hash=$4`,
      [sampleJobId, String(sampleJobId), sampleJobDescription, contentHash]
    );

    // 8. Upload master resume to Supabase Storage
    const storageRef = await uploadFile(userId, masterResumeId, masterPdfBuffer, 'morgan_master_resume.pdf');
    assert.strictEqual(storageRef.path, `${userId}/${masterResumeId}/morgan_master_resume.pdf`);

    await pool.query(
      `INSERT INTO resumes (id, user_id, original_filename, storage_bucket, storage_object_path, sha256, file_size_bytes, page_count, parser_version, processing_status, is_latest)
       VALUES ($1, $2, 'morgan_master_resume.pdf', $3, $4, $5, $6, 1, $7, 'ready', true)
       ON CONFLICT (id) DO NOTHING`,
      [masterResumeId, userId, storageRef.bucket, storageRef.path, storageRef.sha256, masterPdfBuffer.length, PROFILE_VERSION]
    );
  });

  it('Step 2: Request suggestions for a sample job without user prompt text (POST .../suggestions with {})', async () => {
    // Single-click zero-prompt tailoring request
    const res = await request(app)
      .post(`/api/v1/resumes/${masterResumeId}/tailor/${sampleJobId}/suggestions`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({}); // Zero user prompt text

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.jobId, sampleJobId);
    assert.strictEqual(res.body.resumeId, masterResumeId);
    assert.ok(Array.isArray(res.body.suggestions), 'Must return array of suggestions');
    assert.ok(res.body.suggestions.length > 0, 'Must provide at least one improvement suggestion');

    generatedSuggestions = res.body.suggestions;
    for (const sug of generatedSuggestions) {
      assert.ok(sug.id, 'Suggestion has id');
      assert.ok(sug.section, 'Suggestion specifies section');
      assert.ok(sug.originalText, 'Suggestion has original text');
      assert.ok(sug.suggestedText, 'Suggestion has suggested text');
      assert.ok(sug.rationale, 'Suggestion has rationale');
      assert.strictEqual(sug.status, 'pending', 'Suggestion status starts as pending');
    }
  });

  it('Step 3: Verify non-hallucination guardrail (no unpossessed skills recommended or allowed)', async () => {
    // 1. Verify every generated suggestion strictly adheres to candidate verified skills
    for (const sug of generatedSuggestions) {
      const guard = validateSuggestionGuardrail(sug.originalText, sug.suggestedText, candidateWhitelist);
      assert.strictEqual(
        guard.valid,
        true,
        `Generated suggestion "${sug.suggestedText}" introduced unpossessed skills: ${guard.introducedUnpossessedSkills.join(', ')}`
      );
      assert.strictEqual(guard.introducedUnpossessedSkills.length, 0);
    }

    // 2. Adversarial Test: Attempt to submit an edit introducing unpossessed skills (Kubernetes & Rust)
    const adversarialText = 'Architected high-scale microservices using Node.js, Kubernetes, and Rust with 99.99% uptime.';
    const adversarialRes = await request(app)
      .post(`/api/v1/resumes/${masterResumeId}/tailor/${sampleJobId}/apply-suggestion`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({
        suggestionId: 'sug-adversarial-fake',
        acceptedText: adversarialText,
        section: 'experience',
        bulletIndex: 0,
        originalText: 'Worked on backend APIs using Node.js and PostgreSQL to handle user traffic.',
      });

    assert.strictEqual(
      adversarialRes.status,
      400,
      'Guardrail must return 400 Bad Request when unpossessed skills are introduced'
    );
    assert.strictEqual(adversarialRes.body.success, false);
    assert.ok(
      adversarialRes.body.message.includes('unpossessed skills') ||
      adversarialRes.body.message.toLowerCase().includes('guardrail') ||
      adversarialRes.body.unpossessedSkills?.length > 0,
      'Response must explain guardrail rejection'
    );
  });

  it('Step 4: Accept an approved suggestion via API', async () => {
    // Select first valid suggestion
    acceptedSuggestion = generatedSuggestions[0];
    assert.ok(acceptedSuggestion, 'Must have at least one suggestion to accept');

    const res = await request(app)
      .post(`/api/v1/resumes/${masterResumeId}/tailor/${sampleJobId}/apply-suggestion`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({
        suggestionId: acceptedSuggestion.id,
        acceptedText: acceptedSuggestion.suggestedText,
        section: acceptedSuggestion.section,
        itemIndex: acceptedSuggestion.itemIndex ?? 0,
        bulletIndex: acceptedSuggestion.bulletIndex ?? 0,
        originalText: acceptedSuggestion.originalText,
      });

    assert.strictEqual(res.status, 200, `Expected 200, got: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.tailoredResumeId, 'Must return tailoredResumeId');
    assert.ok(res.body.storagePath, 'Must return storagePath');
    assert.ok(res.body.pdfUrl, 'Must return pdfUrl');
    assert.ok(res.body.downloadUrl, 'Must return downloadUrl');
    assert.ok(res.body.updatedScores, 'Must return updatedScores');
    assert.ok(res.body.scoreDelta, 'Must return scoreDelta');

    tailoredResumeId = res.body.tailoredResumeId;
    isolatedStoragePath = res.body.storagePath;
    updatedAtsScore = res.body.updatedScores.atsScore;
    updatedSemanticScore = res.body.updatedScores.semanticScore;
  });

  it('Step 5: Update the resume PDF file (confirming %PDF, detectedAsScanned: false, 100% section extraction)', async () => {
    // Download the generated tailored PDF directly from storage
    const downloadedPdf = await downloadFile({
      bucket: 'resumes',
      path: isolatedStoragePath,
      sha256: '',
    });

    assert.ok(downloadedPdf instanceof Buffer);
    assert.ok(downloadedPdf.length > 1000, 'Tailored PDF buffer must be substantial');

    // 1. Confirm %PDF magic bytes
    const magic = downloadedPdf.subarray(0, 4).toString('utf8');
    assert.strictEqual(magic, '%PDF', 'Tailored file must begin with %PDF magic bytes');

    // 2. Parse with ATS parser
    const parsedTailored = await parsePdfBuffer(downloadedPdf);
    assert.strictEqual(parsedTailored.detectedAsScanned, false, 'Tailored PDF must never be detected as scanned');
    assert.ok(parsedTailored.normalizedText.length > 500, 'Normalized text must be extracted');

    // 3. Confirm 100% section extraction
    assert.ok(parsedTailored.sections.summary, 'Summary detected in tailored PDF');
    assert.ok(parsedTailored.sections.skills, 'Skills detected in tailored PDF');
    assert.ok(parsedTailored.sections.experience, 'Experience detected in tailored PDF');
    assert.ok(parsedTailored.sections.projects, 'Projects detected in tailored PDF');
    assert.ok(parsedTailored.sections.education, 'Education detected in tailored PDF');

    // 4. Verify clean single-column layout without formatting artifacts
    assert.strictEqual(parsedTailored.layoutSignals.hasMultiColumnRisk, false);
    assert.strictEqual(parsedTailored.layoutSignals.excessiveTables, false);
  });

  it('Step 6: Store the resume in Supabase storage under job-isolated path (${userId}/jobs/${jobId}/${tailoredResumeId}/${safeFilename})', async () => {
    // Expected path structure: ${userId}/jobs/${jobId}/${tailoredResumeId}/${safeFilename}
    const expectedPrefix = `${userId}/jobs/${sampleJobId}/${tailoredResumeId}/`;
    assert.ok(
      isolatedStoragePath.startsWith(expectedPrefix),
      `Storage path "${isolatedStoragePath}" must start with job-isolated prefix "${expectedPrefix}"`
    );

    // Verify DB linkage
    const { rows } = await pool.query('SELECT * FROM resumes WHERE id=$1', [tailoredResumeId]);
    assert.strictEqual(rows.length, 1);
    const row = rows[0];
    assert.strictEqual(String(row.user_id), userId);
    assert.strictEqual(String(row.job_id), sampleJobId, 'Resume must be tied to specific job_id in DB');
    assert.strictEqual(String(row.parent_resume_id), masterResumeId, 'Resume must reference parent_resume_id');
    assert.strictEqual(row.storage_object_path, isolatedStoragePath);
  });

  it('Step 7: Verify recalculated ATS score and semantic similarity score', async () => {
    assert.strictEqual(typeof updatedAtsScore, 'number');
    assert.strictEqual(typeof updatedSemanticScore, 'number');
    assert.ok(updatedAtsScore >= 0 && updatedAtsScore <= 100, `ATS score out of range: ${updatedAtsScore}`);
    assert.ok(updatedSemanticScore >= 0 && updatedSemanticScore <= 100, `Semantic score out of range: ${updatedSemanticScore}`);

    // Fetch existing tailored resume via GET /api/v1/resumes/:resumeId/tailor/:jobId
    const getRes = await request(app)
      .get(`/api/v1/resumes/${masterResumeId}/tailor/${sampleJobId}`)
      .set('Authorization', `Bearer ${sessionToken}`);

    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.body.success, true);
    assert.ok(getRes.body.tailoredResume);
    assert.strictEqual(getRes.body.tailoredResume.id, tailoredResumeId);
    assert.strictEqual(getRes.body.tailoredResume.atsScore, updatedAtsScore);
    assert.strictEqual(getRes.body.tailoredResume.semanticScore, updatedSemanticScore);
  });

  it('Step 8: Verify resume versioning allows >3 versions per user without eviction', async () => {
    // Upload 4 more resumes for this user (total 1 master + 1 tailored + 4 additional = 6 resumes)
    const createdIds: string[] = [];

    for (let i = 1; i <= 4; i++) {
      const extraResumeId = crypto.randomUUID();
      const extraPdf = await generateResumePdf({
        ...sampleCandidateData,
        summary: `Version ${i} resume for testing multi-version retention policy without cap.`,
      });

      const ref = await uploadFile(userId, extraResumeId, extraPdf, `version_${i}.pdf`);
      await pool.query(
        `INSERT INTO resumes (id, user_id, original_filename, storage_bucket, storage_object_path, sha256, file_size_bytes, page_count, parser_version, processing_status, is_latest)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, 'ready', false)`,
        [extraResumeId, userId, `version_${i}.pdf`, ref.bucket, ref.path, ref.sha256, extraPdf.length, PROFILE_VERSION]
      );
      createdIds.push(extraResumeId);
    }

    // Query all resumes for this user
    const { rows } = await pool.query(
      'SELECT id, original_filename, is_latest FROM resumes WHERE user_id=$1 ORDER BY created_at ASC',
      [userId]
    );

    // Verify all resumes (>3) are preserved in database without any being evicted
    assert.ok(
      rows.length >= 6,
      `User should have at least 6 resume versions in DB without cap eviction (got ${rows.length})`
    );

    const userResumeIds = rows.map((r) => r.id);
    assert.ok(userResumeIds.includes(masterResumeId), 'Master resume must not be evicted');
    assert.ok(userResumeIds.includes(tailoredResumeId), 'Tailored resume must not be evicted');
    for (const extraId of createdIds) {
      assert.ok(userResumeIds.includes(extraId), `Version ${extraId} must not be evicted`);
    }
  });

  it('Step 9: Cleanup test records', async () => {
    await pool.query('DELETE FROM analyses WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM resumes WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM jobs WHERE id=$1', [sampleJobId]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => {});
  });
});
