# 🚀 How to Run Your Separate Python & TypeScript Services

## ✅ What I've Set Up For You

Your project now has **two completely independent services**:

### 1. **Python Service** (Flask) - Port 5000
   - Handles PDF text extraction
   - Performs resume analysis
   - Returns ATS scores and recommendations
   - **Location:** `backend/python/app.py`

### 2. **TypeScript Service** (Bun/Express) - Port 3001
   - Handles authentication
   - Manages database
   - File uploads
   - Makes HTTP requests to Python service
   - **Location:** `backend/src/server.ts`

---

## 🎯 Option 1: Quick Start (Run Both Together)

Open a terminal and run:

```bash
cd /home/mylappy/Desktop/designproject/resume/backend
./start-all.sh
```

This will:
- Create Python virtual environment (if needed)
- Install Python dependencies
- Start Python service on port 5000
- Start TypeScript service on port 3001

---

## 🎯 Option 2: Run Services Separately (Recommended for Development)

### Terminal 1 - Start Python Service

```bash
cd /home/mylappy/Desktop/designproject/resume/backend
./start-python.sh
```

You'll see:
```
🐍 Starting Python Resume Analysis Service...
Creating virtual environment...
Installing dependencies...
Starting server on http://localhost:5000...
```

### Terminal 2 - Start TypeScript Service

```bash
cd /home/mylappy/Desktop/designproject/resume/backend
bun run dev
```

You'll see:
```
🚀 Server is running on http://localhost:3001
```

---

## 📋 First Time Setup (Do This Once)

### 1. Update Your TypeScript Service

Replace the old analysis service with the new HTTP-based one:

```bash
cd /home/mylappy/Desktop/designproject/resume/backend
mv src/services/analysisService.ts src/services/analysisService.old.ts
mv src/services/analysisService.new.ts src/services/analysisService.ts
```

### 2. Update Your Environment File

Add this to `backend/.env`:

```env
PYTHON_SERVICE_URL=http://localhost:5000
```

### 3. Install Python Dependencies (First Time)

```bash
cd backend/python
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

---

## 🧪 Test the Services

### Test Python Service:

```bash
# Health check
curl http://localhost:5000/health

# Test with a sample text
curl -X POST http://localhost:5000/api/analyze-text \
  -H "Content-Type: application/json" \
  -d '{"text": "Software Engineer with 5 years of experience. Developed web applications using React and Node.js. Increased performance by 40%."}'
```

### Test TypeScript Service:

```bash
curl http://localhost:3001/health
```

---

## 📁 Project Structure

```
backend/
├── python/                          # 🐍 PYTHON SERVICE
│   ├── app.py                      # Flask server (NEW!)
│   ├── requirements.txt            # Python dependencies (NEW!)
│   ├── README.md                   # Python docs (NEW!)
│   ├── pdf_text_extract.py         # PDF extraction
│   ├── resume_analyzer.py          # Resume analysis
│   └── venv/                       # Virtual environment (auto-created)
│
├── src/                            # 📘 TYPESCRIPT SERVICE
│   ├── server.ts                   # Express server
│   ├── services/
│   │   ├── analysisService.ts      # HTTP client to Python (UPDATED!)
│   │   └── ...
│   └── ...
│
├── start-all.sh                    # Start both services (NEW!)
├── start-python.sh                 # Start Python only (NEW!)
└── .env                            # Environment config
```

---

## 🌐 How They Communicate

```
User Request
    ↓
TypeScript Backend :3001
    ↓ HTTP POST
Python Service :5000
    ↓ (Extract PDF + Analyze)
Python Service :5000
    ↓ JSON Response
TypeScript Backend :3001
    ↓
User Response
```

**No child processes, no mixing Python and JS!** ✨

---

## 🛠️ Development Workflow

1. **Start Python service** in Terminal 1
   ```bash
   ./start-python.sh
   ```

2. **Start TypeScript service** in Terminal 2
   ```bash
   bun run dev
   ```

3. **Make changes:**
   - Python changes: Service auto-reloads (Flask debug mode)
   - TypeScript changes: Just save, Bun auto-reloads

4. **Stop services:**
   - Press `Ctrl+C` in each terminal

---

## ❓ Troubleshooting

### "Python service is not running"
- Make sure Python service is started first
- Check if port 5000 is available: `lsof -i :5000`

### "Import flask could not be resolved"
- This is just a VS Code warning
- Run: `source backend/python/venv/bin/activate` in terminal
- Or select Python interpreter: Ctrl+Shift+P → "Python: Select Interpreter" → Choose `venv`

### Services can't communicate
- Check both are running
- Verify `PYTHON_SERVICE_URL=http://localhost:5000` in `.env`
- Test Python service: `curl http://localhost:5000/health`

---

## 🎉 Benefits of This Architecture

✅ **Complete Separation** - No mixing of Python and JavaScript  
✅ **Independent Scaling** - Scale services separately  
✅ **Easy Debugging** - Check each service independently  
✅ **Clean Code** - No child process management  
✅ **Production Ready** - Can deploy on different servers  
✅ **Technology Independence** - Use best tools for each task

---

Ready to run? Execute:
```bash
cd /home/mylappy/Desktop/designproject/resume/backend
./start-python.sh
```

Then in another terminal:
```bash
cd /home/mylappy/Desktop/designproject/resume/backend
bun run dev
```
