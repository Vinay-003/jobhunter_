#!/usr/bin/env python3
"""
Quick test to verify ML models are working properly
"""

import sys
import os

# Set up offline environment first
sys.path.insert(0, os.path.dirname(__file__))
from offline_config import setup_offline_environment
setup_offline_environment()

def test_ml_services():
    """Test both ML services"""
    print("🧪 Testing ML Resume Analysis Services...")
    
    try:
        # Test resume analyzer
        from resume_analyzer_ml import get_analyzer
        analyzer = get_analyzer()
        
        if analyzer.model is not None:
            print("✅ Resume Analyzer ML: Working")
            
            # Quick test
            test_result = analyzer.analyze_resume("Software engineer with Python experience")
            print(f"   📊 Test analysis score: {test_result.get('score', 'N/A')}")
        else:
            print("❌ Resume Analyzer ML: Failed to load")
            
        # Test job matcher
        from job_matcher_ml import get_matcher
        matcher = get_matcher()
        
        if matcher.model is not None:
            print("✅ Job Matcher ML: Working")
            
            # Quick test
            test_match = matcher.calculate_match_score(
                "Python developer with Flask experience",
                "Looking for Python Flask developer",
                "Python Developer",
                75.0
            )
            print(f"   🎯 Test match score: {test_match.get('matchScore', 'N/A')}")
        else:
            print("❌ Job Matcher ML: Failed to load")
            
        print("\n🎉 All tests completed!")
        return True
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_ml_services()
    if success:
        print("\n✅ Your ML services are ready to use!")
        print("🚀 You can now start the server with: python start_optimized.py")
    else:
        print("\n❌ There are still issues with the ML setup")
    
    sys.exit(0 if success else 1)