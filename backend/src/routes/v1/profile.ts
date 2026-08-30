import { Router } from 'express';
import { z } from 'zod';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import * as Session from '../../modules/auth/session.js';
import jwt from 'jsonwebtoken';

const router = Router();
function authenticateAny(req:any,res:any,next:any){
  const cookies = req.cookies || {};
  const cookieName = process.env.SESSION_COOKIE_NAME || 'jobhunter_session';
  let token = cookies[cookieName] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ success:false, message:'Authentication required'});
  Session.verifySession(token).then(sess=>{
    if (sess) { req.user={ id:sess.user_id }; return next(); }
    try { const secret=process.env.JWT_SECRET; if(!secret) throw new Error(); const d:any=jwt.verify(token, secret); req.user={id:String(d.id)}; return next(); } catch { return res.status(401).json({ success:false, message:'Invalid session'}); }
  }).catch(()=> res.status(401).json({ success:false, message:'Invalid session'}));
}

router.get('/', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  try {
    const u = await pool.query('SELECT id, username, email, display_name, created_at FROM users WHERE id=$1', [userId]);
    if (!u.rows.length) return res.status(404).json({ success:false, message:'User not found'});
    let prefs=null;
    try {
      const pr = await pool.query('SELECT * FROM user_job_preferences WHERE user_id=$1', [userId]);
      prefs = pr.rows[0] || null;
    } catch{}
    res.json({ success:true, user: u.rows[0], preferences: prefs });
  } catch(e:any){ res.status(500).json({ success:false, message:e.message}); }
});

const patchSchema = z.object({
  display_name: z.string().min(1).max(100).optional(),
  preferences: z.object({
    targetRoles: z.array(z.string()).optional(),
    seniority: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    workModes: z.array(z.string()).optional(),
    emphasizedSkills: z.array(z.string()).optional(),
    excludedRoles: z.array(z.string()).optional(),
    minSalary: z.number().optional(),
  }).optional()
});

router.patch('/', authenticateAny, validate({ body: patchSchema }), async (req:any,res)=>{
  const userId = String(req.user.id);
  const { display_name, preferences } = req.body;
  try {
    if (display_name) {
      await pool.query('UPDATE users SET display_name=$1, updated_at=now() WHERE id=$1', [display_name, userId]).catch(async()=>{
        await pool.query('UPDATE users SET username=$1 WHERE id=$2', [display_name, userId]);
      });
    }
    if (preferences) {
      try {
        await pool.query(`INSERT INTO user_job_preferences (user_id, target_roles, seniority, locations, work_modes, emphasized_skills, excluded_roles, min_salary, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
          ON CONFLICT (user_id) DO UPDATE SET target_roles=$2, seniority=$3, locations=$4, work_modes=$5, emphasized_skills=$6, excluded_roles=$7, min_salary=$8, updated_at=now()`,
          [userId, preferences.targetRoles||[], preferences.seniority||[], preferences.locations||[], preferences.workModes||[], preferences.emphasizedSkills||[], preferences.excludedRoles||[], preferences.minSalary||null]);
      } catch{}
    }
    res.json({ success:true, message:'Profile updated'});
  } catch(e:any){ res.status(500).json({ success:false, message:e.message}); }
});

router.put('/job-preferences', authenticateAny, validate({ body: z.object({
  targetRoles: z.array(z.string()).optional(),
  seniority: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  workModes: z.array(z.string()).optional(),
  emphasizedSkills: z.array(z.string()).optional(),
  excludedRoles: z.array(z.string()).optional(),
  minSalary: z.number().optional(),
}) }), async (req:any,res)=>{
  const userId = String(req.user.id);
  const p = req.body;
  try {
    await pool.query(`INSERT INTO user_job_preferences (user_id, target_roles, seniority, locations, work_modes, emphasized_skills, excluded_roles, min_salary, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT (user_id) DO UPDATE SET target_roles=$2, seniority=$3, locations=$4, work_modes=$5, emphasized_skills=$6, excluded_roles=$7, min_salary=$8, updated_at=now()`,
      [userId, p.targetRoles||[], p.seniority||[], p.locations||[], p.workModes||[], p.emphasizedSkills||[], p.excludedRoles||[], p.minSalary||null]);
    res.json({ success:true, message:'Preferences saved'});
  } catch(e:any){ res.status(500).json({ success:false, message:e.message}); }
});

router.get('/job-preferences', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  try {
    const pr = await pool.query('SELECT * FROM user_job_preferences WHERE user_id=$1', [userId]);
    res.json({ success:true, preferences: pr.rows[0]||null });
  } catch(e:any){ res.json({ success:true, preferences:null}); }
});

export default router;
