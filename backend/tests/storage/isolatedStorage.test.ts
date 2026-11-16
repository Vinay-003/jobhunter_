import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import path from 'node:path';
import { uploadFile, downloadFile, uploadJobTailoredFile } from '../../src/modules/storage/supabaseStorage.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

describe('Job-Isolated Supabase Storage', () => {
  const userId = crypto.randomUUID();
  const jobIdA = crypto.randomUUID();
  const jobIdB = crypto.randomUUID();
  const resumeId1 = crypto.randomUUID();
  const resumeId2 = crypto.randomUUID();

  const dummyPdfA = Buffer.from('%PDF-1.4 Mock PDF Content for Job A - ' + Date.now());
  const dummyPdfB = Buffer.from('%PDF-1.4 Mock PDF Content for Job B - ' + Date.now());

  it('uploads job-tailored resume to isolated path under userId/jobs/jobId/...', async () => {
    const refA = await uploadFile(userId, resumeId1, dummyPdfA, 'resume_job_a.pdf', { jobId: jobIdA });
    assert.strictEqual(refA.path, `${userId}/jobs/${jobIdA}/${resumeId1}/resume_job_a.pdf`);
    assert.ok(refA.bucket);

    const refB = await uploadJobTailoredFile(userId, jobIdB, resumeId2, dummyPdfB, 'resume_job_b.pdf');
    assert.strictEqual(refB.path, `${userId}/jobs/${jobIdB}/${resumeId2}/resume_job_b.pdf`);

    // Verify isolation: path for Job A cannot collide with Job B
    assert.notStrictEqual(refA.path, refB.path);
    assert.ok(refA.path.includes(`/jobs/${jobIdA}/`));
    assert.ok(refB.path.includes(`/jobs/${jobIdB}/`));
  });

  it('downloads stored file and verifies content roundtrip integrity', async () => {
    const ref = await uploadJobTailoredFile(userId, jobIdA, resumeId1, dummyPdfA, 'tailored.pdf');
    const downloaded = await downloadFile(ref);

    assert.ok(Buffer.isBuffer(downloaded));
    const downloadedSha = crypto.createHash('sha256').update(downloaded).digest('hex');
    assert.strictEqual(downloadedSha, ref.sha256);
    assert.strictEqual(downloaded.toString('utf8'), dummyPdfA.toString('utf8'));
  });

  it('standard resume uploads without jobId preserve legacy path convention', async () => {
    const legacyResumeId = crypto.randomUUID();
    const refLegacy = await uploadFile(userId, legacyResumeId, dummyPdfA, 'master_resume.pdf');
    assert.strictEqual(refLegacy.path, `${userId}/${legacyResumeId}/master_resume.pdf`);
  });
});
