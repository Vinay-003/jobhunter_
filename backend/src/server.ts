// src/server.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import uploadRoutes from './routes/upload.js';
import analysisRoutes from './routes/analysis.js';
import jobRoutes from './routes/jobs.js';
import keepaliveRoutes from './routes/keepalive.js';
import v1Router from './routes/v1/index.js';
import fs from 'fs';
import path from 'path';
import './config/env.js';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3001;

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || '').split(',').map(s=>s.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);
const uploadLimiter = rateLimit({ windowMs: 60*1000, max: 10, standardHeaders: true, legacyHeaders: false });

// Create required directories (ephemeral, for temp processing only - primary storage is Supabase)
const uploadsDir = path.join(process.cwd(), 'uploads');
const tempDir = path.join(uploadsDir, 'temp');

[uploadsDir, tempDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Keepalive — public, no auth, touches DB to prevent Supabase pause after 7 days
// Mount BEFORE other routers so it is always reachable from cron (any path)
app.use('/keepalive', keepaliveRoutes);
app.use('/api/keepalive', keepaliveRoutes);

// Routes - legacy (keep for backward compat, will be deprecated)
app.use('/api/auth', authRoutes);
app.use('/api', uploadRoutes);
app.use('/api', analysisRoutes);
app.use('/api', jobRoutes);

// V1 API (spec-compliant) — also exposes /api/v1/keepalive via v1Router
app.use('/api/v1', v1Router);

// Health check endpoint - keep log quiet (Render hits every 5s)
app.get('/health', (req, res) => {
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
  console.log(`🧠 Embedding provider: ${process.env.EMBEDDING_PROVIDER || 'auto'} (model=${process.env.LOCAL_EMBEDDING_MODEL || process.env.EMBEDDING_MODEL_ID || 'anass1209/resume-job-matcher-all-MiniLM-L6-v2'})`);
  if (process.env.AWS_SAGEMAKER_ENDPOINT_NAME) console.log(`☁️  SageMaker endpoint: ${process.env.AWS_SAGEMAKER_ENDPOINT_NAME} (${process.env.AWS_REGION})`);
  else console.log('☁️  SageMaker: not configured — no AWS calls will be made');
  console.log('='.repeat(50));
  // Warm up local model in background so the first user request doesn't pay the
  // ~60-90s cold SentenceTransformer load (frontend jd-match timeout is 180s).
  if ((process.env.EMBEDDING_PROVIDER || 'auto').toLowerCase() === 'local') {
    console.log('[embeddings] warming up local model in background...');
    import('./providers/embeddings/LocalEmbeddingProvider.js').then(async ({ LocalEmbeddingProvider }) => {
      try {
        const t0 = Date.now();
        const p = new LocalEmbeddingProvider({});
        const r = await p.embed({ texts: ['warmup'], purpose: 'jd' });
        console.log(`[embeddings] local warmup done model=${r.modelId} dim=${r.dimension} ms=${Date.now() - t0}`);
      } catch (e: any) {
        console.warn('[embeddings] local warmup failed, will load on first request:', e?.message || e);
      }
    }).catch((e: any) => console.warn('[embeddings] warmup import failed:', e?.message || e));
  }
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