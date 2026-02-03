# Resume ATS & Job Recommendation System

This project is split into **two independent services**:
- **TypeScript Backend (Bun + Express)** - Authentication, database, resume uploads, job search/recommendations
- **Python Service (Flask)** - PDF text extraction and resume analysis

## Quick Start

### Run Services Separately

**Terminal 1 - Python Service (Port 5000):**
```bash
cd backend/python
python3 -m venv venv
source venv/bin/activate  # On Linux/Mac
pip install -r requirements.txt
python app.py
```

**Terminal 2 - TypeScript Backend (Port 3001):**
```bash
cd backend
bun run dev
```

## Manual Setup

### Python Service (Port 5000)

```bash
cd backend/python

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Linux/Mac

# Install dependencies
pip install -r requirements.txt

# Run server
python app.py
```

### TypeScript Service (Port 3001)

```bash
cd backend

# Install dependencies
bun install

# Set up environment variables
# Create backend/.env (see example below)

# Run server
bun run dev
```

## Environment Variables

Create `backend/.env`:

```env
# Database (use one of these connection strings)
PG_DATABASE_STRING=your_database_connection_string
# DATABASE_URL=your_database_connection_string
# SUPABASE_DB_URL=your_database_connection_string
PG_SSL=true

# Auth
JWT_SECRET=your_secret_key

# Server
PORT=3001
NODE_ENV=development

# Python Service URL (from backend to Python service)
PYTHON_SERVICE_URL=http://localhost:5000

# Job API
JOOBLE_API_KEY=your_jooble_api_key
```

> Note: The backend exits on startup if no database connection string is provided.

## Database Setup

Run the migration to create required tables:

```bash
cd backend
bun run migrate
```

## API Endpoints

### TypeScript Backend (http://localhost:3001)
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/upload-resume` - Upload resume
- `GET /api/latest-resume` - Fetch latest resume
- `GET /api/resume/:id` - Download resume by ID
- `POST /api/analyze` - Analyze latest resume
- `POST /api/analyze/:id` - Analyze resume by ID
- `POST /api/jobs/search` - Search jobs (Jooble)
- `POST /api/jobs/refresh` - Refresh jobs from Jooble
- `GET /api/jobs` - Get jobs from database
- `GET /api/jobs/recommendations` - Get job recommendations
- `GET /health` - Health check

### Python Service (http://localhost:5000) - Core
- `GET /health` - Health check
- `POST /api/extract-text` - Extract text from PDF
- `POST /api/analyze-text` - Analyze resume text
- `POST /api/analyze-pdf` - Complete analysis pipeline

### Python Service (http://localhost:5000) - ML
- `POST /api/ml/analyze-text` - Analyze resume text (ML)
- `POST /api/ml/analyze-pdf` - Complete analysis pipeline (ML)
- `POST /api/ml/match-job` - Match resume to a job (ML)
- `POST /api/ml/batch-match-jobs` - Batch match jobs (ML)

## Architecture

```
TypeScript Backend (3001)
    ↓ HTTP Request
Python Service (5000)
    ↓ PDF Extraction & Analysis
TypeScript Backend (3001)
    ↓ Response to Client
```

**Benefits:**
- ✅ Complete separation of Python and JavaScript
- ✅ Can scale services independently
- ✅ Can deploy on different servers/containers
- ✅ Easy to maintain and debug
- ✅ No child process management

## Frontend

```bash
cd frontend/project

# Install dependencies
bun install

# Run development server
bun run dev
```

## Documentation

- [Backend README](backend/README.md)
- [Python Service README](backend/python/README.md)
See `docs/` for architecture/design references and additional notes.
