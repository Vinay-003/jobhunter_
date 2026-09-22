import type { ResumeProfile } from '../parsing/resumeProfile.js';
import type { NormalizedJob } from '../../providers/jobs/JobProvider.js';
import { normalizeSkill } from '../parsing/skillNormalizer.js';
import { MockEmbeddingProvider } from '../../providers/embeddings/MockEmbeddingProvider.js';
import { AwsSageMakerEmbeddingProvider } from '../../providers/embeddings/AwsSageMakerEmbeddingProvider.js';
import { LocalEmbeddingProvider } from '../../providers/embeddings/LocalEmbeddingProvider.js';
import { env } from '../../config/env.js';

export const VERSION = '2.0.0';

/**
 * Ranking — compose fit score: Required skill 30 + Responsibility semantic 25 + Role/title 15 + Seniority 15 + Domain/education 10 + Location 5 =100
 * Without ATS/salary/freshness.
 * Embedding: SageMaker (aws) or Local when EMBEDDING_PROVIDER set; Mock ONLY as fallback — never default.
 */

function getRankingEmbeddingProvider(): { embed: (input: { texts: string[]; purpose: 'resume'|'job'|'jd' }) => Promise<{ vectors: number[][]; modelId: string; dimension: number }> } {
  const p = (env.EMBEDDING_PROVIDER || 'auto').toLowerCase();
  if (p === 'local' || process.env.USE_LOCAL_EMBEDDINGS === 'true') return new LocalEmbeddingProvider({ modelId: process.env.LOCAL_EMBEDDING_MODEL });
  if (p === 'aws' || (process.env.AWS_SAGEMAKER_ENDPOINT_NAME && process.env.AWS_ACCESS_KEY_ID)) return new AwsSageMakerEmbeddingProvider();
  // Do NOT default to mock silently — let Aws provider handle hasAwsCreds check and fallback with proper warning.
  // If no AWS creds, Aws provider will fallback to mock internally and log once, instead of ranking silently mocking.
  if (p === 'mock') return new MockEmbeddingProvider();
  return new AwsSageMakerEmbeddingProvider();
}

export type RankBreakdown = {
  requiredSkill: number; // 0-30
  responsibilitySemantic: number; // 0-25
  roleTitle: number; // 0-15
  seniority: number; // 0-15
  domainEducation: number; // 0-10
  location: number; // 0-5
};

export type RankResult = {
  fitScore: number;
  breakdown: RankBreakdown;
  evidence: string[];
};

function normalizeSkillSet(skills: string[]): Set<string> {
  return new Set(skills.map((s) => normalizeSkill(s).toLowerCase()));
}

function cosine(a: number[], b: number[]): number {
  return MockEmbeddingProvider.cosine(a, b);
}

async function semanticSimilarity(a: string, b: string): Promise<{ score: number; modelId: string; usedMock: boolean }> {
  if (!a.trim() || !b.trim()) return { score: 0, modelId: 'none', usedMock: true };
  const provider = getRankingEmbeddingProvider();
  const res = await provider.embed({ texts: [a, b], purpose: 'job' });
  const isMock = res.modelId.includes('mock');
  const c = cosine(res.vectors[0], res.vectors[1]);
  // map from [-1,1] to [0,1]
  return { score: (c + 1) / 2, modelId: res.modelId, usedMock: isMock };
}

export async function rankJob(
  profile: ResumeProfile,
  job: NormalizedJob,
  opts?: { preferences?: { locations?: string[] | null } },
): Promise<RankResult> {
  const evidence: string[] = [];

  // 1) Required skill 30
  let requiredSkillScore = 0;
  {
    // Extract skills from job description
    const jobText = `${job.title} ${job.description ?? ''}`.toLowerCase();
    const profileSet = normalizeSkillSet(profile.skills);
    // Use alias keys to find skills in job
    const { CANONICAL_SKILL_ALIASES } = await getAliases();
    const jobSkills: string[] = [];
    for (const key of Object.keys(CANONICAL_SKILL_ALIASES)) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(jobText)) {
        const norm = normalizeSkill(key).toLowerCase();
        if (!jobSkills.includes(norm)) jobSkills.push(norm);
      }
    }
    if (jobSkills.length === 0) {
      requiredSkillScore = 15; // neutral when no skills detected
      evidence.push('No skills detected in job — neutral skill score');
    } else {
      const matched = jobSkills.filter((s) => profileSet.has(s)).length;
      const coverage = matched / jobSkills.length;
      requiredSkillScore = Math.round(coverage * 30);
      evidence.push(`Skill coverage ${matched}/${jobSkills.length}`);
    }
  }

  // 2) Responsibility semantic 25
  let responsibilitySemantic = 0;
  let rankingEmbeddingModelId = env.EMBEDDING_MODEL_ID;
  let rankingUsedMock = false;
  {
    const resumeText = profile.summary ?? profile.skills.join(' ') ?? '';
    const jobDesc = job.description ?? job.title;
    const { score: sim, modelId, usedMock } = await semanticSimilarity(resumeText.slice(0, 1000), jobDesc.slice(0, 1000));
    rankingEmbeddingModelId = modelId;
    rankingUsedMock = usedMock;
    responsibilitySemantic = Math.round(sim * 25);
    evidence.push(`Semantic similarity ${sim.toFixed(2)} via ${modelId}${usedMock ? ' (mock fallback)' : ''}`);
  }

  // 3) Role/title 15
  let roleTitle = 0;
  {
    const titleLower = job.title.toLowerCase();
    const resumeExpTitles = profile.experience.map((e) => (e.title ?? '').toLowerCase()).join(' ');
    const resumeSummaryLower = (profile.summary ?? '').toLowerCase();
    const combined = `${resumeExpTitles} ${resumeSummaryLower}`;
    // Simple keyword overlap of title words
    const titleWords = titleLower.split(/\W+/).filter((w) => w.length > 2);
    let overlap = 0;
    for (const w of titleWords) {
      if (combined.includes(w)) overlap++;
    }
    const coverage = titleWords.length ? overlap / titleWords.length : 0;
    // Also semantic fallback if low
    let score = coverage;
    if (score < 0.3) {
      const { score: sim, modelId: simModel } = await semanticSimilarity(combined.slice(0, 500), job.title);
      score = Math.max(score, sim * 0.8);
      if (sim > coverage) {
        rankingEmbeddingModelId = simModel;
        evidence.push(`Title semantic ${sim.toFixed(2)} via ${simModel}`);
      }
    }
    roleTitle = Math.round(score * 15);
    evidence.push(`Title overlap ${overlap}/${titleWords.length}`);
  }

  // 4) Seniority / Level 15 - with explicit penalties (ResumeWorded strict)
  let seniority = 0;
  {
    const seniorityOrder = ['junior', 'mid', 'senior', 'lead'];
    const profileSen = profile.seniority;
    const jobLower = `${job.title} ${job.description ?? ''}`.toLowerCase();
    let jobSen: string | null = null;
    if (/(principal|staff|lead)\b/.test(jobLower)) jobSen = 'lead';
    else if (/senior\b/.test(jobLower)) jobSen = 'senior';
    else if (/(junior|entry)/.test(jobLower)) jobSen = 'junior';
    else if (/mid/.test(jobLower)) jobSen = 'mid';

    if (!profileSen || !jobSen) {
      seniority = 8; // partial when unknown
      evidence.push('Level: unknown — partial (no penalty)');
    } else if (profileSen === jobSen) {
      seniority = 15;
      evidence.push(`Level match: ${profileSen} = ${jobSen} (no penalty)`);
    } else {
      const diff = Math.abs(seniorityOrder.indexOf(profileSen) - seniorityOrder.indexOf(jobSen));
      // Explicit penalties: adjacent -5, far -10 to -15
      seniority = diff === 1 ? 10 : diff === 2 ? 5 : 0;
      const penalty = 15 - seniority;
      evidence.push(`Level penalty: ${penalty} pts — your ${profileSen} vs job ${jobSen} (diff ${diff})`);
    }
  }

  // 5) Domain/education 10
  let domainEducation = 0;
  {
    // Cheap heuristic: if job mentions degree and profile has education, score
    const jobLower = (job.description ?? '').toLowerCase();
    const eduKeywords = ['bachelor', 'master', 'degree', 'phd', 'education'];
    const hasEduReq = eduKeywords.some((k) => jobLower.includes(k));
    if (!hasEduReq) {
      domainEducation = 6; // neutral
    } else if (profile.education.length > 0) {
      domainEducation = 10;
      evidence.push('Education matches requirement');
    } else {
      domainEducation = 2;
      evidence.push('Missing education for job requirement');
    }
    // Domain overlap bonus: reuse skill for domain? keep simple
  }

  // 6) Location 5
  let location = 0;
  {
    const prefLocs = opts?.preferences?.locations?.map((s) => s.toLowerCase()) ?? [];
    if (!prefLocs.length || !job.location) {
      location = 3; // neutral
    } else {
      const jl = job.location.toLowerCase();
      const match = prefLocs.some((pl) => jl.includes(pl) || pl.includes(jl));
      location = match ? 5 : 0;
      evidence.push(match ? `Location match ${job.location}` : `Location mismatch ${job.location}`);
    }
  }

  const breakdown: RankBreakdown = {
    requiredSkill: requiredSkillScore,
    responsibilitySemantic,
    roleTitle,
    seniority,
    domainEducation,
    location,
  };

  const fitScore = Object.values(breakdown).reduce((s, v) => s + v, 0);

  return { 
    fitScore: Math.max(0, Math.min(100, fitScore)), 
    breakdown, 
    evidence,
    embeddingModelId: rankingEmbeddingModelId,
    usedMock: rankingUsedMock,
  } as RankResult & { embeddingModelId: string; usedMock: boolean };
}

async function getAliases(): Promise<{ CANONICAL_SKILL_ALIASES: Record<string, string> }> {
  return {
    CANONICAL_SKILL_ALIASES: {
      js: 'JavaScript', javascript: 'JavaScript', 'node.js': 'Node.js', nodejs: 'Node.js', 'node js': 'Node.js',
      'react.js': 'React', reactjs: 'React', 'vue.js': 'Vue.js', vuejs: 'Vue.js', ts: 'TypeScript', typescript: 'TypeScript',
      py: 'Python', python3: 'Python', 'c#': 'C#', 'c++': 'C++', cpp: 'C++', golang: 'Go', k8s: 'Kubernetes', kubernetes: 'Kubernetes',
      docker: 'Docker', postgres: 'PostgreSQL', postgresql: 'PostgreSQL', psql: 'PostgreSQL', mysql: 'MySQL', mongo: 'MongoDB', mongodb: 'MongoDB',
      redis: 'Redis', aws: 'AWS', gcp: 'GCP', azure: 'Azure', 'express.js': 'Express', expressjs: 'Express', express: 'Express',
      nextjs: 'Next.js', 'next.js': 'Next.js', tailwind: 'Tailwind CSS', 'tailwind css': 'Tailwind CSS', html5: 'HTML', css3: 'CSS',
      sass: 'Sass', scss: 'Sass', graphql: 'GraphQL', rest: 'REST', 'rest api': 'REST', restful: 'REST',
    },
  };
}

export function rankJobsSync(
  profile: ResumeProfile,
  jobs: NormalizedJob[],
  opts?: { preferences?: { locations?: string[] | null } },
): Promise<RankResult[]> {
  return Promise.all(jobs.map((j) => rankJob(profile, j, opts)));
}

export default rankJob;
