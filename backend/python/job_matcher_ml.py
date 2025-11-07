"""
ML-Based Job Matcher using Sentence-BERT
Calculates semantic similarity between resume and job descriptions
"""

import json
import re
from typing import Dict, List, Any
try:
    from sentence_transformers import SentenceTransformer, util
    import torch
    import numpy as np
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("Warning: ML libraries not available. Install with: pip install sentence-transformers torch")


class JobMatcherML:
    """ML-powered job matcher using Sentence-BERT for semantic similarity"""
    
    def __init__(self):
        """Initialize the ML model"""
        self.model = None
        self.model_name = 'all-mpnet-base-v2'  # Best pre-trained model
        
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
                
                # Set model to evaluation mode
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
        
        # Combine job title and description for better context
        job_text = f"{job_title} {job_description}" if job_title else job_description
        job_text_lower = job_text.lower()
        
        # Detect if this is a snippet (short text) vs full job description
        is_snippet = len(job_text.split()) < 100  # Less than 100 words = likely a snippet
        
        # CRITICAL: Detect job seniority level
        job_seniority = self._detect_job_seniority(job_title, job_description)
        
        # Calculate seniority mismatch penalty
        seniority_penalty = self._calculate_seniority_penalty(
            experience_level, years_of_experience, job_seniority, job_text_lower
        )
        
        # Encode texts
        resume_embedding = self.model.encode(resume_text, convert_to_tensor=True)
        job_embedding = self.model.encode(job_text, convert_to_tensor=True)
        
        # Calculate cosine similarity
        similarity = util.cos_sim(resume_embedding, job_embedding)[0][0].item()
        
        # IMPROVED FORMULA WITH SNIPPET BOOST:
        # For snippets (Jooble), apply more generous scoring since they lack full context
        if is_snippet:
            # Snippet formula - more generous (shift entire curve up)
            if similarity >= 0.6:
                semantic_score = 75 + (similarity - 0.6) * 62.5  # 75-100 points
            elif similarity >= 0.4:
                semantic_score = 60 + (similarity - 0.4) * 75  # 60-75 points
            elif similarity >= 0.25:
                semantic_score = 45 + (similarity - 0.25) * 100  # 45-60 points
            else:
                semantic_score = similarity * 180  # 0-45 points
        else:
            # Full description formula - standard scoring
            if similarity >= 0.7:
                semantic_score = 70 + (similarity - 0.7) * 50  # 70-85 points
            elif similarity >= 0.5:
                semantic_score = 55 + (similarity - 0.5) * 75  # 55-70 points
            elif similarity >= 0.3:
                semantic_score = 35 + (similarity - 0.3) * 100  # 35-55 points
            else:
                semantic_score = similarity * 116.7  # 0-35 points
        
        # 2. ATS score provides quality boost (0-15 points for full, 0-10 for snippet)
        # Reduce ATS impact for snippets since matching is harder
        ats_max = 10 if is_snippet else 15
        ats_contribution = (ats_score / 100) * ats_max
        
        # Total match score BEFORE seniority penalty
        total_score = semantic_score + ats_contribution
        
        # Apply seniority mismatch penalty (can reduce score by 0-40 points)
        total_score = max(0, total_score - seniority_penalty)
        total_score = min(100, max(0, total_score))
        
        # Generate match details
        match_level = self._get_match_level(total_score)
        reasons = self._generate_match_reasons(
            resume_text, job_text, similarity, ats_score, total_score, 
            seniority_penalty, experience_level, job_seniority
        )
        
        return {
            "matchScore": round(total_score, 1),
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
        Detect job seniority level from title and description
        
        Returns: 'entry', 'mid', 'senior', 'principal', 'intern'
        """
        combined = f"{job_title} {job_description}".lower()
        
        # Intern/student level (highest priority)
        if any(term in combined for term in ['intern', 'internship', 'co-op', 'co op', 'trainee']):
            return 'intern'
        
        # Principal/Staff level
        if any(term in combined for term in ['principal', 'staff', 'distinguished', 'fellow', 'chief', 'head of', 'vp', 'director']):
            return 'principal'
        
        # Senior level
        if any(term in combined for term in ['senior', 'sr.', 'sr ', 'lead', 'architect', 'expert', 'specialist']):
            # Check for years requirement
            years_required = re.findall(r'(\d+)\+?\s*years', combined)
            if years_required and int(years_required[0]) >= 7:
                return 'principal'
            return 'senior'
        
        # Mid level
        if any(term in combined for term in ['mid-level', 'mid level', 'associate', 'ii', '2']):
            return 'mid'
        
        # Entry level indicators
        if any(term in combined for term in ['entry', 'entry-level', 'junior', 'jr.', 'jr ', 'graduate', 'new grad', 'i ', ' i']):
            return 'entry'
        
        # Check years requirement to determine level
        years_required = re.findall(r'(\d+)\+?\s*years', combined)
        if years_required:
            years = int(years_required[0])
            if years >= 10:
                return 'principal'
            elif years >= 7:
                return 'senior'
            elif years >= 3:
                return 'mid'
            elif years <= 2:
                return 'entry'
        
        # Default: assume mid-level if unclear
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
                return 30  # Heavy penalty
            elif job_level == 'mid':
                return 10  # Light penalty (might stretch)
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
        
        # Prepare job texts
        job_texts = [
            f"{job.get('title', '')} {job.get('description', '')}"
            for job in jobs
        ]
        
        # Encode resume once
        resume_embedding = self.model.encode(resume_text, convert_to_tensor=True)
        
        # Batch encode all jobs
        job_embeddings = self.model.encode(job_texts, convert_to_tensor=True)
        
        # Calculate all similarities at once
        similarities = util.cos_sim(resume_embedding, job_embeddings)[0]
        
        # Process results
        results = []
        for i, (job, similarity) in enumerate(zip(jobs, similarities)):
            similarity_score = similarity.item()
            
            # Detect snippet vs full description
            is_snippet = len(job_texts[i].split()) < 100
            
            # Detect job seniority and calculate penalty
            job_seniority = self._detect_job_seniority(job.get('title', ''), job.get('description', ''))
            seniority_penalty = self._calculate_seniority_penalty(
                experience_level, years_of_experience, job_seniority, job_texts[i].lower()
            )
            
            # Calculate scores using improved formula with snippet detection
            if is_snippet:
                # Snippet formula - more generous
                if similarity_score >= 0.6:
                    semantic_score = 75 + (similarity_score - 0.6) * 62.5
                elif similarity_score >= 0.4:
                    semantic_score = 60 + (similarity_score - 0.4) * 75
                elif similarity_score >= 0.25:
                    semantic_score = 45 + (similarity_score - 0.25) * 100
                else:
                    semantic_score = similarity_score * 180
                ats_max = 10
            else:
                # Full description formula
                if similarity_score >= 0.7:
                    semantic_score = 70 + (similarity_score - 0.7) * 50
                elif similarity_score >= 0.5:
                    semantic_score = 55 + (similarity_score - 0.5) * 75
                elif similarity_score >= 0.3:
                    semantic_score = 35 + (similarity_score - 0.3) * 100
                else:
                    semantic_score = similarity_score * 116.7
                ats_max = 15
            
            ats_contribution = (ats_score / 100) * ats_max
            total_score = min(100, max(0, semantic_score + ats_contribution))
            
            # Apply seniority penalty
            total_score = max(0, total_score - seniority_penalty)
            
            # Generate details
            match_level = self._get_match_level(total_score)
            reasons = self._generate_match_reasons(
                resume_text, job_texts[i], similarity_score, ats_score, total_score,
                seniority_penalty, experience_level, job_seniority
            )
            
            results.append({
                "success": True,
                "matchScore": round(total_score, 1),
                "semanticSimilarity": round(similarity_score * 100, 1),
                "atsContribution": round(ats_contribution, 1),
                "seniorityPenalty": round(seniority_penalty, 1),
                "candidateLevel": experience_level,
                "jobLevel": job_seniority,
                "matchLevel": match_level,
                "reasons": reasons,
                "methodology": f"ML-based ({'snippet' if is_snippet else 'full'} - Batch)"
            })
        
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
        
        # ATS contribution (0-40 points)
        ats_contribution = (ats_score / 100) * 40
        
        # Total score
        total_score = min(100, max(0, keyword_score + ats_contribution))
        
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
        
        # Overall match quality
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
        
        # ATS score impact
        if ats_score >= 80:
            reasons.append("Your resume is well-optimized for ATS systems")
        elif ats_score >= 60:
            reasons.append("Good resume quality supports your application")
        
        # Extract common key terms (simple keyword extraction)
        resume_lower = resume_text.lower()
        job_lower = job_text.lower()
        
        # Common technical terms
        tech_terms = [
            "python", "java", "javascript", "react", "node", "sql", "aws",
            "machine learning", "data", "api", "cloud", "agile", "docker"
        ]
        
        matched_terms = [term for term in tech_terms if term in resume_lower and term in job_lower]
        if matched_terms:
            reasons.append(f"Matching skills: {', '.join(matched_terms[:3])}")
        
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
