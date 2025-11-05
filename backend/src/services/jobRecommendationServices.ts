// src/services/jobRecommendationService.ts
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pool from '../config/database.js';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface JobFilters {
  location?: string;
  days_posted?: number;
  min_match_score?: number;
}

interface RecommendationResult {
  success: boolean;
  ats_score?: number;
  candidate_priority?: string;
  total_jobs?: number;
  recommended_jobs?: number;
  recommendations?: any[];
  error?: string;
}

export class JobRecommendationService {
  private pythonScriptsPath: string;

  constructor() {
    if (__dirname.includes('dist')) {
      this.pythonScriptsPath = path.join(__dirname, '..', '..', 'python');
    } else {
      this.pythonScriptsPath = path.join(__dirname, '..', '..', 'python');
    }

    if (!fs.existsSync(this.pythonScriptsPath)) {
      this.pythonScriptsPath = path.join(process.cwd(), 'python');
    }
  }

  /**
   * Scrape jobs from various sources
   */
  async scrapeJobs(searchQuery: string = 'software', location: string = ''): Promise<any[]> {
    try {
      const scraperScript = path.join(this.pythonScriptsPath, 'job_scraper.py');
      
      const { stdout, stderr } = await execAsync(
        `python "${scraperScript}" "${searchQuery}" "${location}"`,
        {
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf8'
        }
      );

      if (stderr && !stdout) {
        console.error('Job scraping error:', stderr);
        return [];
      }

      const result = JSON.parse(stdout.trim());
      return result.success ? result.jobs : [];
    } catch (error: any) {
      console.error('Error scraping jobs:', error);
      return [];
    }
  }

  /**
   * Store jobs in database
   */
  async storeJobs(jobs: any[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const job of jobs) {
        await client.query(
          `INSERT INTO jobs (title, company, location, description, url, posted_date, 
           salary, tags, source, experience_required, job_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT DO NOTHING`,
          [
            job.title,
            job.company,
            job.location || 'Remote',
            job.description,
            job.url,
            job.posted_date,
            job.salary,
            job.tags || [],
            job.source,
            job.experience_required || 'Mid Level',
            job.job_type || 'Full-time'
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get jobs from database with filters
   */
  async getJobs(filters?: JobFilters): Promise<any[]> {
    let query = 'SELECT * FROM jobs WHERE is_active = true';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.location) {
      query += ` AND (LOWER(location) LIKE $${paramIndex} OR LOWER(location) = 'remote')`;
      params.push(`%${filters.location.toLowerCase()}%`);
      paramIndex++;
    }

    if (filters?.days_posted) {
      query += ` AND posted_date >= NOW() - INTERVAL '${filters.days_posted} days'`;
    }

    query += ' ORDER BY posted_date DESC LIMIT 100';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Generate job recommendations based on resume analysis
   */
  async generateRecommendations(
    userId: number,
    resumeAnalysis: any,
    filters?: JobFilters
  ): Promise<RecommendationResult> {
    try {
      // Get jobs from database
      const jobs = await this.getJobs(filters);

      if (jobs.length === 0) {
        return {
          success: false,
          error: 'No jobs available'
        };
      }

      // Write temporary files for Python script
      const tempDir = path.join(process.cwd(), 'uploads', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const analysisFile = path.join(tempDir, `analysis_${userId}_${Date.now()}.json`);
      const jobsFile = path.join(tempDir, `jobs_${userId}_${Date.now()}.json`);
      const filtersFile = path.join(tempDir, `filters_${userId}_${Date.now()}.json`);

      fs.writeFileSync(analysisFile, JSON.stringify(resumeAnalysis));
      fs.writeFileSync(jobsFile, JSON.stringify(jobs));
      if (filters) {
        fs.writeFileSync(filtersFile, JSON.stringify(filters));
      }

      try {
        // Run recommendation script
        const recommenderScript = path.join(this.pythonScriptsPath, 'job_recommender.py');
        const command = filters
          ? `python "${recommenderScript}" "${analysisFile}" "${jobsFile}" "${filtersFile}"`
          : `python "${recommenderScript}" "${analysisFile}" "${jobsFile}"`;

        const { stdout, stderr } = await execAsync(command, {
          maxBuffer: 10 * 1024 * 1024,
          encoding: 'utf8'
        });

        // Clean up temp files
        [analysisFile, jobsFile, filtersFile].forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });

        if (stderr && !stdout) {
          throw new Error(`Recommendation failed: ${stderr}`);
        }

        const result = JSON.parse(stdout.trim());
        return result;
      } catch (error) {
        // Clean up temp files on error
        [analysisFile, jobsFile, filtersFile].forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
        throw error;
      }
    } catch (error: any) {
      console.error('Error generating recommendations:', error);
      return {
        success: false,
        error: error.message || 'Failed to generate recommendations'
      };
    }
  }

  /**
   * Store recommendations in database
   */
  async storeRecommendations(
    userId: number,
    resumeId: number,
    recommendations: any[]
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear old recommendations for this user and resume
      await client.query(
        'DELETE FROM job_recommendations WHERE user_id = $1 AND resume_id = $2',
        [userId, resumeId]
      );

      // Insert new recommendations
      for (const rec of recommendations) {
        await client.query(
          `INSERT INTO job_recommendations 
           (user_id, resume_id, job_id, match_score, recommendation_reasons)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, resume_id, job_id) DO UPDATE
           SET match_score = $4, recommendation_reasons = $5`,
          [
            userId,
            resumeId,
            rec.id,
            rec.match_score,
            JSON.stringify(rec.recommendation_reasons || [])
          ]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get stored recommendations for a user
   */
  async getUserRecommendations(userId: number, limit: number = 20): Promise<any[]> {
    const result = await pool.query(
      `SELECT r.*, j.title, j.company, j.location, j.description, j.url, 
              j.posted_date, j.salary, j.tags, j.experience_required, j.job_type
       FROM job_recommendations r
       JOIN jobs j ON r.job_id = j.id
       WHERE r.user_id = $1 AND j.is_active = true
       ORDER BY r.match_score DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }
}

export default new JobRecommendationService();