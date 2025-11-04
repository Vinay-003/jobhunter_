import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { analyzeResumeById, analyzeLatestResume } from '../controllers/analysisController.js';

const router = express.Router();

// Analyze a specific resume by ID
router.post('/analyze/:id', authenticateToken, analyzeResumeById);

// Analyze user's latest resume
router.post('/analyze', authenticateToken, analyzeLatestResume);

export default router;

