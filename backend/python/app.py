"""
Python Flask Server for Resume Analysis
Runs independently from the TypeScript backend
"""

# IMPORTANT: Set offline environment BEFORE importing any ML libraries
from offline_config import setup_offline_environment
setup_offline_environment()

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from pdf_text_extract import extract_pdf_text
from resume_analyzer import analyze_resume

# Import ML modules (with fallback to rule-based)
try:
    from resume_analyzer_ml import get_analyzer as get_ml_analyzer
    from job_matcher_ml import get_matcher as get_ml_matcher
    ML_ENABLED = True
    print("✅ ML modules loaded successfully")
except ImportError as e:
    ML_ENABLED = False
    print(f"⚠️  ML modules not available: {e}")
    print("   Falling back to rule-based analysis")

app = Flask(__name__)
CORS(app)  # Enable CORS for TypeScript backend to communicate

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), '..', 'uploads', 'temp')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'service': 'Python Resume Analysis Service',
        'version': '1.0.0'
    })

@app.route('/api/extract-text', methods=['POST'])
def extract_text():
    """Extract text from PDF file"""
    try:
        # Check if file is in request
        if 'file' not in request.files:
            # Check if file path is provided
            data = request.get_json()
            if data and 'filePath' in data:
                pdf_path = data['filePath']
            else:
                return jsonify({
                    'success': False,
                    'error': 'No file or filePath provided'
                }), 400
        else:
            # Save uploaded file
            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400
            
            # Save file temporarily
            pdf_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(pdf_path)
        
        # Extract text
        text = extract_pdf_text(pdf_path)
        
        if text:
            return jsonify({
                'success': True,
                'text': text,
                'length': len(text)
            })
        else:
            return jsonify({
                'success': False,
                'error': 'Failed to extract text from PDF'
            }), 500
            
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analyze-text', methods=['POST'])
def analyze_text():
    """Analyze resume text and provide ATS score"""
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({
                'success': False,
                'error': 'No text provided for analysis'
            }), 400
        
        text = data['text']
        
        # Analyze resume
        result = analyze_resume(text)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/analyze-pdf', methods=['POST'])
def analyze_pdf():
    """Complete pipeline: extract text from PDF and analyze"""
    try:
        # Check if file is in request
        if 'file' not in request.files:
            # Check if file path is provided
            data = request.get_json()
            if data and 'filePath' in data:
                pdf_path = data['filePath']
            else:
                return jsonify({
                    'success': False,
                    'error': 'No file or filePath provided'
                }), 400
        else:
            # Save uploaded file
            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400
            
            # Save file temporarily
            pdf_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(pdf_path)
        
        # Step 1: Extract text
        text = extract_pdf_text(pdf_path)
        
        if not text:
            return jsonify({
                'success': False,
                'error': 'Failed to extract text from PDF'
            }), 500
        
        # Step 2: Analyze text
        analysis_result = analyze_resume(text)
        
        # Add extracted text to response
        analysis_result['extractedText'] = text
        analysis_result['textLength'] = len(text)
        
        return jsonify(analysis_result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/', methods=['GET'])
def root():
    """Root endpoint"""
    return jsonify({
        'service': 'Python Resume Analysis API',
        'version': '1.0.0',
        'mlEnabled': ML_ENABLED,
        'endpoints': {
            'health': '/health',
            'extractText': '/api/extract-text',
            'analyzeText': '/api/analyze-text',
            'analyzePdf': '/api/analyze-pdf',
            'analyzeTextML': '/api/ml/analyze-text',
            'analyzePdfML': '/api/ml/analyze-pdf',
            'matchJob': '/api/ml/match-job',
            'batchMatchJobs': '/api/ml/batch-match-jobs'
        }
    })

# ========================================
# ML-BASED ENDPOINTS
# ========================================

@app.route('/api/ml/analyze-text', methods=['POST'])
def analyze_text_ml():
    """Analyze resume text using ML (Sentence-BERT)"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({
                'success': False,
                'error': 'No text provided for analysis'
            }), 400
        
        text = data['text']
        
        # Use ML analyzer
        analyzer = get_ml_analyzer()
        result = analyzer.analyze_resume(text)
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/ml/analyze-pdf', methods=['POST'])
def analyze_pdf_ml():
    """Complete ML pipeline: extract text from PDF and analyze with ML"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        # Check if file is in request
        if 'file' not in request.files:
            # Check if file path is provided
            data = request.get_json()
            if data and 'filePath' in data:
                pdf_path = data['filePath']
            else:
                return jsonify({
                    'success': False,
                    'error': 'No file or filePath provided'
                }), 400
        else:
            # Save uploaded file
            file = request.files['file']
            if file.filename == '':
                return jsonify({
                    'success': False,
                    'error': 'No file selected'
                }), 400
            
            # Save file temporarily
            pdf_path = os.path.join(UPLOAD_FOLDER, file.filename)
            file.save(pdf_path)
        
        # Step 1: Extract text
        text = extract_pdf_text(pdf_path)
        
        if not text:
            return jsonify({
                'success': False,
                'error': 'Failed to extract text from PDF'
            }), 500
        
        # Step 2: Analyze text with ML
        analyzer = get_ml_analyzer()
        analysis_result = analyzer.analyze_resume(text)
        
        # Add extracted text to response
        analysis_result['extractedText'] = text
        analysis_result['textLength'] = len(text)
        
        # DEBUG: Log what we're returning
        print(f"🔍 PYTHON RETURNING extractedInfo.skills: {analysis_result.get('extractedInfo', {}).get('skills', [])}") 
        print(f"🔍 PYTHON skills count: {len(analysis_result.get('extractedInfo', {}).get('skills', []))}")
        
        return jsonify(analysis_result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/ml/match-job', methods=['POST'])
def match_job_ml():
    """Calculate match score between resume and single job using ML"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        data = request.get_json()
        
        if not data or 'resumeText' not in data or 'jobDescription' not in data:
            return jsonify({
                'success': False,
                'error': 'resumeText and jobDescription are required'
            }), 400
        
        resume_text = data['resumeText']
        job_description = data['jobDescription']
        job_title = data.get('jobTitle', '')
        ats_score = data.get('atsScore', 0)
        
        # Use ML matcher
        matcher = get_ml_matcher()
        result = matcher.calculate_match_score(
            resume_text, job_description, job_title, ats_score
        )
        
        return jsonify(result)
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

@app.route('/api/ml/batch-match-jobs', methods=['POST'])
def batch_match_jobs_ml():
    """Calculate match scores for multiple jobs (batch processing)"""
    if not ML_ENABLED:
        return jsonify({
            'success': False,
            'error': 'ML modules not available. Install: pip install sentence-transformers torch'
        }), 503
    
    try:
        data = request.get_json()
        
        if not data or 'resumeText' not in data or 'jobs' not in data:
            return jsonify({
                'success': False,
                'error': 'resumeText and jobs array are required'
            }), 400
        
        resume_text = data['resumeText']
        jobs = data['jobs']  # Array of {title, description}
        ats_score = data.get('atsScore', 0)
        experience_level = data.get('experienceLevel', 'entry')
        years_of_experience = data.get('yearsOfExperience', 0)
        
        if not isinstance(jobs, list):
            return jsonify({
                'success': False,
                'error': 'jobs must be an array'
            }), 400
        
        # Use ML matcher for batch processing with experience level
        matcher = get_ml_matcher()
        results = matcher.batch_calculate_matches(
            resume_text, jobs, ats_score, experience_level, years_of_experience
        )
        
        return jsonify({
            'success': True,
            'totalJobs': len(jobs),
            'matches': results
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# ========================================
# END ML ENDPOINTS
# ========================================

if __name__ == '__main__':
    print('=' * 60)
    print('🐍 Python Resume Analysis Service')
    print('=' * 60)
    print(f'ML Enabled: {"✅ Yes" if ML_ENABLED else "⚠️  No (using rule-based fallback)"}')
    print('Server running on: http://localhost:5000')
    print('Endpoints:')
    print('  GET  /health - Health check')
    print('  POST /api/extract-text - Extract text from PDF')
    print('  POST /api/analyze-text - Analyze resume text (rule-based)')
    print('  POST /api/analyze-pdf - Complete analysis pipeline (rule-based)')
    if ML_ENABLED:
        print('  POST /api/ml/analyze-text - Analyze resume text (ML)')
        print('  POST /api/ml/analyze-pdf - Complete analysis pipeline (ML)')
        print('  POST /api/ml/match-job - Match resume to job (ML)')
        print('  POST /api/ml/batch-match-jobs - Batch match jobs (ML)')
    print('=' * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)
