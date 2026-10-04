// backend/src/routes/jobs.ts
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import joobleService from '../services/joobleService.js';
import jobRecommendationService from '../services/jobRecommendationService.js';
import { ResumeModel } from '../models/Resume.js';

const router = express.Router();
const resumeModel = new ResumeModel();

/**
 * POST /api/jobs/search
 * Search jobs from Jooble API
 */
router.post('/jobs/search', authenticateToken, async (req, res) => {
  try {
    const { keywords = 'software developer', location = '', page = '1' } = req.body;

    console.log(`Searching jobs: keywords="${keywords}", location="${location}"`);

    const result = await joobleService.searchJobs({
      keywords,
      location,
      page
    });

    res.status(200).json({
      success: true,
      totalCount: result.totalCount,
      jobsCount: result.jobs.length,
      jobs: result.jobs,
      apiCallsUsed: joobleService['apiCallCount'],
      apiCallsRemaining: 500 - joobleService['apiCallCount']
    });
  } catch (error: any) {
    console.error('Error searching jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching jobs: ' + (error.message || 'Unknown error')
    });
  }
});

/**
 * GET /api/jobs
 * Get all jobs from database with optional filters
 */
router.get('/jobs', authenticateToken, async (req, res) => {
  try {
    const { location, keywords, days_posted } = req.query;

    const filters: any = {};
    if (location) filters.location = location as string;
    if (keywords) filters.keywords = keywords as string;
    if (days_posted) {
      const days = Number(days_posted);
      if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(400).json({success:false,message:'Invalid days_posted'});
      filters.days_posted = days;
    }

    const jobs = await jobRecommendationService.getJobs(filters);

    res.status(200).json({
      success: true,
      count: jobs.length,
      jobs
    });
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching jobs: ' + (error.message || 'Unknown error')
    });
  }
});

/**
 * POST /api/jobs/refresh
 * Manually refresh jobs from Jooble API
 */
router.post('/jobs/refresh', authenticateToken, async (req, res) => {
  try {
    const { keywords = 'software developer', location = '' } = req.body;

    await joobleService.refreshJobs(keywords, location);

    res.status(200).json({
      success: true,
      message: `Successfully refreshed jobs for "${keywords}" in "${location}"`
    });
  } catch (error: any) {
    console.error('Error refreshing jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error refreshing jobs: ' + (error.message || 'Unknown error')
    });
  }
});

/**
 * GET /api/jobs/recommendations
 * Get job recommendations based on user's resume analysis
 */
router.get('/jobs/recommendations', authenticateToken, (_req, res) => {
  // Legacy JWT/analysis scoring is deliberately retired: it cannot share the
  // revocable v1 session boundary or persisted recommendation snapshots.
  return res.status(410).json({
    success: false,
    code: 'RECOMMENDATIONS_MOVED',
    message: 'Recommendations moved to /api/v1/recommendations. Sign in with a v1 session and create a persisted run.',
    migrationPath: '/api/v1/recommendations',
    recommendations: [],
  });
});

/**
 * GET /api/jobs/recommendations/stored
 * Get stored recommendations for user from database
 */
router.get('/jobs/recommendations/stored', authenticateToken, async (req, res) => {
  return res.status(410).json({success:false,code:'RECOMMENDATIONS_MOVED',migrationPath:'/api/v1/recommendations',message:'Read persisted recommendations via /api/v1/recommendations/:id/results',recommendations:[]});
});

export default router;
