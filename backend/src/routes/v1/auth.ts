import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import * as Session from '../../modules/auth/session.js';
import { requireSession } from '../../middleware/requireSession.js';
import { issueOtp, consumeOtp } from '../../utils/otp.js';

const router = Router();

const signupSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  display_name: z.string().min(1).max(100).optional(),
  email: z.string().email(),
  password: z.string().min(8).max(128),
}).refine(d => d.username || d.display_name, { message: 'username or display_name required' });

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'Must be a 6-digit code'),
  purpose: z.enum(['verification', 'login']).optional(),
});

const resendOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['verification', 'login']).optional(),
});

router.post('/signup', validate({ body: signupSchema }), async (req, res) => {
  const { username, display_name, email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  const displayName = (display_name || username || '').trim();
  const userName = (username || displayName).trim();
  try {
    let exists;
    try {
      exists = await pool.query('SELECT id, verified FROM users WHERE email=$1 OR username=$2 LIMIT 1', [normalizedEmail, userName]);
    } catch (e: any) {
      if (e.code === '42703') { // column username does not exist -> V2 schema
        exists = await pool.query('SELECT id, verified FROM users WHERE email=$1 LIMIT 1', [normalizedEmail]);
      } else throw e;
    }

    if (exists.rows.length) {
      const existingUser = exists.rows[0];
      if (existingUser.verified) {
        return res.status(400).json({ success: false, message: 'User already exists with this email or username' });
      }
      // If user exists but is unverified, update credentials and re-issue OTP
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        'UPDATE users SET password_hash = $1, display_name = $2, verified = false WHERE id = $3',
        [hash, displayName, existingUser.id]
      );
      try {
        await issueOtp(normalizedEmail, 'verification');
      } catch (err: any) {
        if (err.message === 'OTP_RATE_LIMIT') {
          return res.status(429).json({ success: false, message: 'Verification code already sent. Please wait 60 seconds before requesting a new code.' });
        }
        console.error('Error sending OTP during signup re-attempt:', err);
        return res.status(503).json({ success: false, message: 'Unable to send verification email. Please check email configuration.' });
      }

      return res.status(200).json({
        success: true,
        requiresVerification: true,
        email: normalizedEmail,
        message: 'Verification code sent to your email',
      });
    }

    const hash = await bcrypt.hash(password, 10);
    let row;
    try {
      const r = await pool.query(
        'INSERT INTO users (email, password_hash, display_name, verified) VALUES ($1, $2, $3, false) RETURNING id, email, display_name, verified',
        [normalizedEmail, hash, displayName]
      );
      row = { ...r.rows[0], username: r.rows[0].display_name };
    } catch (e: any) {
      if (e.code !== '42703' && !e.message?.includes('column')) throw e;
      try {
        const r = await pool.query(
          'INSERT INTO users (username, email, password_hash, display_name, verified) VALUES ($1, $2, $3, $4, false) RETURNING id, username, email, display_name, verified',
          [userName, normalizedEmail, hash, displayName]
        );
        row = r.rows[0];
      } catch (e2: any) {
        const r = await pool.query(
          'INSERT INTO users (username, email, password_hash, display_name) VALUES ($1, $2, $3, $4) RETURNING id, username, email, display_name',
          [userName, normalizedEmail, hash, displayName]
        );
        row = r.rows[0];
      }
    }

    try {
      await issueOtp(normalizedEmail, 'verification');
    } catch (err: any) {
      if (err.message === 'OTP_RATE_LIMIT') {
        return res.status(429).json({ success: false, message: 'Please wait 60 seconds before requesting a new code' });
      }
      console.error('Error sending OTP during signup:', err);
      return res.status(503).json({ success: false, message: 'Unable to send verification email. Please check email configuration.' });
    }

    res.status(201).json({
      success: true,
      requiresVerification: true,
      email: normalizedEmail,
      message: 'Account created. Verification code sent to your email.',
      user: row,
    });
  } catch (e: any) {
    console.error('signup error', e);
    if (e.code === '23505') return res.status(400).json({ success: false, message: 'User already exists' });
    res.status(500).json({ success: false, message: 'Error creating user' });
  }
});

router.post('/login', validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [normalizedEmail]);
    if (!r.rows.length) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });

    // Direct login session creation - credentials verified via password
    await pool.query('UPDATE users SET last_login=CURRENT_TIMESTAMP, verified=true WHERE id=$1', [user.id]).catch(() => {});
    const { token } = await Session.createSession(String(user.id), req.headers['user-agent']);
    Session.setSessionCookie(res, token);
    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        username: user.username ?? user.display_name,
        email: user.email,
        display_name: user.display_name,
        verified: true,
      },
    });
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ success: false, message: 'Error during login' });
  }
});

router.post('/verify-otp', validate({ body: verifyOtpSchema }), async (req, res) => {
  const { email, otp, purpose } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const verified = await consumeOtp(normalizedEmail, otp, purpose);
    if (!verified) {
      return res.status(400).json({ success: false, message: 'Invalid or expired verification code' });
    }

    // Mark user verified
    await pool.query('UPDATE users SET verified = true WHERE email = $1', [normalizedEmail]);

    const r = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
    if (!r.rows.length) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    const user = r.rows[0];

    await pool.query('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=$1', [user.id]).catch(() => {});
    const { token } = await Session.createSession(String(user.id), req.headers['user-agent']);
    Session.setSessionCookie(res, token);

    return res.json({
      success: true,
      message: 'Verification successful',
      user: {
        id: user.id,
        username: user.username ?? user.display_name,
        email: user.email,
        display_name: user.display_name,
        verified: true,
      },
    });
  } catch (e) {
    console.error('verify-otp error', e);
    return res.status(500).json({ success: false, message: 'Error verifying code' });
  }
});

router.post('/resend-otp', validate({ body: resendOtpSchema }), async (req, res) => {
  const { email, purpose } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const r = await pool.query('SELECT id, verified FROM users WHERE email = $1', [normalizedEmail]);
    if (!r.rows.length) {
      return res.json({ success: true, message: 'If eligible, a verification code was sent to your email' });
    }

    const defaultPurpose = r.rows[0].verified ? 'login' : 'verification';
    await issueOtp(normalizedEmail, purpose || defaultPurpose);
    return res.json({ success: true, message: 'Verification code sent to your email' });
  } catch (err: any) {
    if (err.message === 'OTP_RATE_LIMIT') {
      return res.status(429).json({ success: false, message: 'Please wait 60 seconds before requesting a new code' });
    }
    console.error('resend-otp error:', err);
    return res.status(503).json({ success: false, message: 'Unable to send verification code. Please try again later.' });
  }
});

router.post('/logout', requireSession, async (req, res, next) => {
  try { await Session.logout(Session.extractToken(req)!); }
  catch (error) { return next(error); }
  Session.clearSessionCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

router.post('/logout-all', requireSession, async (req: any, res, next) => {
  try {
    await Session.logoutAll(String(req.user.id));
    Session.clearSessionCookie(res);
    res.json({ success: true, message: 'All sessions revoked' });
  } catch (error) { next(error); }
});

router.get('/session', requireSession, async (req: any, res, next) => {
  try {
    const u = await pool.query('SELECT id, email, display_name, verified FROM users WHERE id=$1', [req.user.id]);
    if (!u.rows.length) return res.status(401).json({ success: false, message: 'Invalid session' });
    return res.json({
      success: true,
      user: {
        ...u.rows[0],
        username: u.rows[0].display_name,
        verified: u.rows[0].verified ?? true,
      },
    });
  } catch (error) { next(error); }
});

export default router;
