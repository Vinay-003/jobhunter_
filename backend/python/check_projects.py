from resume_analyzer_ml import ResumeAnalyzerML
import json

analyzer = ResumeAnalyzerML()

# Read the resume text from test file
with open('test_enhanced_parsing.py', 'r', encoding='utf-8') as f:
    content = f.read()
    resume_text = content.split('resume_text = """')[1].split('"""')[0]

result = analyzer.analyze_resume(resume_text)
projects = result['extractedInfo'].get('projects', [])

print(f"Projects found: {len(projects)}")
print(json.dumps(projects, indent=2))
