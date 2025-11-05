import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';

interface AnalysisResult {
  success: boolean;
  score?: number;
  status?: string;
  statusMessage?: string;
  insights?: string[];
  recommendations?: string[];
  metrics?: {
    wordCount: number;
    sectionsFound: number;
    actionVerbs: number;
    quantifiableMetrics: number;
    keywordsUsed: number;
  };
  error?: string;
  extractedText?: string;
  textLength?: number;
}

export class AnalysisService {
  private pythonServiceUrl: string;

  constructor() {
    // Python service URL from environment or default
    this.pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:5000';
    console.log(`Python service URL: ${this.pythonServiceUrl}`);
  }

  /**
   * Check if Python service is available
   */
  async checkPythonService(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.pythonServiceUrl}/health`, {
        timeout: 3000
      });
      return response.data.status === 'ok';
    } catch (error) {
      console.error('Python service health check failed:', error);
      return false;
    }
  }

  /**
   * Extract text from a PDF file
   */
  async extractTextFromPDF(pdfPath: string): Promise<string> {
    try {
      // Verify file exists
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found at path: ${pdfPath}`);
      }

      console.log(`Extracting text from: ${pdfPath}`);

      // Call Python service
      const response = await axios.post(
        `${this.pythonServiceUrl}/api/extract-text`,
        { filePath: pdfPath },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000 // 30 second timeout
        }
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Text extraction failed');
      }

      console.log(`Successfully extracted ${response.data.length} characters`);
      return response.data.text;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Python service is not running. Please start it with: cd backend/python && python app.py');
      }
      console.error('Error extracting text from PDF:', error);
      throw new Error(`Text extraction failed: ${error.message}`);
    }
  }

  /**
   * Analyze resume text and return ATS score and recommendations
   */
  async analyzeResumeText(text: string): Promise<AnalysisResult> {
    try {
      if (!text || !text.trim()) {
        return {
          success: false,
          error: 'No text provided for analysis'
        };
      }

      console.log(`Analyzing resume text (${text.length} characters)`);

      // Call Python service
      const response = await axios.post(
        `${this.pythonServiceUrl}/api/analyze-text`,
        { text },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );

      console.log(`Analysis complete - Score: ${response.data.score}`);
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Python service is not running. Please start it with: cd backend/python && python app.py'
        };
      }
      console.error('Error analyzing resume:', error);
      return {
        success: false,
        error: error.message || 'Resume analysis failed'
      };
    }
  }

  /**
   * Complete analysis pipeline: extract text and analyze
   */
  async analyzeResume(pdfPath: string): Promise<AnalysisResult> {
    try {
      console.log(`Starting analysis for PDF: ${pdfPath}`);

      // Verify file exists
      if (!fs.existsSync(pdfPath)) {
        throw new Error(`PDF file not found at path: ${pdfPath}`);
      }

      // Call Python service for complete analysis
      const response = await axios.post(
        `${this.pythonServiceUrl}/api/analyze-pdf`,
        { filePath: pdfPath },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000 // 60 second timeout for complete pipeline
        }
      );

      console.log(`Analysis complete, score: ${response.data.score}`);
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Python service is not running. Please start it with: cd backend/python && python app.py'
        };
      }
      console.error('Error in analysis pipeline:', error);
      return {
        success: false,
        error: error.message || 'Analysis pipeline failed'
      };
    }
  }
}

export default new AnalysisService();
