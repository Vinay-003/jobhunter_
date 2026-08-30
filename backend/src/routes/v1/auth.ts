import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import * as Session from '../../modules/auth/session.js';

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

router.post('/signup', validate({ body: signupSchema }), async (req, res) => {
  const { username, display_name, email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  const displayName = (display_name || username || '').trim();
  const userName = (username || displayName).trim();
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email=$1 OR username=$2 LIMIT 1', [normalizedEmail, userName]);
    if (exists.rows.length) return res.status(400).json({ success:false, message:'User already exists with this email or username'});
    const hash = await bcrypt.hash(password, 10);
    // handle uuid vs serial id: use gen_random_uuid if users.id is uuid, else serial auto
    let row;
    try {
      const r = await pool.query('INSERT INTO users (username,email,password_hash,display_name) VALUES ($1,$2,$3,$4) RETURNING id, username, email, display_name', [userName, normalizedEmail, hash, displayName]);
      row = r.rows[0];
    } catch (e:any) {
      // fallback if display_name column missing or type mismatch
      const r = await pool.query('INSERT INTO users (username,email,password_hash) VALUES ($1,$2,$3) RETURNING id, username, email', [userName, normalizedEmail, hash]);
      row = r.rows[0];
    }
    res.status(201).json({ success:true, message:'User created', user: row });
  } catch (e:any) {
    console.error('signup error', e);
    // unique violation
    if (e.code==='23505') return res.status(400).json({ success:false, message:'User already exists'});
    res.status(500).json({ success:false, message:'Error creating user'});
  }
});

router.post('/login', validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email).trim().toLowerCase();
  try {
    const r = await pool.query('SELECT * FROM users WHERE email=$1', [normalizedEmail]);
    if (!r.rows.length) return res.status(401).json({ success:false, message:'Invalid credentials'});
    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ success:false, message:'Invalid credentials'});
    await pool.query('UPDATE users SET last_login=CURRENT_TIMESTAMP WHERE id=$1', [user.id]).catch(()=>{});
    // create opaque session
    let token:string|null=null;
    try {
      const s = await Session.createSession(String(user.id), req.headers['user-agent'] as string);
      token = s.token;
      Session.setSessionCookie(res, token);
    } catch (e) {
      console.warn('session create failed, falling back to JWT', e);
    }
    // also issue JWT for compatibility
    const jwtSecret = process.env.JWT_SECRET;
    let jwtToken:string|undefined;
    if (jwtSecret) {
      jwtToken = jwt.sign({ id:user.id, email:user.email }, jwtSecret, { expiresIn:'7d' });
    }
    res.json({ success:true, message:'Login successful', token: jwtToken, sessionToken: token, user:{ id:user.id, username:user.username, email:user.email }});
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ success:false, message:'Error during login'});
  }
});

router.post('/logout', async (req, res)=>{
  // try session logout via cookie or bearer
  const cookies = (req as any).cookies || {};
  const cookieName = process.env.SESSION_COOKIE_NAME || 'jobhunter_session';
  let token = cookies[cookieName];
  if (!token) {
    const hdr = req.headers.authorization;
    if (hdr && hdr.startsWith('Bearer ')) token = hdr.slice(7);
  }
  if (token) await Session.logout(token).catch(()=>{});
  Session.clearSessionCookie(res);
  res.json({ success:true, message:'Logged out'});
});

router.post('/logout-all', Session.authenticateSession, async (req:any, res)=>{
  await Session.logoutAll(String(req.user.id));
  Session.clearSessionCookie(res);
  res.json({ success:true, message:'All sessions revoked'});
});

router.get('/session', async (req, res)=>{
  const cookies = (req as any).cookies || {};
  const cookieName = process.env.SESSION_COOKIE_NAME || 'jobhunter_session';
  let token = cookies[cookieName];
  if (!token) {
    const hdr = req.headers.authorization;
    if (hdr && hdr.startsWith('Bearer ')) token = hdr.slice(7);
  }
  if (!token) return res.status(401).json({ success:false, message:'Not authenticated'});
  // try opaque session first
  const sess = await Session.verifySession(token).catch(()=>null);
  if (sess) {
    const u = await pool.query('SELECT id, username, email, display_name FROM users WHERE id=$1', [sess.user_id]);
    return res.json({ success:true, user: u.rows[0] });
  }
  // fallback JWT
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('no secret');
    const decoded:any = jwt.verify(token, secret);
    const u = await pool.query('SELECT id, username, email, display_name FROM users WHERE id=$1', [decoded.id]);
    if (!u.rows.length) return res.status(401).json({ success:false, message:'Invalid session'});
    return res.json({ success:true, user: u.rows[0] });
  } catch {
    return res.status(401).json({ success:false, message:'Invalid session'});
  }
});

export default router;
