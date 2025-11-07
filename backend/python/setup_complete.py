#!/usr/bin/env python3
"""
Complete setup script for ML Resume Analyzer
Run this after installing requirements.txt to set up everything
"""

import os
import sys
import subprocess
from pathlib import Path

def run_command(command, description):
    """Run a shell command and print status"""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        if e.stdout:
            print(f"stdout: {e.stdout}")
        if e.stderr:
            print(f"stderr: {e.stderr}")
        return False

def setup_environment():
    """Set up the complete Python environment"""
    print("🚀 Setting up ML Resume Analyzer Environment\n")
    
    # Check if we're in a virtual environment
    if sys.prefix == sys.base_prefix:
        print("⚠️  Warning: Not running in a virtual environment!")
        print("   Consider running: python -m venv venv && venv\\Scripts\\activate")
        print()
    
    # Install/upgrade pip
    if not run_command("python -m pip install --upgrade pip", "Upgrading pip"):
        return False
    
    # Install requirements
    if not run_command("pip install -r requirements.txt", "Installing Python packages"):
        return False
    
    # Download NLTK data
    print("🔄 Downloading NLTK data...")
    try:
        import nltk
        nltk.download('punkt', quiet=True)
        nltk.download('stopwords', quiet=True)
        nltk.download('wordnet', quiet=True)
        print("✅ NLTK data downloaded successfully")
    except Exception as e:
        print(f"⚠️  NLTK download warning: {e}")
    
    # Download ML models
    print("🔄 Pre-downloading ML models...")
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer('all-mpnet-base-v2')
        test_embeddings = model.encode(["test"])
        print("✅ ML models cached successfully")
    except Exception as e:
        print(f"❌ ML model setup failed: {e}")
        return False
    
    # Create necessary directories
    upload_dir = Path("../uploads/temp")
    upload_dir.mkdir(parents=True, exist_ok=True)
    print(f"✅ Created upload directory: {upload_dir.absolute()}")
    
    print("\n🎉 Setup completed successfully!")
    print("\n📝 Next steps:")
    print("   1. Start the Python server: python app.py")
    print("   2. Start the TypeScript backend: cd ../src && npm start")
    print("   3. Start the frontend: cd ../../frontend/project && npm run dev")
    
    return True

if __name__ == "__main__":
    if setup_environment():
        sys.exit(0)
    else:
        print("\n❌ Setup failed. Please check the errors above.")
        sys.exit(1)