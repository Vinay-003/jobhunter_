"""Debug projects extraction"""
from resume_analyzer_ml import ResumeAnalyzerML

resume_text = """
 Projects
 Rusticle
 Interpreter Design | Rust
 Github, vaibhav-123-4/rusticle
 - A Custom Language Interpreter in Rust for new Lin Language
 - Implemented a lexer, parser, and interpreter for executing Lin code.
 
 StockForesight
 Regression Model | Python
 Github, Google Colab
 - Developed a multiple linear regression-based AI system.
 - Implemented data fetching, cleaning, and visualization techniques.
 
 HackThePlots
 Full Stack | Next.Js
 Github, vaibhav-123-4/hacktheplots
 - Developed a custom CTF hosting platform tailored for TechHunt.
 - Rapidly developed the platform in just three days.
 
 SKILLS
"""

analyzer = ResumeAnalyzerML()
info = analyzer._extract_resume_info(resume_text)

print("Projects found:", len(info['projects']))
for p in info['projects']:
    print(f"\nProject: {p['name']}")
    print(f"  Tech: {p['technology']}")
    print(f"  Desc: {p['description'][:80]}...")
