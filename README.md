# Kafka Project

The repository has been reorganized for clarity. Primary apps live under `backend/` and `frontend/project/`. Python utilities for PDF extraction are under `backend/python/`.

## Structure

- `backend/`: Express + TypeScript API
  - `src/`: application source (routes, controllers, models)
  - `uploads/`: user-uploaded files
  - `python/`: PDF utilities (`pdf_text_extract.py`, `tect_to-model.py`)
- `frontend/project/`: Vite + React app

## Development

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend/project
npm install
npm run dev
```

## Python utilities

```bash
cd backend/python
python pdf_text_extract.py
python tect_to-model.py
```