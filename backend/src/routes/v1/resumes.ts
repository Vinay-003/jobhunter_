import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import pool from '../../config/database.js';
import * as Session from '../../modules/auth/session.js';
import jwt from 'jsonwebtoken';
import parsePdfBuffer from '../../modules/parsing/pdfParser.js';
import { buildResumeProfile } from '../../modules/parsing/resumeProfile.js';
import { uploadFile, deleteFile, downloadFile } from '../../modules/storage/supabaseStorage.js';

const router = Router();

function authenticateAny(req:any,res:any,next:any){
  // try session first then JWT
  const cookies = req.cookies || {};
  const cookieName = process.env.SESSION_COOKIE_NAME || 'jobhunter_session';
  let token = cookies[cookieName] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) return res.status(401).json({ success:false, message:'Authentication required'});
  // try session
  Session.verifySession(token).then(sess=>{
    if (sess) {
      req.user = { id: sess.user_id };
      return next();
    }
    // fallback JWT
    try {
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('no secret');
      const decoded:any = jwt.verify(token, secret);
      req.user = { id: String(decoded.id) };
      return next();
    } catch {
      return res.status(401).json({ success:false, message:'Invalid session'});
    }
  }).catch(()=> res.status(401).json({ success:false, message:'Invalid session'}));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5*1024*1024 },
  fileFilter: (_req, file, cb)=>{
    if (file.mimetype==='application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) cb(null,true);
    else cb(new Error('Only PDF files are allowed'));
  }
});

router.post('/', authenticateAny, upload.single('resume'), async (req:any,res)=>{
  try {
    if (!req.file) return res.status(400).json({ success:false, message:'No file uploaded'});
    const buf:Buffer = req.file.buffer;
    if (buf.slice(0,4).toString()!=='%PDF') return res.status(400).json({ success:false, message:'Invalid PDF file (magic bytes mismatch)'});
    const userId = String(req.user.id);
    const resumeId = crypto.randomUUID();
    const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
    const targetLevel = req.body?.targetLevel;
    // parse for page count and validation
    let pageCount=1;
    let parserVersion='2.0.0';
    try {
      const parsed = await parsePdfBuffer(buf);
      pageCount = parsed.pages.length || 1;
      if (parsed.detectedAsScanned) {
      }
    } catch(e){ }

    const storage = await uploadFile(userId, resumeId, buf, req.file.originalname);

    // DB insert - handle is_latest via transaction: clear old latest BEFORE insert to avoid unique violation
    let row;
    const originalFilename = req.file.originalname;
    const client = await pool.connect();
    try {
      try {
        await client.query('BEGIN');
        await client.query('UPDATE resumes SET is_latest=false WHERE user_id=$1 AND is_latest=true', [userId]);
        const r = await client.query(
          `INSERT INTO resumes (id, user_id, original_filename, storage_bucket, storage_object_path, sha256, file_size_bytes, page_count, parser_version, processing_status, is_latest)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
           RETURNING *`,
          [resumeId, userId, originalFilename, storage.bucket, storage.path, sha256, buf.length, pageCount, parserVersion, 'uploaded']
        );
        row = r.rows[0];
        await client.query('COMMIT');
      } catch(e:any) {
        await client.query('ROLLBACK');
        // fallback legacy: file_name/file_path (for old DB)
        if (e.code === '42703' || e.message?.includes('original_filename')) {
          await client.query('BEGIN');
          await client.query('UPDATE resumes SET is_latest=false WHERE user_id=$1', [userId]);
          const r2 = await client.query('INSERT INTO resumes (user_id, file_name, file_path, is_latest, status) VALUES ($1,$2,$3,true,$4) RETURNING *', [userId, originalFilename, storage.path, 'uploaded']);
          row = r2.rows[0];
          await client.query('COMMIT');
        } else {
          // is_latest race - retry by clearing and inserting again
          if (e.code === '23505' && e.constraint?.includes('one_latest')) {
            await client.query('BEGIN');
            await client.query('UPDATE resumes SET is_latest=false WHERE user_id=$1 AND is_latest=true', [userId]);
            const r = await client.query(
              `INSERT INTO resumes (id, user_id, original_filename, storage_bucket, storage_object_path, sha256, file_size_bytes, page_count, parser_version, processing_status, is_latest)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)
               RETURNING *`,
              [resumeId, userId, originalFilename, storage.bucket, storage.path, sha256, buf.length, pageCount, parserVersion, 'uploaded']
            );
            row = r.rows[0];
            await client.query('COMMIT');
          } else {
            throw e;
          }
        }
      }
    } finally {
      client.release();
    }

    try {
      const parsed = await parsePdfBuffer(buf);
      const profile = buildResumeProfile(parsed);
      await pool.query('INSERT INTO resume_profiles (resume_id, profile_json, profile_version) VALUES ($1,$2,$3) ON CONFLICT (resume_id) DO UPDATE SET profile_json=$2, profile_version=$3, updated_at=now()', [row.id, JSON.stringify(profile), '2.0.0']).catch(()=>{});
    } catch{}

    res.json({ success:true, resume:{ id: row.id, fileName: row.original_filename || row.file_name, uploadDate: row.created_at || row.upload_date, status: row.processing_status || row.status, sha256, pageCount }});
  } catch(e:any){
    console.error('upload error', e);
    res.status(500).json({ success:false, message: e.message || 'Upload failed'});
  }
});

router.get('/', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  try {
    let rows;
    try {
      const r = await pool.query('SELECT id, original_filename as file_name, storage_object_path, sha256, file_size_bytes, page_count, processing_status as status, created_at as upload_date, is_latest FROM resumes WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
      rows = r.rows;
    } catch {
      const r = await pool.query('SELECT * FROM resumes WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
      rows = r.rows;
    }
    res.json({ success:true, resumes: rows.map((r:any)=>({ id:r.id, fileName:r.file_name, uploadDate:r.upload_date, status:r.status, pageCount:r.page_count, sha256:r.sha256, isLatest:r.is_latest }))});
  } catch(e:any){ res.status(500).json({ success:false, message:e.message}); }
});

router.get('/:id', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const id = req.params.id;
  try {
    let row;
    try {
      const r = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [id, userId]);
      row = r.rows[0];
    } catch {
      const r = await pool.query('SELECT * FROM resumes WHERE id=$1', [id]);
      if (r.rows[0]?.user_id != userId) return res.status(404).json({ success:false, message:'Resume not found'});
      row = r.rows[0];
    }
    if (!row) return res.status(404).json({ success:false, message:'Resume not found'});
    res.json({ success:true, resume:{ id:row.id, fileName: row.original_filename||row.file_name, uploadDate: row.created_at||row.upload_date, status: row.processing_status||row.status, sha256:row.sha256, pageCount:row.page_count }});
  } catch(e:any){ res.status(500).json({ success:false, message:e.message}); }
});

router.delete('/:id', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const id = req.params.id;
  try {
    let row;
    const r = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [id, userId]);
    row = r.rows[0];
    if (!row) {
      // fallback old schema check
      const r2 = await pool.query('SELECT * FROM resumes WHERE id=$1', [id]);
      if (r2.rows[0] && String(r2.rows[0].user_id)!==userId) return res.status(403).json({ success:false, message:'Forbidden'});
      if (!r2.rows[0]) return res.status(404).json({ success:false, message:'Resume not found'});
      row = r2.rows[0];
    }
    const storagePath = row.storage_object_path || row.file_path;
    const bucket = row.storage_bucket || 'resumes';
    // delete storage
    try { await deleteFile({bucket, path: storagePath, sha256: ""}); } catch{}
    // delete related rows
    await pool.query('DELETE FROM resume_embeddings WHERE resume_id=$1', [id]).catch(()=>{});
    await pool.query('DELETE FROM resume_profiles WHERE resume_id=$1', [id]).catch(()=>{});
    await pool.query('DELETE FROM analyses WHERE resume_id=$1', [id]).catch(()=>{});
    await pool.query('DELETE FROM recommendations WHERE run_id IN (SELECT id FROM recommendation_runs WHERE resume_id=$1)', [id]).catch(()=>{});
    await pool.query('DELETE FROM recommendation_runs WHERE resume_id=$1', [id]).catch(()=>{});
    await pool.query('DELETE FROM job_recommendations WHERE resume_id=$1', [id]).catch(()=>{});
    await pool.query('DELETE FROM resumes WHERE id=$1 AND user_id=$2', [id, userId]);
    res.json({ success:true, message:'Resume deleted'});
  } catch(e:any){ console.error(e); res.status(500).json({ success:false, message:e.message}); }
});

router.get('/:id/download', authenticateAny, async (req:any,res)=>{
  const userId = String(req.user.id);
  const id = req.params.id;
  try {
    const r = await pool.query('SELECT * FROM resumes WHERE id=$1 AND user_id=$2', [id, userId]);
    let row = r.rows[0];
    if (!row) {
      const r2 = await pool.query('SELECT * FROM resumes WHERE id=$1', [id]);
      if (r2.rows[0] && String(r2.rows[0].user_id)!==userId) return res.status(403).json({ success:false, message:'Forbidden'});
      row = r2.rows[0];
    }
    if (!row) return res.status(404).json({ success:false, message:'Resume not found'});
    const bucket = row.storage_bucket || 'resumes';
    const path = row.storage_object_path || row.file_path;
    try {
      const data = await downloadFile({bucket, path, sha256: ""});
      const safe = String(row.original_filename||row.file_name).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
      res.setHeader('Content-Type','application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${safe}"`);
      return res.send(data);
    } catch(e:any){
      return res.status(404).json({ success:false, message:'File not found in storage'});
    }
  } catch(e:any){ res.status(500).json({ success:false, message:e.message}); }
});

export default router;
