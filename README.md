````markdown
# Resume ATS & Job Recommendation System

This project is split into **two independent services**:
- **TypeScript Backend** (Node.js/Bun) - Authentication, database, file uploads
- **Python Service** - PDF text extraction and resume analysis

## Quick Start

### Option 1: Run Both Services Together

```bash
cd backend
chmod +x start-all.sh
./start-all.sh
```

### Option 2: Run Services Separately

**Terminal 1 - Python Service:**
```bash
cd backend
chmod +x start-python.sh
./start-python.sh
```

**Terminal 2 - TypeScript Service:**
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
cp .env.example .env  # Edit .env with your config

# Run server
bun run dev
```

## Environment Variables

Create `backend/.env`:

```env
# TypeScript Backend
PORT=3001
DATABASE_URL=your_database_connection_string
JWT_SECRET=your_secret_key
NODE_ENV=development

# Python Service URL
PYTHON_SERVICE_URL=http://localhost:5000
```

## API Endpoints

### TypeScript Backend (http://localhost:3001)
- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `POST /api/upload-resume` - Upload resume
- `POST /api/analyze` - Analyze resume (calls Python service)
- `GET /api/jobs` - Get jobs
- `GET /api/jobs/recommendations` - Get job recommendations

### Python Service (http://localhost:5000)
- `GET /health` - Health check
- `POST /api/extract-text` - Extract text from PDF
- `POST /api/analyze-text` - Analyze resume text
- `POST /api/analyze-pdf` - Complete analysis pipeline

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
- [Analysis API Documentation](backend/ANALYSIS_API.md)
- [Supabase Setup](backend/SUPABASE_SETUP.md)
````