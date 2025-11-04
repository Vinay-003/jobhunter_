import type { Request, Response } from 'express';
import analysisService from '../services/analysisService.js';
import { ResumeModel } from '../models/Resume.js';

const resumeModel = new ResumeModel();

/**
 * Analyze a specific resume by ID
 */
export const analyzeResumeById = async (req: Request, res: Response) => {
  try {
    const resumeId = parseInt(req.params.id);
    const userId = req.user?.id;

    if (isNaN(resumeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resume ID'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get resume from database
    const resume = await resumeModel.getResumeById(resumeId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Verify resume belongs to the user
    if (resume.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: This resume does not belong to you'
      });
    }

    // Check if file exists
    const fs = await import('fs');
    if (!fs.existsSync(resume.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'Resume file not found on server'
      });
    }

    console.log(`Analyzing resume ID ${resumeId} for user ${userId}`);

    // Perform analysis
    const analysisResult = await analysisService.analyzeResume(resume.file_path);

    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        message: analysisResult.error || 'Analysis failed'
      });
    }

    // Update resume with analysis results
    const updatedResume = await resumeModel.updateResumeStatus(
      resumeId,
      'processed',
      analysisResult
    );

    res.status(200).json({
      success: true,
      message: 'Resume analyzed successfully',
      analysis: analysisResult,
      resume: {
        id: updatedResume.id,
        fileName: updatedResume.file_name,
        status: updatedResume.status,
        analysisData: updatedResume.analysis_data
      }
    });
  } catch (error: any) {
    console.error('Error analyzing resume:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing resume: ' + (error.message || 'Unknown error')
    });
  }
};

/**
 * Analyze the user's latest resume
 */
export const analyzeLatestResume = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    // Get latest resume
    const resume = await resumeModel.getLatestResume(userId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please upload a resume first.'
      });
    }

    // Check if already analyzed
    if (resume.status === 'processed' && resume.analysis_data) {
      return res.status(200).json({
        success: true,
        message: 'Resume already analyzed',
        analysis: resume.analysis_data,
        resume: {
          id: resume.id,
          fileName: resume.file_name,
          status: resume.status
        }
      });
    }

    // Check if file exists
    const fs = await import('fs');
    if (!fs.existsSync(resume.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'Resume file not found on server'
      });
    }

    console.log(`Analyzing latest resume for user ${userId}`);

    // Perform analysis
    const analysisResult = await analysisService.analyzeResume(resume.file_path);

    if (!analysisResult.success) {
      return res.status(500).json({
        success: false,
        message: analysisResult.error || 'Analysis failed'
      });
    }

    // Update resume with analysis results
    const updatedResume = await resumeModel.updateResumeStatus(
      resume.id,
      'processed',
      analysisResult
    );

    res.status(200).json({
      success: true,
      message: 'Resume analyzed successfully',
      analysis: analysisResult,
      resume: {
        id: updatedResume.id,
        fileName: updatedResume.file_name,
        status: updatedResume.status,
        analysisData: updatedResume.analysis_data
      }
    });
  } catch (error: any) {
    console.error('Error analyzing latest resume:', error);
    res.status(500).json({
      success: false,
      message: 'Error analyzing resume: ' + (error.message || 'Unknown error')
    });
  }
};

