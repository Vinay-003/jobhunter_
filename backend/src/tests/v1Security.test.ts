import { describe, expect, test } from 'bun:test';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { csrfProtection, issueCsrfToken } from '../middleware/csrf.js';
import { requireSession } from '../middleware/requireSession.js';

describe('V1 cookie CSRF', () => {
  const app = express();
  app.use(cookieParser(), csrfProtection);
  app.get('/token', issueCsrfToken);
  app.post('/write', (_req, res) => res.json({ success: true }));

  test('requires token and rejects a mismatched token for cookie mutations', async () => {
    const token = await request(app).get('/token');
    const cookie = token.headers['set-cookie'];
    expect((await request(app).post('/write').set('Cookie', cookie)).status).toBe(403);
    expect((await request(app).post('/write').set('Cookie', cookie).set('X-CSRF-Token', 'wrong')).status).toBe(403);
    expect((await request(app).post('/write').set('Cookie', cookie).set('X-CSRF-Token', token.body.csrfToken)).status).toBe(200);
  });

  test('rejects foreign origins even with a correct token', async () => {
    const token = await request(app).get('/token');
    expect((await request(app).post('/write').set('Cookie', token.headers['set-cookie']).set('X-CSRF-Token', token.body.csrfToken).set('Origin', 'https://evil.invalid')).status).toBe(403);
  });
});

describe('opaque-only V1 authorization', () => {
  const app = express();
  app.get('/private', requireSession, (_req, res) => res.json({ success: true }));
  test('rejects JWT-formatted bearer without querying for a session', async () => {
    expect((await request(app).get('/private').set('Authorization', 'Bearer header.payload.signature')).status).toBe(401);
  });
});
