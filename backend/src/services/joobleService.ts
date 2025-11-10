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
      
      // COMPREHENSIVE VALIDATION: Check both skills AND format
      const validationResult = this.validateResumeFormat(resumeAnalysis);
      
      if (!validationResult.isValid) {
        console.error('❌ Invalid resume file detected');
        console.error(`   Reason: ${validationResult.reason}`);
        console.error(`   Details:`, validationResult.details);
        return {
          success: false,
          error: validationResult.reason,
          totalJobs: 0,
          recommendedJobs: 0,
          recommendations: [],
          atsScore: resumeAnalysis.score || 0,
          apiCallsUsed: this.apiCallCount,
          apiCallsRemaining: this.API_LIMIT - this.apiCallCount
        };
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
   * Validate resume format and structure
   * Checks for proper resume characteristics vs random documents
   */
  private validateResumeFormat(analysis: any): { isValid: boolean; reason: string; details: any } {
    const details: any = {
      skillCount: 0,
      hasSections: false,
      sectionCount: 0,
      hasContact: false,
      hasWorkExperience: false,
      hasEducation: false,
      wordCount: 0,
      bulletCount: 0
    };

    // Check 1: Must have extractedInfo (basic requirement)
    if (!analysis.extractedInfo) {
      return {
        isValid: false,
        reason: 'Invalid file format. This does not appear to be a resume.',
        details
      };
    }

    const info = analysis.extractedInfo;

    // Gather metrics
    details.skillCount = info.skills?.length || 0;
    details.sectionCount = info.sections?.length || 0;
    details.hasSections = details.sectionCount > 0;
    details.hasContact = info.has_contact || !!(info.email || info.phone);
    details.hasWorkExperience = (info.work_experience?.length || 0) > 0;
    details.hasEducation = (info.education?.length || 0) > 0;
    // Word count and bullet count are in metrics object, not extractedInfo
    details.wordCount = analysis.metrics?.wordCount || info.word_count || 0;
    details.bulletCount = analysis.metrics?.totalBullets || info.total_bullets || 0;

    // VALIDATION RULES (must pass at least 3 out of 5 checks)
    const checks = {
      sufficientSkills: details.skillCount >= 3,
      hasProperSections: details.sectionCount >= 2, // At least 2 sections (e.g., Experience + Education)
      hasContactInfo: details.hasContact,
      hasExperienceOrEducation: details.hasWorkExperience || details.hasEducation,
      reasonableLength: details.wordCount >= 200 && details.wordCount <= 2000 // Resume range
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;

    console.log('📋 RESUME FORMAT VALIDATION:', {
      checks,
      passedChecks,
      totalChecks,
      details
    });

    // Must pass at least 3 out of 5 checks
    if (passedChecks < 3) {
      const failedChecks = Object.entries(checks)
        .filter(([_, passed]) => !passed)
        .map(([check]) => check);

      return {
        isValid: false,
        reason: `Invalid resume file. This appears to be a non-resume document (failed ${totalChecks - passedChecks}/${totalChecks} format checks). Please upload a valid resume with your professional information.`,
        details: {
          ...details,
          failedChecks,
          passedChecks: `${passedChecks}/${totalChecks}`
        }
      };
    }

    // All checks passed
    return {
      isValid: true,
      reason: 'Valid resume format',
      details
    };
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
      highValue: ['full stack', 'devops', 'microservices', 'api', 'rest', 'graphql'],
      // Soft skills - important for all roles (management, HR, marketing, etc.)
      softSkills: ['leadership', 'communication', 'teamwork', 'problem solving', 'analytical', 
                   'collaboration', 'project management', 'critical thinking', 'mentoring',
                   'presentation', 'negotiation', 'time management', 'event management',
                   'team management', 'versatile', 'trust building', 'strategic planning'],
      // Non-CS domain skills
      business: ['marketing', 'sales', 'business development', 'strategy', 'consulting', 
                'finance', 'accounting', 'economics', 'operations', 'supply chain'],
      design: ['ui/ux', 'graphic design', 'product design', 'figma', 'sketch', 'photoshop', 
              'illustrator', 'wireframing', 'prototyping'],
      management: ['agile', 'scrum', 'kanban', 'pmp', 'prince2', 'stakeholder management',
                  'resource planning', 'budget management']
    };
    
    // Categorize each skill
    const softSkills: string[] = [];
    const businessSkills: string[] = [];
    const designSkills: string[] = [];
    const managementSkills: string[] = [];
    
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
      if (skillCategories.softSkills.some(s => skillLower.includes(s))) {
        softSkills.push(skill);
      }
      if (skillCategories.business.some(b => skillLower.includes(b))) {
        businessSkills.push(skill);
      }
      if (skillCategories.design.some(d => skillLower.includes(d))) {
        designSkills.push(skill);
      }
      if (skillCategories.management.some(m => skillLower.includes(m))) {
        managementSkills.push(skill);
      }
    });
    
    // Build optimized search query with ALL relevant skills
    // Strategy: Include technical skills + domain-specific skills + key soft skills
    const selectedSkills: string[] = [];
    
    // Add ALL categorized skills (prioritize hard skills but include domain-specific ones)
    selectedSkills.push(...prioritySkills);    // Full stack, DevOps, etc.
    selectedSkills.push(...frameworks);        // React, Next.js, Express, etc.
    selectedSkills.push(...languages);         // Python, JavaScript, Rust, etc.
    selectedSkills.push(...cloudTools);        // Azure, CI/CD, GitHub Actions, etc.
    selectedSkills.push(...databases);         // PostgreSQL, MySQL, Supabase, etc.
    selectedSkills.push(...dataScience);       // ML, AI, Pandas, NumPy, etc.
    selectedSkills.push(...businessSkills);    // Marketing, Sales, Finance, etc.
    selectedSkills.push(...designSkills);      // UI/UX, Figma, Graphic Design, etc.
    selectedSkills.push(...managementSkills);  // Agile, Scrum, Project Management, etc.
    
    // Add top soft skills (limit to avoid dilution, but include important ones)
    const topSoftSkills = softSkills.slice(0, 5);  // Include up to 5 soft skills
    selectedSkills.push(...topSoftSkills);
    
    // Add any uncategorized skills that might be domain-specific (e.g., "testing", "quality assurance")
    const categorizedSet = new Set([
      ...frameworks, ...languages, ...databases, ...cloudTools, ...dataScience,
      ...prioritySkills, ...softSkills, ...businessSkills, ...designSkills, ...managementSkills
    ]);
    const uncategorizedSkills = uniqueKeywords.filter(skill => !categorizedSet.has(skill));
    
    // Add uncategorized skills (could be domain-specific like "legal", "healthcare", etc.)
    selectedSkills.push(...uncategorizedSkills);
    
    // Remove duplicates
    const finalKeywords = [...new Set(selectedSkills)];
    
    console.log(`🔍 Skill categorization:`, {
      total: uniqueKeywords.length,
      frameworks: frameworks.length,
      languages: languages.length,
      databases: databases.length,
      cloudTools: cloudTools.length,
      dataScience: dataScience.length,
      highValue: prioritySkills.length,
      softSkills: softSkills.length,
      business: businessSkills.length,
      design: designSkills.length,
      management: managementSkills.length,
      uncategorized: uncategorizedSkills.length,
      selected: finalKeywords.length
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
        console.log('✅ Using ML-based job matching');
        console.log(`   Received ${mlMatches.length} ML-matched jobs`);
        
        const filtered = this.filterAndSortMatches(mlMatches, filters);
        console.log(`   After filtering: ${filtered.length} jobs`);
        console.log(`   Top 5 scores: ${filtered.slice(0, 5).map(j => j.matchScore).join(', ')}`);
        
        return filtered;
      }
    } catch (error: any) {
      console.log('⚠️ ML matching unavailable, falling back to rule-based');
      console.log('   Error:', error.message);
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
      console.log('\n🔮 Attempting ML-based job matching...');
      console.log(`   Jobs to match: ${jobs.length}`);
      console.log(`   Resume length: ${analysis.extractedText?.length || 0} chars`);
      console.log(`   ATS Score: ${analysis.score || 0}`);
      console.log(`   Experience: ${analysis.extractedInfo?.experienceLevel || 'entry'} (${analysis.extractedInfo?.yearsOfExperience || 0} years)`);
      
      // Prepare jobs for batch processing
      const jobsData = jobs.map(job => ({
        title: job.title,
        description: job.snippet
      }));

      console.log(`   Calling Python ML service: ${PYTHON_SERVICE_URL}/api/ml/batch-match-jobs`);
      
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

      if (response.data.success && response.data.results) {
        console.log(`✅ ML Matching: Received ${response.data.results.length} results`);
        
        // Combine ML results with job data
        return jobs.map((job, index) => {
          const mlResult = response.data.results[index];
          console.log(`   Job ${index + 1}: ${job.title.substring(0, 50)} - Score: ${mlResult.matchScore}`);
          
          return {
            ...job,
            matchScore: mlResult.matchScore || 0,
            semanticSimilarity: mlResult.semanticSimilarity,
            matchLevel: mlResult.matchLevel,
            recommendationReasons: mlResult.reasons || [],
            methodology: mlResult.methodology,
            seniorityPenalty: mlResult.seniorityPenalty,
            candidateLevel: mlResult.candidateLevel,
            jobLevel: mlResult.jobLevel
          };
        });
      }

      console.log('⚠️ ML service returned no results');
      return [];
    } catch (error: any) {
      console.error('❌ ML matching error:', error.message);
      if (error.response) {
        console.error('   Response status:', error.response.status);
        console.error('   Response data:', error.response.data);
      }
      return [];
    }
  }

  /**
   * Filter and sort matches
   */
  private filterAndSortMatches(matches: any[], filters: any): any[] {
    console.log(`\n🔍 Filtering ${matches.length} matches...`);
    console.log(`   Filters:`, filters);
    
    let filtered = matches;

    // Filter by minimum match score if specified
    if (filters.min_match_score) {
      const before = filtered.length;
      filtered = matches.filter(job => job.matchScore >= filters.min_match_score);
      console.log(`   ⚠️ Min score filter (${filters.min_match_score}): ${before} → ${filtered.length} jobs`);
    }

    // Filter by posting date if specified
    if (filters.days_posted) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.days_posted);
      const before = filtered.length;
      filtered = filtered.filter(job => {
        const jobDate = new Date(job.updated);
        return jobDate >= cutoffDate;
      });
      console.log(`   📅 Date filter (${filters.days_posted} days): ${before} → ${filtered.length} jobs`);
    }

    // Sort by match score descending
    const sorted = filtered.sort((a, b) => b.matchScore - a.matchScore);
    const top20 = sorted.slice(0, 20);
    
    console.log(`   📊 Top 10 scores: ${sorted.slice(0, 10).map(j => j.matchScore).join(', ')}`);
    console.log(`   ✅ Returning top ${top20.length} jobs\n`);
    
    return top20;
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