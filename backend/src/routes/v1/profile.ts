import { Router } from 'express';
import { z } from 'zod';
import pool from '../../config/database.js';
import { validate } from '../../middleware/validate.js';
import { requireSession } from '../../middleware/requireSession.js';

const router = Router();
const preferenceSchema = z.object({
  targetRoles: z.array(z.string().trim().max(100)).max(20).optional(),
  seniority: z.array(z.string().trim().max(50)).max(10).optional(),
  locations: z.array(z.string().trim().max(100)).max(20).optional(),
  workModes: z.array(z.string().trim().max(50)).max(10).optional(),
  emphasizedSkills: z.array(z.string().trim().max(100)).max(30).optional(),
  excludedRoles: z.array(z.string().trim().max(100)).max(20).optional(),
  minSalary: z.number().nonnegative().nullable().optional(),
}).strict();
const serialize = (p: any) => p ? {
  targetRoles: p.target_roles ?? [], seniority: p.seniority ?? [], locations: p.locations ?? [],
  workModes: p.work_modes ?? [], emphasizedSkills: p.emphasized_skills ?? [],
  excludedRoles: p.excluded_roles ?? [], minSalary: p.min_salary === null ? null : Number(p.min_salary),
} : null;

router.get('/', requireSession, async (req:any, res, next) => {
  try {
    const [u, pr] = await Promise.all([
      pool.query('SELECT id, email, display_name, created_at FROM users WHERE id=$1', [req.user.id]),
      pool.query('SELECT * FROM user_job_preferences WHERE user_id=$1', [req.user.id]),
    ]);
    if (!u.rows.length) return res.status(404).json({ success:false, message:'User not found' });
    res.json({ success:true, user: { ...u.rows[0], username: u.rows[0].display_name }, preferences: serialize(pr.rows[0]) });
  } catch (error) { next(error); }
});

router.patch('/', requireSession, validate({ body: z.object({ display_name: z.string().trim().min(1).max(100) }).strict() }), async (req:any,res,next) => {
  try {
    const result = await pool.query('UPDATE users SET display_name=$1, updated_at=now() WHERE id=$2 RETURNING id, email, display_name', [req.body.display_name, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ success:false, message:'User not found' });
    res.json({ success:true, user: { ...result.rows[0], username: result.rows[0].display_name } });
  } catch (error) { next(error); }
});

router.get('/job-preferences', requireSession, async (req:any,res,next) => {
  try {
    const pr = await pool.query('SELECT * FROM user_job_preferences WHERE user_id=$1', [req.user.id]);
    res.json({ success:true, preferences: serialize(pr.rows[0]) });
  } catch (error) { next(error); }
});

router.put('/job-preferences', requireSession, validate({ body: preferenceSchema }), async (req:any,res,next) => {
  try {
    const p = req.body;
    const pr = await pool.query(`INSERT INTO user_job_preferences (user_id, target_roles, seniority, locations, work_modes, emphasized_skills, excluded_roles, min_salary, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
      ON CONFLICT (user_id) DO UPDATE SET target_roles=$2, seniority=$3, locations=$4, work_modes=$5, emphasized_skills=$6, excluded_roles=$7, min_salary=$8, updated_at=now() RETURNING *`,
      [req.user.id, p.targetRoles ?? [], p.seniority ?? [], p.locations ?? [], p.workModes ?? [], p.emphasizedSkills ?? [], p.excludedRoles ?? [], p.minSalary ?? null]);
    res.json({ success:true, preferences: serialize(pr.rows[0]) });
  } catch (error) { next(error); }
});

export default router;
