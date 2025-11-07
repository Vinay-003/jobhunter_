#!/usr/bin/env python3
"""
Optimized startup script for Python ML service
- Sets offline environment
- Pre-loads models once at startup
- Faster subsequent requests
"""

import os
import sys
from offline_config import setup_offline_environment

def startup_check():
    """Perform startup checks and optimizations"""
    print("🚀 Starting Python ML Resume Analysis Service...")
    
    # 1. Setup offline environment
    setup_offline_environment()
    
    # 2. Check if models are cached
    cache_dir = os.path.expanduser('~/.cache/huggingface/hub')
    model_dir = os.path.join(cache_dir, 'models--sentence-transformers--all-mpnet-base-v2')
    
    if not os.path.exists(model_dir):
        print("⚠️  Models not found in cache. Run 'python download_models.py' first!")
        print(f"   Looking for models in: {model_dir}")
        return False
    
    # 3. Pre-load ML services (this initializes singleton instances)
    try:
        print("🔄 Pre-loading ML services...")
        from resume_analyzer_ml import get_analyzer
        from job_matcher_ml import get_matcher
        
        # Initialize singletons
        analyzer = get_analyzer()
        matcher = get_matcher()
        
        if analyzer.model is not None and matcher.model is not None:
            print("✅ ML services initialized successfully!")
            print("🎯 Models are cached and ready for fast inference")
            return True
        else:
            print("⚠️  Models failed to load - falling back to rule-based analysis")
            return True  # Still continue, just without ML
            
    except Exception as e:
        print(f"❌ Error during startup: {e}")
        return False

if __name__ == "__main__":
    if startup_check():
        print("🎉 Startup complete! Starting Flask server...")
        # Import and run the main app
        from app import app
        app.run(debug=True, host='0.0.0.0', port=5000)
    else:
        print("❌ Startup failed. Please fix the issues above.")
        sys.exit(1)