import { Router } from 'express';
import auth from './auth.js';
import resumes from './resumes.js';
import analyses from './analyses.js';
import profile from './profile.js';
import recommendations from './recommendations.js';
import keepalive from '../keepalive.js';
import { probeStorage } from '../../modules/storage/supabaseStorage.js';

const router = Router();

router.use('/auth', auth);
router.use('/resumes', resumes);
router.use('/analyses', analyses);
router.use('/profile', profile);
router.use('/job-preferences', profile); // alias
router.use('/recommendation-runs', recommendations);
router.use('/recommendations', recommendations);
router.use('/keepalive', keepalive);

// ?deep=1 also probes Supabase Storage (Issue 1 fix 5): storage: ok | error <code> | not-configured
router.get('/health', async (req, res) => {
  const body: Record<string, unknown> = { success: true, status: 'ok', timestamp: new Date().toISOString(), version: 'v1' };
  if (String(req.query.deep ?? '') === '1') {
    body.storage = await probeStorage();
  }
  res.json(body);
});

export default router;
