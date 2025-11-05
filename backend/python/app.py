"""
Python Flask Server for Resume Analysis
Runs independently from the TypeScript backend
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
from pdf_text_extract import extract_pdf_text
from resume_analyzer import analyze_resume

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
        'endpoints': {
            'health': '/health',
            'extractText': '/api/extract-text',
            'analyzeText': '/api/analyze-text',
            'analyzePdf': '/api/analyze-pdf'
        }
    })

if __name__ == '__main__':
    print('=' * 60)
    print('🐍 Python Resume Analysis Service')
    print('=' * 60)
    print('Server running on: http://localhost:5000')
    print('Endpoints:')
    print('  GET  /health - Health check')
    print('  POST /api/extract-text - Extract text from PDF')
    print('  POST /api/analyze-text - Analyze resume text')
    print('  POST /api/analyze-pdf - Complete analysis pipeline')
    print('=' * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=True)
