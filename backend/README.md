# Backend (TypeScript + Bun)

Resume ATS and Job Recommendation System backend service.

## Setup

```bash
bun install
```

## Environment

Create `backend/.env` with the following variables:

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

> The server exits on startup if no database connection string is provided.

## Run

```bash
bun run dev
```

## Database Migration

```bash
bun run migrate
```
