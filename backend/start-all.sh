#!/bin/bash

# Start Python Service
echo "🐍 Starting Python Service..."
cd backend/python

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install -q -r requirements.txt

# Start Python service in background
echo "Starting Python Flask server on port 5000..."
python app.py &
PYTHON_PID=$!

# Wait for Python service to start
sleep 3

# Go back to backend root
cd ..

# Start TypeScript Service
echo ""
echo "🚀 Starting TypeScript Service..."
bun run dev &
TYPESCRIPT_PID=$!

echo ""
echo "✅ Both services are running!"
echo "   Python Service: http://localhost:5000"
echo "   TypeScript Service: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both services"

# Wait for user interrupt
trap "kill $PYTHON_PID $TYPESCRIPT_PID; exit" INT
wait
