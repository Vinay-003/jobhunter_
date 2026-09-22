import { Router } from 'express';
import auth from './auth.js';
import resumes from './resumes.js';
import analyses from './analyses.js';
import profile from './profile.js';
import recommendations from './recommendations.js';
import keepalive from '../keepalive.js';

const router = Router();

router.use('/auth', auth);
router.use('/resumes', resumes);
router.use('/analyses', analyses);
router.use('/profile', profile);
router.use('/job-preferences', profile); // alias
router.use('/recommendation-runs', recommendations);
router.use('/recommendations', recommendations);
router.use('/keepalive', keepalive);

router.get('/health', (req,res)=> res.json({ success:true, status:'ok', timestamp: new Date().toISOString(), version:'v1' }));

export default router;
