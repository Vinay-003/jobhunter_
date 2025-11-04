# Resume Analysis API Documentation

## Overview

The analysis system extracts text from uploaded PDF resumes and provides ATS (Applicant Tracking System) scores, insights, and recommendations.

## API Endpoints

### 1. Analyze Latest Resume
**POST** `/api/analyze`

Analyzes the user's most recent resume upload.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Resume analyzed successfully",
  "analysis": {
    "success": true,
    "score": 85.5,
    "status": "excellent",
    "statusMessage": "Your resume is well-optimized for ATS systems",
    "insights": [
      "Good resume length - optimal for ATS parsing",
      "Contact information present (email and phone)",
      "All key sections present",
      "Good use of action verbs",
      "Quantifiable achievements present"
    ],
    "recommendations": [
      "Consider adding more detail to your resume"
    ],
    "metrics": {
      "wordCount": 450,
      "sectionsFound": 4,
      "actionVerbs": 8,
      "quantifiableMetrics": 5,
      "keywordsUsed": 7
    }
  },
  "resume": {
    "id": 1,
    "fileName": "resume.pdf",
    "status": "processed",
    "analysisData": { ... }
  }
}
```

### 2. Analyze Specific Resume
**POST** `/api/analyze/:id`

Analyzes a specific resume by ID.

**Parameters:**
- `id` (path parameter): Resume ID

**Headers:**
```
Authorization: Bearer <token>
```

**Response:** Same as above

## How It Works

1. **Text Extraction**: Uses PyMuPDF (fitz) to extract text from the PDF
2. **Analysis**: Analyzes the text for:
   - Resume length (word count)
   - Contact information (email, phone)
   - Key sections (Experience, Education, Skills, Summary)
   - Action verbs usage
   - Quantifiable achievements (numbers, percentages)
   - Keyword optimization
3. **Scoring**: Calculates an ATS score (0-100) based on all factors
4. **Storage**: Saves analysis results to the `analysis_data` JSONB field in the database

## Python Scripts

### `pdf_text_extract.py`
- Extracts text from PDF files
- Usage: `python pdf_text_extract.py <pdf_path>`
- Returns JSON with extracted text

### `resume_analyzer.py`
- Analyzes resume text and provides ATS score
- Usage: `python resume_analyzer.py <text_or_file_path>`
- Returns JSON with analysis results

## Requirements

Make sure you have the required Python packages:
```bash
pip install pymupdf
```

## Error Handling

The API handles:
- Missing or invalid resume files
- PDF extraction errors
- Analysis failures
- Authentication errors
- Database errors

All errors return appropriate HTTP status codes and error messages.

## Status Values

Resumes have the following statuses:
- `pending`: Uploaded but not yet analyzed
- `processed`: Successfully analyzed

## Next Steps

To automatically analyze resumes after upload, you can:
1. Modify the upload endpoint to trigger analysis automatically
2. Set up a job queue system for background processing
3. Add webhooks for completion notifications

