# resume_analyzer.py
# Analyzes resume text and provides ATS score and recommendations

import sys
import json
import re
import os

def analyze_resume(text):
    """Analyze resume text and provide ATS score and recommendations.
    
    Args:
        text (str): Extracted text from resume
        
    Returns:
        dict: Analysis results with score, insights, and recommendations
    """
    if not text or not text.strip():
        return {
            "success": False,
            "error": "No text provided for analysis"
        }
    
    text_lower = text.lower()
    
    # Basic ATS scoring factors
    score = 0
    insights = []
    recommendations = []
    
    # Check 1: Resume length (good resumes are 1-2 pages worth of text)
    word_count = len(text.split())
    if 400 <= word_count <= 800:
        score += 20
        insights.append("Good resume length - optimal for ATS parsing")
    elif word_count < 400:
        score += 10
        recommendations.append("Consider adding more detail to your resume (aim for 400-800 words)")
    else:
        score += 15
        recommendations.append("Resume may be too long - consider condensing to 2 pages")
    
    # Check 2: Contact information
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    phone_pattern = r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
    
    has_email = bool(re.search(email_pattern, text))
    has_phone = bool(re.search(phone_pattern, text))
    
    if has_email and has_phone:
        score += 15
        insights.append("Contact information present (email and phone)")
    elif has_email or has_phone:
        score += 8
        recommendations.append("Ensure both email and phone number are included")
    else:
        recommendations.append("Missing contact information - add email and phone number")
    
    # Check 3: Key sections
    sections = {
        "experience": ["experience", "work history", "employment", "professional experience"],
        "education": ["education", "academic", "qualifications", "degree"],
        "skills": ["skills", "technical skills", "competencies", "abilities"],
        "summary": ["summary", "objective", "profile", "about"]
    }
    
    found_sections = []
    for section, keywords in sections.items():
        if any(keyword in text_lower for keyword in keywords):
            found_sections.append(section)
    
    section_score = (len(found_sections) / len(sections)) * 25
    score += section_score
    
    if len(found_sections) == len(sections):
        insights.append("All key sections present (Experience, Education, Skills, Summary)")
    elif len(found_sections) >= 3:
        missing = [s for s in sections.keys() if s not in found_sections]
        recommendations.append(f"Consider adding: {', '.join(missing).title()} section")
    else:
        recommendations.append("Add more sections: Experience, Education, Skills, and Summary")
    
    # Check 4: Action verbs and quantifiable achievements
    action_verbs = ["achieved", "improved", "developed", "implemented", "managed", "created", 
                    "increased", "reduced", "led", "designed", "built", "optimized"]
    numbers = re.findall(r'\b\d+[%$,kmKM]?\b', text)
    
    action_verb_count = sum(1 for verb in action_verbs if verb in text_lower)
    if action_verb_count >= 5:
        score += 15
        insights.append("Good use of action verbs to describe achievements")
    elif action_verb_count >= 3:
        score += 10
        recommendations.append("Use more action verbs to strengthen your accomplishments")
    else:
        recommendations.append("Add more action verbs (achieved, improved, developed, etc.)")
    
    if len(numbers) >= 3:
        score += 15
        insights.append("Quantifiable achievements present - great for ATS")
    elif len(numbers) >= 1:
        score += 8
        recommendations.append("Add more quantifiable metrics (percentages, numbers, dollar amounts)")
    else:
        recommendations.append("Include quantifiable achievements (numbers, percentages, metrics)")
    
    # Check 5: Keywords (common resume keywords)
    common_keywords = ["leadership", "communication", "problem solving", "team", "project", 
                      "analysis", "collaboration", "innovation", "strategy", "management"]
    keyword_count = sum(1 for keyword in common_keywords if keyword in text_lower)
    
    keyword_score = min(keyword_count * 2, 15)
    score += keyword_score
    
    if keyword_count >= 5:
        insights.append("Good keyword usage for ATS optimization")
    elif keyword_count >= 3:
        recommendations.append("Consider adding more relevant keywords from your industry")
    
    # Ensure score is between 0-100
    score = min(100, max(0, score))
    
    # Determine status
    if score >= 80:
        status = "excellent"
        status_message = "Your resume is well-optimized for ATS systems"
    elif score >= 60:
        status = "good"
        status_message = "Your resume is good, with room for improvement"
    elif score >= 40:
        status = "fair"
        status_message = "Your resume needs significant improvements for ATS"
    else:
        status = "poor"
        status_message = "Your resume requires major improvements"
    
    return {
        "success": True,
        "score": round(score, 1),
        "status": status,
        "statusMessage": status_message,
        "insights": insights,
        "recommendations": recommendations,
        "metrics": {
            "wordCount": word_count,
            "sectionsFound": len(found_sections),
            "actionVerbs": action_verb_count,
            "quantifiableMetrics": len(numbers),
            "keywordsUsed": keyword_count
        }
    }

if __name__ == "__main__":
    # CLI usage: python resume_analyzer.py <text_or_file_path>
    if len(sys.argv) < 2:
        result = {"success": False, "error": "Usage: python resume_analyzer.py <text_or_file_path>"}
        print(json.dumps(result))
        sys.exit(1)
    
    input_arg = sys.argv[1]
    
    # Check if input is a file path
    if os.path.exists(input_arg) and os.path.isfile(input_arg):
        # Read text from file
        try:
            with open(input_arg, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception as e:
            result = {"success": False, "error": f"Failed to read file: {str(e)}"}
            print(json.dumps(result))
            sys.exit(1)
    else:
        # Treat as direct text input
        text = input_arg
    
    result = analyze_resume(text)
    print(json.dumps(result))

