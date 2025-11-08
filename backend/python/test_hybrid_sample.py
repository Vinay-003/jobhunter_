#!/usr/bin/env python3
"""
Test the new hybrid ATS scoring system with sample resume text
"""

from resume_analyzer_ml import ResumeAnalyzerML

def test_hybrid_scoring():
    # Sample resume text based on typical format
    sample_text = """
DEVYASH SHARMA
Email: devyash@example.com | Phone: +91-1234567890 | Location: Bangalore, India
LinkedIn: devyash-sharma | GitHub: devyash

PROFESSIONAL SUMMARY
Software Engineer with 3+ years of experience in full-stack development, specializing in scalable web applications and cloud infrastructure. Seeking to leverage expertise in React, Node.js, and AWS to drive innovation.

WORK EXPERIENCE

Senior Software Engineer
Tech Corp Inc.
January 2022 - Present
• Led development of microservices architecture serving 1M+ users, reducing latency by 40%
• Managed team of 5 engineers, implementing Agile practices that improved delivery speed by 30%
• Architected AWS infrastructure reducing costs by $50K annually
• Implemented CI/CD pipelines increasing deployment frequency by 200%

Software Engineer
Innovation Labs
June 2020 - December 2021
• Developed RESTful APIs processing 10K requests/second with 99.9% uptime
• Optimized database queries reducing response time by 60%
• Collaborated with cross-functional teams to deliver 15+ features

Junior Developer
StartupCo
January 2020 - May 2020
• Built responsive web applications using React and TypeScript
• Participated in code reviews and improved code quality by 25%

PROJECTS

E-Commerce Platform
Built scalable online shopping platform using MERN stack serving 50K users
Implemented payment integration with Stripe and real-time notifications
Technologies: React, Node.js, MongoDB, Redis, AWS

Real-Time Chat Application
Developed WebSocket-based chat app with end-to-end encryption
Achieved sub-100ms message delivery latency
Technologies: Socket.io, Express, PostgreSQL

Open Source Contributions
Contributed to popular GitHub projects with 10+ merged PRs
Maintained personal library with 500+ stars on GitHub

Portfolio Website
Created personal portfolio using Next.js and Tailwind CSS
Implemented SEO optimization achieving 95+ Lighthouse score
Technologies: Next.js, TypeScript, Vercel

Cloud Infrastructure Tool
Built CLI tool for automating AWS deployments
Reduced deployment time from 30 minutes to 5 minutes
Technologies: Python, Boto3, Docker

ML Model Deployment
Deployed machine learning models using FastAPI and Docker
Achieved 99% accuracy on test dataset
Technologies: Python, TensorFlow, Kubernetes

SKILLS
Languages: JavaScript, TypeScript, Python, Java, SQL, HTML, CSS
Frameworks: React, Node.js, Express, Next.js, FastAPI, Django
Databases: PostgreSQL, MongoDB, Redis, MySQL
Cloud: AWS, Google Cloud, Azure, Docker, Kubernetes
Tools: Git, Jenkins, Jira, Webpack, Jest, Pytest
Soft Skills: Leadership, Team Management, Agile, Problem Solving

EDUCATION

Bachelor of Technology in Computer Science
University of Technology, Bangalore
August 2016 - May 2020
CGPA: 8.5/10
Relevant Coursework: Data Structures, Algorithms, Database Systems, Cloud Computing
"""

    analyzer = ResumeAnalyzerML()
    result = analyzer.analyze_resume(sample_text, target_level='mid')
    
    print("=" * 60)
    print("HYBRID ATS SCORING TEST - Sample Resume")
    print("=" * 60)
    print(f"Score: {result['score']}/100")
    print(f"Status: {result['status']}")
    print()
    
    print("CATEGORY SCORES:")
    category_scores = result['scoreBreakdown']['category_scores']
    for category, score in category_scores.items():
        print(f"  {category.replace('_', ' ').title()}: {score}")
    
    print()
    print("DETAILED BREAKDOWN:")
    breakdown = result['scoreBreakdown']
    print(f"  ML Semantic: {breakdown.get('ml_semantic_score', 0)}/20")
    print(f"  Formatting Total: {breakdown.get('formatting_total', 0)}/28")
    print(f"    - File Type: {breakdown.get('file_type_score', 0)}/5")
    print(f"    - Layout: {breakdown.get('layout_score', 0)}/6")
    print(f"    - Sections: {breakdown.get('sections_score', 0)}/5")
    print(f"    - Date Consistency: {breakdown.get('date_consistency_score', 0)}/4")
    print(f"    - Contact Info: {breakdown.get('contact_info_score', 0)}/3")
    print(f"    - Bullet Density: {breakdown.get('bullet_density_score', 0)}/5")
    print(f"  Content Total: {breakdown.get('content_total', 0)}/24")
    print(f"    - Summary: {breakdown.get('summary_score', 0)}/5")
    print(f"    - Skills Clarity: {breakdown.get('skills_clarity_score', 0)}/6")
    print(f"    - Experience Completeness: {breakdown.get('experience_completeness_score', 0)}/8")
    print(f"    - Projects Detail: {breakdown.get('projects_detail_score', 0)}/5")
    print(f"  Skills & Keywords Total: {breakdown.get('skills_keywords_total', 0)}/18")
    print(f"    - Hard Skills: {breakdown.get('hard_skills_score', 0)}/8")
    print(f"    - Action Verbs: {breakdown.get('action_verbs_score', 0)}/5")
    print(f"    - Quantification: {breakdown.get('quantification_score', 0)}/5")
    print(f"  Education Total: {breakdown.get('education_total', 0)}/10")
    print(f"  Language Total: {breakdown.get('language_total', 0)}/8")
    print(f"    - Grammar: {breakdown.get('grammar_score', 0)}/5")
    print(f"    - Tone: {breakdown.get('tone_score', 0)}/3")
    print(f"  Length: {breakdown.get('length_score', 0)}/2")
    print()
    print(f"  Bonuses: +{breakdown.get('total_bonuses', 0)}")
    if breakdown.get('tailoring_bonus'):
        print(f"    - Tailoring: +{breakdown.get('tailoring_bonus', 0)}")
    if breakdown.get('leadership_bonus'):
        print(f"    - Leadership: +{breakdown.get('leadership_bonus', 0)}")
    if breakdown.get('oss_bonus'):
        print(f"    - OSS: +{breakdown.get('oss_bonus', 0)}")
    print()
    print(f"  Penalties: {breakdown.get('total_penalties', 0)}")
    if breakdown.get('file_type_penalty'):
        print(f"    - File Type: {breakdown.get('file_type_penalty', 0)}")
    if breakdown.get('contact_penalty'):
        print(f"    - Contact: {breakdown.get('contact_penalty', 0)}")
    if breakdown.get('dates_penalty'):
        print(f"    - Dates: {breakdown.get('dates_penalty', 0)}")
    
    print()
    print("=" * 60)
    print()
    
    # Show metrics
    print("EXTRACTED METRICS:")
    metrics = result['metrics']
    print(f"  Word Count: {metrics['wordCount']}")
    print(f"  Total Bullets: {metrics['totalBullets']}")
    print(f"  Quantified Bullets: {metrics['quantifiableMetrics']}")
    print(f"  Skills Found: {metrics['skillsFound']}")
    print(f"  Action Verbs: {metrics['actionVerbs']}")
    print()
    
    # Show recommendations
    print("TOP 3 RECOMMENDATIONS:")
    for i, rec in enumerate(result['recommendations'][:3], 1):
        print(f"  {i}. {rec}")
    
    print()
    print("EXTRACTED INFO:")
    info = result['extractedInfo']
    print(f"  Name: {info.get('name', 'Not found')}")
    print(f"  Email: {info.get('email', 'Not found')}")
    print(f"  Phone: {info.get('phone', 'Not found')}")
    print(f"  LinkedIn: {info.get('linkedin', 'Not found')}")
    print(f"  GitHub: {info.get('github', 'Not found')}")
    print(f"  Work Experience: {len(info.get('work_experience', []))} roles")
    print(f"  Projects: {len(info.get('projects', []))} projects")
    print(f"  Education: {len(info.get('education', []))} degrees")
    
    return result

if __name__ == '__main__':
    test_hybrid_scoring()
