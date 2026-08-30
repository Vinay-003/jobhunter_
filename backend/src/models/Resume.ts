import { Pool } from 'pg';
import pool from '../config/database.js';

export interface Resume {
  id: number;
  user_id: number;
  file_name: string;
  file_path: string;
  upload_date: Date;
  is_latest: boolean;
  status: string;
  analysis_data?: any;
  created_at: Date;
  updated_at: Date;
}

export interface ResumeContent {
  content: Buffer;
  fileName: string;
  uploadDate: Date;
  status: string;
}

export class ResumeModel {
  private pool: Pool;

  constructor() {
    this.pool = pool;
  }

  async createResume(userId: number, fileName: string, filePath: string): Promise<Resume> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Set all existing resumes for this user to not latest
      await client.query(
        'UPDATE resumes SET is_latest = false WHERE user_id = $1',
        [userId]
      );

      // Insert new resume
      const result = await client.query(
        `INSERT INTO resumes (user_id, file_name, file_path, is_latest)
         VALUES ($1, $2, $3, true)
         RETURNING *`,
        [userId, fileName, filePath]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestResume(userId: number): Promise<Resume | null> {
    const result = await this.pool.query(
      'SELECT * FROM resumes WHERE user_id = $1 AND is_latest = true',
      [userId]
    );
    return result.rows[0] || null;
  }

  async getResumeById(id: number): Promise<Resume | null> {
    const result = await this.pool.query(
      'SELECT * FROM resumes WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async getResumeByIdForUser(id: number, userId: number): Promise<Resume | null> {
    const result = await this.pool.query(
      'SELECT * FROM resumes WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  async updateResumeStatus(id: number, status: string, analysisData?: any): Promise<Resume> {
    const result = await this.pool.query(
      `UPDATE resumes 
       SET status = $1, analysis_data = $2
       WHERE id = $3
       RETURNING *`,
      [status, analysisData, id]
    );
    return result.rows[0];
  }

  async getUserResumes(userId: number): Promise<Resume[]> {
    const result = await this.pool.query(
      'SELECT * FROM resumes WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  async getResumeContent(id: number): Promise<ResumeContent | null> {
    const result = await this.pool.query(
      `SELECT pdf_content, file_name, upload_date, status 
       FROM resumes WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return {
      content: result.rows[0].pdf_content,
      fileName: result.rows[0].file_name,
      uploadDate: result.rows[0].upload_date,
      status: result.rows[0].status
    };
  }

  async getLatestResumeContent(userId: number): Promise<ResumeContent | null> {
    const result = await this.pool.query(
      `SELECT pdf_content, file_name, upload_date, status 
       FROM resumes 
       WHERE user_id = $1 AND is_latest = true`,
      [userId]
    );
    if (result.rows.length === 0) {
      return null;
    }
    return {
      content: result.rows[0].pdf_content,
      fileName: result.rows[0].file_name,
      uploadDate: result.rows[0].upload_date,
      status: result.rows[0].status
    };
  }
} 