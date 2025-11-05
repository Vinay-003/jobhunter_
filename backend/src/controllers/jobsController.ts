// src/controllers/jobsController.ts
import type { Request, Response } from 'express';
import jobRecommendationService from '../services/jobRecommendationService.js';
import { ResumeModel } from '../models/Resume.js';

const resumeModel = new ResumeModel();

/**
 * Scrape and store jobs
 */
export const scrapeJobs = async (req: Request, res: Response) => {
  try {
    const { searchQuery = 'software', location = '' } = req.body;

    console.log(`Scraping jobs: query="${searchQuery}", location="${location}"`);

    const jobs = await jobRecommendationService.scrapeJobs(searchQuery, location);

    if (jobs.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No jobs found'
      });
    }

    // Store jobs in database
    await jobRecommendationService.storeJobs(jobs);

    res.status(200).json({
      success: true,
      message: `Successfully scraped and stored ${jobs.length} jobs`,
      count: jobs.length
    });
  } catch (error: any) {
    console.error('Error scraping jobs:', error);
    res.status(500).json({
      success: false,
      message: 'Error scraping jobs: ' + (error.message || 'Unknown error')
    });
  }
};

/**
 * Get all jobs with optional filters
 */
export const getJobs = async (req: Request, res: Response) => {
  try {
    const { location, days_posted } = req.query;

    const filters: any = {};
    if (location) filters.location = location as string;
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
};

/**
 * Get job recommendations based on user's resume
 */
export const getRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const { location, days_posted, min_match_score } = req.query;

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
        message: 'Resume has not been analyzed yet. Please analyze your resume first.'
      });
    }

    // Prepare filters
    const filters: any = {};
    if (location) filters.location = location as string;
    if (days_posted) filters.days_posted = parseInt(days_posted as string);
    if (min_match_score) filters.min_match_score = parseFloat(min_match_score as string);

    console.log(`Generating recommendations for user ${userId} with filters:`, filters);

    // Generate recommendations
    const recommendations = await jobRecommendationService.generateRecommendations(
      userId,
      resume.analysis_data,
      filters
    );

    if (!recommendations.success) {
      return res.status(500).json({
        success: false,
        message: recommendations.error || 'Failed to generate recommendations'
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
      ...recommendations
    });
  } catch (error: any) {
    console.error('Error getting recommendations:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating recommendations: ' + (error.message || 'Unknown error')
    });
  }
};

/**
 * Get stored recommendations for user
 */
export const getStoredRecommendations = async (req: Request, res: Response) => {
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
};