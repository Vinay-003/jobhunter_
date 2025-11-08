#!/usr/bin/env python3
"""
Test the new hybrid ATS scoring system with Devyash resume
"""

from resume_analyzer_ml import ResumeAnalyzerML
from pdf_text_extract import extract_pdf_text

def test_hybrid_scoring():
    # Test with Devyash resume
    pdf_path = '/home/mylappy/Desktop/jobhunter_working/backend/uploads/temp/1762635662945-452825500.pdf'
    text = extract_pdf_text(pdf_path)
    
    analyzer = ResumeAnalyzerML()
    result = analyzer.analyze_resume(text, target_level='mid')
    
    print("=" * 60)
    print("HYBRID ATS SCORING TEST - Devyash Resume")
    print("=" * 60)
    print(f"Previous Score: 65.1/100")
    print(f"New Score: {result['score']}/100")
    print(f"ResumeWorded: 87/100")
    print(f"Gap Reduction: {87 - 65.1:.1f} → {87 - result['score']:.1f}")
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
    
    return result

if __name__ == '__main__':
    test_hybrid_scoring()
