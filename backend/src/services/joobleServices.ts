// src/services/joobleService.ts
import axios from 'axios';
import pool from '../config/database.js';

const JOOBLE_API_URL = 'https://jooble.org/api/';
const JOOBLE_API_KEY = 'b5c200c7-8bb9-4908-be33-9ac162971afe';

interface JoobleSearchParams {
  keywords: string;
  location?: string;
  radius?: string;
  salary?: string;
  page?: string;
}

interface JoobleJob {
  title: string;
  location: string;
  snippet: string;
  salary: string;
  source: string;
  type: string;
  link: string;
  updated: string;
  company: string;
  id: string;
}

interface JoobleResponse {
  totalCount: number;
  jobs: JoobleJob[];
}

export class JoobleService {
  private apiCallCount = 0;
  private readonly API_LIMIT = 500;

  /**
   * Fetch jobs from Jooble API
   */
  async searchJobs(params: JoobleSearchParams): Promise<JoobleResponse> {
    try {
      // Check if we've hit the API limit
      if (this.apiCallCount >= this.API_LIMIT) {
        console.warn('Jooble API limit reached, fetching from database');
        return this.getJobsFromDatabase(params);
      }

      console.log('Calling Jooble API with params:', params);

      const response = await axios.post<JoobleResponse>(
        `${JOOBLE_API_URL}${JOOBLE_API_KEY}`,
        params,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );

      this.apiCallCount++;
      console.log(`API calls used: ${this.apiCallCount}/${this.API_LIMIT}`);

      // Store jobs in database for caching
      if (response.data && response.data.jobs) {
        await this.storeJobsInDatabase(response.data.jobs);
      }

      return response.data;
    } catch (error: any) {
      console.error('Error fetching from Jooble API:', error.message);
      
      // Fallback to database if API fails
      console.log('Falling back to database jobs');
      return this.getJobsFromDatabase(params);
    }
  }

  /**
   * Store jobs in database for caching
   */
  private async storeJobsInDatabase(jobs: JoobleJob[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const job of jobs) {
        // Check if job already exists (by link URL as unique identifier)
        const existing = await client.query(
          'SELECT id FROM jobs WHERE url = $1',
          [job.link]
        );

        if (existing.rows.length === 0) {
          await client.query(
            `INSERT INTO jobs (
              title, company, location, description, url, posted_date,
              salary, tags, source, experience_required, job_type, is_active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              job.title,
              job.company || 'Unknown',
              job.location,
              job.snippet,
              job.link,
              job.updated || new Date().toISOString(),
              job.salary || 'Not specified',
              [], // tags - empty for now
              'jooble',
              'Not specified',
              job.type || 'Full-time',
              true
            ]
          );
        } else {
          // Update existing job
          await client.query(
            `UPDATE jobs SET
              title = $1, company = $2, location = $3, description = $4,
              salary = $5, job_type = $6, updated_at = CURRENT_TIMESTAMP
            WHERE url = $7`,
            [
              job.title,
              job.company || 'Unknown',
              job.location,
              job.snippet,
              job.salary || 'Not specified',
              job.type || 'Full-time',
              job.link
            ]
          );
        }
      }

      await client.query('COMMIT');
      console.log(`Stored ${jobs.length} jobs in database`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error storing jobs in database:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Fallback: Get jobs from database when API is unavailable
   */
  private async getJobsFromDatabase(params: JoobleSearchParams): Promise<JoobleResponse> {
    try {
      let query = 'SELECT * FROM jobs WHERE is_active = true';
      const queryParams: any[] = [];
      let paramIndex = 1;

      // Filter by keywords in title or description
      if (params.keywords) {
        query += ` AND (
          LOWER(title) LIKE $${paramIndex} OR 
          LOWER(description) LIKE $${paramIndex}
        )`;
        queryParams.push(`%${params.keywords.toLowerCase()}%`);
        paramIndex++;
      }

      // Filter by location
      if (params.location) {
        query += ` AND LOWER(location) LIKE $${paramIndex}`;
        queryParams.push(`%${params.location.toLowerCase()}%`);
        paramIndex++;
      }

      // Order by most recent
      query += ' ORDER BY posted_date DESC LIMIT 50';

      const result = await pool.query(query, queryParams);

      // Transform database jobs to Jooble format
      const jobs: JoobleJob[] = result.rows.map(row => ({
        title: row.title,
        location: row.location,
        snippet: row.description,
        salary: row.salary,
        source: row.source,
        type: row.job_type,
        link: row.url,
        updated: row.posted_date,
        company: row.company,
        id: row.id.toString()
      }));

      return {
        totalCount: jobs.length,
        jobs
      };
    } catch (error) {
      console.error('Error fetching jobs from database:', error);
      return { totalCount: 0, jobs: [] };
    }
  }

  /**
   * Get jobs with ATS-based recommendations
   */
  async getRecommendedJobs(
    userId: number,
    resumeAnalysis: any,
    filters: {
      location?: string;
      keywords?: string;
      days_posted?: number;
      min_match_score?: number;
    }
  ): Promise<any> {
    try {
      // Extract keywords from resume skills
      const keywords = this.extractKeywordsFromResume(resumeAnalysis);
      
      // Search jobs from Jooble
      const joobleJobs = await this.searchJobs({
        keywords: filters.keywords || keywords,
        location: filters.location || '',
        page: '1'
      });

      // Get jobs from database (includes both Jooble and other sources)
      const dbJobs = await this.getJobsFromDatabase({
        keywords: filters.keywords || keywords,
        location: filters.location
      });

      // Combine and deduplicate jobs
      const allJobs = this.deduplicateJobs([...joobleJobs.jobs, ...dbJobs.jobs]);

      // Apply ATS-based matching
      const recommendedJobs = this.calculateJobMatches(allJobs, resumeAnalysis, filters);

      return {
        success: true,
        totalJobs: allJobs.length,
        recommendedJobs: recommendedJobs.length,
        recommendations: recommendedJobs,
        atsScore: resumeAnalysis.score,
        apiCallsUsed: this.apiCallCount,
        apiCallsRemaining: this.API_LIMIT - this.apiCallCount
      };
    } catch (error: any) {
      console.error('Error getting recommended jobs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Extract keywords from resume analysis
   */
  private extractKeywordsFromResume(analysis: any): string {
    const keywords: string[] = [];

    // Extract technical skills
    if (analysis.skills && analysis.skills.technical) {
      Object.values(analysis.skills.technical).forEach((skillArray: any) => {
        if (Array.isArray(skillArray)) {
          keywords.push(...skillArray);
        }
      });
    }

    // Use first 3 keywords to avoid too specific searches
    return keywords.slice(0, 3).join(' ') || 'software developer';
  }

  /**
   * Remove duplicate jobs based on URL
   */
  private deduplicateJobs(jobs: JoobleJob[]): JoobleJob[] {
    const seen = new Set<string>();
    return jobs.filter(job => {
      if (seen.has(job.link)) {
        return false;
      }
      seen.add(job.link);
      return true;
    });
  }

  /**
   * Calculate job match scores based on ATS analysis
   */
  private calculateJobMatches(
    jobs: JoobleJob[],
    analysis: any,
    filters: any
  ): any[] {
    const matchedJobs = jobs.map(job => {
      const matchScore = this.calculateMatchScore(job, analysis);
      
      return {
        ...job,
        matchScore: Math.round(matchScore * 10) / 10,
        recommendationReasons: this.getRecommendationReasons(job, analysis, matchScore)
      };
    });

    // Filter by minimum match score if specified
    let filtered = matchedJobs;
    if (filters.min_match_score) {
      filtered = matchedJobs.filter(job => job.matchScore >= filters.min_match_score);
    }

    // Filter by posting date if specified
    if (filters.days_posted) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.days_posted);
      filtered = filtered.filter(job => {
        const jobDate = new Date(job.updated);
        return jobDate >= cutoffDate;
      });
    }

    // Sort by match score descending
    return filtered.sort((a, b) => b.matchScore - a.matchScore).slice(0, 20);
  }

  /**
   * Calculate match score between job and resume
   */
  private calculateMatchScore(job: JoobleJob, analysis: any): number {
    let score = 0;
    const jobText = `${job.title} ${job.snippet}`.toLowerCase();

    // Technical skills match (40 points)
    if (analysis.skills && analysis.skills.technical) {
      const techSkills: string[] = [];
      Object.values(analysis.skills.technical).forEach((skillArray: any) => {
        if (Array.isArray(skillArray)) {
          techSkills.push(...skillArray);
        }
      });

      const matchedSkills = techSkills.filter(skill => 
        jobText.includes(skill.toLowerCase())
      );
      
      if (techSkills.length > 0) {
        score += (matchedSkills.length / techSkills.length) * 40;
      }
    }

    // Soft skills match (15 points)
    if (analysis.skills && analysis.skills.soft) {
      const matchedSoftSkills = analysis.skills.soft.filter((skill: string) =>
        jobText.includes(skill.toLowerCase())
      );
      
      if (analysis.skills.soft.length > 0) {
        score += (matchedSoftSkills.length / analysis.skills.soft.length) * 15;
      }
    }

    // ATS score boost (20 points)
    score += (analysis.score / 100) * 20;

    // Job freshness (15 points)
    const jobDate = new Date(job.updated);
    const daysOld = (Date.now() - jobDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysOld <= 7) {
      score += 15;
    } else if (daysOld <= 14) {
      score += 12;
    } else if (daysOld <= 30) {
      score += 8;
    } else {
      score += 4;
    }

    // Salary presence (10 points)
    if (job.salary && job.salary !== 'Not specified') {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Generate recommendation reasons
   */
  private getRecommendationReasons(job: JoobleJob, analysis: any, matchScore: number): string[] {
    const reasons: string[] = [];

    if (matchScore >= 80) {
      reasons.push('Excellent match for your skills and experience');
    } else if (matchScore >= 60) {
      reasons.push('Good match for your profile');
    } else if (matchScore >= 40) {
      reasons.push('Moderate match - consider applying');
    }

    // Check for skill matches
    const jobText = `${job.title} ${job.snippet}`.toLowerCase();
    if (analysis.skills && analysis.skills.technical) {
      const techSkills: string[] = [];
      Object.values(analysis.skills.technical).forEach((skillArray: any) => {
        if (Array.isArray(skillArray)) {
          techSkills.push(...skillArray);
        }
      });

      const matchedSkills = techSkills
        .filter(skill => jobText.includes(skill.toLowerCase()))
        .slice(0, 3);

      if (matchedSkills.length > 0) {
        reasons.push(`Matches your skills: ${matchedSkills.join(', ')}`);
      }
    }

    // Job freshness
    const jobDate = new Date(job.updated);
    const daysOld = Math.floor((Date.now() - jobDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysOld <= 3) {
      reasons.push('Recently posted - apply quickly!');
    }

    return reasons;
  }

  /**
   * Refresh jobs from API (manual trigger)
   */
  async refreshJobs(keywords: string, location: string = ''): Promise<void> {
    try {
      const response = await this.searchJobs({ keywords, location });
      console.log(`Refreshed ${response.jobs.length} jobs for "${keywords}" in "${location}"`);
    } catch (error) {
      console.error('Error refreshing jobs:', error);
      throw error;
    }
  }
}

export default new JoobleService();