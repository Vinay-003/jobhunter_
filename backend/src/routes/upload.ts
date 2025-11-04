import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ResumeModel } from '../models/Resume.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();
const resumeModel = new ResumeModel();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file storage
const storage = multer.diskStorage({
  destination: function (_req: Express.Request, _file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) {
    cb(null, uploadsDir);
  },
  filename: function (_req: Express.Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) {
    // Create unique filename with timestamp and original name
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (_req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
    // Accept only PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Upload resume endpoint with proper error handling
router.post('/upload-resume', authenticateToken, (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Use multer and handle errors
  upload.single('resume')(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size too large. Maximum size is 5MB.'
          });
        }
        return res.status(400).json({
          success: false,
          message: `Upload error: ${err.message}`
        });
      }
      // Other multer errors (like file type)
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    next();
  });
}, async (req: express.Request, res: express.Response) => {
  try {
    console.log('Upload request received');
    console.log('File:', req.file ? req.file.originalname : 'No file');
    console.log('User:', req.user?.id);

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded. Please select a PDF file.' 
      });
    }

    if (!req.user?.id) {
      // Clean up the uploaded file if there was an error
      if (req.file) {
        fs.unlink(req.file.path, (err) => {
          if (err) console.error('Error deleting file after auth failure:', err);
        });
      }
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    console.log('Storing resume in database...');
    // Store resume information in database
    const resume = await resumeModel.createResume(
      req.user.id,
      req.file.originalname,
      req.file.path
    );

    console.log('Resume stored successfully:', resume.id);

    res.status(200).json({
      success: true,
      message: 'Resume uploaded and processed successfully',
      resume: {
        id: resume.id,
        fileName: resume.file_name,
        uploadDate: resume.upload_date,
        status: resume.status
      }
    });
  } catch (error: any) {
    console.error('Upload error:', error);
    console.error('Error stack:', error.stack);
    
    // Clean up the uploaded file if there was an error
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file after failed upload:', err);
      });
    }

    // Provide more detailed error message
    const errorMessage = error.message || 'Error uploading file';
    const isDatabaseError = error.code === '23503' || error.code === '42P01' || error.message?.includes('relation') || error.message?.includes('does not exist');

    res.status(500).json({
      success: false,
      message: isDatabaseError 
        ? 'Database error: Please ensure all tables are created. Check database connection.'
        : errorMessage
    });
  }
});

// Get user's latest resume
router.get('/latest-resume', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const resume = await resumeModel.getLatestResume(req.user.id);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found'
      });
    }

    res.status(200).json({
      success: true,
      resume: {
        id: resume.id,
        fileName: resume.file_name,
        uploadDate: resume.upload_date,
        status: resume.status,
        analysisData: resume.analysis_data
      }
    });
  } catch (error) {
    console.error('Error fetching resume:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching resume'
    });
  }
});

// Get resume file endpoint
router.get('/resume/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    const resumeId = parseInt(req.params.id);
    if (isNaN(resumeId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid resume ID'
      });
    }

    const resume = await resumeModel.getResumeById(resumeId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Check if file exists
    if (!fs.existsSync(resume.file_path)) {
      return res.status(404).json({
        success: false,
        message: 'Resume file not found'
      });
    }

    // Send the file
    res.sendFile(resume.file_path);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
});

// Get latest resume content endpoint
router.get('/latest-resume-content', authenticateToken, async (req: express.Request, res: express.Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const resume = await resumeModel.getLatestResumeContent(req.user.id);
    if (!resume) {
      return res.status(404).json({
        success: false,
        message: 'No resume found'
      });
    }

    // Set appropriate headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${resume.fileName}"`);
    
    // Send the PDF content
    res.send(resume.content);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file'
    });
  }
});

export default router; 