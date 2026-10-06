import { describe, expect, test, mock } from 'bun:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import * as sessionModule from '../modules/auth/session.js';
import recommendationsRouter from '../routes/v1/recommendations.js';

describe('recommendation endpoints', () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/recommendation-runs', recommendationsRouter);

  test('POST /api/v1/recommendation-runs/roles rejects unauthenticated calls with 401', async () => {
    const res = await request(app)
      .post('/api/v1/recommendation-runs/roles')
      .send({ resumeId: '00000000-0000-4000-8000-000000000001' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  const validToken = 'a'.repeat(64);
  // Mock verifySession to return a valid session for validToken
  mock.module('../modules/auth/session.js', () => ({
    ...sessionModule,
    verifySession: async (token: string) => {
      if (token === validToken) {
        return {
          id: 'session-1',
          user_id: '00000000-0000-4000-8000-000000000001',
          token_hash: 'hash',
          expires_at: new Date(Date.now() + 86400000).toISOString(),
          revoked_at: null,
          last_used_at: null,
        };
      }
      return null;
    },
  }));

  test('POST /api/v1/recommendation-runs/roles rejects invalid resumeId with validation error', async () => {
    const res = await request(app)
      .post('/api/v1/recommendation-runs/roles')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ resumeId: 'not-a-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/v1/recommendation-runs rejects invalid payload schema', async () => {
    const res = await request(app)
      .post('/api/v1/recommendation-runs')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ resumeId: 'invalid-uuid' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('GET /api/v1/recommendation-runs/:id rejects invalid UUID format', async () => {
    const res = await request(app)
      .get('/api/v1/recommendation-runs/not-a-uuid')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid run ID');
  });

  test('GET /api/v1/recommendation-runs/:id/results rejects invalid pagination', async () => {
    const res = await request(app)
      .get('/api/v1/recommendation-runs/00000000-0000-4000-8000-000000000001/results?limit=-5')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/v1/recommendation-runs/:id/jobs/:jobId/availability rejects invalid IDs', async () => {
    const res = await request(app)
      .post('/api/v1/recommendation-runs/bad-run/jobs/bad-job/availability')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid identifier');
  });

  test('POST /api/v1/recommendation-runs/:id/jobs/:jobId/report-closed rejects invalid IDs', async () => {
    const res = await request(app)
      .post('/api/v1/recommendation-runs/bad-run/jobs/bad-job/report-closed')
      .set('Authorization', `Bearer ${validToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe('Invalid identifier');
  });
});
