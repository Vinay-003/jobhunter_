#!/bin/bash

# Start only the Python service
echo "🐍 Starting Python Resume Analysis Service..."

cd "$(dirname "$0")/python"

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Start Flask server
echo ""
echo "Starting server on http://localhost:5000..."
python app.py
