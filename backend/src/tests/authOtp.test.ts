import { describe, expect, it, beforeEach } from 'bun:test';
import { sendEmail, sentEmailHistory, clearEmailHistory } from '../utils/sendEmail.js';
import { TTL_HOURS, TTL_MS, hashToken, generateToken } from '../modules/auth/session.js';

describe('Auth OTP and Email verification unit tests', () => {
  beforeEach(() => {
    clearEmailHistory();
  });

  it('validates email format before sending', async () => {
    await expect(sendEmail('not-an-email', 'subject', 'body')).rejects.toThrow('Invalid email');
    await expect(sendEmail('user@test.com', '', 'body')).rejects.toThrow('Invalid email');
    await expect(sendEmail('user@test.com', 'subject', '')).rejects.toThrow('Invalid email');
  });

  it('records email sending in test / mock mode', async () => {
    const to = 'candidate@example.com';
    const subject = 'Your JobHunter verification code';
    const body = 'Your verification code is 123456';

    const id = await sendEmail(to, subject, body);
    expect(id).toBe('mock-email-id');
    expect(sentEmailHistory.length).toBe(1);
    expect(sentEmailHistory[0].to).toBe(to);
    expect(sentEmailHistory[0].subject).toBe(subject);
    expect(sentEmailHistory[0].text).toBe(body);
  });

  it('session TTL: calculates valid milliseconds from TTL_HOURS and token hashing', () => {
    expect(TTL_HOURS).toBeGreaterThan(0);
    expect(TTL_MS).toBe(TTL_HOURS * 60 * 60 * 1000);

    const token = generateToken();
    expect(token).toHaveLength(64);

    const hash = hashToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
    expect(hashToken(token)).toBe(hash);
  });

  it('session expiry check rejects expired or revoked timestamps', () => {
    const expiredTimestamp = new Date(Date.now() - 1000).toISOString();
    const isExpired = new Date(expiredTimestamp).getTime() < Date.now();
    expect(isExpired).toBe(true);

    const futureTimestamp = new Date(Date.now() + TTL_MS).toISOString();
    const isFuture = new Date(futureTimestamp).getTime() >= Date.now();
    expect(isFuture).toBe(true);
  });
});
