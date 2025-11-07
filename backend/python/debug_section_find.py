from resume_analyzer_ml import ResumeAnalyzerML
import re

# Read the resume text from test file
with open('test_enhanced_parsing.py', 'r', encoding='utf-8') as f:
    content = f.read()
    resume_text = content.split('resume_text = """')[1].split('"""')[0]

print("=" * 80)
print("Searching for Projects section...")
print("=" * 80)

text_lower = resume_text.lower()

project_keywords = ['projects', 'portfolio', 'work samples', 'key projects', 'personal projects']
for keyword in project_keywords:
    pattern = r'\b' + keyword + r'\b'
    match = re.search(pattern, text_lower)
    if match:
        print(f"\n✓ Found '{keyword}' at position {match.start()}")
        # Show context
        start = max(0, match.start() - 20)
        end = min(len(resume_text), match.start() + 100)
        context = resume_text[start:end]
        print(f"Context: {repr(context)}")
        break
else:
    print("\n❌ No projects section found!")
    
# Check if word "projects" appears at all
if 'projects' in text_lower:
    print(f"\n'projects' found in text (case insensitive)")
    # Find all occurrences
    import re
    matches = list(re.finditer(r'projects', text_lower))
    for m in matches:
        start = max(0, m.start() - 10)
        end = min(len(resume_text), m.start() + 30)
        print(f"  At {m.start()}: {repr(resume_text[start:end])}")
