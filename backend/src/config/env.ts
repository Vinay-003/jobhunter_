import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),
  PG_DATABASE_STRING: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  SUPABASE_DB_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  FRONTEND_URL: z.string().optional(),
  SESSION_COOKIE_NAME: z.string().default('jobhunter_session'),
  SESSION_TTL_DAYS: z.coerce.number().default(7),
  JOOBLE_API_KEY: z.string().optional(),
  JOOBLE_MAX_QUERIES_PER_REFRESH: z.coerce.number().default(4),
  JOOBLE_CALL_BUDGET: z.coerce.number().default(450),
  SUPABASE_URL: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_RESUME_BUCKET: z.string().default('resumes'),
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SAGEMAKER_ENDPOINT_NAME: z.string().optional(),
  EMBEDDING_MODEL_ID: z.string().default('anass1209/resume-job-matcher-all-MiniLM-L6-v2'),
  EMBEDDING_PROVIDER: z.enum(['mock','local','aws','auto']).default('auto'),
  LOCAL_EMBEDDING_MODEL: z.string().optional(),
  PYTHON_SERVICE_URL: z.string().optional(),
}).superRefine((data, ctx) => {
  if (!data.PG_DATABASE_STRING && !data.DATABASE_URL && !data.SUPABASE_DB_URL) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'One of PG_DATABASE_STRING, DATABASE_URL, SUPABASE_DB_URL required', path: ['PG_DATABASE_STRING'] });
  }
  if (data.NODE_ENV === 'production') {
    if (!data.JOOBLE_API_KEY) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'JOOBLE_API_KEY required in production', path: ['JOOBLE_API_KEY'] });
    if (!process.env.JWT_SECRET) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'JWT_SECRET required in production', path: ['JWT_SECRET'] });
  }
});

let parsed: z.infer<typeof envSchema>;
try {
  parsed = envSchema.parse(process.env);
} catch (e: any) {
  console.error('❌ Environment validation failed:');
  if (e.errors) console.error(JSON.stringify(e.errors, null, 2));
  else console.error(e.message);
  if (process.env.NODE_ENV === 'production') process.exit(1);
  else {
    console.warn('⚠️  Continuing with invalid env in development - fix before production');
    parsed = envSchema.parse({ ...process.env, JWT_SECRET: process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me-32+chars-xxx', PG_DATABASE_STRING: process.env.PG_DATABASE_STRING || 'postgresql://postgres:postgres@localhost:5432/postgres' } as any);
  }
}

export const env = parsed!;
export function getDatabaseUrl() {
  return env.PG_DATABASE_STRING || env.DATABASE_URL || env.SUPABASE_DB_URL!;
}
export function getCorsOrigins(): string[] | undefined {
  const raw = env.CORS_ALLOWED_ORIGINS || env.FRONTEND_URL;
  if (!raw) return undefined;
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}
