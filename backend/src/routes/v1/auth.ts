import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import * as Session from '../../modules/auth/session.js';
import { requireSession } from '../../middleware/requireSession.js';

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
    // V2: check email only (username not required); legacy: check OR username if column exists
    let exists;
    try {
      exists = await pool.query('SELECT id FROM users WHERE email=$1 OR username=$2 LIMIT 1', [normalizedEmail, userName]);
    } catch (e:any) {
      if (e.code === '42703') { // column username does not exist -> V2 schema
        exists = await pool.query('SELECT id FROM users WHERE email=$1 LIMIT 1', [normalizedEmail]);
      } else throw e;
    }
    if (exists.rows.length) return res.status(400).json({ success:false, message:'User already exists with this email or username'});
    const hash = await bcrypt.hash(password, 10);
    let row;
    // Try V2 schema first: (email, password_hash, display_name)
    try {
      const r = await pool.query('INSERT INTO users (email,password_hash,display_name) VALUES ($1,$2,$3) RETURNING id, email, display_name', [normalizedEmail, hash, displayName]);
      row = { ...r.rows[0], username: r.rows[0].display_name };
    } catch (e:any) {
      if (e.code !== '42703' && !e.message.includes('column')) throw e;
      // Fallback legacy: try username variants
      try {
        const r = await pool.query('INSERT INTO users (username,email,password_hash,display_name) VALUES ($1,$2,$3,$4) RETURNING id, username, email, display_name', [userName, normalizedEmail, hash, displayName]);
        row = r.rows[0];
      } catch (e2:any) {
        const r = await pool.query('INSERT INTO users (username,email,password_hash) VALUES ($1,$2,$3) RETURNING id, username, email', [userName, normalizedEmail, hash]);
        row = r.rows[0];
      }
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
    const { token } = await Session.createSession(String(user.id), req.headers['user-agent']);
    Session.setSessionCookie(res, token);
    res.json({ success:true, message:'Login successful', user:{ id:user.id, username:user.username ?? user.display_name, email:user.email, display_name: user.display_name }});
  } catch (e) {
    console.error('login error', e);
    res.status(500).json({ success:false, message:'Error during login'});
  }
});

router.post('/logout', requireSession, async (req, res, next)=>{
  try { await Session.logout(Session.extractToken(req)!); }
  catch (error) { return next(error); }
  Session.clearSessionCookie(res);
  res.json({ success:true, message:'Logged out'});
});

router.post('/logout-all', requireSession, async (req:any, res, next)=>{
  try {
    await Session.logoutAll(String(req.user.id));
    Session.clearSessionCookie(res);
    res.json({ success:true, message:'All sessions revoked'});
  } catch (error) { next(error); }
});

router.get('/session', requireSession, async (req:any, res, next)=>{
  try {
    const u = await pool.query('SELECT id, email, display_name FROM users WHERE id=$1', [req.user.id]);
    if (!u.rows.length) return res.status(401).json({ success:false, message:'Invalid session'});
    return res.json({ success:true, user: { ...u.rows[0], username: u.rows[0].display_name } });
  } catch (error) { next(error); }
});

export default router;
