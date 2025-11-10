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
        
        # 2. ATS score provides quality boost (0-15 points for full, 0-10 for snippet)
        # Reduce ATS impact for snippets since matching is harder
        ats_max = 10 if is_snippet else 15
        ats_contribution = (ats_score / 100) * ats_max
        
        logging.info("� ATS CONTRIBUTION CALCULATION:")
        logging.info(f"   Resume ATS Score: {ats_score:.1f}/100")
        logging.info(f"   Max ATS Points: {ats_max} ({'snippet' if is_snippet else 'full desc'})")
        logging.info(f"   Formula: ({ats_score:.1f} / 100) × {ats_max}")
        logging.info(f"   Calculation: {ats_score / 100:.3f} × {ats_max} = {ats_contribution:.1f}")
        logging.info(f"   ✅ ATS Contribution: +{ats_contribution:.1f}/100")
        logging.info("")
        
        # Total match score BEFORE seniority penalty
        base_score = semantic_score + ats_contribution
        
        logging.info("➕ BASE SCORE CALCULATION:")
        logging.info(f"   Semantic Score: {semantic_score:.1f}")
        logging.info(f"   ATS Contribution: +{ats_contribution:.1f}")
        logging.info(f"   Formula: {semantic_score:.1f} + {ats_contribution:.1f}")
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
                ats_max = 10
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
                ats_max = 15
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"   ✅ Semantic Score: {semantic_score:.1f}/100")
            
            ats_contribution = (ats_score / 100) * ats_max
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"\n📋 ATS CONTRIBUTION:")
                logging.info(f"   Resume ATS: {ats_score:.1f}/100")
                logging.info(f"   Max Points: {ats_max} ({'snippet' if is_snippet else 'full'})")
                logging.info(f"   Formula: ({ats_score:.1f} / 100) × {ats_max} = {ats_contribution:.1f}")
                logging.info(f"   ✅ ATS Contribution: +{ats_contribution:.1f}/100")
            
            base_score = semantic_score + ats_contribution
            
            if show_detailed and detailed_count <= max_detailed:
                logging.info(f"\n➕ BASE SCORE:")
                logging.info(f"   {semantic_score:.1f} (semantic) + {ats_contribution:.1f} (ATS) = {base_score:.1f}")
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
                        f"ATS: +{ats_contribution:.1f} | "
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
        
        # ATS score impact
        if ats_score >= 80:
            reasons.append("Your resume is well-optimized for ATS systems")
        elif ats_score >= 60:
            reasons.append("Good resume quality supports your application")
        
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
