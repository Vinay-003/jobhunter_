"""
Test script to verify enhanced resume parsing
"""
import json
from resume_analyzer_ml import ResumeAnalyzerML

# Your resume text
resume_text = """
Vaibhav Sharma
 vaibhav-123-4
 Third Year B.Tech | Computer Science | IIIT Vadodara
 202351154@iiitvadodara.ac.in
 EDUCATION
 (+91) 8168762007
 IIIT VADODARA,CSE
 Undergrad
 Gandhinagar, Gujarat
 WORKEXPERIENCE
 IIITV Finance And Consulting Club
 Sept. 2023- Aug 2027- Secretary: Managed internal communications, documentation, and
 scheduling, enhancing team coordination and contributing to improvement in operational 
 efficiency and event execution.
 SUMMARY
 Computer science undergraduate at IIIT Vadodara with experience in full stack development, 
 machine learning, and financial engineering. Proficient in Java, C++, and JavaScript. 
 Developed projects like Rusticle and StockForesight, demonstrating strong problem solving 
 and analytical skills. Experienced in leadership and event management with a proven 
 ability to boost engagement and visibility.
 Projects
 Rusticle
 Interpreter Design | Rust
 Github, vaibhav-123-4/rusticle
 - A Custom Language Interpreter in Rust for new Lin Language
 - Implemented a lexer, parser, and interpreter for executing Lin code.
 - Created a package management system for importing and installing packages.
 - Built a backend service using Actix-web for package distribution
 - Ensured robust error handling and user-friendly error messages.
 - Implemented CI/CD pipeline using GitHub Actions for automated build, test, and deployment.
 
 StockForesight
 Regression Model | Python
 Github, Google Colab
 Multiple linear regression AI stock price prediction system.
 - Developed a multiple linear regression-based AI system for predicting stock prices.
 - Implemented data fetching, cleaning, and visualization techniques using yfinance, pandas, numpy, and plotly.
 - Created an interactive web application with Streamlit for real-time stock price predictions.
 - Built and evaluated custom linear regression models to predict high and low stock prices.
 
 HackThePlots
 Full Stack | Next.Js
 Github, vaibhav-123-4/hacktheplots
 Custom CTF platform for Technical Fest's flagship event - TechHunt.
 - Developed a custom CTF hosting platform tailored for TechHunt using TypeScript, Tailwind and NextJs.
 - Rapidly developed the platform in just three days, ensuring a user-friendly interface.
 - Implemented features such as a real-time scoreboard, progression graphs, and a custom scoring system.
 - Achieved over 50% participant retention till the end of the event.
 
 SKILLS
 - Frontend
 - Backend
 - DSA
 Programming Languages
 - Java
 - C++
 - Python
 - Javascript
 Tools-Frameworks
 - Node.js
 - Express.js
 - Next.js
 - Supabase
 - React
 - MySQL
 - PostgreSQL
 - LangChain
 - Version Control System: Git, Github
 Soft-Skills
 - Leadership | Event Management | Team management | Versatile | Strong Analytical Skills | 
   Trust building | Strong Problem Solving Skills | Time Management | Communication Skills
 Languages
 - English
 - Hindi
 Links
 - Github: vaibhav-123-4
 - LinkedIn: vaibhav123
"""

def main():
    print("=" * 80)
    print("Testing Enhanced Resume Parsing")
    print("=" * 80)
    
    # Initialize analyzer
    analyzer = ResumeAnalyzerML()
    
    # Analyze resume
    print("\n📄 Analyzing resume...\n")
    result = analyzer.analyze_resume(resume_text)
    
    if result.get("success"):
        print("✅ Analysis successful!\n")
        
        # Display extracted information
        extracted = result.get("extractedInfo", {})
        
        print("👤 PERSONAL INFORMATION")
        print("-" * 80)
        print(f"Name: {extracted.get('name', 'Not found')}")
        print(f"Email: {extracted.get('email', 'Not found')}")
        print(f"Phone: {extracted.get('phone', 'Not found')}")
        print(f"Location: {extracted.get('location', 'Not found')}")
        print(f"LinkedIn: {extracted.get('linkedin', 'Not found')}")
        print(f"GitHub: {extracted.get('github', 'Not found')}")
        
        print("\n🎓 EDUCATION")
        print("-" * 80)
        education = extracted.get('education', [])
        if education:
            for edu in education:
                print(f"  • {edu.get('degree', 'N/A')} in {edu.get('field', 'N/A')}")
                print(f"    Institution: {edu.get('institution', 'N/A')}")
                print(f"    Year: {edu.get('graduation_year', 'N/A')}")
        else:
            print("  No education found")
        
        print("\n💼 WORK EXPERIENCE")
        print("-" * 80)
        experience = extracted.get('work_experience', [])
        if experience:
            for exp in experience:
                print(f"  • {exp.get('organization', 'N/A')}")
                print(f"    Duration: {exp.get('duration', 'N/A')}")
                desc = exp.get('description', '')[:100]
                if desc:
                    print(f"    Description: {desc}...")
        else:
            print("  No work experience found")
        
        print("\n🚀 PROJECTS")
        print("-" * 80)
        projects = extracted.get('projects', [])
        if projects:
            for proj in projects:
                print(f"  • {proj.get('name', 'N/A')}")
                print(f"    Technology: {proj.get('technology', 'N/A')}")
                desc = proj.get('description', '')[:100]
                if desc:
                    print(f"    Description: {desc}...")
        else:
            print("  No projects found")
        
        print("\n🛠️ SKILLS")
        print("-" * 80)
        skills = extracted.get('skills', [])
        if skills:
            print(f"  Found {len(skills)} skills:")
            # Group skills for better display
            for i in range(0, len(skills), 5):
                print(f"  {', '.join(skills[i:i+5])}")
        else:
            print("  No skills found")
        
        print("\n📊 ANALYSIS METRICS")
        print("-" * 80)
        metrics = result.get("metrics", {})
        print(f"Word Count: {metrics.get('wordCount', 0)}")
        print(f"Sections Found: {metrics.get('sectionsFound', 0)}")
        print(f"Skills Found: {metrics.get('skillsFound', 0)}")
        print(f"Action Verbs: {metrics.get('actionVerbs', 0)}")
        print(f"Quantifiable Metrics: {metrics.get('quantifiableMetrics', 0)}")
        
        print("\n🎯 EXPERIENCE LEVEL")
        print("-" * 80)
        print(f"Level: {extracted.get('experienceLevel', 'Unknown')}")
        print(f"Years: {extracted.get('yearsOfExperience', 0)}")
        
        print("\n⭐ ATS SCORE")
        print("-" * 80)
        print(f"Score: {result.get('score', 0)}/100")
        print(f"Status: {result.get('status', 'Unknown')}")
        print(f"Message: {result.get('statusMessage', 'N/A')}")
        
        print("\n" + "=" * 80)
        print("Full extractedInfo for debugging:")
        print("=" * 80)
        print(json.dumps(extracted, indent=2))
        
    else:
        print(f"❌ Analysis failed: {result.get('error', 'Unknown error')}")

if __name__ == "__main__":
    main()
