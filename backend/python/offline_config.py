"""
Offline Configuration for ML Models
Sets environment variables to prevent online model checks
"""

import os

def setup_offline_environment():
    """Configure environment for offline ML model usage"""
    
    # Hugging Face offline mode - CRITICAL: Must be set before imports
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['TRANSFORMERS_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_PROGRESS_BARS'] = '1'
    os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'  # Disable Windows symlink warnings
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    
    # Force offline mode for sentence transformers
    os.environ['SENTENCE_TRANSFORMERS_HOME'] = os.path.expanduser('~/.cache/torch/sentence_transformers')
    
    # PyTorch offline settings
    os.environ['TORCH_HOME'] = os.path.expanduser('~/.cache/torch')
    
    # Disable various network checks
    os.environ['DISABLE_TELEMETRY'] = '1'
    os.environ['DO_NOT_TRACK'] = '1'
    
    # CRITICAL: Force huggingface_hub to use local cache only
    os.environ['HF_HUB_CACHE'] = os.path.expanduser('~/.cache/huggingface')
    os.environ['HUGGINGFACE_HUB_CACHE'] = os.path.expanduser('~/.cache/huggingface')
    
    print("🔒 Offline environment configured for ML models")

# IMPORTANT: Set these variables as early as possible
setup_offline_environment()

if __name__ == "__main__":
    print("Environment variables set for offline ML usage")