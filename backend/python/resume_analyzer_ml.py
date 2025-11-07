"""
ML-Based Resume Analyzer using Sentence-BERT
Provides semantic analysis and ATS scoring using pre-trained transformers
"""

import re
import json
from typing import Dict, List, Any

try:
    from sentence_transformers import SentenceTransformer, util
    import torch
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("Warning: ML libraries not available. Install with: pip install sentence-transformers torch")


class ResumeAnalyzerML:
    """ML-powered resume analyzer using Sentence-BERT"""
    
    def __init__(self):
        """Initialize the ML model"""
        self.model = None
        self.model_name = 'all-mpnet-base-v2'  # Best pre-trained model for semantic similarity
        
        if ML_AVAILABLE:
            try:
                print(f"Loading Sentence-BERT model: {self.model_name}...")
                
                # Try to load from local cache first
                import os
                cache_dir = os.path.expanduser('~/.cache/huggingface/hub')
                model_path = os.path.join(cache_dir, f'models--sentence-transformers--{self.model_name}')
                
                if os.path.exists(model_path):
                    # Load from cache directory directly
                    snapshot_dirs = []
                    snapshots_path = os.path.join(model_path, 'snapshots')
                    if os.path.exists(snapshots_path):
                        snapshot_dirs = [d for d in os.listdir(snapshots_path) if os.path.isdir(os.path.join(snapshots_path, d))]
                    
                    if snapshot_dirs:
                        # Use the first (and likely only) snapshot directory
                        snapshot_path = os.path.join(snapshots_path, snapshot_dirs[0])
                        print(f"📂 Loading model from local cache: {snapshot_path}")
                        self.model = SentenceTransformer(snapshot_path)
                    else:
                        # Fallback to online loading (which should use cache)
                        print("🌐 Loading model with cache fallback...")
                        self.model = SentenceTransformer(self.model_name)
                else:
                    # First time - download the model
                    print("📥 Downloading model for first time...")
                    self.model = SentenceTransformer(self.model_name)
                
                # Set model to evaluation mode and disable gradient computation
                if self.model:
                    self.model.eval()
                    print("✅ Model loaded successfully!")
                    
            except Exception as e:
                print(f"❌ Error loading model: {e}")
                print("💡 Trying alternative loading method...")
                try:
                    # Alternative: Try loading without auth token parameter
                    self.model = SentenceTransformer(self.model_name)
                    if self.model:
                        self.model.eval()
                        print("✅ Model loaded with alternative method!")
                except Exception as e2:
                    print(f"❌ Alternative loading also failed: {e2}")
                    self.model = None
        else:
            print("❌ ML libraries not available. Falling back to rule-based analysis.")
    
    def analyze_resume(self, text: str) -> Dict[str, Any]:
        """
        Analyze resume text using ML and rule-based approaches
        
        Args:
            text: Resume text content
            
        Returns:
            Dictionary with ATS score, insights, and recommendations
        """
        if not text or not text.strip():
            return {
                "success": False,
                "error": "No text provided for analysis"
            }
        
        # Extract structured information
        extracted_info = self._extract_resume_info(text)
        
        # Calculate ATS score using ML if available, otherwise use rules
        if self.model is not None:
            ats_score = self._calculate_ml_ats_score(text, extracted_info)
        else:
            ats_score = self._calculate_rule_based_score(text, extracted_info)
        
        # Generate insights and recommendations
        insights = self._generate_insights(extracted_info, ats_score)
        recommendations = self._generate_recommendations(extracted_info, ats_score)
        
        # Determine status
        status, status_message = self._get_status(ats_score)
        
        return {
            "success": True,
            "score": round(ats_score, 1),
            "status": status,
            "statusMessage": status_message,
            "insights": insights,
            "recommendations": recommendations,
            "metrics": {
                "wordCount": extracted_info["word_count"],
                "sectionsFound": len(extracted_info["sections"]),
                "skillsFound": len(extracted_info["skills"]),
                "actionVerbs": len(extracted_info["action_verbs"]),
                "quantifiableMetrics": len(extracted_info["numbers"]),
                "contactInfoPresent": extracted_info["has_contact"],
                "totalBullets": extracted_info.get("total_bullets", 0),
                "quantifiedBullets": extracted_info.get("quantified_bullets", 0)
            },
            "extractedInfo": {
                "name": extracted_info.get("name"),
                "email": extracted_info.get("email"),
                "phone": extracted_info.get("phone"),
                "location": extracted_info.get("location"),
                "linkedin": extracted_info.get("linkedin"),
                "github": extracted_info.get("github"),
                "skills": extracted_info.get("skills", []),  # All skills now
                "sections": extracted_info.get("sections", []),
                "education": extracted_info.get("education", []),
                "work_experience": extracted_info.get("work_experience", []),
                "projects": extracted_info.get("projects", []),
                "experienceLevel": extracted_info.get("experience_level", "entry"),
                "yearsOfExperience": extracted_info.get("years_of_experience", 0)
            }
        }
    
    def _extract_resume_info(self, text: str) -> Dict[str, Any]:
        """Extract structured information from resume"""
        text_lower = text.lower()
        
        # Word count
        word_count = len(text.split())
        
        # Extract name (usually first line or first few words)
        lines = text.split('\n')
        name = None
        for line in lines[:5]:  # Check first 5 lines
            line = line.strip()
            if line and not any(char.isdigit() for char in line) and len(line.split()) <= 4:
                # Likely a name if it's short, has no numbers, and looks like a proper name
                if not any(keyword in line.lower() for keyword in ['email', 'phone', 'linkedin', 'github', 'http', '@']):
                    name = line
                    break
        
        # Contact information
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        phone_pattern = r'(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}'
        
        email = re.search(email_pattern, text)
        phone = re.search(phone_pattern, text)
        
        # Extract location (city, state, country)
        location = None
        location_patterns = [
            r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),\s*([A-Z][a-z]+)',  # City, State
            r'([A-Z][a-z]+),\s*([A-Z]{2})',  # City, ST
        ]
        for pattern in location_patterns:
            match = re.search(pattern, text)
            if match:
                location = match.group()
                break
        
        # Extract LinkedIn URL
        linkedin = None
        linkedin_patterns = [
            r'linkedin\.com/in/([a-zA-Z0-9-]+)',
            r'LinkedIn:\s*([a-zA-Z0-9-]+)',
            r'linkedin:\s*([a-zA-Z0-9-]+)'
        ]
        for pattern in linkedin_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                linkedin = match.group(1) if '/' in pattern else match.group(1)
                break
        
        # Extract GitHub URL
        github = None
        github_patterns = [
            r'github\.com/([a-zA-Z0-9-]+)',
            r'Github:\s*([a-zA-Z0-9-]+)',
            r'github:\s*([a-zA-Z0-9-]+)'
        ]
        for pattern in github_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                github = match.group(1)
                break
        
        # Sections
        section_keywords = {
            "experience": ["experience", "work history", "employment", "professional experience", "workexperience"],
            "education": ["education", "academic", "qualifications", "degree"],
            "skills": ["skills", "technical skills", "competencies", "abilities", "expertise"],
            "summary": ["summary", "objective", "profile", "about"],
            "projects": ["projects", "portfolio", "work samples"],
            "certifications": ["certifications", "certificates", "licenses"]
        }
        
        found_sections = []
        for section, keywords in section_keywords.items():
            if any(keyword in text_lower for keyword in keywords):
                found_sections.append(section)
        
        # Extract education details
        education_info = self._extract_education(text, text_lower)
        
        # Extract work experience
        work_experience = self._extract_work_experience(text, text_lower)
        
        # Extract projects
        projects = self._extract_projects(text, text_lower)
        
        # Action verbs with frequency tracking
        action_verbs = [
            "achieved", "improved", "developed", "implemented", "managed", "created",
            "increased", "reduced", "led", "designed", "built", "optimized", "launched",
            "delivered", "executed", "established", "streamlined", "spearheaded",
            "automated", "collaborated", "coordinated", "directed", "engineered",
            "enhanced", "founded", "generated", "initiated", "integrated", "maintained",
            "operated", "planned", "programmed", "resolved", "supervised", "trained",
            "upgraded", "validated", "architected", "deployed", "facilitated",
            "migrated", "modernized", "orchestrated", "pioneered", "scaled",
            "accelerated", "drove", "transformed", "revamped", "overhauled"
        ]
        found_action_verbs = []
        action_verb_frequency = {}
        
        for verb in action_verbs:
            # Count occurrences
            pattern = r'\b' + verb + r'\b'
            matches = re.findall(pattern, text_lower)
            count = len(matches)
            if count > 0:
                found_action_verbs.append(verb)
                action_verb_frequency[verb] = count
        
        # Detect repetitive verbs (used more than 2 times) - ResumeWorded penalty
        repetitive_verbs = {verb: count for verb, count in action_verb_frequency.items() if count > 2}
        
        # Count bullet points
        bullet_pattern = r'^\s*[•\-\*◦▪]\s+'
        total_bullets = sum(1 for line in lines if re.match(bullet_pattern, line))
        
        # Numbers and metrics - count overall and per bullet
        numbers = re.findall(r'\b\d+[%$,kmKMbB]?\b', text)
        
        # Count quantified bullets (bullets with numbers/metrics)
        quantified_bullets = 0
        for line in lines:
            if re.match(bullet_pattern, line):
                if re.search(r'\d+[\d,]*\.?\d*\s*(%|percent|million|thousand|users|customers|revenue|\$|hours|days|weeks|months|years|projects|items)', line.lower()):
                    quantified_bullets += 1
        
        # Enhanced skills extraction with comprehensive list
        common_skills = [
            # Programming Languages
            "python", "java", "javascript", "typescript", "c++", "c#", "c", "ruby", "php", 
            "swift", "kotlin", "go", "rust", "scala", "r", "matlab", "perl", "haskell",
            # Web Technologies & Frameworks
            "react", "angular", "vue", "vue.js", "node.js", "node", "express", "express.js",
            "django", "flask", "spring", "spring boot", "asp.net", "html", "html5", "css", 
            "css3", "sass", "less", "bootstrap", "tailwind", "tailwindcss", "material-ui",
            "next.js", "next", "nuxt", "gatsby", "svelte", "backbone", "ember",
            # Backend & APIs
            "fastapi", "graphql", "rest", "restful", "soap", "grpc", "microservices",
            "serverless", "lambda", "api", "websocket",
            # Databases
            "sql", "mysql", "postgresql", "postgres", "mongodb", "redis", "sqlite",
            "oracle", "dynamodb", "cassandra", "elasticsearch", "mariadb", "neo4j",
            "firestore", "supabase", "firebase",
            # Cloud & DevOps
            "aws", "azure", "gcp", "google cloud", "docker", "kubernetes", "k8s",
            "jenkins", "ci/cd", "terraform", "ansible", "vagrant", "git", "github", 
            "gitlab", "bitbucket", "linux", "unix", "bash", "shell", "nginx", "apache",
            # Data & AI/ML
            "machine learning", "deep learning", "data analysis", "data science",
            "artificial intelligence", "ai", "ml", "tensorflow", "pytorch", "keras",
            "scikit-learn", "sklearn", "pandas", "numpy", "jupyter", "matplotlib",
            "seaborn", "plotly", "tableau", "power bi", "spark", "hadoop", "airflow",
            "etl", "data mining", "nlp", "computer vision", "opencv",
            # Mobile Development
            "android", "ios", "react native", "flutter", "xamarin", "ionic", "cordova",
            "swift", "objective-c", "kotlin", "java android",
            # Testing & Quality
            "testing", "unit testing", "selenium", "jest", "mocha", "chai", "pytest",
            "junit", "testng", "cypress", "puppeteer", "test automation", "tdd", "bdd",
            # Tools & Others
            "agile", "scrum", "jira", "confluence", "trello", "slack", "figma", "sketch",
            "photoshop", "illustrator", "postman", "swagger", "webpack", "vite", "babel",
            "eslint", "prettier", "vim", "vscode", "intellij", "eclipse", "xcode",
            # Version Control & Collaboration
            "version control", "source control", "git flow", "github actions", "travis ci",
            "circle ci", "gitlab ci",
            # Blockchain & Web3
            "blockchain", "ethereum", "solidity", "web3", "smart contracts", "cryptocurrency",
            # System Design & Architecture
            "system design", "architecture", "design patterns", "oop", "functional programming",
            "event-driven", "message queue", "kafka", "rabbitmq", "redis pub/sub",
            # Soft skills
            "leadership", "communication", "teamwork", "problem solving", "analytical",
            "collaboration", "project management", "critical thinking", "mentoring",
            "presentation", "negotiation", "time management", "event management",
            "team management", "versatile", "trust building"
        ]
        found_skills = []
        for skill in common_skills:
            # Use word boundaries for exact matching
            pattern = r'\b' + re.escape(skill) + r'\b'
            if re.search(pattern, text_lower):
                found_skills.append(skill)
        
        # Remove duplicates and maintain order
        found_skills = list(dict.fromkeys(found_skills))
        
        # Detect experience level (student, entry, mid, senior, principal)
        experience_level, years_of_experience = self._detect_experience_level(text, text_lower, total_bullets)
        
        return {
            "word_count": word_count,
            "name": name,
            "email": email.group() if email else None,
            "phone": phone.group() if phone else None,
            "location": location,
            "linkedin": linkedin,
            "github": github,
            "has_contact": bool(email and phone),
            "sections": found_sections,
            "education": education_info,
            "work_experience": work_experience,
            "projects": projects,
            "action_verbs": found_action_verbs,
            "action_verb_frequency": action_verb_frequency,
            "repetitive_verbs": repetitive_verbs,
            "numbers": numbers,
            "skills": found_skills,
            "total_bullets": total_bullets,
            "quantified_bullets": quantified_bullets,
            "experience_level": experience_level,
            "years_of_experience": years_of_experience
        }
    
    def _extract_education(self, text: str, text_lower: str) -> List[Dict[str, Any]]:
        """Extract education information from resume"""
        education_list = []
        
        # Find EDUCATION section
        education_section_start = -1
        education_keywords = ['education', 'academic background', 'qualifications']
        
        for keyword in education_keywords:
            pos = text_lower.find(keyword)
            if pos != -1:
                education_section_start = pos
                break
        
        if education_section_start == -1:
            return education_list
        
        # Extract text from education section (until next major section)
        next_section_keywords = ['work experience', 'workexperience', 'experience', 'projects', 'skills', 'certifications']
        education_section_end = len(text)
        
        for keyword in next_section_keywords:
            pos = text_lower.find(keyword, education_section_start + 50)
            if pos != -1 and pos < education_section_end:
                education_section_end = pos
        
        education_text = text[education_section_start:education_section_end]
        
        # Look for university/institution names
        institution_patterns = [
            r'(IIIT\s+[A-Z][a-z]+(?:,\s*[A-Z]{2,3})?)',
            r'(IIT\s+[A-Z][a-z]+)',
            r'(NIT\s+[A-Z][a-z]+)',
            r'([A-Z][A-Za-z\s]+(?:University|College|Institute|School)[^.\n]*)'
        ]
        
        institutions_found = []
        for pattern in institution_patterns:
            matches = re.finditer(pattern, education_text, re.IGNORECASE)
            for match in matches:
                institutions_found.append(match.group(1))
        
        # Look for degree patterns
        degree_patterns = [
            r'\b(B\.?Tech|Bachelor|B\.?E\.?|B\.?S\.?)\b',
            r'\b(M\.?Tech|Master|M\.?E\.?|M\.?S\.?)\b',
            r'\b(Ph\.?D\.?|Doctorate)\b'
        ]
        
        degrees_found = []
        for pattern in degree_patterns:
            matches = re.finditer(pattern, education_text, re.IGNORECASE)
            for match in matches:
                degrees_found.append(match.group(1))
        
        # Look for field of study
        field_keywords = ['computer science', 'cse', 'electrical', 'mechanical', 'civil', 
                         'electronics', 'information technology', 'data science', 'ai', 'ml']
        fields_found = []
        for keyword in field_keywords:
            if keyword in education_text.lower():
                fields_found.append(keyword.upper() if keyword == 'cse' else keyword.title())
        
        # Look for years
        year_pattern = r'20\d{2}|202[0-9]'
        years = re.findall(year_pattern, education_text)
        
        # Combine findings into structured data
        if institutions_found or degrees_found:
            # Primary education entry
            education_list.append({
                "degree": degrees_found[0] if degrees_found else "B.Tech",
                "field": fields_found[0] if fields_found else "Computer Science",
                "institution": institutions_found[0] if institutions_found else None,
                "graduation_year": years[-1] if years else None
            })
        
        return education_list
    
    def _extract_work_experience(self, text: str, text_lower: str) -> List[Dict[str, Any]]:
        """Extract work experience from resume"""
        experience_list = []
        
        # Find EXPERIENCE or WORK EXPERIENCE section
        experience_section_start = -1
        experience_keywords = ['workexperience', 'work experience', 'experience', 'employment history', 'professional experience']
        
        for keyword in experience_keywords:
            pos = text_lower.find(keyword)
            if pos != -1:
                experience_section_start = pos
                break
        
        if experience_section_start == -1:
            return experience_list
        
        # Extract text from experience section (until next major section)
        next_section_keywords = ['summary', 'projects', 'skills', 'certifications', 'education']
        experience_section_end = len(text)
        
        for keyword in next_section_keywords:
            pos = text_lower.find(keyword, experience_section_start + 50)
            if pos != -1 and pos < experience_section_end:
                experience_section_end = pos
        
        experience_text = text[experience_section_start:experience_section_end]
        lines = experience_text.split('\n')
        
        current_org = None
        current_role = None
        current_duration = None
        current_description = []
        
        for line in lines:
            line = line.strip()
            if not line or line.lower() in experience_keywords:
                continue
            
            # Check if line contains a date range pattern
            date_pattern = r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\.?\s*\d{4}\s*[-–—]\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\.?\s*\d{4}|Present|Current|present|current)'
            date_match = re.search(date_pattern, line, re.IGNORECASE)
            
            if date_match:
                # Save previous experience if exists
                if current_org:
                    experience_list.append({
                        "organization": current_org,
                        "role": current_role,
                        "duration": current_duration,
                        "description": ' '.join(current_description)
                    })
                
                # Start new experience
                current_duration = date_match.group()
                # Extract organization and role from the line
                parts = line.split(date_match.group())
                before_date = parts[0].strip()
                
                # Check if there's a hyphen or dash indicating role
                if '-' in before_date:
                    org_role = before_date.split('-', 1)
                    current_org = org_role[0].strip()
                    current_role = org_role[1].strip() if len(org_role) > 1 else None
                else:
                    current_org = before_date
                    current_role = None
                
                # Description might be after the date
                if len(parts) > 1:
                    after_date = parts[1].strip()
                    if after_date and after_date.startswith('-'):
                        after_date = after_date[1:].strip()
                    if after_date:
                        current_description = [after_date]
                    else:
                        current_description = []
                else:
                    current_description = []
                    
            elif current_org and (line.startswith(('-', '•', '*', '◦', '▪')) or (current_description and len(line) > 10)):
                # Add to current description
                if line.startswith(('-', '•', '*', '◦', '▪')):
                    line = line[1:].strip()
                current_description.append(line)
            elif not current_org and not line.startswith(('-', '•', '*', '◦', '▪')):
                # Might be organization name without date format
                if len(line.split()) <= 6 and not any(char.isdigit() for char in line):
                    current_org = line
                    current_role = None
                    current_duration = None
                    current_description = []
        
        # Save last experience
        if current_org:
            experience_list.append({
                "organization": current_org,
                "role": current_role,
                "duration": current_duration,
                "description": ' '.join(current_description)
            })
        
        return experience_list
    
    def _extract_projects(self, text: str, text_lower: str) -> List[Dict[str, Any]]:
        """Extract project information from resume"""
        projects_list = []
        
        # Find PROJECTS section - look for it as a section header (at start of line or with minimal prefix)
        projects_section_start = -1
        project_keywords = ['projects', 'portfolio', 'work samples', 'key projects', 'personal projects']
        
        for keyword in project_keywords:
            # Use pattern that matches the keyword at the start of a line (possibly with leading whitespace)
            # or with only a few characters before it (section marker like numbers/bullets)
            pattern = r'(?:^|\n)\s{0,5}' + keyword + r'\b'
            match = re.search(pattern, text_lower, re.MULTILINE)
            if match:
                projects_section_start = match.end() - len(keyword)
                break
        
        if projects_section_start == -1:
            return projects_list
        
        # Extract text from projects section (until next major section)
        next_section_keywords = ['education', 'experience', 'skills', 'certifications', 'languages', 'links']
        projects_section_end = len(text)
        
        for keyword in next_section_keywords:
            pattern = r'(?:^|\n)\s{0,5}' + keyword + r'\b'
            match = re.search(pattern, text_lower[projects_section_start + 50:], re.MULTILINE)
            if match:
                candidate_end = projects_section_start + 50 + match.start()
                if candidate_end < projects_section_end:
                    projects_section_end = candidate_end
        
        projects_text = text[projects_section_start:projects_section_end]
        lines = [l.strip() for l in projects_text.split('\n') if l.strip()]
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Skip section header
            if any(keyword in line.lower() for keyword in project_keywords):
                i += 1
                continue
            
            # Check if current line has technology separator
            if '|' in line and not line.startswith(('-', '•', '*', '◦', '▪')):
                # This line has format: "Category | Technology" or "Project Name | Technology"
                parts = line.split('|')
                project_name = parts[0].strip()
                technology = parts[1].strip() if len(parts) > 1 else ""
                
                # Check if previous non-bullet line could be the project name
                # (in case format is: Name on one line, Category | Tech on next line)
                if (i > 0 and 
                    not lines[i-1].startswith(('-', '•', '*', '◦', '▪', 'http', 'github', 'gitlab', 'link')) and
                    len(lines[i-1].split()) <= 3 and
                    not any(keyword in lines[i-1].lower() for keyword in project_keywords)):
                    # Previous line is likely the actual project name
                    project_name = lines[i-1]
                
                # Collect description from following bullet points
                description_parts = []
                j = i + 1
                while j < len(lines):
                    next_line = lines[j]
                    if next_line.startswith(('-', '•', '*', '◦', '▪')):
                        cleaned = next_line[1:].strip()
                        description_parts.append(cleaned)
                        j += 1
                    elif next_line.lower().startswith(('github', 'gitlab', 'http', 'link')):
                        # Skip link lines
                        j += 1
                    elif '|' in next_line or (len(next_line.split()) <= 3 and not next_line.startswith(('-', '•', '*'))):
                        # Hit next project or project name
                        break
                    else:
                        # Could be continuation or description
                        if len(next_line) > 20:
                            description_parts.append(next_line)
                        j += 1
                
                projects_list.append({
                    "name": project_name,
                    "technology": technology,
                    "description": ' '.join(description_parts)
                })
                
                i = j
            elif (not line.startswith(('-', '•', '*', '◦', '▪', 'http', 'github', 'gitlab')) and
                  i + 1 < len(lines) and
                  '|' in lines[i + 1]):
                # This is a project name, next line has technology
                # Will be handled when we process the next line
                i += 1
            else:
                i += 1
        
        return projects_list
    
    def _detect_experience_level(self, text: str, text_lower: str, total_bullets: int) -> tuple:
        """
        Detect candidate's experience level and years of experience
        
        Returns:
            tuple: (experience_level, years_of_experience)
            experience_level: 'student', 'entry', 'mid', 'senior', 'principal'
            years_of_experience: estimated years (0-20+)
        """
        years = 0
        
        # Student indicators (highest priority)
        student_indicators = [
            "3rd year", "third year", "4th year", "fourth year",
            "undergraduate", "pursuing", "expected graduation",
            "currently studying", "student at", "bachelor's student",
            "master's student", "expected 202", "graduating 202"
        ]
        is_student = any(indicator in text_lower for indicator in student_indicators)
        
        # Extract years of experience from text
        # Pattern 1: "X years of experience"
        years_pattern1 = re.findall(r'(\d+)\+?\s*years?\s+(?:of\s+)?experience', text_lower)
        # Pattern 2: "X+ years experience"
        years_pattern2 = re.findall(r'(\d+)\+?\s*years?\s+experience', text_lower)
        # Pattern 3: Count work history date ranges
        date_ranges = re.findall(r'(20\d{2})\s*[-–—]\s*(20\d{2}|present|current)', text_lower)
        
        # Get explicit years mentioned
        if years_pattern1 or years_pattern2:
            all_years = [int(y) for y in (years_pattern1 + years_pattern2)]
            years = max(all_years) if all_years else 0
        
        # Calculate from date ranges if no explicit mention
        if years == 0 and date_ranges:
            total_experience = 0
            current_year = 2025
            for start, end in date_ranges:
                start_year = int(start)
                end_year = current_year if end.lower() in ['present', 'current'] else int(end)
                total_experience += max(0, end_year - start_year)
            years = min(total_experience, 20)  # Cap at 20 years
        
        # Seniority keywords
        senior_keywords = ['senior', 'lead', 'principal', 'staff', 'architect', 'head of']
        mid_keywords = ['associate', 'mid-level', 'mid level']
        entry_keywords = ['junior', 'entry', 'entry-level', 'graduate', 'intern', 'trainee']
        
        has_senior = any(keyword in text_lower for keyword in senior_keywords)
        has_mid = any(keyword in text_lower for keyword in mid_keywords)
        has_entry = any(keyword in text_lower for keyword in entry_keywords)
        
        # Determine experience level based on signals
        if is_student:
            return ('student', 0)
        elif has_entry or years < 2:
            return ('entry', max(years, 0))
        elif has_senior or years >= 7:
            if years >= 10 or 'principal' in text_lower or 'staff' in text_lower:
                return ('principal', years)
            else:
                return ('senior', years)
        elif has_mid or years >= 3:
            return ('mid', max(years, 3))
        elif total_bullets >= 25:
            # Many bullets suggests experienced professional
            return ('senior', max(years, 7))
        elif total_bullets >= 15:
            return ('mid', max(years, 3))
        elif total_bullets <= 10:
            # Few bullets suggests entry level or student
            return ('entry', max(years, 0))
        else:
            # Default to entry if unclear
            return ('entry', max(years, 0))
    
    def _calculate_ml_ats_score(self, text: str, info: Dict) -> float:
        """
        Calculate ATS score using ML semantic analysis
        
        Uses Sentence-BERT to compare resume against ideal resume characteristics
        """
        # Add text to info for experience detection
        info['text'] = text
        
        # Ideal resume characteristics (what ATS systems look for)
        ideal_characteristics = [
            "professional summary with clear career objectives and key achievements",
            "detailed work experience with quantifiable accomplishments and impact metrics",
            "comprehensive technical skills and competencies relevant to the role",
            "educational background with degrees certifications and relevant coursework",
            "strong action verbs describing responsibilities and achievements",
            "contact information including email phone and location",
            "clean formatting with clear section headers and bullet points"
        ]
        
        # Calculate semantic similarity between resume and ideal characteristics
        resume_embedding = self.model.encode(text, convert_to_tensor=True)
        ideal_embeddings = self.model.encode(ideal_characteristics, convert_to_tensor=True)
        
        # Compute cosine similarity
        similarities = util.cos_sim(resume_embedding, ideal_embeddings)[0]
        
        # Use MAX similarity instead of average (best match matters more)
        # Also take top 3 best matches and average them
        top_similarities = torch.topk(similarities, k=min(3, len(similarities))).values
        avg_top_similarity = torch.mean(top_similarities).item()
        
        # Base ML score (0-20 points based on semantic similarity)
        # Minimize ML impact to avoid inconsistency
        ml_score = avg_top_similarity * 20
        
        # Rule-based bonuses (0-80 points)
        rule_score = 0
        
        # Contact info (5 points)
        if info["has_contact"]:
            rule_score += 5
        elif info["email"] or info["phone"]:
            rule_score += 3
        
        # Sections (10 points) - Reward comprehensive structure
        if len(info["sections"]) >= 5:
            rule_score += 10
        elif len(info["sections"]) >= 4:
            rule_score += 7
        elif len(info["sections"]) >= 3:
            rule_score += 5
        else:
            rule_score += (len(info["sections"]) / 3) * 5
        
        # Action verbs (8 points) - Reward diversity
        verb_count = len(info["action_verbs"])
        if verb_count >= 15:
            action_verb_score = 8
        elif verb_count >= 10:
            action_verb_score = 7
        elif verb_count >= 6:
            action_verb_score = 5
        else:
            action_verb_score = min(verb_count / 6 * 5, 5)
        
        # Penalty for repetitive verbs
        repetitive_penalty = len(info.get("repetitive_verbs", {})) * 1
        action_verb_score = max(0, action_verb_score - repetitive_penalty)
        rule_score += action_verb_score
        
        # Skills (7 points) - Reward comprehensive skills
        skill_count = len(info.get("skills", []))
        if skill_count >= 25:
            skill_score = 7
        elif skill_count >= 20:
            skill_score = 6
        elif skill_count >= 15:
            skill_score = 5
        elif skill_count >= 10:
            skill_score = 4
        else:
            skill_score = min(skill_count / 10 * 4, 4)
        rule_score += skill_score
        
        # HEAVILY REDUCED: Quantification (5 points) - De-emphasize this
        # Data shows TDS has 8.8% quantification but scores 87% on ResumeWorded
        total_bullets = info.get("total_bullets", 0)
        quantified_bullets = info.get("quantified_bullets", 0)
        
        if total_bullets > 0:
            quantification_ratio = quantified_bullets / total_bullets
            if quantification_ratio >= 0.5:
                metric_score = 5
            elif quantification_ratio >= 0.3:
                metric_score = 4
            elif quantification_ratio >= 0.15:
                metric_score = 3
            else:
                metric_score = 2
        else:
            # Fallback to number count
            num_count = len(info["numbers"])
            if num_count >= 10:
                metric_score = 5
            elif num_count >= 5:
                metric_score = 4
            else:
                metric_score = 2
        
        rule_score += metric_score
        
        # Content density (10 points) - Reward substantial content
        word_count = info["word_count"]
        if 500 <= word_count <= 900:  # Ideal range
            density_score = 10
        elif 400 <= word_count < 500 or 900 < word_count <= 1100:
            density_score = 9
        elif 300 <= word_count < 400 or 1100 < word_count <= 1300:
            density_score = 7
        elif 200 <= word_count < 300:
            density_score = 5
        else:
            density_score = 3
        rule_score += density_score
        
        # MASSIVELY INCREASED: Bullet Count (35 points) - PRIMARY differentiator
        # This is THE key indicator: TDS has 34 bullets (87% RW), Anas has 17 (56% RW)
        # Bullet count signals experience depth and professional level
        if total_bullets >= 30:
            bullet_score = 37  # Senior/expert level (increased from 35)
        elif total_bullets >= 25:
            bullet_score = 32
        elif total_bullets >= 20:
            bullet_score = 27
        elif total_bullets >= 15:
            bullet_score = 20
        elif total_bullets >= 12:
            bullet_score = 14
        elif total_bullets >= 8:
            bullet_score = 8
        elif total_bullets >= 5:
            bullet_score = 4
        else:
            bullet_score = 1
        
        rule_score += bullet_score
        
        # Total: 20 (ML) + 82 (rules) = 102, capped at 100
        # Rules: Contact(5) + Sections(10) + Verbs(8) + Skills(7) + Metrics(5) + Density(10) + BulletCount(37) = 82
        total_score = ml_score + rule_score
        return min(100, max(0, total_score))
    
    def _calculate_rule_based_score(self, text: str, info: Dict) -> float:
        """Fallback rule-based scoring when ML is not available"""
        score = 0
        
        # Contact info (8 points)
        if info["has_contact"]:
            score += 8
        elif info["email"] or info["phone"]:
            score += 4
        
        # Sections (12 points) - Stricter like ML version
        if len(info["sections"]) >= 5:
            score += 12
        elif len(info["sections"]) >= 4:
            score += 8
        elif len(info["sections"]) >= 3:
            score += 5
        else:
            score += (len(info["sections"]) / 6) * 12
        
        # Action verbs (15 points) - Need 12 for max
        action_verb_score = min(len(info["action_verbs"]) / 12 * 15, 15)
        score += action_verb_score
        
        # Quantifiable metrics (18 points) - Need 10 for max
        metric_score = min(len(info["numbers"]) / 10 * 18, 18)
        score += metric_score
        
        # Word count (17 points) - Same as ML scoring
        if 500 <= info["word_count"] <= 800:
            word_score = 17
        elif 450 <= info["word_count"] < 500:
            word_score = 14
        elif 400 <= info["word_count"] < 450:
            word_score = 11
        elif 350 <= info["word_count"] < 400:
            word_score = 7
        elif 300 <= info["word_count"] < 350:
            word_score = 4
        elif info["word_count"] < 300:
            word_score = 2
        elif 800 < info["word_count"] <= 1000:
            word_score = 14
        elif 1000 < info["word_count"] <= 1200:
            word_score = 10
        else:
            word_score = 6
        score += word_score
        
        # Content quality bonus (30 points) - Replaces ML semantic analysis
        # Very strict requirements matching ResumeWorded
        quality_bonus = 0
        
        # Has comprehensive sections (12 points)
        if len(info["sections"]) >= 6:
            quality_bonus += 12
        elif len(info["sections"]) >= 5:
            quality_bonus += 9
        elif len(info["sections"]) >= 4:
            quality_bonus += 6
        elif len(info["sections"]) >= 3:
            quality_bonus += 3
        
        # Strong mix of verbs and metrics (12 points)
        if len(info["action_verbs"]) >= 15 and len(info["numbers"]) >= 12:
            quality_bonus += 12
        elif len(info["action_verbs"]) >= 10 and len(info["numbers"]) >= 8:
            quality_bonus += 9
        elif len(info["action_verbs"]) >= 6 and len(info["numbers"]) >= 5:
            quality_bonus += 6
        elif len(info["action_verbs"]) >= 4 and len(info["numbers"]) >= 3:
            quality_bonus += 3
        
        # Comprehensive skills (6 points)
        if len(info["skills"]) >= 25:
            quality_bonus += 6
        elif len(info["skills"]) >= 15:
            quality_bonus += 4
        elif len(info["skills"]) >= 10:
            quality_bonus += 2
        
        score += quality_bonus
        
        return min(100, max(0, score))
    
    def _generate_insights(self, info: Dict, score: float) -> List[str]:
        """Generate positive insights about the resume"""
        insights = []
        
        if score >= 80:
            insights.append("Excellent resume optimization for ATS systems")
        elif score >= 70:
            insights.append("Very good resume structure with strong ATS compatibility")
        elif score >= 60:
            insights.append("Good resume structure with room for enhancement")
        elif score >= 50:
            insights.append("Decent resume foundation - follow recommendations to improve")
        else:
            insights.append("Resume needs improvement - focus on the recommendations below")
        
        if info["has_contact"]:
            insights.append("Complete contact information present")
        
        if len(info["sections"]) >= 5:
            insights.append(f"Well-structured with {len(info['sections'])} key sections")
        elif len(info["sections"]) >= 3:
            insights.append(f"Good structure with {len(info['sections'])} sections present")
        
        if len(info["action_verbs"]) >= 10:
            insights.append(f"Excellent use of action verbs ({len(info['action_verbs'])} found)")
        elif len(info["action_verbs"]) >= 5:
            insights.append(f"Good use of action verbs ({len(info['action_verbs'])} found)")
        
        if len(info["numbers"]) >= 5:
            insights.append(f"Strong quantification of achievements ({len(info['numbers'])} metrics)")
        elif len(info["numbers"]) >= 3:
            insights.append(f"Good quantification of achievements ({len(info['numbers'])} metrics)")
        
        if len(info["skills"]) >= 10:
            insights.append(f"Comprehensive skill set ({len(info['skills'])} skills identified)")
        elif len(info["skills"]) >= 5:
            insights.append(f"Diverse skill set ({len(info['skills'])} skills identified)")
        
        # Word count feedback
        if 400 <= info["word_count"] <= 900:
            insights.append("Optimal resume length for ATS systems")
        elif 300 <= info["word_count"] < 400:
            insights.append("Acceptable resume length but could be more detailed")
        
        return insights
    
    def _generate_recommendations(self, info: Dict, score: float) -> List[str]:
        """Generate recommendations for improvement"""
        recommendations = []
        
        # Contact info
        if not info["has_contact"]:
            if not info["email"]:
                recommendations.append("⚠️ Add your email address at the top of your resume")
            if not info["phone"]:
                recommendations.append("⚠️ Add your phone number for easy contact")
        
        # Sections
        missing_sections = set(["experience", "education", "skills", "summary"]) - set(info["sections"])
        if missing_sections:
            for section in missing_sections:
                recommendations.append(f"📝 Add a '{section.title()}' section to improve structure")
        
        # Repetitive action verbs - New ResumeWorded check
        repetitive_verbs = info.get("repetitive_verbs", {})
        if repetitive_verbs:
            for verb, count in repetitive_verbs.items():
                recommendations.append(f"🔄 Replace repetitive '{verb.title()}' verb (used {count} times) - use it max 2 times")
        
        # Action verbs
        if len(info["action_verbs"]) < 5:
            recommendations.append("💪 Use more action verbs (achieved, developed, implemented, led, etc.) to strengthen impact")
        elif len(info["action_verbs"]) < 10:
            recommendations.append("💪 Add more action verbs to better showcase your achievements")
        
        # Quantifiable metrics - New bullet-based check
        total_bullets = info.get("total_bullets", 0)
        quantified_bullets = info.get("quantified_bullets", 0)
        
        if total_bullets > 0:
            quantification_ratio = quantified_bullets / total_bullets
            if quantification_ratio < 0.3:
                recommendations.append(f"📊 Only {quantified_bullets} of {total_bullets} bullets are quantified - add numbers to at least 50% (e.g., 'Increased sales by 30%')")
            elif quantification_ratio < 0.5:
                recommendations.append(f"📊 Quantify more bullets: {quantified_bullets}/{total_bullets} have metrics - aim for 50%+ (add %, $, or specific numbers)")
            elif quantification_ratio < 0.7:
                recommendations.append(f"📊 Good quantification ({quantified_bullets}/{total_bullets}) - try to add metrics to a few more bullets")
        else:
            # Fallback to simple number count
            if len(info["numbers"]) < 3:
                recommendations.append("📊 Add quantifiable metrics (%, $, numbers) to demonstrate impact")
            elif len(info["numbers"]) < 5:
                recommendations.append("📊 Include more specific numbers and percentages to quantify your achievements")
        
        # Word count - realistic expectations
        if info["word_count"] < 200:
            recommendations.append("📄 Your resume is too short - add more details about your experience, achievements, and impact")
        elif info["word_count"] < 300:
            recommendations.append("📄 Expand your resume with more specific examples and details (aim for 400-700 words)")
        elif info["word_count"] < 400:
            recommendations.append("📄 Consider adding more details about your responsibilities and achievements")
        elif info["word_count"] > 1200:
            recommendations.append("✂️ Your resume is too long - condense to 2 pages maximum (600-900 words)")
        elif info["word_count"] > 900:
            recommendations.append("✂️ Consider condensing slightly for better readability (aim for 600-900 words)")
        
        # Skills
        if len(info["skills"]) < 5:
            recommendations.append("🔧 List more relevant technical and soft skills (e.g., programming languages, tools, frameworks)")
        elif len(info["skills"]) < 8:
            recommendations.append("🔧 Expand your skills section with more specific technologies and competencies")
        
        # Score-based recommendations
        if score < 50:
            recommendations.append("⭐ Focus on adding quantifiable achievements and action verbs first - these have the biggest impact")
        elif score < 70:
            recommendations.append("⭐ Your resume foundation is good - focus on quantifying achievements and adding specific results")
        
        # Always helpful
        if not any("bullet" in r.lower() for r in recommendations):
            recommendations.append("✨ Use bullet points to make your resume easier to scan by ATS systems")
        
        return recommendations
    
    def _get_status(self, score: float) -> tuple:
        """Determine resume status based on score"""
        if score >= 85:
            return "excellent", "Outstanding! Your resume is exceptionally well-optimized for ATS systems"
        elif score >= 75:
            return "very-good", "Great! Your resume is very well-optimized for ATS systems"
        elif score >= 65:
            return "good", "Good! Your resume is well-structured with minor improvements needed"
        elif score >= 55:
            return "fair", "Fair - Your resume has good foundations but needs key improvements"
        elif score >= 45:
            return "needs-improvement", "Needs improvement - Follow the recommendations to strengthen your resume"
        else:
            return "poor", "Significant improvements needed - Focus on the top recommendations first"


# Singleton instance
_analyzer_instance = None

def get_analyzer() -> ResumeAnalyzerML:
    """Get or create analyzer instance (singleton pattern)"""
    global _analyzer_instance
    if _analyzer_instance is None:
        _analyzer_instance = ResumeAnalyzerML()
    return _analyzer_instance


# CLI usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: python resume_analyzer_ml.py <text_or_file_path>"
        }))
        sys.exit(1)
    
    input_arg = sys.argv[1]
    
    # Check if input is a file
    import os
    if os.path.exists(input_arg) and os.path.isfile(input_arg):
        try:
            with open(input_arg, 'r', encoding='utf-8') as f:
                text = f.read()
        except Exception as e:
            print(json.dumps({
                "success": False,
                "error": f"Failed to read file: {str(e)}"
            }))
            sys.exit(1)
    else:
        text = input_arg
    
    analyzer = get_analyzer()
    result = analyzer.analyze_resume(text)
    print(json.dumps(result, indent=2))
