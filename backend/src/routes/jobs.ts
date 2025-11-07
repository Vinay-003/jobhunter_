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
    if (days_posted) filters.days_posted = parseInt(days_posted as string);

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
router.get('/jobs/recommendations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { location, keywords, days_posted, min_match_score } = req.query;

    // Get user's latest resume
    const resume = await resumeModel.getLatestResume(userId);

    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please upload a resume first.'
      });
    }

    // Check if resume has been analyzed
    if (!resume.analysis_data) {
      return res.status(400).json({
        success: false,
        message: 'Resume has not been analyzed yet. Please analyze your resume first at /api/analyze'
      });
    }

    // Check if analysis is outdated (old version with limited data extraction)
    // Old version indicators:
    // 1. extractedInfo.skills has less than 10 items (old: 3, new: 36+)
    // 2. Missing new fields like 'name', 'linkedin', 'github', 'projects', 'education'
    const hasLimitedSkills = resume.analysis_data.extractedInfo?.skills 
      && Array.isArray(resume.analysis_data.extractedInfo.skills) 
      && resume.analysis_data.extractedInfo.skills.length < 10;
    
    const missingNewFields = !resume.analysis_data.extractedInfo?.name 
      || !resume.analysis_data.extractedInfo?.projects
      || !resume.analysis_data.extractedInfo?.education;
    
    console.log('🔍 AUTO-REANALYSIS CHECK:', {
      hasLimitedSkills,
      skillsCount: resume.analysis_data.extractedInfo?.skills?.length || 0,
      hasName: !!resume.analysis_data.extractedInfo?.name,
      hasProjects: !!resume.analysis_data.extractedInfo?.projects,
      hasEducation: !!resume.analysis_data.extractedInfo?.education,
      missingNewFields,
      willReanalyze: hasLimitedSkills || missingNewFields
    });
    
    console.log('📊 FULL extractedInfo.skills ARRAY:', JSON.stringify(resume.analysis_data.extractedInfo?.skills || [], null, 2));
    console.log('📚 EDUCATION:', JSON.stringify(resume.analysis_data.extractedInfo?.education || 'none', null, 2));
    console.log('🚀 PROJECTS:', JSON.stringify(resume.analysis_data.extractedInfo?.projects || 'none', null, 2));
    
    const needsReanalysis = hasLimitedSkills || missingNewFields;

    if (needsReanalysis) {
      console.log('⚠️  Detected outdated analysis. Re-analyzing resume with enhanced parser...');
      console.log(`   - Limited skills: ${hasLimitedSkills} (${resume.analysis_data.extractedInfo?.skills?.length || 0} skills found)`);
      console.log(`   - Missing new fields: ${missingNewFields}`);
      
      const analysisService = (await import('../services/analysisService.js')).default;
      const freshAnalysis = await analysisService.analyzeResume(resume.file_path);
      
      if (freshAnalysis.success) {
        // Update the database with fresh analysis
        await resumeModel.updateResumeStatus(resume.id, 'processed', freshAnalysis);
        // Use fresh analysis for job matching
        resume.analysis_data = freshAnalysis;
        console.log('✅ Resume re-analyzed successfully!');
        console.log(`   - Skills extracted: ${(freshAnalysis as any).extractedInfo?.skills?.length || 0}`);
        console.log(`   - Projects found: ${(freshAnalysis as any).extractedInfo?.projects?.length || 0}`);
        console.log(`   - Education entries: ${(freshAnalysis as any).extractedInfo?.education?.length || 0}`);
      }
    }

    // Prepare filters
    const filters: any = {};
    if (location) filters.location = location as string;
    if (keywords) filters.keywords = keywords as string;
    if (days_posted) filters.days_posted = parseInt(days_posted as string);
    if (min_match_score) filters.min_match_score = parseFloat(min_match_score as string);

    console.log(`Generating recommendations for user ${userId} with filters:`, filters);
    console.log(`Resume analysis structure:`, {
      hasSkills: !!resume.analysis_data.skills,
      hasExtractedInfo: !!resume.analysis_data.extractedInfo,
      extractedInfoSkills: resume.analysis_data.extractedInfo?.skills || 'none',  // Show ALL skills, not just first 3
      extractedInfoSkillsCount: resume.analysis_data.extractedInfo?.skills?.length || 0,
      topLevelKeys: Object.keys(resume.analysis_data)
    });

    // Get recommendations from Jooble
    const recommendations = await joobleService.getRecommendedJobs(
      userId,
      resume.analysis_data,
      filters
    );

    if (!recommendations.success) {
      return res.status(400).json({
        success: false,
        message: recommendations.error || 'Failed to generate recommendations',
        atsScore: recommendations.atsScore || 0,
        totalJobs: 0,
        recommendedJobs: 0,
        recommendations: []
      });
    }

    // Store recommendations in database
    if (recommendations.recommendations && recommendations.recommendations.length > 0) {
      await jobRecommendationService.storeRecommendations(
        userId,
        resume.id,
        recommendations.recommendations
      );
    }

    res.status(200).json({
      success: true,
      atsScore: recommendations.atsScore,
      totalJobs: recommendations.totalJobs,
      recommendedJobs: recommendations.recommendedJobs,
      recommendations: recommendations.recommendations,
      apiCallsUsed: recommendations.apiCallsUsed,
      apiCallsRemaining: recommendations.apiCallsRemaining
    });
  } catch (error: any) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating recommendations: ' + (error.message || 'Unknown error')
    });
  }
});

/**
 * GET /api/jobs/recommendations/stored
 * Get stored recommendations for user from database
 */
router.get('/jobs/recommendations/stored', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;

    const recommendations = await jobRecommendationService.getUserRecommendations(
      userId,
      limit
    );

    res.status(200).json({
      success: true,
      count: recommendations.length,
      recommendations
    });
  } catch (error: any) {
    console.error('Error fetching stored recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching recommendations: ' + (error.message || 'Unknown error')
    });
  }
});

export default router;