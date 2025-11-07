# Python Resume Analysis Service

Independent Python service for PDF text extraction and resume analysis with ML capabilities.

## 🚀 Quick Setup

1. **Create virtual environment:**
```bash
cd backend/python
python3 -m venv venv
source venv/bin/activate  # On Linux/Mac
# or on Windows: venv\Scripts\activate
```

2. **Complete setup (installs dependencies + downloads ML models):**
```bash
python setup_complete.py
```

**OR** Manual setup:

```bash
# Install dependencies
pip install -r requirements.txt

# Download ML models (IMPORTANT - prevents runtime downloads)
python download_models.py
```

3. **Test the setup:**
```bash
python test_ml_setup.py
```

## 🎯 Run the Server

**Recommended - Optimized startup:**
```bash
# Make sure virtual environment is activated
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Start with optimized loading
python start_optimized.py
```

**Alternative - Regular startup:**
```bash
python app.py
```

Server will start on `http://localhost:5000`

## ✅ What You Should See

**Successful startup:**
```
🚀 Starting Python ML Resume Analysis Service...
🔒 Offline environment configured for ML models
🔄 Pre-loading ML services...
📂 Loading model from local cache: [cache_path]
✅ Model loaded successfully!
✅ ML services initialized successfully!
🎯 Models are cached and ready for fast inference
🎉 Startup complete! Starting Flask server...
```

**If you see timeouts/retries:** Run `python download_models.py` again.

## 🔧 Important Notes

⚠️ **First-time setup**: The ML models (~438MB) are downloaded separately from the Python packages. Always run the setup scripts to avoid delays during runtime.

✅ **Model caching**: Once downloaded, models load instantly from local cache with no network calls.

🔒 **Offline mode**: The service is configured to work completely offline after initial setup.

## 📋 Troubleshooting

**Issue**: Models not loading, network timeouts
**Solution**: 
```bash
python download_models.py
python test_ml_setup.py
```

**Issue**: "No sentence-transformers model found"
**Solution**: Delete cache and re-download:
```bash
# Delete cache directory
rm -rf ~/.cache/huggingface  # Linux/Mac
# or manually delete C:\Users\[user]\.cache\huggingface on Windows

# Re-download
python download_models.py
```

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
