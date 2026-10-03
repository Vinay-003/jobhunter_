import { describe, expect, test } from 'bun:test';
import express from 'express';
import rateLimit from 'express-rate-limit';
import request from 'supertest';

function appWithProxy(hops: number) {
  const app = express();
  app.set('trust proxy', hops);
  app.post('/login', rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false }), (_req, res) => {
    res.sendStatus(204);
  });
  return app;
}

describe('rate-limit proxy trust', () => {
  test('uses the single Render ingress hop, not a client-prepended chain', async () => {
    const app = appWithProxy(1);
    const trustedIngress = '203.0.113.10';

    for (let i = 0; i < 20; i += 1) {
      const response = await request(app)
        .post('/login')
        .set('X-Forwarded-For', `198.51.100.${i + 1}, ${trustedIngress}`);
      expect(response.status).toBe(204);
    }

    // Changing the untrusted, left-most value must not evade the same key.
    const spoofed = await request(app)
      .post('/login')
      .set('X-Forwarded-For', `192.0.2.99, ${trustedIngress}`);
    expect(spoofed.status).toBe(429);
  });

  test('does not trust forwarded addresses in development by default', async () => {
    const app = appWithProxy(0);
    const first = await request(app).post('/login').set('X-Forwarded-For', '198.51.100.1');
    const second = await request(app).post('/login').set('X-Forwarded-For', '198.51.100.2');
    expect(first.status).toBe(204);
    expect(second.status).toBe(204);
  });
});
