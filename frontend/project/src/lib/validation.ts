// src/lib/validation.ts - zod schemas
import { z } from 'zod';

export const signupSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username too long')
    .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Only letters, numbers, _ - . allowed'),
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password too long'),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const atsUploadSchema = z.object({
  targetLevel: z.enum(['entry', 'mid', 'senior']),
  jobDescription: z.string().max(20000, 'JD too long').optional(),
  mode: z.enum(['resume', 'match']).optional(),
});

export type AtsUploadInput = z.infer<typeof atsUploadSchema>;

export const profileSchema = z.object({
  username: z.string().min(3).max(32).optional(),
  jobPreferences: z
    .object({
      keywords: z.string().max(200).optional(),
      location: z.string().max(100).optional(),
      min_match_score: z.number().min(0).max(100).optional(),
      days_posted: z.number().min(1).max(90).optional(),
    })
    .optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

// Helper to format zod errors
export function formatZodError(err: z.ZodError): string {
  return err.issues.map((i) => i.message).join(', ');
}
