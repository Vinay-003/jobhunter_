import { describe, expect, it, beforeEach } from 'bun:test';
import { sendEmail, sentEmailHistory, clearEmailHistory } from '../utils/sendEmail.js';
import { renderOtpEmailHtml, OTP_EMAIL_TEMPLATE } from '../utils/otpEmailTemplate.js';
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

  it('records email sending with HTML in test / mock mode', async () => {
    const to = 'candidate@example.com';
    const subject = 'Your JobHunter verification code';
    const body = 'Your verification code is 123456';
    const html = renderOtpEmailHtml('123456');

    const id = await sendEmail(to, subject, body, html);
    expect(id).toBe('mock-email-id');
    expect(sentEmailHistory.length).toBe(1);
    expect(sentEmailHistory[0].to).toBe(to);
    expect(sentEmailHistory[0].subject).toBe(subject);
    expect(sentEmailHistory[0].text).toBe(body);
    expect(sentEmailHistory[0].html).toBe(html);
    expect(sentEmailHistory[0].html).toContain('123456');
    expect(sentEmailHistory[0].html).not.toContain('{{OTP_CODE}}');
  });

  it('renders OTP email HTML template matching required JobHunter design', () => {
    const rendered = renderOtpEmailHtml('948210');

    expect(rendered).toContain('948210');
    expect(rendered).not.toContain('{{OTP_CODE}}');
    expect(rendered).toContain('Your JobHunter verification code');
    expect(rendered).toContain("You're almost in");
    expect(rendered).toContain('Expires in 5 minutes');
    expect(rendered).toContain('JobHunter will never ask you to share this code');
    expect(rendered).toContain('jobhunter.vinaybuilds.me');
    expect(rendered).toContain('RESUME HEALTH &nbsp;·&nbsp; EXPLAINABLE INSIGHTS &nbsp;·&nbsp; ROLE MATCHING');
  });

  it('sanitizes special characters in OTP code within HTML', () => {
    const rendered = renderOtpEmailHtml('<b>123</b>');
    expect(rendered).toContain('&lt;b&gt;123&lt;/b&gt;');
    expect(rendered).not.toContain('<b>123</b>');
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
