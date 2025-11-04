import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
}

export class AnalysisService {
  private pythonScriptsPath: string;

  constructor() {
    // Get the path to Python scripts relative to the backend directory
    // Scripts are in backend/python/ when running from backend/
    
    // If running from dist folder (compiled), adjust path
    if (__dirname.includes('dist')) {
      // When compiled, __dirname is dist/services, so go up to backend then to python
      this.pythonScriptsPath = path.join(__dirname, '..', '..', 'python');
    } else {
      // When running from src, go up one level to backend, then to python
      this.pythonScriptsPath = path.join(__dirname, '..', '..', 'python');
    }
    
    // Ensure the path exists
    if (!fs.existsSync(this.pythonScriptsPath)) {
      console.warn(`Warning: Python scripts path not found: ${this.pythonScriptsPath}`);
      console.warn(`Current __dirname: ${__dirname}`);
      console.warn(`Trying fallback: ${path.join(process.cwd(), 'python')}`);
      // Fallback to process.cwd()
      this.pythonScriptsPath = path.join(process.cwd(), 'python');
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

      const extractScript = path.join(this.pythonScriptsPath, 'pdf_text_extract.py');
      
      // Execute Python script to extract text
      const { stdout, stderr } = await execAsync(
        `python "${extractScript}" "${pdfPath}"`,
        {
          maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large PDFs
          encoding: 'utf8' as const
        }
      );

      if (stderr && !stdout) {
        throw new Error(`Text extraction failed: ${stderr}`);
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (!result.success) {
          throw new Error(result.error || 'Text extraction failed');
        }
        return result.text;
      } catch (parseError) {
        // If output is not JSON, treat it as plain text (backward compatibility)
        if (stdout.trim()) {
          return stdout.trim();
        }
        throw new Error('Failed to parse extraction result');
      }
    } catch (error: any) {
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

      const analyzerScript = path.join(this.pythonScriptsPath, 'resume_analyzer.py');
      
      // Write text to a temporary file to avoid command line length issues
      const tempFile = path.join(process.cwd(), 'uploads', `temp_${Date.now()}_${Math.random().toString(36).substring(7)}.txt`);
      fs.writeFileSync(tempFile, text, 'utf8');

      try {
        // Execute Python script with temp file path
        const { stdout, stderr } = await execAsync(
          `python "${analyzerScript}" "${tempFile}"`,
          {
            maxBuffer: 10 * 1024 * 1024,
            encoding: 'utf8' as const
          }
        );

        // Clean up temp file
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }

        if (stderr && !stdout) {
          throw new Error(`Analysis failed: ${stderr}`);
        }

        try {
          const result = JSON.parse(stdout.trim());
          return result;
        } catch (parseError) {
          throw new Error('Failed to parse analysis result');
        }
      } catch (error) {
        // Clean up temp file on error
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
        throw error;
      }
    } catch (error: any) {
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
      
      // Step 1: Extract text
      const text = await this.extractTextFromPDF(pdfPath);
      console.log(`Text extracted, length: ${text.length} characters`);

      // Step 2: Analyze text
      const analysis = await this.analyzeResumeText(text);
      console.log(`Analysis complete, score: ${analysis.score}`);

      return analysis;
    } catch (error: any) {
      console.error('Error in analysis pipeline:', error);
      return {
        success: false,
        error: error.message || 'Analysis pipeline failed'
      };
    }
  }
}

export default new AnalysisService();

