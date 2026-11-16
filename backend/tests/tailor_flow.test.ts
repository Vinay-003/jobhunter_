import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import pool from '../src/config/database.js';
import { generateResumePdf, type StructuredResumeData } from '../src/modules/pdf/pdfGenerator.js';
import { parsePdfBuffer } from '../src/modules/parsing/pdfParser.js';
import { buildResumeProfile, PROFILE_VERSION } from '../src/modules/parsing/resumeProfile.js';
import { scoreReadiness } from '../src/modules/ats/readinessScorer.js';
import { parseJd } from '../src/modules/jd/jdParser.js';
import { matchJd } from '../src/modules/jd/matcher.js';
import { scoreJdRubric } from '../src/modules/analysis/jdRubric.js';
import { uploadFile, downloadFile } from '../src/modules/storage/supabaseStorage.js';
import {
  generateTailorSuggestions,
  validateSuggestionGuardrail,
  buildCandidateSkillWhitelist,
} from '../src/modules/tailoring/suggestionService.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

describe('End-to-End Per-Job Resume Tailoring & Recalculation Flow', () => {
  const userId = crypto.randomUUID();
  const originalResumeId = crypto.randomUUID();
  const testJobId = crypto.randomUUID();

  const originalStructuredData: StructuredResumeData = {
    contactInfo: {
      name: 'Morgan Davis',
      title: 'Full Stack Software Engineer',
      email: 'morgan.davis@example.com',
      phone: '+1 555-0182',
      location: 'Austin, TX',
      linkedin: 'linkedin.com/in/morgandavis',
      github: 'github.com/morgandavis',
    },
    summary:
      'Full Stack Software Engineer with 4 years of experience building web applications and REST APIs using TypeScript, Node.js, React, and PostgreSQL.',
    skills: [
      { category: 'Languages', skills: ['TypeScript', 'JavaScript', 'Python', 'SQL'] },
      { category: 'Frameworks & Databases', skills: ['React', 'Node.js', 'Express', 'PostgreSQL', 'Docker', 'Redis'] },
    ],
    experience: [
      {
        title: 'Full Stack Engineer',
        company: 'Apex Digital Solutions',
        date: '2021 – Present',
        bullets: [
          'Worked on backend APIs using Node.js and PostgreSQL to handle customer transactions.',
          'Built web application user interface using React and TypeScript.',
          'Assisted with database query tuning to improve application performance.',
        ],
      },
    ],
    projects: [
      {
        title: 'Task Orchestration Service',
        date: '2023',
        bullets: [
          'Engineered a background job worker using Redis and Node.js for processing email batches.',
          'Deployed microservices using Docker containers.',
        ],
      },
    ],
    education: [
      {
        degree: 'Bachelor of Science in Computer Science',
        institution: 'University of Texas at Austin',
        year: '2020',
      },
    ],
  };

  const sampleJobDescription = `
    Job Title: Senior Backend Software Engineer
    Company: ScaleFlow Inc.
    Location: Remote / Austin, TX
    
    About the Role:
    We are seeking a Senior Backend Engineer to architect, build, and optimize high-throughput distributed systems.
    
    Key Responsibilities:
    - Architect and scale low-latency RESTful APIs and event-driven backend services using Node.js and TypeScript.
    - Optimize complex PostgreSQL database schemas, indexing strategies, and caching layers with Redis.
    - Implement containerized deployments using Docker and automated CI/CD workflows.
    - Mentor junior developers and drive engineering excellence through code reviews and architectural RFCs.
    
    Required Qualifications:
    - 3+ years experience with Node.js, TypeScript, and REST APIs.
    - Strong database design and query optimization skills with PostgreSQL.
    - Solid understanding of Docker containerization and Redis caching.
    - Proven track record of improving system reliability, latency, and throughput.
  `;

  let masterPdfBuffer: Buffer;
  let masterAtsScore: number;
  let masterSemanticScore: number;
  let parsedJd: any;

  it('1. Generates and parses master resume PDF', async () => {
    masterPdfBuffer = await generateResumePdf(originalStructuredData);
    assert.strictEqual(masterPdfBuffer.subarray(0, 4).toString('utf8'), '%PDF');

    const parsedDoc = await parsePdfBuffer(masterPdfBuffer);
    assert.strictEqual(parsedDoc.detectedAsScanned, false);
    assert.ok(parsedDoc.sections.experience);

    const profile = buildResumeProfile(parsedDoc);
    const readiness = scoreReadiness(parsedDoc, profile, 'mid');
    masterAtsScore = readiness.score;
    assert.ok(masterAtsScore > 50, `Master ATS score should be reasonable (got ${masterAtsScore})`);

    parsedJd = parseJd(sampleJobDescription);
    const deterministic = matchJd(profile, parsedJd);
    const dummyCoverage = (parsedJd.responsibilities || []).map((r: string) => ({
      responsibility: r,
      matchScore: 0.5,
      candidateEvidence: 'evidence',
    }));
    const rubric = scoreJdRubric(profile, parsedJd, deterministic, dummyCoverage);
    masterSemanticScore = rubric.score ?? 0;
  });

  it('2. Uploads master resume to Supabase Storage and records in DB', async () => {
    const storageRef = await uploadFile(userId, originalResumeId, masterPdfBuffer, 'master_resume.pdf');
    assert.strictEqual(storageRef.path, `${userId}/${originalResumeId}/master_resume.pdf`);

    // Insert user record
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name) 
       VALUES ($1, $2, 'hash', 'Morgan Davis') 
       ON CONFLICT (id) DO NOTHING`,
      [userId, `test_${Date.now()}@example.com`]
    );

    // Insert job into jobs table
    const contentHash = crypto.createHash('sha256').update(sampleJobDescription).digest('hex');
    await pool.query(
      `INSERT INTO jobs (id, source, external_id, title, company, description, content_hash) 
       VALUES ($1, 'custom', $2, 'Senior Backend Software Engineer', 'ScaleFlow Inc.', $3, $4) 
       ON CONFLICT (id) DO UPDATE SET description=$3, content_hash=$4`,
      [testJobId, String(testJobId), sampleJobDescription, contentHash]
    );

    // Insert master resume
    await pool.query(
      `INSERT INTO resumes (id, user_id, original_filename, storage_bucket, storage_object_path, sha256, file_size_bytes, page_count, parser_version, processing_status, is_latest)
       VALUES ($1, $2, 'master_resume.pdf', $3, $4, $5, $6, 1, $7, 'ready', true)
       ON CONFLICT (id) DO NOTHING`,
      [originalResumeId, userId, storageRef.bucket, storageRef.path, storageRef.sha256, masterPdfBuffer.length, PROFILE_VERSION]
    );
  });

  it('3. Generates tailor suggestions with zero user prompt and validates whitelist guardrail', async () => {
    const parsedDoc = await parsePdfBuffer(masterPdfBuffer);
    const profile = buildResumeProfile(parsedDoc);
    const whitelist = buildCandidateSkillWhitelist(parsedDoc.normalizedText, profile);

    const suggestions = await generateTailorSuggestions(
      { resumeText: parsedDoc.normalizedText, profile },
      {
        id: testJobId,
        title: 'Senior Backend Software Engineer',
        company: 'ScaleFlow Inc.',
        requiredSkills: parsedJd.requiredSkills,
        preferredSkills: parsedJd.preferredSkills,
        responsibilities: parsedJd.responsibilities,
      }
    );

    assert.ok(suggestions.length > 0, 'Should generate at least one suggestion');

    // Verify all suggestions adhere to candidate whitelist
    for (const sug of suggestions) {
      assert.ok(sug.suggestedText);
      assert.ok(sug.rationale);
      const guard = validateSuggestionGuardrail(sug.originalText, sug.suggestedText, whitelist);
      assert.strictEqual(
        guard.valid,
        true,
        `Suggestion "${sug.suggestedText}" introduced forbidden skills: ${guard.introducedUnpossessedSkills.join(', ')}`
      );
    }

    // Verify that an adversarial suggestion is strictly rejected
    const adversarialGuard = validateSuggestionGuardrail(
      'Worked on backend APIs using Node.js.',
      'Architected Kubernetes cluster and deployed microservices in Rust and Go.',
      whitelist
    );
    assert.strictEqual(adversarialGuard.valid, false, 'Adversarial suggestion must be rejected');
    assert.ok(adversarialGuard.introducedUnpossessedSkills.length > 0);
  });

  it('4. Applies approved edit, regenerates PDF, uploads to job-isolated storage path, and recalculates scores', async () => {
    // Approved high-impact edit aligning with JD without adding unpossessed skills
    const approvedEdit =
      'Architected high-throughput REST APIs using Node.js and PostgreSQL, decreasing query latency by 45% under peak traffic.';

    // Clone structured data and apply edit
    const tailoredStructuredData: StructuredResumeData = JSON.parse(JSON.stringify(originalStructuredData));
    tailoredStructuredData.experience![0].bullets![0] = approvedEdit;

    // Generate updated PDF
    const tailoredPdfBuffer = await generateResumePdf(tailoredStructuredData);
    assert.strictEqual(tailoredPdfBuffer.subarray(0, 4).toString('utf8'), '%PDF');

    // Parse updated PDF
    const tailoredParsedDoc = await parsePdfBuffer(tailoredPdfBuffer);
    const tailoredProfile = buildResumeProfile(tailoredParsedDoc);

    // Recalculate ATS score
    const newReadiness = scoreReadiness(tailoredParsedDoc, tailoredProfile, 'mid');
    const newAtsScore = newReadiness.score;

    // Recalculate Semantic / Job Fit score
    const newDeterministic = matchJd(tailoredProfile, parsedJd);
    const dummyCoverage = (parsedJd.responsibilities || []).map((r: string) => ({
      responsibility: r,
      matchScore: 0.85, // higher match due to stronger alignment
      candidateEvidence: approvedEdit,
    }));
    const newRubric = scoreJdRubric(tailoredProfile, parsedJd, newDeterministic, dummyCoverage);
    const newSemanticScore = newRubric.score ?? 0;

    assert.ok(newAtsScore >= masterAtsScore, `ATS score should improve or maintain (old: ${masterAtsScore}, new: ${newAtsScore})`);

    // Upload to Job-Isolated storage path: ${userId}/jobs/${testJobId}/${tailoredResumeId}/...
    const tailoredResumeId = crypto.randomUUID();
    const tailoredFilename = 'tailored_senior_backend_resume.pdf';
    const storageRef = await uploadFile(userId, tailoredResumeId, tailoredPdfBuffer, tailoredFilename, {
      jobId: testJobId,
    });

    assert.strictEqual(
      storageRef.path,
      `${userId}/jobs/${testJobId}/${tailoredResumeId}/${tailoredFilename}`,
      'Must match job-isolated Supabase storage path requirement'
    );

    // Save to PostgreSQL database
    await pool.query(
      `INSERT INTO resumes (
        id, user_id, original_filename, storage_bucket, storage_object_path,
        sha256, file_size_bytes, page_count, parser_version, processing_status,
        is_latest, job_id, parent_resume_id, tailored_content_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, 'ready', false, $9, $10, $11)`,
      [
        tailoredResumeId,
        userId,
        tailoredFilename,
        storageRef.bucket,
        storageRef.path,
        storageRef.sha256,
        tailoredPdfBuffer.length,
        PROFILE_VERSION,
        testJobId,
        originalResumeId,
        JSON.stringify(tailoredStructuredData),
      ]
    );

    // Verify row in database has job_id and parent_resume_id
    const dbCheck = await pool.query('SELECT * FROM resumes WHERE id=$1', [tailoredResumeId]);
    assert.strictEqual(dbCheck.rows.length, 1);
    assert.strictEqual(dbCheck.rows[0].job_id, testJobId);
    assert.strictEqual(dbCheck.rows[0].parent_resume_id, originalResumeId);
    assert.strictEqual(dbCheck.rows[0].storage_object_path, storageRef.path);

    // Download file from Supabase storage and verify integrity
    const downloadedBuf = await downloadFile(storageRef);
    const downloadedParsed = await parsePdfBuffer(downloadedBuf);
    assert.ok(
      downloadedParsed.normalizedText.replace(/\s+/g, ' ').includes('decreasing query latency by 45%') ||
      downloadedParsed.normalizedText.includes('REST APIs using Node.js and PostgreSQL')
    );
  });

  it('5. Clean up test database records', async () => {
    await pool.query('DELETE FROM analyses WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM resumes WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM jobs WHERE id=$1', [testJobId]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => {});
  });
});
