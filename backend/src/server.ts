// src/server.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import analysisRoutes from './routes/analysis.js';
import jobRoutes from './routes/jobs.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create required directories
const uploadsDir = path.join(process.cwd(), 'uploads');
const tempDir = path.join(uploadsDir, 'temp');

[uploadsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`Created directory: ${dir}`);
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes);
app.use('/api', analysisRoutes);
app.use('/api', jobRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  console.log('Health check endpoint hit');
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Resume ATS & Job Recommendation System API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      resumes: '/api',
      analysis: '/api/analyze',
      jobs: '/api/jobs'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path
  });
});

// Error handling middleware (must be after all routes)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  console.error('Error stack:', err.stack);
  
  // Don't send response if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  res.status(err.status || 500).json({ 
    success: false,
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(50));
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: ${process.env.DATABASE_URL ? 'Connected' : 'Not configured'}`);
  console.log('='.repeat(50));
  console.log('\nAvailable endpoints:');
  console.log('  GET  /health - Health check');
  console.log('  POST /api/auth/signup - Create account');
  console.log('  POST /api/auth/login - Login');
  console.log('  POST /api/upload-resume - Upload resume');
  console.log('  POST /api/analyze - Analyze resume');
  console.log('  POST /api/jobs/scrape - Scrape jobs');
  console.log('  GET  /api/jobs - Get all jobs');
  console.log('  GET  /api/jobs/recommendations - Get recommendations');
  console.log('='.repeat(50));
});

export default app;