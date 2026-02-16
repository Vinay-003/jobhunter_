import unittest

from resume_analyzer_ml import ResumeAnalyzerML


class LightweightAnalyzer(ResumeAnalyzerML):
    def __init__(self):
        # Skip model loading for fast deterministic tests.
        self.model = None
        self.model_name = ""
        self.fallback_model = ""


class ResumeAnalyzerRecommendationTests(unittest.TestCase):
    def setUp(self):
        self.analyzer = LightweightAnalyzer()

    def test_regression_middle_dot_bullets_and_label_links(self):
        text = """
VINAY SAINI
jadamvinay2003@gmail.com | [+91] 8619865958 | Linkedin | Github
SUMMARY
Entry-level software engineer focused on backend systems.
EDUCATION
Indian Institute of Information Technology Vadodara
EXPERIENCE
Editorial Club
January 2024 - January 2025
Joint Secretary
· Led 8 teams in the college magazine's design and content creation.
· Mentored 20+ club members on editing and writing.
PROJECTS
CLIFFY | Python | OpenAI API
· Built a Python CLI that suggests commands while you type.
Resume ATS & Job Recommendation System | TypeScript | Python
· Built a two-service app with Bun/Express and Flask.
SKILLS
Python, TypeScript, React, PostgreSQL
"""
        result = self.analyzer.analyze_resume(text, "entry")

        self.assertTrue(result["success"])
        self.assertGreater(result["metrics"]["totalBullets"], 0)

        recommendations = result["recommendations"]
        self.assertFalse(any("Add LinkedIn profile" in r for r in recommendations))
        self.assertFalse(any("currently 0" in r and "bullet" in r.lower() for r in recommendations))

    def test_missing_links_still_recommended(self):
        text = """
Alex Doe
alex@example.com | +1 222 333 4444
EXPERIENCE
Acme Corp - Intern Jan 2024 - May 2024
- Built internal dashboard features.
PROJECTS
Personal Portfolio | React
- Built portfolio website.
SKILLS
React, TypeScript, Node.js
"""
        result = self.analyzer.analyze_resume(text, "entry")
        recommendations = result["recommendations"]

        self.assertTrue(any("LinkedIn" in r or "GitHub" in r for r in recommendations))

    def test_projects_and_experience_threshold_behavior(self):
        text = """
Pat Lee
pat@example.com | +1 333 444 5555 | linkedin.com/in/patlee
EDUCATION
State University
EXPERIENCE
Startup Inc - Intern Jan 2024 - Present
- Implemented API endpoints for candidate tracking.
PROJECTS
Project One | Python
- Built analytics dashboard.
Project Two | TypeScript
- Built resume scoring feature.
SKILLS
Python, TypeScript, Flask, Express
"""
        result = self.analyzer.analyze_resume(text, "entry")
        recommendations = result["recommendations"]

        # 1 work exp and 2 projects: should suggest adding more, but not critical zero-experience guidance.
        self.assertTrue(any("Add 1-2 more projects" in r for r in recommendations))
        self.assertTrue(any("internships" in r.lower() or "part-time" in r.lower() for r in recommendations))
        self.assertFalse(any("CRITICAL: Add 3-4 projects" in r for r in recommendations))

    def test_summary_recommendation_only_when_absent(self):
        with_summary = """
Sam Kim
sam@example.com | +1 111 222 3333
SUMMARY
Backend developer with internship experience.
EDUCATION
Tech University
EXPERIENCE
Org - Intern Jan 2024 - Apr 2024
- Built services.
PROJECTS
Tooling App | Python
- Automated workflows.
SKILLS
Python, SQL
"""
        without_summary = """
Sam Kim
sam@example.com | +1 111 222 3333
EDUCATION
Tech University
EXPERIENCE
Org - Intern Jan 2024 - Apr 2024
- Built services.
PROJECTS
Tooling App | Python
- Automated workflows.
SKILLS
Python, SQL
"""

        result_with = self.analyzer.analyze_resume(with_summary, "entry")
        result_without = self.analyzer.analyze_resume(without_summary, "entry")

        self.assertFalse(any("'Summary' section" in r for r in result_with["recommendations"]))
        self.assertTrue(any("'Summary' section" in r for r in result_without["recommendations"]))

    def test_target_level_is_returned_and_used(self):
        text = """
Taylor Doe
taylor@example.com | +1 555 444 3333
EDUCATION
University of Example
EXPERIENCE
Acme - Intern Jan 2024 - Apr 2024
- Built APIs
PROJECTS
Alpha | Python
- Built feature
SKILLS
Python, Flask
"""
        result = self.analyzer.analyze_resume(text, "senior")
        self.assertEqual(result.get("targetLevel"), "senior")
        self.assertEqual(result["extractedInfo"].get("experienceLevel"), "senior")
        self.assertEqual(result["extractedInfo"].get("targetLevel"), "senior")

    def test_senior_target_penalizes_entry_profile_score(self):
        text = """
Jordan Dev
jordan@example.com | +1 555 000 1111
EDUCATION
Example University
EXPERIENCE
Campus Club Jan 2024 - Apr 2024
- Built club website and managed updates.
PROJECTS
Portfolio Site | React
- Built a personal portfolio.
SKILLS
React, TypeScript, CSS
"""
        entry_result = self.analyzer.analyze_resume(text, "entry")
        senior_result = self.analyzer.analyze_resume(text, "senior")

        self.assertTrue(entry_result["success"])
        self.assertTrue(senior_result["success"])
        self.assertGreater(entry_result["score"], senior_result["score"])


if __name__ == "__main__":
    unittest.main()
