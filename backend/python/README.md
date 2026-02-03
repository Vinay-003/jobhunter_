# Python Resume Analysis Service

Independent Python service for PDF text extraction and resume analysis with ML capabilities.

## Setup

```bash
cd backend/python
python3 -m venv venv
source venv/bin/activate  # On Linux/Mac
# or on Windows: venv\Scripts\activate
pip install -r requirements.txt
```

## Run the Server

```bash
# Make sure virtual environment is activated
source venv/bin/activate  # or venv\Scripts\activate on Windows
python app.py
```

Server will start on `http://localhost:5000`

## API Endpoints

### Health Check
```bash
GET http://localhost:5000/health
```

### Extract Text from PDF
```bash
POST http://localhost:5000/api/extract-text
Content-Type: application/json

{
  "filePath": "/path/to/resume.pdf"
}
```

Or upload file directly:
```bash
POST http://localhost:5000/api/extract-text
Content-Type: multipart/form-data

file: [PDF file]
```

### Analyze Resume Text
```bash
POST http://localhost:5000/api/analyze-text
Content-Type: application/json

{
  "text": "Resume text content here..."
}
```

### Complete Analysis (Extract + Analyze)
```bash
POST http://localhost:5000/api/analyze-pdf
Content-Type: application/json

{
  "filePath": "/path/to/resume.pdf"
}
```

Or upload file directly:
```bash
POST http://localhost:5000/api/analyze-pdf
Content-Type: multipart/form-data

file: [PDF file]
```

## ML Endpoints

### Analyze Resume Text (ML)
```bash
POST http://localhost:5000/api/ml/analyze-text
Content-Type: application/json

{
  "text": "Resume text content here...",
  "targetLevel": "entry"
}
```

### Complete Analysis (ML)
```bash
POST http://localhost:5000/api/ml/analyze-pdf
Content-Type: application/json

{
  "filePath": "/path/to/resume.pdf",
  "targetLevel": "entry"
}
```

### Match Resume to Job (ML)
```bash
POST http://localhost:5000/api/ml/match-job
Content-Type: application/json

{
  "resumeText": "Resume text content here...",
  "jobDescription": "Job description here...",
  "jobTitle": "Software Engineer",
  "atsScore": 72,
  "experienceLevel": "entry",
  "yearsOfExperience": 1
}
```

### Batch Match Jobs (ML)
```bash
POST http://localhost:5000/api/ml/batch-match-jobs
Content-Type: application/json

{
  "resumeText": "Resume text content here...",
  "jobs": [
    { "title": "Software Engineer", "description": "..." },
    { "title": "Backend Engineer", "description": "..." }
  ],
  "atsScore": 72,
  "experienceLevel": "entry",
  "yearsOfExperience": 1
}
```

## Response Format

All endpoints return JSON:

```json
{
  "success": true,
  "score": 75.5,
  "status": "good",
  "statusMessage": "Your resume is good, with room for improvement",
  "insights": ["..."],
  "recommendations": ["..."],
  "metrics": {
    "wordCount": 650,
    "sectionsFound": 4,
    "actionVerbs": 8,
    "quantifiableMetrics": 5,
    "keywordsUsed": 6
  }
}
```

## Running in Production

For production, use a WSGI server like Gunicorn:

```bash
pip install gunicorn
gunicorn -w 4 -b 0.0.0.0:5000 app:app
```
