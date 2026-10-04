// backend/src/services/jobRecommendationService.ts
import pool from '../config/database.js';

interface JobFilters {
  location?: string;
  keywords?: string;
  days_posted?: number;
  min_match_score?: number;
}

export class JobRecommendationService {
  /**
   * Get jobs from database with filters
   */
  async getJobs(filters?: JobFilters): Promise<any[]> {
    try {
      let query = 'SELECT * FROM jobs WHERE is_active = true';
      const params: any[] = [];
      let paramIndex = 1;

      // Filter by location
      if (filters?.location) {
        query += ` AND (LOWER(location) LIKE $${paramIndex} OR LOWER(location) = 'remote')`;
        params.push(`%${filters.location.toLowerCase()}%`);
        paramIndex++;
      }

      // Filter by keywords in title or description
      if (filters?.keywords) {
        query += ` AND (
          LOWER(title) LIKE $${paramIndex} OR 
          LOWER(description) LIKE $${paramIndex}
        )`;
        params.push(`%${filters.keywords.toLowerCase()}%`);
        paramIndex++;
      }

      // Filter by days posted
      if (filters?.days_posted) {
        if (!Number.isInteger(filters.days_posted) || filters.days_posted < 1 || filters.days_posted > 365) throw new Error('Invalid days_posted');
        query += ` AND posted_date >= NOW() - ($${paramIndex}::int * INTERVAL '1 day')`;
        params.push(filters.days_posted);
      }

      query += ' ORDER BY posted_date DESC LIMIT 100';

      const result = await pool.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('Error fetching jobs from database:', error);
      return [];
    }
  }


}

export default new JobRecommendationService();
