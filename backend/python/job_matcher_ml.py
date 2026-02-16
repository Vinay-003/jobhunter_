"""
ML-Based Job Matcher using Sentence-BERT
Calculates semantic similarity between resume and job descriptions
"""

import json
import re
import logging
from typing import Dict, List, Any
try:
    from sentence_transformers import SentenceTransformer, util
    import torch
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("Warning: ML libraries not available. Install with: pip install sentence-transformers torch")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s - %(message)s',
    datefmt='%H:%M:%S'
)


class JobMatcherML:
    """ML-powered job matcher using Sentence-BERT for semantic similarity"""
    
    def __init__(self):
        """Initialize the ML model"""
        self.model = None
        # Use resume-specific fine-tuned model (same as ResumeAnalyzerML)
        self.model_name = 'anass1209/resume-job-matcher-all-MiniLM-L6-v2'
        self.fallback_model = 'all-mpnet-base-v2'  # Fallback to general model if needed
        
        if ML_AVAILABLE:
            try:
                print(f"Loading Resume-Job Matching Model: {self.model_name}...")
                print("📌 This model is specifically fine-tuned for resume-job matching!")
                
                # Try to load resume-specific model
                import os
                cache_dir = os.path.expanduser('~/.cache/huggingface/hub')
                
                # Check for resume-specific model in cache
                # Handle both formats: with and without username prefix
                model_variants = [
                    f'models--anass1209--{self.model_name.split("/")[-1]}',
                    f'models--sentence-transformers--{self.model_name.split("/")[-1]}'
                ]
                
                model_loaded = False
                for variant in model_variants:
                    model_path = os.path.join(cache_dir, variant)
                    if os.path.exists(model_path):
                        snapshots_path = os.path.join(model_path, 'snapshots')
                        if os.path.exists(snapshots_path):
                            snapshot_dirs = [d for d in os.listdir(snapshots_path) if os.path.isdir(os.path.join(snapshots_path, d))]
                            if snapshot_dirs:
                                snapshot_path = os.path.join(snapshots_path, snapshot_dirs[0])
                                print(f"📂 Loading resume-specific model from cache...")
                                self.model = SentenceTransformer(snapshot_path)
                                model_loaded = True
                                break
                
                if not model_loaded:
                    # Download the resume-specific model
                    print("📥 Downloading resume-specific model (first time, ~90MB)...")
                    self.model = SentenceTransformer(self.model_name)
                
                # Set model to evaluation mode
                if self.model:
                    self.model.eval()
                    print("✅ Resume-specific model loaded successfully!")
                    
            except Exception as e:
                print(f"⚠️ Could not load resume-specific model: {e}")
                print(f"💡 Falling back to general model: {self.fallback_model}")
                try:
                    # Fallback to general-purpose model
                    self.model = SentenceTransformer(self.fallback_model)
                    if self.model:
                        self.model.eval()
                        print("✅ Fallback model loaded successfully!")
                except Exception as e2:
                    print(f"❌ Fallback loading also failed: {e2}")
                    self.model = None
        else:
            print("❌ ML libraries not available. Falling back to keyword matching.")
    
    def calculate_match_score(
        self,
        resume_text: str,
        job_description: str,
        job_title: str = "",
        ats_score: float = 0,
        experience_level: str = "entry",
        years_of_experience: int = 0
    ) -> Dict[str, Any]:
        """
        Calculate match score between resume and job
        
        Args:
            resume_text: Full resume text
            job_description: Job description text
            job_title: Job title (optional)
            ats_score: Resume ATS score (0-100)
            
        Returns:
            Dictionary with match score and details
        """
        if not resume_text or not job_description:
            return {
                "success": False,
                "error": "Resume text and job description are required"
            }
        
        if self.model is not None:
            # ML-based matching
            match_result = self._calculate_ml_match(
                resume_text, job_description, job_title, ats_score, 
                experience_level, years_of_experience
            )
        else:
            # Fallback to keyword matching
            match_result = self._calculate_keyword_match(
                resume_text, job_description, ats_score
            )
        
        return {
            "success": True,
            **match_result
        }
    
    def batch_calculate_matches(
        self,
        resume_text: str,
        jobs: List[Dict[str, str]],
        ats_score: float = 0,
        experience_level: str = "entry",
        years_of_experience: int = 0
    ) -> List[Dict[str, Any]]:
        """
        Calculate match scores for multiple jobs at once (more efficient)
        
        Args:
            resume_text: Full resume text
            jobs: List of job dicts with 'description' and optionally 'title'
            ats_score: Resume ATS score
            
        Returns:
            List of match results for each job
        """
        if not resume_text or not jobs:
            return []
        
        results = []
        
        if self.model is not None and len(jobs) > 1:
            # Batch processing for efficiency
            results = self._batch_ml_match(resume_text, jobs, ats_score, experience_level, years_of_experience)
        else:
            # Process individually
            for job in jobs:
                result = self.calculate_match_score(
                    resume_text,
                    job.get('description', ''),
                    job.get('title', ''),
                    ats_score,
                    experience_level,
                    years_of_experience
                )
                results.append(result)
        
        return results
    
    def _calculate_ml_match(
        self,
        resume_text: str,
        job_description: str,
        job_title: str,
        ats_score: float,
        experience_level: str = "entry",
        years_of_experience: int = 0
    ) -> Dict[str, Any]:
        """Calculate match using Sentence-BERT semantic similarity"""
        
        logging.info("=" * 80)
        logging.info("🎯 CALCULATING JOB MATCH")
        logging.info(f"Job Title: {job_title[:100] if job_title else 'N/A'}")
        logging.info(f"Resume Length: {len(resume_text)} chars, Job Desc Length: {len(job_description)} chars")
        logging.info(f"Candidate: {experience_level} level, {years_of_experience} years exp")
        
        # Combine job title and description for better context
        job_text = f"{job_title} {job_description}" if job_title else job_description
        job_text_lower = job_text.lower()
        
        # Detect if this is a snippet (short text) vs full job description
        word_count = len(job_text.split())
        is_snippet = word_count < 100  # Less than 100 words = likely a snippet
        logging.info(f"Job Text: {word_count} words - {'SNIPPET' if is_snippet else 'FULL DESCRIPTION'}")
        
        # CRITICAL: Detect job seniority level
        job_seniority = self._detect_job_seniority(job_title, job_description)
        logging.info(f"Job Level Detected: {job_seniority.upper()}")
        
        # Calculate seniority mismatch penalty
        seniority_penalty = self._calculate_seniority_penalty(
            experience_level, years_of_experience, job_seniority, job_text_lower
        )
        if seniority_penalty > 0:
            logging.warning(f"⚠️ Seniority Mismatch Penalty: -{seniority_penalty:.1f} points ({experience_level} → {job_seniority})")
        
        # Encode texts
        logging.info("📊 Encoding texts with resume-specific model...")
        resume_embedding = self.model.encode(resume_text, convert_to_tensor=True)
        job_embedding = self.model.encode(job_text, convert_to_tensor=True)
        
        # Calculate cosine similarity
        similarity = util.cos_sim(resume_embedding, job_embedding)[0][0].item()
        logging.info(f"🔍 Raw Semantic Similarity: {similarity:.4f} ({similarity*100:.1f}%)")
        
        logging.info("")
        logging.info("📐 SEMANTIC SCORE CALCULATION:")
        logging.info(f"   Using {'SNIPPET' if is_snippet else 'FULL DESCRIPTION'} formula")
        
        # IMPROVED FORMULA WITH SNIPPET BOOST:
        # For snippets (Jooble), apply more generous scoring since they lack full context
        if is_snippet:
            # Snippet formula - more generous (shift entire curve up)
            if similarity >= 0.6:
                semantic_score = 75 + (similarity - 0.6) * 62.5  # 75-100 points
                logging.info(f"   Range: ≥0.6 → Formula: 75 + ({similarity:.4f} - 0.6) × 62.5")
                logging.info(f"   Calculation: 75 + {similarity - 0.6:.4f} × 62.5 = {semantic_score:.1f}")
            elif similarity >= 0.4:
                semantic_score = 60 + (similarity - 0.4) * 75  # 60-75 points
                logging.info(f"   Range: 0.4-0.6 → Formula: 60 + ({similarity:.4f} - 0.4) × 75")
                logging.info(f"   Calculation: 60 + {similarity - 0.4:.4f} × 75 = {semantic_score:.1f}")
            elif similarity >= 0.25:
                semantic_score = 45 + (similarity - 0.25) * 100  # 45-60 points
                logging.info(f"   Range: 0.25-0.4 → Formula: 45 + ({similarity:.4f} - 0.25) × 100")
                logging.info(f"   Calculation: 45 + {similarity - 0.25:.4f} × 100 = {semantic_score:.1f}")
            else:
                semantic_score = similarity * 180  # 0-45 points
                logging.info(f"   Range: <0.25 → Formula: {similarity:.4f} × 180")
                logging.info(f"   Calculation: {similarity:.4f} × 180 = {semantic_score:.1f}")
        else:
            # Full description formula - standard scoring
            if similarity >= 0.7:
                semantic_score = 70 + (similarity - 0.7) * 50  # 70-85 points
                logging.info(f"   Range: ≥0.7 → Formula: 70 + ({similarity:.4f} - 0.7) × 50")
                logging.info(f"   Calculation: 70 + {similarity - 0.7:.4f} × 50 = {semantic_score:.1f}")
            elif similarity >= 0.5:
                semantic_score = 55 + (similarity - 0.5) * 75  # 55-70 points
                logging.info(f"   Range: 0.5-0.7 → Formula: 55 + ({similarity:.4f} - 0.5) × 75")
                logging.info(f"   Calculation: 55 + {similarity - 0.5:.4f} × 75 = {semantic_score:.1f}")
            elif similarity >= 0.3:
                semantic_score = 35 + (similarity - 0.3) * 100  # 35-55 points
                logging.info(f"   Range: 0.3-0.5 → Formula: 35 + ({similarity:.4f} - 0.3) × 100")
                logging.info(f"   Calculation: 35 + {similarity - 0.3:.4f} × 100 = {semantic_score:.1f}")
            else:
                semantic_score = similarity * 116.7  # 0-35 points
                logging.info(f"   Range: <0.3 → Formula: {similarity:.4f} × 116.7")
                logging.info(f"   Calculation: {similarity:.4f} × 116.7 = {semantic_score:.1f}")
        
        logging.info(f"   ✅ Semantic Score: {semantic_score:.1f}/100")
        logging.info("")
        
        # ATS no longer contributes to job match score.
        ats_contribution = 0.0
        
        # Total match score BEFORE seniority penalty
        base_score = semantic_score
        
        logging.info("➕ BASE SCORE CALCULATION:")
        logging.info(f"   Semantic Score: {semantic_score:.1f}")
        logging.info("   ATS Contribution: +0.0 (disabled)")
        logging.info(f"   Formula: {semantic_score:.1f}")
        logging.info(f"   ✅ Base Score: {base_score:.1f}/100")
        logging.info("")
        
        # Apply seniority penalty
        logging.info("⚖️ SENIORITY PENALTY APPLICATION:")
        logging.info(f"   Candidate Level: {experience_level}")
        logging.info(f"   Job Level: {job_seniority}")
        logging.info(f"   Penalty: -{seniority_penalty:.1f} points")
        logging.info(f"   Formula: max(0, min(100, {base_score:.1f} - {seniority_penalty:.1f}))")
        
        final_score = max(0, min(100, base_score - seniority_penalty))
        logging.info(f"   Calculation: max(0, min(100, {base_score - seniority_penalty:.1f}))")
        logging.info(f"   ✅ Final Score: {final_score:.1f}/100")
        logging.info("")
        
        # Determine match level
        if final_score >= 80:
            match_level = "excellent"
            level_range = "80-100"
        elif final_score >= 65:
            match_level = "very-good"
            level_range = "65-79"
        elif final_score >= 50:
            match_level = "good"
            level_range = "50-64"
        elif final_score >= 35:
            match_level = "fair"
            level_range = "35-49"
        else:
            match_level = "poor"
            level_range = "0-34"
        
        logging.info("🎖️ MATCH LEVEL DETERMINATION:")
        logging.info(f"   Score: {final_score:.1f}/100")
        logging.info(f"   Range: {level_range}")
        logging.info(f"   ✅ Match Level: {match_level.upper()}")
        
        # Generate match reasons
        reasons = self._generate_match_reasons(
            resume_text, job_text, similarity, ats_score, final_score, 
            seniority_penalty, experience_level, job_seniority
        )
        
        logging.info(f"💡 Top Reasons: {reasons[:2]}")
        logging.info("=" * 80 + "\n")
        
        return {
            "matchScore": round(final_score, 1),
            "semanticSimilarity": round(similarity * 100, 1),
            "atsContribution": round(ats_contribution, 1),
            "seniorityPenalty": round(seniority_penalty, 1),
            "candidateLevel": experience_level,
            "jobLevel": job_seniority,
            "matchLevel": match_level,
            "reasons": reasons,
            "methodology": f"ML-based ({'snippet' if is_snippet else 'full description'})"
        }
    
    def _detect_job_seniority(self, job_title: str, job_description: str) -> str:
        """
        Detect job seniority level from title and description with comprehensive keyword matching
        
        Returns: 'entry', 'mid', 'senior', 'principal', 'intern'
        """
        title_lower = job_title.lower()
        desc_lower = job_description.lower()
        combined = f"{title_lower} {desc_lower}"
        
        # Priority 1: Intern/student level (highest priority - most specific)
        intern_keywords = [
            'intern', 'internship', 'co-op', 'co op', 'trainee', 'apprentice',
            'student', 'undergraduate', 'summer intern', 'winter intern', 
            'part-time intern', 'research intern'
        ]
        # Exclude "graduate student" from intern (that's for PhDs)
        if any(keyword in combined for keyword in intern_keywords):
            # But not if it says "graduate" without "student" (that's entry level)
            if 'graduate student' not in combined or 'intern' in combined:
                return 'intern'
        
        # Priority 2: Principal/Staff/Executive level (check before senior to avoid conflicts)
        # These are VERY specific titles
        principal_exact_titles = [
            # C-level and executives (most specific)
            'chief technology officer', 'chief technical officer', 'cto', 'ceo', 'cfo', 
            'cio', 'cpo', 'cdo', 'chief', 'vp ', 'vice president', 'v.p.', 'evp', 'svp',
            
            # Director level (very specific)
            'director of', 'engineering director', 'director', 'head of', 'group head',
            'department head', 'managing director',
            
            # Principal/Staff level (specific)
            'principal engineer', 'principal developer', 'principal software',
            'staff engineer', 'staff developer', 'staff software', 'staff architect',
            'distinguished engineer', 'fellow', 'principal architect',
            
            # High-level specialized architects
            'solutions architect', 'enterprise architect', 'chief architect',
            'principal consultant'
        ]
        if any(keyword in title_lower for keyword in principal_exact_titles):
            return 'principal'
        
        # Check for "manager" or "lead" in engineering/technical roles (these are senior/principal)
        if any(term in title_lower for term in ['engineering manager', 'technical manager', 
                                                  'eng manager', 'tech manager']):
            return 'principal'
        
        # Priority 3: Entry level (check BEFORE senior to catch "junior" correctly)
        entry_exact_keywords = [
            # Direct entry terms (most specific)
            'entry-level', 'entry level', 'junior ', 'jr. ', 'jr ', 'junior developer',
            'junior engineer', 'junior software', 'jr developer', 'jr engineer',
            
            # Graduate positions (very specific to entry)
            'graduate developer', 'graduate engineer', 'graduate programmer',
            'graduate software', 'new grad', 'recent graduate', 'fresh graduate',
            'recent grad',
            
            # Early career (VERY strong indicator)
            'early career', 'early in your career', 'starting your career',
            'beginning of your career',
            
            # Assistant positions
            'assistant developer', 'assistant engineer', 'assistant programmer',
            
            # Level I positions (using word boundaries to avoid matching "ii", "iii", etc.)
            'level 1', ' i ', 'l1 ', ' l1', 'software engineer 1', 'swe 1', 
            'sde 1', 'engineer 1', 'developer 1'
        ]
        
        # Check for entry keywords, but be careful about Roman numerals
        for keyword in entry_exact_keywords:
            if keyword in combined:
                # Special handling for single 'i' - must not be part of 'ii', 'iii', etc.
                if keyword == ' i ':
                    # Make sure it's not 'ii', 'iii', 'iv', 'v'
                    if ' ii' not in combined and 'iii' not in combined and ' iv' not in combined:
                        return 'entry'
                else:
                    return 'entry'
        
        # Also check title alone for strong entry indicators
        if any(keyword in title_lower for keyword in ['junior', 'jr.', 'jr ', 'entry', 
                                                        'graduate', 'assistant']):
            # But not if it also has "senior" or "lead" (e.g., "Senior Junior" doesn't make sense)
            if not any(term in title_lower for term in ['senior', 'sr.', 'sr ', 'lead', 'principal']):
                return 'entry'
        
        # IMPORTANT: Check for strong entry language in description (before checking senior)
        # These phrases strongly indicate entry-level even if other keywords exist
        strong_entry_phrases = [
            'learn on the job', 'willingness to learn', 'eager to learn',
            'we will teach', "we'll teach", 'training provided',
            'mentorship provided', 'with mentorship', 'mentored by',
            'no experience required', 'no prior experience'
        ]
        if any(phrase in desc_lower for phrase in strong_entry_phrases):
            # This is likely entry-level - the job is explicitly offering to teach
            return 'entry'
        
        # Priority 4: Senior level (now safe to check after entry)
        senior_keywords = [
            # Direct senior titles (very specific)
            'senior ', 'sr. ', 'sr ', 'senior developer', 'senior engineer', 
            'senior software', 'sr developer', 'sr engineer', 'sr software',
            
            # Lead positions (specific to title usually)
            'lead engineer', 'lead developer', 'lead software', 'lead programmer',
            'tech lead', 'technical lead', 'team lead',
            
            # Architect roles (senior level)
            'architect', 'software architect', 'solution architect', 'system architect',
            'application architect', 'cloud architect', 'data architect',
            
            # Expert/Specialist
            'expert', 'specialist', 'senior specialist',
            
            # Level indicators (specific numbers) - III, IV, V are senior (5-7 years typically)
            'level 3', 'level 4', 'level 5', 'level iii', 'level iv', 'level v',
            'l3 ', 'l4 ', 'l5 ', ' l3', ' l4', ' l5',
            'software engineer 3', 'software engineer 4', 'software engineer 5',
            'swe 3', 'swe 4', 'swe 5', 'sde 3', 'sde 4', 'sde 5',
            'engineer 3', 'engineer 4', 'engineer 5',
            'software engineer iii', 'software engineer iv', 'software engineer v',
            'sde iii', 'sde iv', 'sde v', 
            'engineer iii', 'engineer iv', 'engineer v',
            'developer iii', 'developer iv', 'developer v',
            
            # Senior consultant
            'senior consultant', 'lead consultant'
        ]
        if any(keyword in combined for keyword in senior_keywords):
            # Double-check years - 7+ might push to principal
            # Try range pattern first, then single number
            years_range_match = re.search(r'(\d+)\s*(?:to|-)\s*(\d+)\s*years', combined)
            if years_range_match:
                min_years = int(years_range_match.group(1))
                max_years = int(years_range_match.group(2))
                avg_years = (min_years + max_years) // 2
                if avg_years >= 7:
                    return 'principal'
            else:
                years_match = re.search(r'(\d+)\+?\s*years', combined)
                if years_match and int(years_match.group(1)) >= 7:
                    return 'principal'
            return 'senior'
        
        # Priority 5: Mid level
        mid_keywords = [
            # Direct mid-level terms
            'mid-level', 'mid level', 'intermediate', 'mid-senior',
            
            # Associate/Analyst roles (must check title to avoid false positives)
            'associate ', 'associate engineer', 'associate developer', 'associate software',
            'analyst', 'software analyst', 'systems analyst',
            
            # Level 2 indicators (with better patterns)
            'level 2', ' ii ', 'level ii', 'l2 ', ' l2', 'software engineer 2', 
            'swe 2', 'sde 2', 'engineer 2', 'developer 2',
            'engineer ii', 'developer ii', 'sde ii', 'software engineer ii',
            
            # Consultant (standard)
            'consultant', 'technical consultant', 'software consultant',
            
            # Experienced but not senior
            'experienced developer', 'experienced engineer'
        ]
        if any(keyword in combined for keyword in mid_keywords):
            return 'mid'
        
        # Priority 6: Check years of experience requirement (most reliable)
        # Look for patterns like "5+ years", "3-5 years", "5 to 7 years"
        years_patterns = [
            r'(\d+)\s*(?:\+|plus)\s*years',  # "5+ years" or "5 plus years"
            r'(\d+)\s*(?:to|-)\s*(\d+)\s*years',  # "3-5 years" or "3 to 5 years"
            r'(\d+)\s*years',  # "5 years"
        ]
        
        for pattern in years_patterns:
            match = re.search(pattern, combined)
            if match:
                if len(match.groups()) == 2 and match.group(2):
                    # Range like "3-5 years" - take average
                    min_years = int(match.group(1))
                    max_years = int(match.group(2))
                    years = (min_years + max_years) // 2
                else:
                    # Single number like "5+ years" or "5 years"
                    years = int(match.group(1))
                
                # Classify based on years
                if years >= 10:
                    return 'principal'
                elif years >= 7:
                    return 'senior'
                elif years >= 5:
                    return 'senior'
                elif years >= 3:
                    return 'mid'
                elif years >= 2:
                    return 'mid'
                elif years <= 1:
                    return 'entry'
                break
        
        # Priority 7: Check for responsibility indicators in job description
        responsibility_indicators = {
            'principal': ['define architecture', 'strategic', 'company-wide', 'cross-functional leadership'],
            'senior': ['mentor', 'mentoring', 'code review', 'lead team', 'technical decisions', 
                      'design systems', 'architecture decisions'],
            'mid': ['collaborate', 'work with team', 'contribute to', 'participate in'],
            'entry': ['learn', 'training provided', 'guidance', 'support from senior', 'shadowing']
        }
        
        for level, indicators in responsibility_indicators.items():
            if any(indicator in desc_lower for indicator in indicators):
                return level
        
        # Priority 8: Default based on job title structure
        # If title has no level indicators, look for role type
        if any(role in title_lower for role in ['engineer', 'developer', 'programmer', 'software']):
            # Plain "Software Engineer" or "Developer" with no qualifier
            # Check if description has any hints
            if any(term in desc_lower for term in ['looking for experienced', '5+ years', 
                                                     'strong background', 'proven track record']):
                return 'mid'
            elif any(term in desc_lower for term in ['recent graduate', 'early career', 
                                                       'no experience', 'will train']):
                return 'entry'
            else:
                # Default to mid-level for unclear cases (safer assumption)
                return 'mid'
        
        # Final default: mid-level (most common, safer than assuming entry or senior)
        return 'mid'
    
    def _calculate_seniority_penalty(
        self,
        candidate_level: str,
        candidate_years: int,
        job_level: str,
        job_text: str
    ) -> float:
        """
        Calculate penalty for seniority mismatch
        
        Heavy penalty for students/entry applying to senior roles
        Moderate penalty for under-qualified candidates
        No penalty for over-qualified (they can apply down)
        
        Returns: Penalty points to subtract (0-40)
        """
        # Seniority hierarchy
        seniority_order = {
            'intern': 0,
            'student': 0,
            'entry': 1,
            'mid': 2,
            'senior': 3,
            'principal': 4
        }
        
        candidate_rank = seniority_order.get(candidate_level, 1)
        job_rank = seniority_order.get(job_level, 2)
        
        gap = job_rank - candidate_rank
        
        # No penalty if candidate is at same level or higher (over-qualified is OK)
        if gap <= 0:
            return 0
        
        # HEAVY penalties for under-qualified candidates
        if candidate_level in ['student', 'intern']:
            # Students/interns should NOT see senior/principal jobs
            if job_level == 'principal':
                return 50  # Essentially disqualify
            elif job_level == 'senior':
                return 40  # Very heavy penalty
            elif job_level == 'mid':
                return 20  # Moderate penalty
            else:
                return 0  # Entry/intern jobs are OK
        
        elif candidate_level == 'entry':
            # Entry-level candidates
            if job_level == 'principal':
                return 45  # Almost disqualify
            elif job_level == 'senior':
                return 35  # Very heavy penalty (was 30)
            elif job_level == 'mid':
                return 20  # Moderate penalty (was 10 - too generous!)
            else:
                return 0
        
        elif candidate_level == 'mid':
            # Mid-level candidates
            if job_level == 'principal':
                return 20  # Moderate penalty
            elif job_level == 'senior':
                return 5  # Small penalty (reasonable stretch)
            else:
                return 0
        
        elif candidate_level == 'senior':
            # Senior candidates can apply anywhere
            if job_level == 'principal':
                return 5  # Tiny penalty
            else:
                return 0
        
        return 0
    
    def _batch_ml_match(
        self,
        resume_text: str,
        jobs: List[Dict[str, str]],
        ats_score: float,
        experience_level: str = "entry",
        years_of_experience: int = 0
    ) -> List[Dict[str, Any]]:
        """Batch process multiple jobs for efficiency"""
        
        logging.info("\n" + "=" * 80)
        logging.info(f"🚀 BATCH JOB MATCHING - Processing {len(jobs)} jobs")
        logging.info(f"Candidate: {experience_level} level, {years_of_experience} years exp")
        logging.info(f"Resume ATS Score: {ats_score:.1f}")
        logging.info("=" * 80)
        
        # Prepare job texts
        job_texts = [
            f"{job.get('title', '')} {job.get('description', '')}"
            for job in jobs
        ]
        
        logging.info("📊 Encoding resume once for all jobs...")
        
        # Encode resume once
        resume_embedding = self.model.encode(resume_text, convert_to_tensor=True)
        logging.info("✅ Resume encoded")
        
        # Batch encode all jobs
        logging.info(f"📚 Batch encoding {len(job_texts)} job descriptions...")
        job_embeddings = self.model.encode(job_texts, convert_to_tensor=True)
        logging.info("✅ All jobs encoded")
        
        # Calculate all similarities at once
        logging.info("🔍 Calculating semantic similarities...")
        similarities = util.cos_sim(resume_embedding, job_embeddings)[0]
        logging.info("✅ Similarities calculated\n")
        
        # Process results
        results = []
        # Show detailed breakdown for first 3 jobs
        show_detailed = True
        detailed_count = 0
        max_detailed = 3
        
        for i, (job, similarity) in enumerate(zip(jobs, similarities)):
            job_title = job.get('title', 'N/A')[:60]
            
            # Show detailed breakdown for first few jobs
            if show_detailed and detailed_count < max_detailed:
                logging.info("\n" + "🔍" * 40)
                logging.info(f"📋 DETAILED CALCULATION FOR JOB {i+1}/{len(jobs)}")
                logging.info(f"Job Title: {job_title}")
                logging.info("🔍" * 40)
                detailed_count += 1
            else:
                logging.info(f"\n--- Job {i+1}/{len(jobs)}: {job_title}")
            
            similarity_score = similarity.item()
            
            # Detect snippet vs full description
            word_count = len(job_texts[i].split())
            is_snippet = word_count < 100
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"\n🔍 Raw Semantic Similarity: {similarity_score:.4f} ({similarity_score*100:.1f}%)")
                logging.info(f"📄 Job Text: {word_count} words - {'SNIPPET' if is_snippet else 'FULL DESCRIPTION'}")
            
            # Detect job seniority and calculate penalty
            job_seniority = self._detect_job_seniority(job.get('title', ''), job.get('description', ''))
            seniority_penalty = self._calculate_seniority_penalty(
                experience_level, years_of_experience, job_seniority, job_texts[i].lower()
            )
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"👤 Job Level Detected: {job_seniority.upper()}")
                if seniority_penalty > 0:
                    logging.info(f"⚠️  Seniority Penalty: -{seniority_penalty:.1f} points ({experience_level} → {job_seniority})")
                else:
                    logging.info(f"✅ No Seniority Penalty (same/lower level)")
                logging.info(f"\n📐 SEMANTIC SCORE CALCULATION:")
                logging.info(f"   Using {'SNIPPET' if is_snippet else 'FULL DESCRIPTION'} formula")
            
            # Calculate scores using improved formula with snippet detection
            if is_snippet:
                # Snippet formula - more generous
                if similarity_score >= 0.6:
                    semantic_score = 75 + (similarity_score - 0.6) * 62.5
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: ≥0.6 → Formula: 75 + ({similarity_score:.4f} - 0.6) × 62.5 = {semantic_score:.1f}")
                elif similarity_score >= 0.4:
                    semantic_score = 60 + (similarity_score - 0.4) * 75
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: 0.4-0.6 → Formula: 60 + ({similarity_score:.4f} - 0.4) × 75 = {semantic_score:.1f}")
                elif similarity_score >= 0.25:
                    semantic_score = 45 + (similarity_score - 0.25) * 100
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: 0.25-0.4 → Formula: 45 + ({similarity_score:.4f} - 0.25) × 100 = {semantic_score:.1f}")
                else:
                    semantic_score = similarity_score * 180
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: <0.25 → Formula: {similarity_score:.4f} × 180 = {semantic_score:.1f}")
                pass
            else:
                # Full description formula
                if similarity_score >= 0.7:
                    semantic_score = 70 + (similarity_score - 0.7) * 50
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: ≥0.7 → Formula: 70 + ({similarity_score:.4f} - 0.7) × 50 = {semantic_score:.1f}")
                elif similarity_score >= 0.5:
                    semantic_score = 55 + (similarity_score - 0.5) * 75
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: 0.5-0.7 → Formula: 55 + ({similarity_score:.4f} - 0.5) × 75 = {semantic_score:.1f}")
                elif similarity_score >= 0.3:
                    semantic_score = 35 + (similarity_score - 0.3) * 100
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: 0.3-0.5 → Formula: 35 + ({similarity_score:.4f} - 0.3) × 100 = {semantic_score:.1f}")
                else:
                    semantic_score = similarity_score * 116.7
                    if show_detailed and detailed_count <= max_detailed:
                        logging.info(f"   Range: <0.3 → Formula: {similarity_score:.4f} × 116.7 = {semantic_score:.1f}")
                pass
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"   ✅ Semantic Score: {semantic_score:.1f}/100")
            
            ats_contribution = 0.0
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"\n📋 ATS CONTRIBUTION:")
                logging.info("   ATS contribution is disabled for job matching")
            
            base_score = semantic_score
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"\n➕ BASE SCORE:")
                logging.info(f"   {semantic_score:.1f} (semantic) = {base_score:.1f}")
                logging.info(f"   ✅ Base Score: {base_score:.1f}/100")
            
            # Apply seniority penalty
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"\n⚖️  SENIORITY PENALTY:")
                logging.info(f"   Candidate: {experience_level} | Job: {job_seniority}")
                logging.info(f"   Penalty: -{seniority_penalty:.1f}")
                logging.info(f"   Formula: max(0, min(100, {base_score:.1f} - {seniority_penalty:.1f}))")
            
            final_score = max(0, min(100, base_score - seniority_penalty))
            
            # Generate details
            match_level = self._get_match_level(final_score)
            
            if show_detailed and detailed_count <= max_detailed:
                level_ranges = {
                    "excellent": "80-100", "very-good": "65-79", "good": "50-64",
                    "fair": "35-49", "poor": "0-34"
                }
                logging.info(f"   ✅ Final Score: {final_score:.1f}/100")
                logging.info(f"\n🎖️  MATCH LEVEL:")
                logging.info(f"   Score: {final_score:.1f}")
                logging.info(f"   Range: {level_ranges.get(match_level, 'unknown')}")
                logging.info(f"   ✅ Level: {match_level.upper()}")
                logging.info("🔍" * 40 + "\n")
            reasons = self._generate_match_reasons(
                resume_text, job_texts[i], similarity_score, ats_score, final_score,
                seniority_penalty, experience_level, job_seniority
            )
            
            # Log results for this job with detailed breakdown
            logging.info(f"    Similarity: {similarity_score*100:.1f}% | "
                        f"Semantic: {semantic_score:.1f} | "
                        f"ATS: +0.0 (disabled) | "
                        f"Base: {base_score:.1f} | "
                        f"Level: {job_seniority} | "
                        f"Penalty: -{seniority_penalty:.1f} | "
                        f"Score: {final_score:.1f} ({match_level})")
            
            results.append({
                "matchScore": round(final_score, 1),
                "semanticSimilarity": round(similarity_score * 100, 1),
                "atsContribution": round(ats_contribution, 1),
                "seniorityPenalty": round(seniority_penalty, 1),
                "candidateLevel": experience_level,
                "jobLevel": job_seniority,
                "matchLevel": match_level,
                "reasons": reasons,
                "methodology": f"ML-based ({'snippet' if is_snippet else 'full'} - Batch)"
            })
        
        # Summary
        avg_score = sum(r['matchScore'] for r in results) / len(results) if results else 0
        good_matches = len([r for r in results if r['matchScore'] >= 50])
        logging.info(f"\n📊 BATCH SUMMARY: Avg Score: {avg_score:.1f}, Good Matches: {good_matches}/{len(results)}")
        logging.info("=" * 80 + "\n")
        
        return results
    
    def _calculate_keyword_match(
        self,
        resume_text: str,
        job_description: str,
        ats_score: float
    ) -> Dict[str, Any]:
        """Fallback keyword-based matching when ML is not available"""
        
        resume_lower = resume_text.lower()
        job_lower = job_description.lower()
        
        # Extract keywords from job description
        job_words = set(word for word in job_lower.split() if len(word) > 3)
        resume_words = set(word for word in resume_lower.split() if len(word) > 3)
        
        # Calculate overlap
        common_words = job_words.intersection(resume_words)
        keyword_overlap = len(common_words) / len(job_words) if job_words else 0
        
        # Keyword match score (0-60 points)
        keyword_score = keyword_overlap * 60
        
        # ATS no longer contributes in keyword fallback either.
        ats_contribution = 0.0
        
        # Total score
        total_score = min(100, max(0, keyword_score))
        
        match_level = self._get_match_level(total_score)
        
        return {
            "matchScore": round(total_score, 1),
            "keywordOverlap": round(keyword_overlap * 100, 1),
            "atsContribution": round(ats_contribution, 1),
            "matchLevel": match_level,
            "reasons": [f"Keyword overlap: {len(common_words)} common terms"],
            "methodology": "Keyword-based (fallback)"
        }
    
    def _get_match_level(self, score: float) -> str:
        """Determine match level from score"""
        if score >= 80:
            return "excellent"
        elif score >= 65:
            return "very-good"
        elif score >= 50:
            return "good"
        elif score >= 35:
            return "fair"
        else:
            return "poor"
    
    def _generate_match_reasons(
        self,
        resume_text: str,
        job_text: str,
        similarity: float,
        ats_score: float,
        match_score: float,
        seniority_penalty: float = 0,
        candidate_level: str = "entry",
        job_level: str = "mid"
    ) -> List[str]:
        """Generate human-readable reasons for the match score"""
        reasons = []
        
        # Seniority mismatch warning (MOST IMPORTANT - show first)
        if seniority_penalty >= 30:
            reasons.append(f"⚠️ This is a {job_level}-level position, but you're {candidate_level}-level - significant experience gap")
        elif seniority_penalty >= 15:
            reasons.append(f"⚠️ This {job_level}-level role may require more experience than you have ({candidate_level}-level)")
        elif seniority_penalty >= 5:
            reasons.append(f"This is a {job_level}-level position - you may need to stretch to meet requirements")
        
        # Overall match quality - Consider penalty in recommendation
        # If there's a significant penalty, temper the recommendation
        if seniority_penalty >= 20:
            # High penalty = not actually a great match despite high score
            if match_score >= 65:
                reasons.append("Good skills match, but position requires more experience")
            elif match_score >= 50:
                reasons.append("Moderate match - carefully review if you meet minimum requirements")
            elif match_score >= 35:
                reasons.append("Limited match - significant experience gap may disqualify")
            else:
                reasons.append("Not recommended - this role is beyond your current experience level")
        else:
            # Normal recommendations when penalty is low/none
            if match_score >= 80:
                reasons.append("Excellent match - highly recommended to apply")
            elif match_score >= 65:
                reasons.append("Very good match for your profile")
            elif match_score >= 50:
                reasons.append("Good match - worth applying")
            elif match_score >= 35:
                reasons.append("Moderate match - review requirements carefully")
            else:
                reasons.append("Limited match - may not be the best fit")
        
        # Semantic similarity
        if similarity >= 0.7:
            reasons.append("Strong semantic alignment between your resume and job requirements")
        elif similarity >= 0.5:
            reasons.append("Moderate alignment with job requirements")
        
        # Extract actual matching skills dynamically
        resume_lower = resume_text.lower()
        job_lower = job_text.lower()
        
        # Comprehensive tech terms list (sorted by specificity)
        tech_terms = [
            # Frameworks & Libraries (check these first - more specific)
            "react native", "spring boot", "next.js", "vue.js", "angular", "react", "node.js", "express.js",
            "django", "flask", "fastapi", "tensorflow", "pytorch", "scikit-learn", "pandas", "numpy",
            ".net core", "asp.net", "entity framework", "laravel", "symfony", "ruby on rails",
            
            # Languages
            "typescript", "javascript", "python", "java", "c#", "c++", "golang", "rust", "kotlin", 
            "swift", "php", "ruby", "scala", "r", "matlab", "perl",
            
            # Cloud & DevOps
            "kubernetes", "docker", "jenkins", "terraform", "ansible", "aws", "azure", "gcp", 
            "google cloud", "ci/cd", "gitlab", "github actions", "circleci",
            
            # Databases
            "postgresql", "mongodb", "mysql", "redis", "elasticsearch", "cassandra", "dynamodb",
            "sql server", "oracle", "sqlite", "mariadb",
            
            # AI/ML
            "machine learning", "deep learning", "natural language processing", "nlp", "computer vision",
            "neural networks", "transformers", "llm", "generative ai", "rag",
            
            # Other Tech
            "graphql", "rest api", "api", "microservices", "websockets", "grpc",
            "git", "linux", "unix", "bash", "powershell", "sql", "nosql",
            "agile", "scrum", "jira", "confluence"
        ]
        
        # Find matching terms (check longer phrases first to avoid partial matches)
        matched_terms = []
        for term in tech_terms:
            if term in resume_lower and term in job_lower:
                # Avoid substrings (e.g., don't count "java" if "javascript" already matched)
                if not any(term in matched for matched in matched_terms):
                    matched_terms.append(term)
        
        # Add matching skills reason (limit to top 5 most relevant)
        if matched_terms:
            # Prioritize longer, more specific terms
            matched_terms.sort(key=len, reverse=True)
            top_skills = matched_terms[:5]
            reasons.append(f"Matching skills: {', '.join(top_skills)}")
        
        return reasons


# Singleton instance
_matcher_instance = None

def get_matcher() -> JobMatcherML:
    """Get or create matcher instance (singleton pattern)"""
    global _matcher_instance
    if _matcher_instance is None:
        _matcher_instance = JobMatcherML()
    return _matcher_instance


# CLI usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 3:
        print(json.dumps({
            "success": False,
            "error": "Usage: python job_matcher_ml.py <resume_text> <job_description> [ats_score]"
        }))
        sys.exit(1)
    
    resume_text = sys.argv[1]
    job_description = sys.argv[2]
    ats_score = float(sys.argv[3]) if len(sys.argv) > 3 else 0
    
    matcher = get_matcher()
    result = matcher.calculate_match_score(resume_text, job_description, "", ats_score)
    print(json.dumps(result, indent=2))
