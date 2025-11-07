// src/services/joobleService.ts
import axios from 'axios';
import pool from '../config/database.js';

const JOOBLE_API_URL = 'https://jooble.org/api/';
const JOOBLE_API_KEY = 'b5c200c7-8bb9-4908-be33-9ac162971afe';
const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5000';

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
      
      // Validate that we have meaningful skills extracted
      // If no skills were extracted, it's likely not a resume
      if (!keywords || keywords === 'software developer') {
        const skillCount = resumeAnalysis?.extractedInfo?.skills?.length || 0;
        if (skillCount < 3) {
          console.error('❌ Invalid resume: insufficient skills extracted');
          console.error(`   Skills found: ${skillCount}`);
          console.error(`   This appears to be a non-resume file (e.g., lab report, essay, etc.)`);
          return {
            success: false,
            error: 'Invalid resume file. Please upload a valid resume with your skills and experience. Only ' + skillCount + ' skill(s) detected.',
            totalJobs: 0,
            recommendedJobs: 0,
            recommendations: [],
            atsScore: resumeAnalysis.score || 0,
            apiCallsUsed: this.apiCallCount,
            apiCallsRemaining: this.API_LIMIT - this.apiCallCount
          };
        }
      }
      
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

      // Apply ATS-based matching (now async with ML support)
      const recommendedJobs = await this.calculateJobMatches(allJobs, resumeAnalysis, filters);

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
    const prioritySkills: string[] = [];
    const frameworks: string[] = [];
    const languages: string[] = [];
    const databases: string[] = [];
    const cloudTools: string[] = [];
    const dataScience: string[] = [];

    // Extract skills from extractedInfo.skills (ML analyzer format)
    if (analysis.extractedInfo && analysis.extractedInfo.skills && Array.isArray(analysis.extractedInfo.skills)) {
      keywords.push(...analysis.extractedInfo.skills);
    }
    
    // Fallback: Extract technical skills from nested structure (rule-based format)
    if (analysis.skills && analysis.skills.technical) {
      Object.values(analysis.skills.technical).forEach((skillArray: any) => {
        if (Array.isArray(skillArray)) {
          keywords.push(...skillArray);
        }
      });
    }
    
    // Fallback: Extract from top-level skills array
    if (analysis.skills && Array.isArray(analysis.skills)) {
      keywords.push(...analysis.skills);
    }

    // Filter out empty strings and duplicates
    const uniqueKeywords = [...new Set(keywords.filter(k => k && k.trim().length > 0))];
    
    // Categorize skills for smarter job matching
    const skillCategories = {
      frameworks: ['react', 'angular', 'vue', 'next.js', 'next', 'express', 'express.js', 'node.js', 'node', 'django', 'flask', 'spring', 'tailwind', 'streamlit'],
      languages: ['python', 'java', 'javascript', 'typescript', 'c', 'c++', 'rust', 'go', 'ruby', 'php', 'kotlin', 'swift'],
      databases: ['mysql', 'postgresql', 'mongodb', 'supabase', 'redis', 'cassandra', 'dynamodb', 'sql'],
      cloudTools: ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'ci/cd', 'github actions', 'git', 'github', 'version control'],
      dataScience: ['machine learning', 'ai', 'data science', 'pandas', 'numpy', 'plotly', 'tensorflow', 'pytorch', 'scikit-learn'],
      highValue: ['full stack', 'devops', 'microservices', 'api', 'rest', 'graphql']
    };
    
    // Categorize each skill
    uniqueKeywords.forEach(skill => {
      const skillLower = skill.toLowerCase();
      
      if (skillCategories.frameworks.some(f => skillLower.includes(f))) {
        frameworks.push(skill);
      }
      if (skillCategories.languages.some(l => skillLower === l)) {
        languages.push(skill);
      }
      if (skillCategories.databases.some(d => skillLower.includes(d))) {
        databases.push(skill);
      }
      if (skillCategories.cloudTools.some(c => skillLower.includes(c))) {
        cloudTools.push(skill);
      }
      if (skillCategories.dataScience.some(ds => skillLower.includes(ds))) {
        dataScience.push(skill);
      }
      if (skillCategories.highValue.some(h => skillLower.includes(h))) {
        prioritySkills.push(skill);
      }
    });
    
    // Build optimized search query with ALL relevant technical skills
    // Strategy: Use frameworks + languages + databases + cloud tools + data science (exclude soft skills)
    const selectedSkills: string[] = [];
    
    // Add ALL categorized technical skills (they're already filtered to be job-relevant)
    selectedSkills.push(...prioritySkills);  // Full stack, DevOps, etc.
    selectedSkills.push(...frameworks);      // React, Next.js, Express, etc.
    selectedSkills.push(...languages);       // Python, JavaScript, Rust, etc.
    selectedSkills.push(...cloudTools);      // Azure, CI/CD, GitHub Actions, etc.
    selectedSkills.push(...databases);       // PostgreSQL, MySQL, Supabase, etc.
    selectedSkills.push(...dataScience);     // ML, AI, Pandas, NumPy, etc.
    
    // Remove duplicates
    const finalKeywords = [...new Set(selectedSkills)];
    
    console.log(`🔍 Skill categorization:`, {
      total: uniqueKeywords.length,
      frameworks: frameworks.length,
      languages: languages.length,
      databases: databases.length,
      cloudTools: cloudTools.length,
      dataScience: dataScience.length,
      highValue: prioritySkills.length
    });
    console.log(`🔍 Selected keywords (${finalKeywords.length}):`, finalKeywords);
    
    const searchQuery = finalKeywords.join(' ');
    console.log(`🔍 Using search query (${searchQuery.length} chars): "${searchQuery}"`);
    
    // Return empty if no valid technical skills found (likely not a resume)
    if (finalKeywords.length === 0) {
      console.warn('⚠️  No technical skills found in resume - may not be a valid resume file');
      return 'software developer';  // Still return default for API call validation check
    }
    
    return searchQuery;
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
   * Calculate job match scores based on ATS analysis (with ML support)
   */
  private async calculateJobMatches(
    jobs: JoobleJob[],
    analysis: any,
    filters: any
  ): Promise<any[]> {
    // Try ML-based matching first
    try {
      const mlMatches = await this.calculateMLMatches(jobs, analysis);
      if (mlMatches && mlMatches.length > 0) {
        console.log('Using ML-based job matching');
        return this.filterAndSortMatches(mlMatches, filters);
      }
    } catch (error) {
      console.log('ML matching unavailable, falling back to rule-based');
    }

    // Fallback to rule-based matching
    const matchedJobs = jobs.map(job => {
      const matchScore = this.calculateMatchScore(job, analysis);
      
      return {
        ...job,
        matchScore: Math.round(matchScore * 10) / 10,
        recommendationReasons: this.getRecommendationReasons(job, analysis, matchScore)
      };
    });

    return this.filterAndSortMatches(matchedJobs, filters);
  }

  /**
   * Calculate matches using ML (Sentence-BERT)
   */
  private async calculateMLMatches(jobs: JoobleJob[], analysis: any): Promise<any[]> {
    try {
      // Prepare jobs for batch processing
      const jobsData = jobs.map(job => ({
        title: job.title,
        description: job.snippet
      }));

      // Call ML service for batch matching
      const response = await axios.post(
        `${PYTHON_SERVICE_URL}/api/ml/batch-match-jobs`,
        {
          resumeText: analysis.extractedText || '',
          jobs: jobsData,
          atsScore: analysis.score || 0,
          experienceLevel: analysis.extractedInfo?.experienceLevel || 'entry',
          yearsOfExperience: analysis.extractedInfo?.yearsOfExperience || 0
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      if (response.data.success && response.data.matches) {
        // Combine ML results with job data
        return jobs.map((job, index) => {
          const mlResult = response.data.matches[index];
          return {
            ...job,
            matchScore: mlResult.matchScore || 0,
            semanticSimilarity: mlResult.semanticSimilarity,
            matchLevel: mlResult.matchLevel,
            recommendationReasons: mlResult.reasons || [],
            methodology: mlResult.methodology
          };
        });
      }

      return [];
    } catch (error: any) {
      console.error('ML matching error:', error.message);
      return [];
    }
  }

  /**
   * Filter and sort matches
   */
  private filterAndSortMatches(matches: any[], filters: any): any[] {
    let filtered = matches;

    // Filter by minimum match score if specified
    if (filters.min_match_score) {
      filtered = matches.filter(job => job.matchScore >= filters.min_match_score);
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