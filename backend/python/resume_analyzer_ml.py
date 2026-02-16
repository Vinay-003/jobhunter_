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
        # Use resume-specific fine-tuned model for better accuracy
        self.model_name = 'anass1209/resume-job-matcher-all-MiniLM-L6-v2'
        self.fallback_model = 'all-mpnet-base-v2'
        
        if ML_AVAILABLE:
            try:
                print(f"Loading Resume-Job Matching Model: {self.model_name}...")
                print("📌 This model is specifically fine-tuned for resume analysis!")
                
                # Try to load from local cache first
                import os
                cache_dir = os.path.expanduser('~/.cache/huggingface/hub')
                model_path = os.path.join(cache_dir, f'models--{self.model_name.replace("/", "--")}')
                
                try:
                    # Try to load resume-specific model
                    if os.path.exists(model_path):
                        snapshot_dirs = []
                        snapshots_path = os.path.join(model_path, 'snapshots')
                        if os.path.exists(snapshots_path):
                            snapshot_dirs = [d for d in os.listdir(snapshots_path) if os.path.isdir(os.path.join(snapshots_path, d))]
                        
                        if snapshot_dirs:
                            snapshot_path = os.path.join(snapshots_path, snapshot_dirs[0])
                            print(f"📂 Loading model from local cache: {snapshot_path}")
                            self.model = SentenceTransformer(snapshot_path)
                        else:
                            print("🌐 Loading model from HuggingFace...")
                            self.model = SentenceTransformer(self.model_name)
                    else:
                        print("📥 Downloading resume-specific model (first time, ~90MB)...")
                        self.model = SentenceTransformer(self.model_name)
                    
                    if self.model:
                        self.model.eval()
                        print("✅ Resume-specific model loaded successfully!")
                        
                except Exception as resume_model_error:
                    # Fallback to general model
                    print(f"⚠️  Resume model failed: {resume_model_error}")
                    print(f"💡 Falling back to general model: {self.fallback_model}...")
                    
                    try:
                        self.model = SentenceTransformer(self.fallback_model)
                        if self.model:
                            self.model.eval()
                            print("✅ Fallback model loaded successfully!")
                    except Exception as fallback_error:
                        print(f"❌ Fallback model also failed: {fallback_error}")
                        self.model = None
                    
            except Exception as e:
                print(f"❌ Critical error loading models: {e}")
                self.model = None
        else:
            print("❌ ML libraries not available. Falling back to rule-based analysis.")
    
    # ========== NEW: ATS COMPATIBILITY UTILITY FUNCTIONS ==========
    
    def _detect_file_type(self, pdf_path: str = None) -> tuple:
        """
        Detect if PDF is text-based or image-based
        Returns: (file_type: str, penalty: int)
        """
        # For now, assume text-based since we successfully extracted text
        # In production, would check if PDF has text layer
        return "text_based", 0
    
    def _analyze_layout(self, text: str) -> tuple:
        """
        Analyze resume layout complexity
        Returns: (layout_type: str, score: float)
        """
        # Check for table indicators, multi-column markers
        has_excessive_symbols = text.count('|') > 50  # Table column separator
        has_tab_formatting = text.count('\t') > 30
        
        if has_excessive_symbols or has_tab_formatting:
            return "complex", 2.0
        
        # Check for normal single-column layout
        lines = text.split('\n')
        avg_line_length = sum(len(line) for line in lines) / max(len(lines), 1)
        
        if avg_line_length > 100:  # Very long lines = likely multi-column
            return "multi_column", 4.0
        
        return "single_column", 6.0
    
    def _check_date_consistency(self, experiences: List[Dict], education: List[Dict]) -> tuple:
        """
        Check date format consistency and presence - More lenient
        Returns: (score: float, penalty: int)
        """
        date_formats = set()
        missing_dates = 0
        total_entries = len(experiences) + len(education)
        
        if total_entries == 0:
            return 2.0, 0  # Give some credit if no entries to check
        
        # Check experiences
        for exp in experiences:
            duration = exp.get('duration')
            if not duration or duration.strip() == '':
                missing_dates += 1
            else:
                # Detect format patterns - be more flexible
                if re.search(r'[A-Z][a-z]{2,8},?\s+\d{4}', duration):
                    date_formats.add('month_year')
                elif re.search(r'\d{1,2}/\d{4}', duration):
                    date_formats.add('mm_yyyy')
                elif re.search(r'\d{4}-\d{2}', duration):
                    date_formats.add('yyyy_mm')
                elif re.search(r'\d{4}', duration):
                    date_formats.add('year_only')
        
        # Check education
        for edu in education:
            date = edu.get('date') or edu.get('graduation_date') or edu.get('graduation_year')
            if not date:
                missing_dates += 1
            else:
                if re.search(r'\d{4}', str(date)):
                    date_formats.add('year_only')
        
        # Calculate score and penalty - be more lenient
        # Only penalize if MORE THAN HALF are missing dates
        penalty = -5 if missing_dates > (total_entries // 2) else 0
        
        # Score based on consistency
        if len(date_formats) == 0:
            score = 1.0  # Some dates found but unclear format
        elif len(date_formats) == 1:
            score = 4.0  # Consistent format - perfect!
        elif len(date_formats) == 2:
            score = 3.0  # Mostly consistent (education vs experience can differ)
        else:
            score = 2.0  # Multiple formats
        
        return score, penalty
    
    def _check_grammar(self, text: str) -> float:
        """
        Basic grammar/spelling check
        Returns: score (0-5)
        Balanced - checks for common issues
        """
        errors = 0
        
        # Check for double spaces (any instance counts)
        double_space_count = text.count('  ')
        if double_space_count > 10:
            errors += 2
        elif double_space_count > 5:
            errors += 1
        
        # Check for common typos
        critical_typos = [
            'teh ', 'recieve', 'occured', 'seperate', 'definately',
            'experiance', 'responcible', 'managment', 'acheivement',
            'refered', 'succesful', 'profesional', 'adress'
        ]
        for typo in critical_typos:
            if typo in text.lower():
                errors += 2  # Each typo counts more
        
        # Check for inconsistent capitalization
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            # Check for sentences starting with lowercase (not bullets)
            if len(line) > 0 and line[0].islower() and not line.startswith(('•', '-', '◦', '*', 'i.e', 'e.g')):
                if len(line) > 20:  # Only count substantial lines
                    errors += 0.5
        
        # Score based on errors
        if errors == 0:
            return 5.0
        elif errors <= 1:
            return 4.0
        elif errors <= 2:
            return 3.0
        elif errors <= 4:
            return 2.0
        elif errors <= 6:
            return 1.0
        else:
            return 0.0
    
    def _detect_tailoring(self, text: str) -> bool:
        """
        Detect if resume appears tailored to specific role/domain
        Returns: True if tailoring detected
        """
        text_lower = text.lower()
        
        # Check for targeting keywords in summary/objective
        targeting_phrases = [
            'seeking', 'looking for', 'interested in', 'pursuing',
            'specializing in', 'focused on', 'passionate about',
            'applying for', 'position in', 'role in'
        ]
        
        for phrase in targeting_phrases:
            if phrase in text_lower:
                return True
        
        return False
    
    def _detect_leadership(self, text: str) -> bool:
        """
        Detect leadership/ownership language
        Returns: True if leadership indicators found
        """
        text_lower = text.lower()
        
        leadership_keywords = [
            'led', 'managed', 'supervised', 'coordinated', 'directed',
            'organized', 'mentored', 'trained', 'guided', 'oversaw',
            'spearheaded', 'championed', 'founded', 'established'
        ]
        
        count = sum(1 for keyword in leadership_keywords if keyword in text_lower)
        return count >= 2
    
    def _detect_oss_contributions(self, text: str) -> bool:
        """
        Detect open source contributions
        Returns: True if OSS contributions found
        """
        text_lower = text.lower()
        
        oss_indicators = [
            'github.com', 'open source', 'oss', 'pull request', 'pr merged',
            'contributor', 'maintainer', 'open-source', 'github repo'
        ]
        
        for indicator in oss_indicators:
            if indicator in text_lower:
                return True
        
        return False
    
    def _check_tone_readability(self, text: str) -> float:
        """
        Check professional tone and readability - Balanced
        Returns: score (0-3)
        """
        score = 3.0  # Start with full points
        
        # Count average sentence length (approximation)
        sentences = re.split(r'[.!?]+', text)
        valid_sentences = [s for s in sentences if len(s.strip().split()) > 3]
        
        if len(valid_sentences) == 0:
            return 1.5  # Some credit for concise resume
        
        avg_words_per_sentence = sum(len(s.split()) for s in valid_sentences) / len(valid_sentences)
        
        # Penalize long sentences (resume bullets should be concise)
        if avg_words_per_sentence > 35:
            score -= 1.5
        elif avg_words_per_sentence > 30:
            score -= 1.0
        elif avg_words_per_sentence > 25:
            score -= 0.5
        
        # Check for passive voice
        passive_indicators = ['was ', 'were ', 'been ', 'being ']
        passive_count = sum(text.lower().count(word) for word in passive_indicators)
        total_words = len(text.split())
        passive_ratio = passive_count / max(total_words, 1)
        
        # Penalize passive voice (aim for <5%)
        if passive_ratio > 0.10:  # More than 10% passive
            score -= 1.0
        elif passive_ratio > 0.06:  # More than 6% passive
            score -= 0.5
        
        return max(0.0, score)
    
    # ========== END NEW ATS FUNCTIONS ==========
    
    def analyze_resume(self, text: str, target_level: str = None) -> Dict[str, Any]:
        """
        Analyze resume text using ML and rule-based approaches
        
        Args:
            text: Resume text content
            target_level: Target experience level - 'entry', 'mid', 'senior' (optional)
                         If not provided, auto-detected from resume
            
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
        
        # Use target level if provided, otherwise use auto-detected level
        experience_level = target_level if target_level else extracted_info.get("experience_level", "entry")
        
        # Validate and normalize experience level
        valid_levels = ["entry", "mid", "senior"]
        if experience_level not in valid_levels:
            experience_level = "entry"  # Default to entry if invalid
        
        # Store the target level in extracted_info for scoring/recommendations
        extracted_info["target_level"] = experience_level
        
        # Calculate ATS score using HYBRID scoring system
        if self.model is not None:
            score_result = self._calculate_hybrid_ats_score(text, extracted_info, experience_level)
            ats_score = score_result['total_score']
            score_breakdown = score_result
        else:
            # Fallback to old ML scoring if model unavailable
            ats_score = self._calculate_rule_based_score(text, extracted_info, experience_level)
            score_breakdown = {'total_score': ats_score}
        
        # Generate insights and recommendations based on target level
        insights = self._generate_insights(extracted_info, ats_score, experience_level)
        strengths = self._generate_strengths(extracted_info, ats_score, experience_level)
        recommendations = self._generate_recommendations(extracted_info, ats_score, experience_level)
        
        # Determine status
        status, status_message = self._get_status(ats_score)
        
        return {
            "success": True,
            "score": round(ats_score, 1),
            "status": status,
            "statusMessage": status_message,
            "targetLevel": experience_level,
            "strengths": strengths,
            "insights": insights,
            "recommendations": recommendations,
            "scoreBreakdown": score_breakdown,
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
                "experienceLevel": experience_level,
                "detectedExperienceLevel": extracted_info.get("experience_level", "entry"),
                "targetLevel": experience_level,
                "yearsOfExperience": extracted_info.get("years_of_experience", 0),
                "detectionMeta": extracted_info.get("detection_meta", {})
            }
        }

    def _detect_sections_from_headers(self, lines: List[str]) -> List[str]:
        """Detect resume sections using line-header matching (more reliable than substring search)."""
        section_keywords = {
            "experience": ["experience", "work history", "employment", "professional experience", "workexperience"],
            "education": ["education", "academic", "qualifications", "degree"],
            "skills": ["skills", "technical skills", "competencies", "abilities", "expertise"],
            "summary": ["summary", "objective", "profile", "about"],
            "projects": ["projects", "portfolio", "work samples", "key projects", "personal projects"],
            "certifications": ["certifications", "certificates", "licenses"]
        }

        found_sections = []
        for raw_line in lines:
            # Normalize typical section header formatting: "PROJECTS:", "Projects |", etc.
            clean = re.sub(r'[^a-zA-Z\s]', ' ', raw_line).strip().lower()
            if not clean or len(clean) > 40:
                continue

            for section, keywords in section_keywords.items():
                if section in found_sections:
                    continue
                if any(clean == keyword or clean.startswith(keyword + " ") for keyword in keywords):
                    found_sections.append(section)
        return found_sections
    
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
        
        # Extract LinkedIn URL or label mention
        linkedin = None
        linkedin_confidence = "none"
        linkedin_patterns = [
            r'linkedin\.com/in/([a-zA-Z0-9-]+)',
            r'LinkedIn:\s*@?([a-zA-Z0-9-]+)',  # Support @username format
            r'linkedin:\s*@?([a-zA-Z0-9-]+)'
        ]
        for pattern in linkedin_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                linkedin = match.group(1)
                linkedin_confidence = "url"
                break
        if not linkedin and re.search(r'\blinked\s*in\b|\blinkedin\b', text_lower):
            linkedin = "mentioned"
            linkedin_confidence = "label"
        
        # Extract GitHub URL or label mention
        github = None
        github_confidence = "none"
        github_patterns = [
            r'github\.com/([a-zA-Z0-9-]+)',
            r'Github:\s*@?([a-zA-Z0-9-]+)',  # Support @username format
            r'github:\s*@?([a-zA-Z0-9-]+)'
        ]
        for pattern in github_patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                github = match.group(1)
                github_confidence = "url"
                break
        if not github and re.search(r'\bgithub\b', text_lower):
            github = "mentioned"
            github_confidence = "label"
        
        # Sections: prefer header-level detection, fallback to broad detection if very sparse.
        found_sections = self._detect_sections_from_headers(lines)
        if len(found_sections) < 2:
            section_keywords = {
                "experience": ["experience", "work history", "employment", "professional experience", "workexperience"],
                "education": ["education", "academic", "qualifications", "degree"],
                "skills": ["skills", "technical skills", "competencies", "abilities", "expertise"],
                "summary": ["summary", "objective", "profile", "about"],
                "projects": ["projects", "portfolio", "work samples"],
                "certifications": ["certifications", "certificates", "licenses"]
            }
            for section, keywords in section_keywords.items():
                if section not in found_sections and any(keyword in text_lower for keyword in keywords):
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
        
        # Count bullet points and collect full bullet text (handling multi-line bullets)
        # Includes middle dot and numbered bullets like "1." / "a)".
        bullet_pattern = r'^\s*(?:[•\-\*◦▪·●◉○►▸]\s+|\d+[\.\)]\s+|[a-zA-Z][\.\)]\s+)'
        list_like_pattern = r'^\s*(?:[•\-\*◦▪·●◉○►▸]|\d+[\.\)]|[a-zA-Z][\.\)])'
        bullets_full_text = []
        current_bullet = None
        has_list_like_lines = False
        
        for line in lines:
            if re.match(list_like_pattern, line):
                has_list_like_lines = True
            if re.match(bullet_pattern, line):
                # Save previous bullet
                if current_bullet:
                    bullets_full_text.append(current_bullet)
                # Start new bullet
                current_bullet = line
            elif current_bullet and line.strip():
                # Continuation of current bullet (non-empty line after bullet start)
                current_bullet += ' ' + line
        
        # Don't forget the last bullet
        if current_bullet:
            bullets_full_text.append(current_bullet)
        
        total_bullets = len(bullets_full_text)
        
        # Numbers and metrics - count overall and per bullet
        numbers = re.findall(r'\b\d+[%$,kmKMbB]?\b', text)
        
        # Count quantified bullets (bullets with numbers/metrics)
        # Much more comprehensive patterns for quantification
        quantified_bullets = 0
        quantification_patterns = [
            r'\d+\s*%',  # 30%, 30 %
            r'\d+\s*(percent|percentage)',  # 30 percent
            r'\$\s*\d+',  # $1000
            r'\d+[\d,]*\s*(million|thousand|billion|k|m|b)\b',  # 1 million, 500k
            r'\d+[\d,]*\+?\s*(users|customers|clients|people|participants|members|students|engineers)',  # 500+ users
            r'\d+[\d,]*\s*(hours|days|weeks|months|years)',  # 3 months
            r'\d+[\d,]*\s*(projects|features|components|modules|systems|applications|apps)',  # 5 projects
            r'\d+[\d,]*\s*(x|times)',  # 2x, 3 times
            r'(increased|decreased|reduced|improved|boosted|grew|raised|cut|saved|enhanced)\s+\w*\s*by\s*\d+',  # increased by 30
            r'(over|more than|under|less than|up to)\s+\d+',  # over 100
            r'\d+[\d,]*\s*(metrics|kpis|tickets|issues|bugs|tests)',  # 50 tickets
            r'\d+[\d,]*\s*(revenue|sales|profit|cost|budget)',  # $50k revenue
            r'from\s+\d+.*to\s+\d+',  # from 10 to 50
        ]
        
        for bullet_text in bullets_full_text:
            # Check if any quantification pattern matches in the full bullet text
            if any(re.search(pattern, bullet_text.lower()) for pattern in quantification_patterns):
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
            "years_of_experience": years_of_experience,
            "detection_meta": {
                "linkedin_confidence": linkedin_confidence,
                "github_confidence": github_confidence,
                "has_list_like_lines": has_list_like_lines
            }
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
        
        # Enhanced date pattern to match various formats including all abbreviations
        date_pattern = r'(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\.?,?\s*\d{4}\s*[-–—]\s*(?:(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\.?,?\s*\d{4}|Present|Current|present|current)'
        
        i = 0
        while i < len(lines):
            line = lines[i].strip()
            
            # Skip empty lines and section headers
            if not line or line.lower() in experience_keywords:
                i += 1
                continue
            
            # Check if this line has a date (inline format)
            date_match = re.search(date_pattern, line, re.IGNORECASE)
            
            if date_match:
                # Save previous experience if exists
                if current_org or current_role:
                    experience_list.append({
                        "organization": current_org or "Unknown",
                        "role": current_role or "Unknown",
                        "duration": current_duration,
                        "description": ' '.join(current_description)
                    })
                
                # Start new experience - date on same line as role/org
                current_duration = date_match.group()
                parts = line.split(date_match.group())
                before_date = parts[0].strip()
                
                # Check if there's a hyphen or dash indicating role
                if '-' in before_date or '|' in before_date:
                    separator = '-' if '-' in before_date else '|'
                    org_role = before_date.split(separator, 1)
                    current_org = org_role[0].strip()
                    current_role = org_role[1].strip() if len(org_role) > 1 else None
                else:
                    current_org = before_date
                    current_role = None
                
                current_description = []
                i += 1
                
            # Check if next 2 lines form a 3-line format: Role, Organization, Date
            elif i + 2 < len(lines):
                next_line = lines[i + 1].strip()
                next_next_line = lines[i + 2].strip()
                
                # Check if line after next has a date pattern
                date_match_ahead = re.search(date_pattern, next_next_line, re.IGNORECASE)
                
                if date_match_ahead and not line.startswith(('-', '•', '*', '◦', '▪')):
                    # Save previous experience if exists
                    if current_org or current_role:
                        experience_list.append({
                            "organization": current_org or "Unknown",
                            "role": current_role or "Unknown",
                            "duration": current_duration,
                            "description": ' '.join(current_description)
                        })
                    
                    # Format: Line1=Role, Line2=Organization, Line3=Date
                    current_role = line
                    current_org = next_line
                    current_duration = date_match_ahead.group()
                    current_description = []
                    
                    i += 3  # Skip all 3 lines
                    continue
            
            # Handle bullet points (description lines)
            if (current_org or current_role) and (line.startswith(('-', '•', '*', '◦', '▪')) or (current_description and len(line) > 10)):
                # Add to current description
                if line.startswith(('-', '•', '*', '◦', '▪')):
                    line = line[1:].strip()
                current_description.append(line)
                i += 1
                
            # Might be organization name without date format (fallback)
            elif not current_org and not line.startswith(('-', '•', '*', '◦', '▪')):
                if len(line.split()) <= 6 and not any(char.isdigit() for char in line):
                    current_org = line
                    current_role = None
                    current_duration = None
                    current_description = []
                i += 1
            else:
                i += 1
        
        # Save last experience
        if current_org or current_role:
            experience_list.append({
                "organization": current_org or "Unknown",
                "role": current_role or "Unknown",
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
        next_section_keywords = ['education', 'experience', 'skills', 'certifications', 'languages', 'links', 'achievements', 'summary']
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
            
            # Check if current line has technology separator (Project Name | Technologies)
            if '|' in line and not line.startswith(('-', '•', '*', '◦', '▪')):
                # This line has format: "Project Name | Technologies"
                parts = line.split('|', 1)  # Split only on first |
                project_name = parts[0].strip()
                technology = parts[1].strip() if len(parts) > 1 else ""
                
                # Continue collecting technology from continuation lines (lines that end with comma or look like tech)
                j = i + 1
                tech_parts = [technology]
                while j < len(lines):
                    next_line = lines[j]
                    # Check if this is a continuation of technologies:
                    # - Doesn't start with bullet
                    # - Doesn't start with http/github/link
                    # - No pipe character (not another project)
                    # - Either: starts with capital letter followed by comma-separated items OR previous tech line ended with comma
                    if (not next_line.startswith(('-', '•', '*', '◦', '▪')) and
                        not next_line.lower().startswith(('http', 'github', 'gitlab', 'link')) and
                        '|' not in next_line):
                        # Check if it looks like technology (has commas or ends with comma or is short technical term)
                        if (',' in next_line or 
                            tech_parts[-1].endswith(',') or
                            (len(next_line.split()) <= 2 and len(next_line) < 30)):
                            tech_parts.append(next_line)
                            j += 1
                            # Stop if this line doesn't end with comma (tech list ended)
                            if not next_line.endswith(','):
                                break
                        else:
                            # Not a tech continuation
                            break
                    else:
                        break
                
                # Join all technology parts
                technology = ' '.join(tech_parts).strip()
                
                # Look for subtitle/description line (non-bullet, not a link, reasonable length)
                subtitle = ""
                if j < len(lines):
                    next_line = lines[j]
                    # If next line is not a bullet and not a link and reasonable length, it's a subtitle
                    if (not next_line.startswith(('-', '•', '*', '◦', '▪')) and
                        not next_line.lower().startswith(('http', 'github', 'gitlab', 'link')) and
                        '|' not in next_line and
                        15 < len(next_line) < 100):
                        subtitle = next_line
                        j += 1
                
                # Collect description from following bullet points
                description_parts = []
                if subtitle:
                    description_parts.append(subtitle)
                
                while j < len(lines):
                    next_line = lines[j]
                    if next_line.startswith(('-', '•', '*', '◦', '▪')):
                        # Remove bullet and add to description
                        cleaned = next_line[1:].strip()
                        if cleaned:
                            description_parts.append(cleaned)
                        j += 1
                    elif next_line.lower().startswith(('github', 'gitlab', 'http', 'link', '•')):
                        # Skip link lines
                        j += 1
                    elif '|' in next_line and not next_line.startswith(('-', '•', '*')):
                        # Hit next project
                        break
                    else:
                        # Stop at next project/section
                        break
                
                projects_list.append({
                    "name": project_name,
                    "technology": technology,
                    "description": ' '.join(description_parts)
                })
                
                i = j
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
    
    def _calculate_ml_ats_score(self, text: str, info: Dict, experience_level: str = "entry") -> Dict:
        """
        Calculate ATS score using ML semantic analysis
        Adjusts expectations based on experience level (entry/mid/senior)
        
        Uses Sentence-BERT to compare resume against ideal resume characteristics
        Returns dict with total score and component breakdown
        """
        # Add text to info for experience detection
        info['text'] = text
        
        # Initialize score breakdown dictionary
        score_breakdown = {}
        
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
        
        # ADJUSTED SCORING - Industry-aligned (closer to ResumeWorded standards)
        # Base ML score (0-20 points) - Increased to match industry tools
        ml_score = avg_top_similarity * 20
        score_breakdown['ml_semantic_score'] = round(ml_score, 1)
        
        # Rule-based scoring (0-80 points) - Industry-standard thresholds
        rule_score = 0
        
        # Contact info (3 points) - Basic requirement
        contact_score = 0
        if info["has_contact"]:
            contact_score += 3
        elif info["email"] or info["phone"]:
            contact_score += 1.5
        score_breakdown['contact_info_score'] = round(contact_score, 1)
        rule_score += contact_score
        
        # Professional identity (2 points)
        identity_score = 0
        if info.get("name"):
            identity_score += 1
        if info.get("linkedin") or info.get("github"):
            identity_score += 1
        score_breakdown['professional_identity_score'] = round(identity_score, 1)
        rule_score += identity_score
        
        # Sections (5 points) - STRICT: Need all key sections
        sections_score = 0
        if len(info["sections"]) >= 6:
            sections_score = 5
        elif len(info["sections"]) >= 5:
            sections_score = 4
        elif len(info["sections"]) >= 4:
            sections_score = 3
        elif len(info["sections"]) >= 3:
            sections_score = 1.5
        # Less than 3 sections = 0 points
        score_breakdown['sections_score'] = round(sections_score, 1)
        rule_score += sections_score
        
        # Education (6 points) - STRICTER
        education_score = 0
        education_count = len(info.get("education", []))
        if experience_level == "entry":
            if education_count >= 1:
                edu = info.get("education", [{}])[0]
                if edu.get("institution") and edu.get("degree") and edu.get("field"):
                    education_score = 6  # Complete info only
                elif edu.get("institution") and edu.get("degree"):
                    education_score = 4  # Partial
                else:
                    education_score = 2  # Minimal
        elif experience_level == "mid":
            if education_count >= 2:
                education_score = 6
            elif education_count == 1:
                edu = info.get("education", [{}])[0]
                if edu.get("institution") and edu.get("degree"):
                    education_score = 5
                else:
                    education_score = 2.5
        else:  # senior
            if education_count >= 2:
                education_score = 5
            elif education_count >= 1:
                education_score = 4
        score_breakdown['education_score'] = round(education_score, 1)
        rule_score += education_score
        
        # Work Experience (15 points) - MOST IMPORTANT, ADJUSTED
        work_experience_score = 0
        work_exp_count = len(info.get("work_experience", []))
        project_count = len(info.get("projects", []))
        
        if experience_level == "entry":
            # Entry: Balance experience and projects (more forgiving)
            if work_exp_count >= 3:
                work_experience_score = 15  # Outstanding for entry
            elif work_exp_count == 2:
                work_experience_score = 13  # Excellent
            elif work_exp_count == 1:
                # If limited work exp, give more credit for projects
                if project_count >= 5:
                    work_experience_score = 13  # Strong project portfolio compensates
                elif project_count >= 4:
                    work_experience_score = 11
                elif project_count >= 3:
                    work_experience_score = 9
                else:
                    work_experience_score = 7  # Acceptable
            elif project_count >= 5:
                work_experience_score = 10  # Strong projects compensate significantly
            elif project_count >= 4:
                work_experience_score = 8  
            elif project_count >= 3:
                work_experience_score = 6  
            else:
                work_experience_score = 2  # Minimal
        elif experience_level == "mid":
            # Mid: Need proven track record
            if work_exp_count >= 4:
                work_experience_score = 15
            elif work_exp_count == 3:
                work_experience_score = 13
            elif work_exp_count == 2:
                work_experience_score = 8  # Below expectations
            elif work_exp_count == 1:
                work_experience_score = 3  # Major red flag
            else:
                work_experience_score = 0  # Unacceptable
        else:  # senior
            # Senior: Need extensive experience
            if work_exp_count >= 5:
                work_experience_score = 15
            elif work_exp_count >= 4:
                work_experience_score = 12
            elif work_exp_count == 3:
                work_experience_score = 7  # Minimum acceptable
            elif work_exp_count == 2:
                work_experience_score = 2  # Major concern
            else:
                work_experience_score = 0  # Unacceptable
        score_breakdown['work_experience_score'] = round(work_experience_score, 1)
        rule_score += work_experience_score
        
        # Projects (8 points) - STRICTER requirements
        projects_score = 0
        if experience_level == "entry":
            # Entry: Projects CRITICAL but need quality
            if project_count >= 5:
                projects_score = 8
            elif project_count >= 4:
                projects_score = 7
            elif project_count >= 3:
                projects_score = 5
            elif project_count >= 2:
                projects_score = 3
            elif project_count == 1:
                projects_score = 1
        elif experience_level == "mid":
            # Mid: Projects nice but not critical
            if project_count >= 4:
                projects_score = 8
            elif project_count >= 3:
                projects_score = 6
            elif project_count >= 2:
                projects_score = 4
            elif project_count >= 1:
                projects_score = 2
        else:  # senior
            # Senior: Projects optional
            if project_count >= 3:
                projects_score = 7
            elif project_count >= 2:
                projects_score = 5
            elif project_count >= 1:
                projects_score = 3
        score_breakdown['projects_score'] = round(projects_score, 1)
        rule_score += projects_score
        
        # Action verbs (6 points) - ADJUSTED: More realistic expectations
        action_verbs_score = 0
        verb_count = len(info["action_verbs"])
        if verb_count >= 15:
            action_verbs_score = 6
        elif verb_count >= 12:
            action_verbs_score = 5
        elif verb_count >= 10:
            action_verbs_score = 4
        elif verb_count >= 8:
            action_verbs_score = 3
        elif verb_count >= 6:
            action_verbs_score = 2
        elif verb_count >= 4:
            action_verbs_score = 1
        # Less than 4 verbs = 0 points
        score_breakdown['action_verbs_score'] = round(action_verbs_score, 1)
        rule_score += action_verbs_score
        
        # Skills diversity (5 points) - ADJUSTED: More reasonable expectations
        skills_score = 0
        skill_count = len(info.get("skills", []))
        if skill_count >= 25:
            skills_score = 5
        elif skill_count >= 20:
            skills_score = 4
        elif skill_count >= 15:
            skills_score = 3
        elif skill_count >= 10:
            skills_score = 2
        elif skill_count >= 6:
            skills_score = 1
        # Less than 6 skills = 0 points
        score_breakdown['skills_score'] = round(skills_score, 1)
        rule_score += skills_score
        
        # Metrics/quantification (7 points) - CRITICAL for impact
        # ADJUSTED: More lenient scoring aligned with industry standards
        quantification_score = 0
        total_bullets = info.get("total_bullets", 0)
        quantified_bullets = info.get("quantified_bullets", 0)
        
        if total_bullets > 0:
            quantification_ratio = quantified_bullets / total_bullets
            if quantification_ratio >= 0.5:  # 50%+
                quantification_score = 7
            elif quantification_ratio >= 0.4:  # 40%+
                quantification_score = 6
            elif quantification_ratio >= 0.3:  # 30%+
                quantification_score = 5
            elif quantification_ratio >= 0.2:  # 20%+
                quantification_score = 4
            elif quantification_ratio >= 0.15:  # 15%+
                quantification_score = 3
            elif quantification_ratio >= 0.10:  # 10%+
                quantification_score = 2
            elif quantification_ratio >= 0.05:  # 5%+
                quantification_score = 1
            # Less than 5% quantification = 0 points
        else:
            # Fallback to number count
            num_count = len(info.get("numbers", []))
            if num_count >= 10:
                quantification_score = 4
            elif num_count >= 7:
                quantification_score = 3
            elif num_count >= 5:
                quantification_score = 2
            elif num_count >= 3:
                quantification_score = 1
        score_breakdown['quantification_score'] = round(quantification_score, 1)
        rule_score += quantification_score
        
        # Content density (4 points) - STRICTER range
        content_density_score = 0
        word_count = info.get("word_count", len(text.split()))
        if 600 <= word_count <= 800:  # Optimal range (NARROWER)
            content_density_score = 4
        elif 500 <= word_count <= 900:  # Acceptable
            content_density_score = 3
        elif 400 <= word_count <= 1000:  # Marginal
            content_density_score = 2
        elif 300 <= word_count <= 1200:  # Needs work
            content_density_score = 1
        # Outside range = 0 points
        score_breakdown['content_density_score'] = round(content_density_score, 1)
        rule_score += content_density_score
        
        # Bullet points (24 points) - MAJOR differentiator, MUCH STRICTER
        bullet_points_score = 0
        total_bullets = info.get("total_bullets", 0)
        
        if experience_level == "entry":
            # Entry: 10-15 bullets expected (internships + projects)
            if 12 <= total_bullets <= 15:
                bullet_points_score = 24  # Perfect for entry
            elif 10 <= total_bullets <= 17:
                bullet_points_score = 20  # Very good
            elif 8 <= total_bullets <= 19:
                bullet_points_score = 16  # Good
            elif 6 <= total_bullets <= 21:
                bullet_points_score = 12  # Acceptable
            elif 5 <= total_bullets <= 23:
                bullet_points_score = 8  # Needs improvement
            elif total_bullets >= 4:
                bullet_points_score = 4  # Weak
            # Less than 4 bullets = 0 points
        elif experience_level == "mid":
            # Mid: 18-25 bullets expected (multiple roles + projects)
            if 20 <= total_bullets <= 25:
                bullet_points_score = 24  # Perfect for mid
            elif 18 <= total_bullets <= 28:
                bullet_points_score = 20  # Very good
            elif 15 <= total_bullets <= 30:
                bullet_points_score = 16  # Good
            elif 12 <= total_bullets <= 32:
                bullet_points_score = 12  # Acceptable
            elif 10 <= total_bullets <= 35:
                bullet_points_score = 8  # Needs improvement
            elif total_bullets >= 8:
                bullet_points_score = 4  # Weak
            # Less than 8 bullets = 0 points (unacceptable for mid)
        else:  # senior
            # Senior: 25-35 bullets expected (extensive experience)
            if 28 <= total_bullets <= 35:
                bullet_points_score = 24  # Perfect for senior
            elif 25 <= total_bullets <= 38:
                bullet_points_score = 20  # Very good
            elif 20 <= total_bullets <= 40:
                bullet_points_score = 16  # Good
            elif 18 <= total_bullets <= 42:
                bullet_points_score = 12  # Acceptable
            elif 15 <= total_bullets <= 45:
                bullet_points_score = 8  # Needs improvement
            elif total_bullets >= 12:
                bullet_points_score = 4  # Weak
            # Less than 12 bullets = 0 points (unacceptable for senior)
        score_breakdown['bullet_points_score'] = round(bullet_points_score, 1)
        rule_score += bullet_points_score
        
        # STRICT SCORING BREAKDOWN (Aligned with ResumeWorded standards):
        # ML Semantic: 20 points
        # Contact: 3 points (essential requirement)
        # Professional Identity: 2 points (LinkedIn/GitHub)
        # Sections: 5 points (need 6+ sections for full score)
        # Education: 6 points (level-dependent)
        # Work Experience: 15 points (CRITICAL, level-dependent)
        # Projects: 8 points (level-dependent)
        # Action Verbs: 6 points (need 15+ for full score)
        # Skills: 5 points (need 25+ for full score)
        # Metrics: 7 points (need 50%+ quantification for full score)
        # Content Density: 4 points (600-800 words optimal)
        # Bullet Points: 24 points (PRIMARY differentiator, level-dependent)
        # TOTAL: 20 + 80 = 100 points
        # This is MUCH STRICTER than before - most resumes will score 40-60%
        
        total_score = ml_score + rule_score
        score_breakdown['total_score'] = round(min(100, max(0, total_score)), 1)
        score_breakdown['rule_based_score'] = round(rule_score, 1)
        
        return score_breakdown
    
    def _calculate_hybrid_ats_score(self, text: str, info: Dict, experience_level: str = "entry") -> Dict:
        """
        HYBRID ATS SCORING SYSTEM v3.0
        Combines ML Semantic (20%) + ATS Formatting (28%) + Content (24%) + Skills (18%) + Education (10%) + Language (8%) + Length (2%)
        Plus bonuses/penalties for special cases
        """
        score_breakdown = {}
        
        #  ============ 1. ML SEMANTIC ANALYSIS: 20 POINTS (20%) ============
        
        ml_score = 0.0
        if self.model is not None:
            # More comprehensive ideal characteristics for better semantic matching
            ideal_characteristics = [
                "professional summary showcasing expertise and career goals with measurable achievements",
                "work experience with quantified results showing impact percentages revenue growth and performance metrics",
                "technical skills including programming languages frameworks cloud platforms and development tools",
                "projects demonstrating hands-on experience with real-world applications and technologies",
                "education credentials with degree specialization institution and graduation details",
                "strong action verbs like developed implemented architected optimized managed and led",
                "contact information with email phone LinkedIn GitHub and professional profiles",
                "clear section organization with experience education skills projects and achievements",
                "bullet points highlighting specific accomplishments with numbers percentages and outcomes",
                "leadership collaboration and team management experience with measurable results"
            ]
            
            resume_embedding = self.model.encode(text, convert_to_tensor=True)
            ideal_embeddings = self.model.encode(ideal_characteristics, convert_to_tensor=True)
            similarities = util.cos_sim(resume_embedding, ideal_embeddings)[0]
            # Use top 5 similarities for better coverage
            top_similarities = torch.topk(similarities, k=min(5, len(similarities))).values
            avg_top_similarity = torch.mean(top_similarities).item()
            # More strict: multiply by 22 instead of 25
            ml_score = min(20.0, avg_top_similarity * 22)
        
        score_breakdown['ml_semantic_score'] = round(ml_score, 1)
        
        # ============ 2. ATS FORMATTING & COMPATIBILITY: 28 POINTS (28%) ============
        
        formatting_score = 0.0
        
        # 2.1 File Type & Readability: 5 points
        file_type, file_penalty = self._detect_file_type()
        file_type_score = 5.0 if file_type == "text_based" else 0.0
        formatting_score += file_type_score
        score_breakdown['file_type_score'] = round(file_type_score, 1)
        
        # 2.2 Single-Column Layout: 6 points
        layout_type, layout_score = self._analyze_layout(text)
        formatting_score += layout_score
        score_breakdown['layout_score'] = round(layout_score, 1)
        
        # 2.3 Standard Section Headings: 5 points
        sections_count = len(info.get("sections", []))
        if sections_count >= 6:
            sections_score = 5.0
        elif sections_count >= 5:
            sections_score = 4.0
        elif sections_count >= 4:
            sections_score = 3.0
        elif sections_count >= 3:
            sections_score = 1.5
        else:
            sections_score = 0.0
        formatting_score += sections_score
        score_breakdown['sections_score'] = round(sections_score, 1)
        
        # 2.4 Date Consistency & Order: 4 points
        date_score, date_penalty = self._check_date_consistency(
            info.get("work_experience", []),
            info.get("education", [])
        )
        formatting_score += date_score
        score_breakdown['date_consistency_score'] = round(date_score, 1)
        
        # 2.5 Contact Information: 3 points
        contact_score = 0.0
        has_linkedin_github = bool(info.get("linkedin") or info.get("github"))
        if info.get("has_contact") and has_linkedin_github:
            contact_score = 3.0
        elif info.get("has_contact"):
            contact_score = 2.0
        elif info.get("email") or info.get("phone"):
            contact_score = 1.0
        formatting_score += contact_score
        score_breakdown['contact_info_score'] = round(contact_score, 1)
        
        # Check for missing contact penalty
        contact_penalty = -10 if not info.get("has_contact") else 0
        
        # 2.6 Bullet Usage & Density: 5 points (stricter)
        total_bullets = info.get("total_bullets", 0)
        work_exp_count = len(info.get("work_experience", []))
        
        if work_exp_count > 0:
            avg_bullets = total_bullets / work_exp_count
            # Ideal: 4-5 bullets per experience
            if 4 <= avg_bullets <= 5:
                bullet_density_score = 5.0
            elif 3 <= avg_bullets <= 6:
                bullet_density_score = 4.0
            elif 2 <= avg_bullets <= 7:
                bullet_density_score = 2.5
            elif avg_bullets >= 1:
                bullet_density_score = 1.0
            else:
                bullet_density_score = 0.0
        else:
            bullet_density_score = 0.0
        
        formatting_score += bullet_density_score
        score_breakdown['bullet_density_score'] = round(bullet_density_score, 1)
        
        score_breakdown['formatting_total'] = round(formatting_score, 1)
        
        # ============ 3. CONTENT STRUCTURE & QUALITY: 24 POINTS (24%) ============
        
        content_score = 0.0
        
        # 3.1 Summary/Profile Quality: 5 points (stricter)
        # Check for summary section with meaningful content
        text_lower = text.lower()
        has_summary = any(keyword in text_lower for keyword in ['summary', 'objective', 'profile', 'about me'])
        
        if has_summary:
            # Find summary section and check length
            summary_keywords_pos = []
            for keyword in ['summary', 'objective', 'profile']:
                pos = text_lower.find(keyword)
                if pos != -1:
                    summary_keywords_pos.append(pos)
            
            if summary_keywords_pos:
                # Get text after summary keyword (next ~200 chars)
                start_pos = min(summary_keywords_pos)
                summary_text = text[start_pos:start_pos+300]
                summary_words = len(summary_text.split())
                
                if summary_words >= 30:  # Substantial summary
                    summary_score = 5.0
                elif summary_words >= 20:
                    summary_score = 3.5
                elif summary_words >= 10:
                    summary_score = 2.0
                else:
                    summary_score = 0.5
            else:
                summary_score = 0.5
        else:
            summary_score = 0.0
        
        content_score += summary_score
        score_breakdown['summary_score'] = round(summary_score, 1)
        
        # 3.2 Skills Section Clarity & Grouping: 6 points (stricter)
        skills_count = len(info.get("skills", []))
        if skills_count >= 30:  # Raised from 25
            skills_clarity_score = 6.0
        elif skills_count >= 25:
            skills_clarity_score = 5.0
        elif skills_count >= 20:
            skills_clarity_score = 4.0
        elif skills_count >= 15:
            skills_clarity_score = 2.5
        elif skills_count >= 10:
            skills_clarity_score = 1.0
        else:
            skills_clarity_score = 0.0
        content_score += skills_clarity_score
        score_breakdown['skills_clarity_score'] = round(skills_clarity_score, 1)
        
        # 3.3 Experience Section Completeness: 8 points
        work_exp_count = len(info.get("work_experience", []))
        project_count = len(info.get("projects", []))
        
        if experience_level == "entry":
            if work_exp_count >= 3:
                exp_completeness_score = 8.0
            elif work_exp_count == 2:
                exp_completeness_score = 6.0
            elif work_exp_count == 1:
                exp_completeness_score = 4.0 if project_count >= 3 else 2.0
            else:
                exp_completeness_score = 0.0
        elif experience_level == "mid":
            if work_exp_count >= 4:
                exp_completeness_score = 8.0
            elif work_exp_count == 3:
                exp_completeness_score = 6.0
            elif work_exp_count == 2:
                exp_completeness_score = 3.0
            else:
                exp_completeness_score = 0.0
        else:  # senior
            if work_exp_count >= 5:
                exp_completeness_score = 8.0
            elif work_exp_count >= 4:
                exp_completeness_score = 6.0
            elif work_exp_count == 3:
                exp_completeness_score = 3.0
            else:
                exp_completeness_score = 0.0
        
        content_score += exp_completeness_score
        score_breakdown['experience_completeness_score'] = round(exp_completeness_score, 1)
        
        # 3.4 Projects & Internships Detail: 5 points
        if experience_level == "entry":
            if project_count >= 5:
                projects_detail_score = 5.0
            elif project_count >= 4:
                projects_detail_score = 4.0
            elif project_count >= 3:
                projects_detail_score = 3.0
            elif project_count >= 1:
                projects_detail_score = 1.0
            else:
                projects_detail_score = 0.0
        else:  # mid/senior
            if project_count >= 3:
                projects_detail_score = 5.0
            elif project_count >= 2:
                projects_detail_score = 3.0
            elif project_count >= 1:
                projects_detail_score = 1.0
            else:
                projects_detail_score = 0.0
        
        content_score += projects_detail_score
        score_breakdown['projects_detail_score'] = round(projects_detail_score, 1)
        
        score_breakdown['content_total'] = round(content_score, 1)
        
        # ============ 4. SKILLS & KEYWORDS: 18 POINTS (18%) ============
        
        skills_keywords_score = 0.0
        
        # 4.1 Hard Skills Presence & Diversity: 8 points
        if skills_count >= 25:
            hard_skills_score = 8.0
        elif skills_count >= 20:
            hard_skills_score = 6.0
        elif skills_count >= 15:
            hard_skills_score = 4.0
        elif skills_count >= 10:
            hard_skills_score = 2.0
        else:
            hard_skills_score = 0.0
        skills_keywords_score += hard_skills_score
        score_breakdown['hard_skills_score'] = round(hard_skills_score, 1)
        
        # 4.2 Action Verbs & Achievement Language: 5 points (balanced)
        verb_count = len(info.get("action_verbs", []))
        if verb_count >= 15:  # Back to strict
            action_verbs_score = 5.0
        elif verb_count >= 12:
            action_verbs_score = 4.0
        elif verb_count >= 10:
            action_verbs_score = 3.0
        elif verb_count >= 8:
            action_verbs_score = 2.0
        elif verb_count >= 5:
            action_verbs_score = 1.0
        else:
            action_verbs_score = 0.0  # No credit for too few
        skills_keywords_score += action_verbs_score
        score_breakdown['action_verbs_score'] = round(action_verbs_score, 1)
        
        # 4.3 Quantified Achievements Detection: 5 points (stricter)
        quantified_bullets = info.get("quantified_bullets", 0)
        if total_bullets > 0:
            quantification_ratio = quantified_bullets / total_bullets
            if quantification_ratio >= 0.5:  # Back to strict
                quantification_score = 5.0
            elif quantification_ratio >= 0.4:
                quantification_score = 4.0
            elif quantification_ratio >= 0.3:
                quantification_score = 3.0
            elif quantification_ratio >= 0.2:
                quantification_score = 2.0
            elif quantification_ratio >= 0.15:
                quantification_score = 1.0
            else:
                quantification_score = 0.0  # No credit for too few
        else:
            quantification_score = 0.0  # No bullets = no score
        
        skills_keywords_score += quantification_score
        score_breakdown['quantification_score'] = round(quantification_score, 1)
        
        score_breakdown['skills_keywords_total'] = round(skills_keywords_score, 1)
        
        # ============ 5. EDUCATION & CERTIFICATIONS: 10 POINTS (10%) ============
        
        education_score = 0.0
        education_count = len(info.get("education", []))
        
        # 5.1 Education Details: 6 points (more generous)
        if experience_level == "entry":
            if education_count >= 1:
                edu = info.get("education", [{}])[0]
                # Check for any combination of education fields
                has_institution = bool(edu.get("institution"))
                has_degree = bool(edu.get("degree"))
                has_field = bool(edu.get("field"))
                has_year = bool(edu.get("graduation_year") or edu.get("date") or edu.get("graduation_date"))
                
                details_count = sum([has_institution, has_degree, has_field, has_year])
                
                if details_count >= 3:
                    education_details_score = 6.0
                elif details_count >= 2:
                    education_details_score = 5.0
                elif details_count >= 1:
                    education_details_score = 3.0
                else:
                    education_details_score = 1.0
            else:
                education_details_score = 0.0
        elif experience_level == "mid":
            if education_count >= 2:
                education_details_score = 6.0
            elif education_count == 1:
                education_details_score = 5.0  # More generous
            else:
                education_details_score = 0.0
        else:  # senior
            if education_count >= 1:
                education_details_score = 6.0
            else:
                education_details_score = 2.0  # Some credit even without formal education
        
        education_score += education_details_score
        score_breakdown['education_details_score'] = round(education_details_score, 1)
        
        # 5.2 Certifications & Courses: 4 points (stricter)
        # Check for certification keywords in text
        cert_keywords = [
            'aws certified', 'google cloud certified', 'microsoft certified', 
            'cisco certified', 'comptia', 'pmp certified', 'scrum master',
            'oracle certified', 'red hat certified', 'cfa', 'cpa'
        ]
        text_lower = text.lower()
        cert_count = sum(1 for keyword in cert_keywords if keyword in text_lower)
        
        # Also check for certificate section
        has_cert_section = any(keyword in text_lower for keyword in ['certifications', 'certificates', 'licenses'])
        
        if cert_count >= 3 or (cert_count >= 2 and has_cert_section):
            certifications_score = 4.0
        elif cert_count >= 2:
            certifications_score = 3.0
        elif cert_count >= 1:
            certifications_score = 1.5
        else:
            certifications_score = 0.0
        
        education_score += certifications_score
        score_breakdown['certifications_score'] = round(certifications_score, 1)
        
        score_breakdown['education_total'] = round(education_score, 1)
        
        # ============ 6. LANGUAGE & PROFESSIONALISM: 8 POINTS (8%) ============
        
        language_score = 0.0
        
        # 6.1 Grammar & Spelling: 5 points
        grammar_score = self._check_grammar(text)
        language_score += grammar_score
        score_breakdown['grammar_score'] = round(grammar_score, 1)
        
        # 6.2 Tone & Readability: 3 points
        tone_score = self._check_tone_readability(text)
        language_score += tone_score
        score_breakdown['tone_score'] = round(tone_score, 1)
        
        score_breakdown['language_total'] = round(language_score, 1)
        
        # ============ 7. LENGTH & CONCISION: 2 POINTS (2%) ============
        
        word_count = info.get("word_count", len(text.split()))
        
        if experience_level == "entry":
            if 400 <= word_count <= 800:
                length_score = 2.0
            elif 300 <= word_count <= 1000:
                length_score = 1.0
            else:
                length_score = 0.0
        elif experience_level == "mid":
            if 600 <= word_count <= 1000:
                length_score = 2.0
            elif 500 <= word_count <= 1200:
                length_score = 1.0
            else:
                length_score = 0.0
        else:  # senior
            if 800 <= word_count <= 1200:
                length_score = 2.0
            elif 600 <= word_count <= 1400:
                length_score = 1.0
            else:
                length_score = 0.0
        
        score_breakdown['length_score'] = round(length_score, 1)
        
        # ============ 8. BONUSES (Max +4, reduced from +6) ============
        
        bonuses = 0.0
        
        # Tailoring detected: +2 points (reduced from +3)
        if self._detect_tailoring(text):
            bonuses += 2.0
            score_breakdown['tailoring_bonus'] = 2.0
        
        # Leadership/Ownership: +1.5 points (reduced from +2)
        if self._detect_leadership(text):
            bonuses += 1.5
            score_breakdown['leadership_bonus'] = 1.5
        
        # OSS Contributions: +0.5 point (reduced from +1)
        if self._detect_oss_contributions(text):
            bonuses += 0.5
            score_breakdown['oss_bonus'] = 0.5
        
        score_breakdown['total_bonuses'] = round(bonuses, 1)
        
        # ============ 9. PENALTIES (Max -35) ============
        
        penalties = 0.0

        # Target level mismatch penalty:
        # if user selects a level much higher than detected profile evidence, penalize strongly.
        detected_level = info.get("experience_level", "entry")
        years_of_experience = int(info.get("years_of_experience", 0) or 0)
        level_rank = {"entry": 1, "mid": 2, "senior": 3}
        target_rank = level_rank.get(experience_level, 1)
        detected_rank = level_rank.get(detected_level, 1)
        rank_gap = target_rank - detected_rank

        level_mismatch_penalty = 0.0
        if rank_gap > 0:
            # Baseline penalty for claiming higher level than detected.
            level_mismatch_penalty = -4.0 * rank_gap

            # Additional evidence checks to make senior claims much stricter.
            work_exp_count = len(info.get("work_experience", []))
            if experience_level == "senior" and years_of_experience < 5:
                level_mismatch_penalty -= 4.0
            if experience_level == "mid" and years_of_experience < 2:
                level_mismatch_penalty -= 2.0
            if work_exp_count == 0:
                level_mismatch_penalty -= 2.0

            # Cap penalty to avoid total collapse.
            level_mismatch_penalty = max(level_mismatch_penalty, -14.0)
        
        # File type penalty (already calculated)
        penalties += file_penalty
        if file_penalty < 0:
            score_breakdown['file_type_penalty'] = file_penalty
        
        # Missing contact penalty (already calculated)
        penalties += contact_penalty
        if contact_penalty < 0:
            score_breakdown['contact_penalty'] = contact_penalty
        
        # Missing dates penalty (already calculated)
        penalties += date_penalty
        if date_penalty < 0:
            score_breakdown['dates_penalty'] = date_penalty

        penalties += level_mismatch_penalty
        if level_mismatch_penalty < 0:
            score_breakdown['level_mismatch_penalty'] = round(level_mismatch_penalty, 1)
            score_breakdown['level_mismatch_detail'] = {
                "target_level": experience_level,
                "detected_level": detected_level,
                "years_of_experience": years_of_experience,
                "rank_gap": rank_gap
            }
        
        score_breakdown['total_penalties'] = round(penalties, 1)
        
        # ============ FINAL SCORE CALCULATION ============
        
        base_score = (
            ml_score +
            formatting_score +
            content_score +
            skills_keywords_score +
            education_score +
            language_score +
            length_score
        )
        
        final_score = base_score + bonuses + penalties
        final_score = max(0, min(100, final_score))
        
        score_breakdown['base_score'] = round(base_score, 1)
        score_breakdown['total_score'] = round(final_score, 1)
        
        # Category summaries for easy reference
        score_breakdown['category_scores'] = {
            'ml_semantic': round(ml_score, 1),
            'formatting': round(formatting_score, 1),
            'content': round(content_score, 1),
            'skills': round(skills_keywords_score, 1),
            'education': round(education_score, 1),
            'language': round(language_score, 1),
            'length': round(length_score, 1),
            'bonuses': round(bonuses, 1),
            'penalties': round(penalties, 1)
        }
        
        return score_breakdown
    
    def _calculate_rule_based_score(self, text: str, info: Dict, experience_level: str = "entry") -> float:
        """Fallback rule-based scoring when ML is not available - level-aware"""
        # Note: This is a simpler version for when ML is unavailable
        # For full level-aware scoring, the ML version is recommended
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

        # Apply target-level mismatch penalty in fallback mode too.
        detected_level = info.get("experience_level", "entry")
        years_of_experience = int(info.get("years_of_experience", 0) or 0)
        level_rank = {"entry": 1, "mid": 2, "senior": 3}
        target_rank = level_rank.get(experience_level, 1)
        detected_rank = level_rank.get(detected_level, 1)
        rank_gap = target_rank - detected_rank

        if rank_gap > 0:
            penalty = 4.0 * rank_gap
            if experience_level == "senior" and years_of_experience < 5:
                penalty += 4.0
            if experience_level == "mid" and years_of_experience < 2:
                penalty += 2.0
            if len(info.get("work_experience", [])) == 0:
                penalty += 2.0
            score -= min(14.0, penalty)
        
        return min(100, max(0, score))
    
    def _generate_insights(self, info: Dict, score: float, experience_level: str = "entry") -> List[str]:
        """Generate positive insights about the resume based on target level"""
        insights = []
        
        # Level-specific messaging
        level_labels = {
            "entry": "Entry-Level",
            "mid": "Mid-Level",
            "senior": "Senior-Level"
        }
        
        if score >= 80:
            insights.append(f"Excellent {level_labels[experience_level]} resume optimization for ATS systems")
        elif score >= 70:
            insights.append(f"Very good {level_labels[experience_level]} resume structure with strong ATS compatibility")
        elif score >= 60:
            insights.append(f"Good {level_labels[experience_level]} resume structure with room for enhancement")
        elif score >= 50:
            insights.append(f"Decent {level_labels[experience_level]} resume foundation - follow recommendations to improve")
        else:
            insights.append(f"{level_labels[experience_level]} resume needs improvement - focus on the recommendations below")
        
        if info["has_contact"]:
            insights.append("Complete contact information present")
        
        # Professional links - NEW
        if info.get("linkedin") and info.get("github"):
            insights.append("Strong professional presence with LinkedIn and GitHub profiles")
        elif info.get("linkedin") or info.get("github"):
            insights.append("Professional profile link included")
        
        # Education - NEW
        education_count = len(info.get("education", []))
        if education_count >= 2:
            insights.append(f"Multiple degrees listed ({education_count} found)")
        elif education_count == 1:
            insights.append("Educational background included")
        
        # Work Experience - NEW
        work_exp_count = len(info.get("work_experience", []))
        if work_exp_count >= 3:
            insights.append(f"Rich work history with {work_exp_count} experiences")
        elif work_exp_count >= 2:
            insights.append(f"Good work history with {work_exp_count} experiences")
        elif work_exp_count == 1:
            insights.append("Work experience included")
        
        # Projects - NEW
        project_count = len(info.get("projects", []))
        if project_count >= 3:
            insights.append(f"Strong project portfolio with {project_count} projects")
        elif project_count >= 2:
            insights.append(f"Good project showcase with {project_count} projects")
        elif project_count == 1:
            insights.append("Project work demonstrated")
        
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

    def _generate_strengths(self, info: Dict, score: float, experience_level: str = "entry") -> List[str]:
        """Generate explicit strengths list for frontend display."""
        insights = self._generate_insights(info, score, experience_level)
        strengths = []

        for item in insights:
            lower = item.lower()
            if any(token in lower for token in [
                "good", "strong", "well", "excellent", "complete", "optimal",
                "professional profile", "educational background", "work experience",
                "project work", "comprehensive", "diverse"
            ]):
                strengths.append(item)

        # Preserve order and uniqueness
        return list(dict.fromkeys(strengths))
    
    def _generate_recommendations(self, info: Dict, score: float, experience_level: str = "entry") -> List[str]:
        """Generate level-appropriate recommendations for improvement"""
        recommendations = []
        
        work_exp_count = len(info.get("work_experience", []))
        project_count = len(info.get("projects", []))
        education_count = len(info.get("education", []))
        total_bullets = info.get("total_bullets", 0)
        detection_meta = info.get("detection_meta", {})
        linkedin_confidence = detection_meta.get("linkedin_confidence", "none")
        github_confidence = detection_meta.get("github_confidence", "none")
        has_list_like_lines = detection_meta.get("has_list_like_lines", False)
        
        # Professional identity
        if not info.get("name"):
            recommendations.append("📛 Add your full name at the top of your resume")
        
        # Evidence-based gating: only suggest links when truly absent.
        if linkedin_confidence == "none" and github_confidence == "none":
            if experience_level == "entry":
                recommendations.append("🔗 Add LinkedIn profile (essential) or GitHub (if technical)")
            else:
                recommendations.append("🔗 Add LinkedIn and GitHub profiles to strengthen professional presence")
        
        # Contact info
        if not info["has_contact"]:
            if not info["email"]:
                recommendations.append("⚠️ Add your email address at the top of your resume")
            if not info["phone"]:
                recommendations.append("⚠️ Add your phone number for easy contact")
        
        # Education - Level-specific expectations
        if education_count == 0:
            recommendations.append("🎓 Add an Education section with your degree, institution, and graduation year")
        elif education_count == 1:
            edu = info.get("education", [{}])[0]
            if not edu.get("institution"):
                recommendations.append("🎓 Include the name of your educational institution")
            if not edu.get("degree"):
                recommendations.append("🎓 Specify your degree/major in the Education section")
            if experience_level == "senior" and not edu.get("degree"):
                recommendations.append("🎓 Consider adding advanced degrees or certifications if applicable")
        
        # Work Experience - CRITICAL level-specific recommendations
        if experience_level == "entry":
            # Entry: Focus on getting ANY experience or strong projects
            if work_exp_count == 0:
                if project_count < 3:
                    recommendations.append("💼 Add internships, volunteer work, or part-time jobs to demonstrate experience")
                    recommendations.append("🚀 Include 3-4 substantial projects to compensate for limited work experience")
            elif work_exp_count == 1:
                recommendations.append("💼 Add more internships or part-time experiences if available")
        
        elif experience_level == "mid":
            # Mid: Need 2-3 professional experiences
            if work_exp_count == 0:
                recommendations.append("⚠️ CRITICAL: Mid-level positions require 2-3 years work experience - add all relevant roles")
            elif work_exp_count == 1:
                recommendations.append("💼 Add more work experiences - mid-level roles typically require 2-3 positions")
            elif work_exp_count == 2:
                recommendations.append("💼 Consider adding additional relevant experiences to strengthen your profile")
        
        else:  # senior
            # Senior: Need 3+ experiences showing progression
            if work_exp_count < 3:
                recommendations.append("⚠️ CRITICAL: Senior positions require 3+ work experiences showing career progression")
            elif work_exp_count == 3:
                recommendations.append("💼 Consider adding more experiences to demonstrate extensive background (4+ is ideal)")
        
        # Projects - Level-specific expectations
        if experience_level == "entry":
            # Entry: Projects are ESSENTIAL
            if project_count == 0:
                recommendations.append("🚀 CRITICAL: Add 3-4 projects to demonstrate your skills (essential for entry-level)")
            elif project_count == 1:
                recommendations.append("🚀 Add more projects (aim for 3-4) - crucial for entry-level candidates")
            elif project_count == 2:
                recommendations.append("🚀 Add 1-2 more projects to strengthen your portfolio")
        
        elif experience_level == "mid":
            # Mid: Projects show initiative
            if project_count == 0 and work_exp_count < 3:
                recommendations.append("🚀 Add 2-3 projects to demonstrate continued skill development")
            elif project_count == 1:
                recommendations.append("🚀 Add more projects to showcase diverse skills and initiative")
        
        else:  # senior
            # Senior: Projects are nice-to-have
            if project_count == 0:
                recommendations.append("🚀 Consider adding 1-2 notable projects or technical leadership examples")
        
        # Bullet count - Level-specific expectations
        if experience_level == "entry":
            if total_bullets < 10 and not (total_bullets == 0 and has_list_like_lines):
                recommendations.append(f"📝 Add more bullet points (currently {total_bullets}, aim for 12-20 for entry-level)")
            elif total_bullets < 12 and not (total_bullets == 0 and has_list_like_lines):
                recommendations.append(f"📝 Add a few more details (currently {total_bullets}, aim for 15-20)")
        elif experience_level == "mid":
            if total_bullets < 20 and not (total_bullets == 0 and has_list_like_lines):
                recommendations.append(f"📝 Add more accomplishment bullets (currently {total_bullets}, aim for 20-30 for mid-level)")
            elif total_bullets < 25 and not (total_bullets == 0 and has_list_like_lines):
                recommendations.append(f"📝 Expand your accomplishments (currently {total_bullets}, aim for 25-30)")
        else:  # senior
            if total_bullets < 30 and not (total_bullets == 0 and has_list_like_lines):
                recommendations.append(f"📝 Add more detailed accomplishments (currently {total_bullets}, aim for 30-35+ for senior-level)")
            elif total_bullets < 35 and not (total_bullets == 0 and has_list_like_lines):
                recommendations.append(f"📝 Expand on your leadership impact (currently {total_bullets}, aim for 35+)")
        
        # Sections
        missing_sections = set(["experience", "education", "skills", "summary"]) - set(info["sections"])
        if missing_sections:
            for section in missing_sections:
                recommendations.append(f"📝 Add a '{section.title()}' section to improve structure")
        
        # Repetitive action verbs
        repetitive_verbs = info.get("repetitive_verbs", {})
        if repetitive_verbs:
            for verb, count in repetitive_verbs.items():
                recommendations.append(f"🔄 Replace repetitive '{verb.title()}' verb (used {count} times) - use it max 2 times")
        
        # Action verbs
        # Avoid false negatives for very short resumes with quality content.
        if len(info["action_verbs"]) < 5 and info.get("word_count", 0) >= 180:
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
