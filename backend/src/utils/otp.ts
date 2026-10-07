import crypto from 'node:crypto';
import pool from '../config/database.js';
import { sendEmail } from './sendEmail.js';

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds

export async function issueOtp(
  emailInput: string,
  purpose: 'verification' | 'login' | 'reset_password' = 'verification'
): Promise<string> {
  const email = emailInput.trim().toLowerCase();

  // Rate-limiting check: last sent within 60s
  const { rows: existing } = await pool.query<{ last_sent: string }>(
    `SELECT last_sent FROM otps WHERE email = $1 AND purpose = $2 ORDER BY last_sent DESC LIMIT 1`,
    [email, purpose]
  );

  if (existing[0] && Date.now() - new Date(existing[0].last_sent).getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new Error('OTP_RATE_LIMIT');
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const subject = purpose === 'login'
    ? 'JobHunter sign-in verification code'
    : 'Your JobHunter verification code';
  const message = `Your JobHunter verification code is: ${code}\n\nThis code will expire in 5 minutes. If you did not request this, please ignore this email.`;

  // Send email FIRST. Only persist OTP if email sending was accepted.
  await sendEmail(email, subject, message);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Invalidate existing active OTPs for this email and purpose
    await client.query(
      `UPDATE otps SET expiry = now() WHERE email = $1 AND purpose = $2 AND expiry > now()`,
      [email, purpose]
    );

    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await client.query(
      `INSERT INTO otps (email, value, purpose, last_sent, expiry)
       VALUES ($1, $2, $3, now(), $4)`,
      [email, code, purpose, expiresAt.toISOString()]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return code;
}

export async function consumeOtp(
  emailInput: string,
  codeInput: unknown,
  purpose?: 'verification' | 'login' | 'reset_password'
): Promise<boolean> {
  const email = emailInput.trim().toLowerCase();
  const code = typeof codeInput === 'string' ? codeInput.trim() : '';

  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const query = purpose
      ? `SELECT id, value, expiry FROM otps WHERE email = $1 AND purpose = $2 AND expiry > now() ORDER BY last_sent DESC LIMIT 1`
      : `SELECT id, value, expiry FROM otps WHERE email = $1 AND expiry > now() ORDER BY last_sent DESC LIMIT 1`;
    const params = purpose ? [email, purpose] : [email];

    const { rows } = await client.query<{ id: string; value: string; expiry: string }>(query, params);
    const record = rows[0];

    if (!record) {
      await client.query('COMMIT');
      return false;
    }

    const storedBuf = Buffer.from(record.value);
    const inputBuf = Buffer.from(code);
    const matches = storedBuf.length === inputBuf.length && crypto.timingSafeEqual(storedBuf, inputBuf);

    if (!matches) {
      await client.query('COMMIT');
      return false;
    }

    // Delete or expire the consumed OTP
    await client.query(`DELETE FROM otps WHERE id = $1`, [record.id]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
