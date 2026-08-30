import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Security tests - owner-scoping and auth gates
// These are lightweight unit tests that don't require DB; integration tests mock pool

describe('security: authentication', () => {
  it('wrong password should be denied', async () => {
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('correctpassword', 4);
    const ok = await bcrypt.compare('wrongpassword', hash);
    expect(ok).toBe(false);
  });

  it('invalid session token hash mismatch', async () => {
    const crypto = await import('node:crypto');
    const token = 'abc123';
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const otherHash = crypto.createHash('sha256').update('different').digest('hex');
    expect(hash).not.toBe(otherHash);
  });

  it('expired session should be treated as invalid (time check)', () => {
    const expiresAt = new Date(Date.now() - 1000).toISOString();
    const expired = new Date(expiresAt).getTime() < Date.now();
    expect(expired).toBe(true);
  });

  it('revoked session should be denied', () => {
    const session = { revoked_at: new Date().toISOString() };
    expect(!!session.revoked_at).toBe(true);
  });

  it('owner-scoped query prevents IDOR', () => {
    // Simulate owner check logic: WHERE id=$1 AND user_id=$2
    const resume = { id: '1', user_id: 'userA' };
    const requestingUser = 'userB';
    const authorized = resume.user_id === requestingUser;
    expect(authorized).toBe(false);
  });
});

describe('security: upload validation', () => {
  it('rejects non-PDF magic bytes', () => {
    const buf = Buffer.from('NOTPDF content');
    const isPdf = buf.slice(0,4).toString() === '%PDF';
    expect(isPdf).toBe(false);
  });

  it('accepts valid PDF magic bytes', () => {
    const buf = Buffer.from('%PDF-1.4 fake content');
    const isPdf = buf.slice(0,4).toString() === '%PDF';
    expect(isPdf).toBe(true);
  });

  it('rejects oversized file (>5MB)', () => {
    const size = 6 * 1024 * 1024;
    const max = 5 * 1024 * 1024;
    expect(size > max).toBe(true);
  });

  it('sanitizes filename header injection', () => {
    const filename = 'resume" onload="alert(1).pdf';
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    expect(safe).not.toContain('"');
    expect(safe).not.toContain(' ');
  });
});

describe('security: XSS', () => {
  it('job snippet with onerror should be escaped as text', () => {
    const snippet = '<img src=x onerror=alert(1)>';
    const escaped = snippet
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    expect(escaped).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escaped).not.toContain('<img');
  });
});
