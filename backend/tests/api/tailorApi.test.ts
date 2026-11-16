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
import { generateResumePdf, type StructuredResumeData } from '../../src/modules/pdf/pdfGenerator.js';
import { uploadFile } from '../../src/modules/storage/supabaseStorage.js';
import { PROFILE_VERSION } from '../../src/modules/parsing/resumeProfile.js';

describe('Tailor API HTTP Endpoints', () => {
  const userId = crypto.randomUUID();
  const testJobId = crypto.randomUUID();
  const resumeId = crypto.randomUUID();
  let sessionToken: string;

  const sampleData: StructuredResumeData = {
    contactInfo: {
      name: 'Taylor Reed',
      title: 'Full Stack Engineer',
      email: 'taylor.reed@example.com',
      phone: '+1 555-0133',
      location: 'Denver, CO',
    },
    summary: 'Full Stack Engineer with 3 years building web apps using Node.js, Express, React, and PostgreSQL.',
    skills: ['TypeScript', 'JavaScript', 'Node.js', 'Express', 'React', 'PostgreSQL', 'Docker'],
    experience: [
      {
        title: 'Software Developer',
        company: 'Alpine Tech',
        date: '2022 – Present',
        bullets: [
          'Worked on backend APIs using Node.js and Express.',
          'Built responsive frontends with React.',
        ],
      },
    ],
    projects: [
      {
        title: 'Inventory Tracker',
        bullets: ['Deployed application using Docker containers.'],
      },
    ],
    education: [
      {
        degree: 'B.S. in Software Engineering',
        institution: 'University of Colorado',
        year: '2022',
      },
    ],
  };

  const sampleJobDescription = `
    Job Title: Backend Node.js Developer
    Company: Summit Software
    Responsibilities:
    - Architect and optimize backend APIs using Node.js, Express, and PostgreSQL.
    - Containerize application services using Docker.
    Requirements:
    - Experience with Node.js, Express, PostgreSQL, and Docker.
  `;

  it('1. Prepares test user, session, job, and master resume', async () => {
    // Insert user
    await pool.query(
      `INSERT INTO users (id, email, password_hash, display_name) 
       VALUES ($1, $2, 'hash', 'Taylor Reed') 
       ON CONFLICT (id) DO NOTHING`,
      [userId, `taylor_${Date.now()}@example.com`]
    );

    // Create session
    const sess = await createSession(userId);
    sessionToken = sess.token;

    // Insert job
    const contentHash = crypto.createHash('sha256').update(sampleJobDescription).digest('hex');
    await pool.query(
      `INSERT INTO jobs (id, source, external_id, title, company, description, content_hash) 
       VALUES ($1, 'custom', $2, 'Backend Node.js Developer', 'Summit Software', $3, $4) 
       ON CONFLICT (id) DO UPDATE SET description=$3, content_hash=$4`,
      [testJobId, String(testJobId), sampleJobDescription, contentHash]
    );

    // Generate & upload PDF
    const pdfBuf = await generateResumePdf(sampleData);
    const storageRef = await uploadFile(userId, resumeId, pdfBuf, 'taylor_resume.pdf');

    await pool.query(
      `INSERT INTO resumes (id, user_id, original_filename, storage_bucket, storage_object_path, sha256, file_size_bytes, page_count, parser_version, processing_status, is_latest)
       VALUES ($1, $2, 'taylor_resume.pdf', $3, $4, $5, $6, 1, $7, 'ready', true)
       ON CONFLICT (id) DO NOTHING`,
      [resumeId, userId, storageRef.bucket, storageRef.path, storageRef.sha256, pdfBuf.length, PROFILE_VERSION]
    );
  });

  it('2. POST /api/v1/resumes/:resumeId/tailor/:jobId/suggestions returns suggestions with zero user prompt', async () => {
    const res = await request(app)
      .post(`/api/v1/resumes/${resumeId}/tailor/${testJobId}/suggestions`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({});

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.jobId, testJobId);
    assert.strictEqual(res.body.resumeId, resumeId);
    assert.ok(Array.isArray(res.body.suggestions));
    assert.ok(res.body.suggestions.length > 0);

    const firstSug = res.body.suggestions[0];
    assert.ok(firstSug.id);
    assert.ok(firstSug.originalText);
    assert.ok(firstSug.suggestedText);
    assert.ok(firstSug.rationale);
    assert.strictEqual(firstSug.status, 'pending');
  });

  it('3. POST /api/v1/resumes/:resumeId/tailor/:jobId/apply-suggestion rejects unpossessed skills (guardrail)', async () => {
    const res = await request(app)
      .post(`/api/v1/resumes/${resumeId}/tailor/${testJobId}/apply-suggestion`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({
        suggestionId: 'sug-adversarial',
        originalText: 'Worked on backend APIs using Node.js and Express.',
        acceptedText: 'Built distributed Kubernetes services in Rust and Scala.',
        section: 'experience',
        bulletIndex: 0,
      });

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('integrity guardrail'));
  });

  it('4. POST /api/v1/resumes/:resumeId/tailor/:jobId/apply-suggestion successfully applies valid suggestion, updates PDF, uploads to isolated storage, and recalculates scores', async () => {
    const validEdit =
      'Architected high-throughput backend APIs using Node.js, Express, and PostgreSQL, reducing latency by 35%.';

    const res = await request(app)
      .post(`/api/v1/resumes/${resumeId}/tailor/${testJobId}/apply-suggestion`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({
        suggestionId: 'sug-1',
        originalText: 'Worked on backend APIs using Node.js and Express.',
        acceptedText: validEdit,
        section: 'experience',
        bulletIndex: 0,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.tailoredResumeId);

    // Verify storage path has job isolation
    assert.ok(res.body.storagePath.includes(`jobs/${testJobId}/`));

    // Verify scores and scoreDelta
    assert.ok(typeof res.body.previousScores.atsScore === 'number');
    assert.ok(typeof res.body.updatedScores.atsScore === 'number');
    assert.ok(typeof res.body.scoreDelta.atsDelta === 'number');
    assert.ok(typeof res.body.previousScores.semanticScore === 'number');
    assert.ok(typeof res.body.updatedScores.semanticScore === 'number');
    assert.ok(typeof res.body.scoreDelta.semanticDelta === 'number');

    // Verify pdfUrl & downloadUrl
    assert.ok(res.body.pdfUrl.includes('/file'));
    assert.ok(res.body.downloadUrl.includes('/download'));
  });

  it('5. GET /api/v1/resumes/:resumeId/tailor/:jobId returns the tailored resume', async () => {
    const res = await request(app)
      .get(`/api/v1/resumes/${resumeId}/tailor/${testJobId}`)
      .set('Authorization', `Bearer ${sessionToken}`);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.tailoredResume);
    assert.ok(res.body.tailoredResume.storagePath.includes(`jobs/${testJobId}/`));
  });

  it('6. Malformed non-UUID parameters return HTTP 400 Bad Request immediately', async () => {
    // Invalid resumeId
    const resBadResume = await request(app)
      .post(`/api/v1/resumes/not-a-valid-uuid/tailor/${testJobId}/suggestions`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({});
    assert.strictEqual(resBadResume.status, 400, 'Non-UUID resumeId must return 400 Bad Request');
    assert.strictEqual(resBadResume.body.success, false);

    // Invalid jobId
    const resBadJob = await request(app)
      .post(`/api/v1/resumes/${resumeId}/tailor/malformed-job-id-999/suggestions`)
      .set('Authorization', `Bearer ${sessionToken}`)
      .send({});
    assert.strictEqual(resBadJob.status, 400, 'Non-UUID jobId must return 400 Bad Request');
    assert.strictEqual(resBadJob.body.success, false);

    // Invalid parameters on /api/v1/tailor/:resumeId/:jobId route
    const resBadTailorRoute = await request(app)
      .get(`/api/v1/tailor/bad-uuid/${testJobId}`)
      .set('Authorization', `Bearer ${sessionToken}`);
    assert.strictEqual(resBadTailorRoute.status, 400, 'Non-UUID on tailor route must return 400 Bad Request');
    assert.strictEqual(resBadTailorRoute.body.success, false);
  });

  it('7. Cleans up test DB records', async () => {
    await pool.query('DELETE FROM analyses WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM resumes WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [userId]).catch(() => {});
    await pool.query('DELETE FROM jobs WHERE id=$1', [testJobId]).catch(() => {});
    await pool.query('DELETE FROM users WHERE id=$1', [userId]).catch(() => {});
  });
});
