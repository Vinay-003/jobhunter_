#!/usr/bin/env python3
"""
Pre-download ML models to avoid downloading during runtime
Run this once after installing requirements.txt
"""

import os
from sentence_transformers import SentenceTransformer

def download_models():
    """Download and cache the required models"""
    print("📥 Downloading ML models for caching...")
    
    # Download the main model used by the application
    model_name = 'all-mpnet-base-v2'
    print(f"Downloading {model_name}...")
    
    try:
        # This will download and cache the model
        model = SentenceTransformer(model_name)
        print(f"✅ Successfully downloaded and cached {model_name}")
        
        # Test the model to ensure it works
        test_texts = ["This is a test sentence.", "This is another test."]
        embeddings = model.encode(test_texts)
        print(f"✅ Model test successful - generated embeddings of shape: {embeddings.shape}")
        
        # Show cache location
        import torch
        cache_dir = torch.hub.get_dir()
        print(f"📍 Models cached in Hugging Face cache directory")
        
        # Test offline loading
        print("\n🔒 Testing offline configuration...")
        from offline_config import setup_offline_environment
        setup_offline_environment()
        
        # Try loading model again in offline mode
        model_offline = SentenceTransformer(model_name)
        test_embeddings = model_offline.encode(["Offline test"])
        print(f"✅ Offline mode works - embeddings shape: {test_embeddings.shape}")
        
    except Exception as e:
        print(f"❌ Error downloading model: {e}")
        return False
    
    print("🎉 All models downloaded successfully!")
    print("💡 Your Flask server will now start much faster!")
    print("🔒 Offline mode configured to prevent network timeouts!")
    return True

if __name__ == "__main__":
    download_models()