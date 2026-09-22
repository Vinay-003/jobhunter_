import type { ResumeProfile } from '../parsing/resumeProfile.js';
import type { NormalizedJob } from '../../providers/jobs/JobProvider.js';
import { normalizeSkill, CANONICAL_SKILL_ALIASES } from '../parsing/skillNormalizer.js';
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

// Major Indian metros/states — Jooble returns city names ("Delhi") while users
// filter by country ("India"). Without this, Delhi-vs-India scores 0.
const INDIAN_PLACES = [
  'delhi', 'new delhi', 'mumbai', 'bombay', 'bengaluru', 'bangalore', 'hyderabad',
  'chennai', 'madras', 'kolkata', 'calcutta', 'pune', 'ahmedabad', 'jaipur',
  'noida', 'gurgaon', 'gurugram', 'kochi', 'cochin', 'coimbatore', 'chandigarh',
  'lucknow', 'kanpur', 'nagpur', 'indore', 'bhopal', 'patna', 'surat', 'vadodara',
  'mysore', 'mysuru', 'thiruvananthapuram', 'karnataka', 'maharashtra',
  'tamil nadu', 'telangana', 'kerala', 'gujarat', 'rajasthan', 'punjab', 'haryana',
  'uttar pradesh', 'madhya pradesh', 'west bengal', 'bihar',
];

function locationScore(prefLocs: string[], jobLocation: string | null, workMode?: string | null): { points: number; note: string } {
  if (!prefLocs.length || !jobLocation) return { points: 3, note: '' };
  if (workMode && workMode.toLowerCase() === 'remote') return { points: 5, note: 'Remote role — matches anywhere' };
  const jl = jobLocation.toLowerCase();
  if (/\bremote\b/.test(jl)) return { points: 5, note: 'Remote — matches anywhere' };
  const direct = prefLocs.some((pl) => jl.includes(pl) || pl.includes(jl));
  if (direct) return { points: 5, note: `Location match ${jobLocation}` };
  // Country containment: pref "india" + job in an Indian city
  if (prefLocs.includes('india') && INDIAN_PLACES.some((p) => jl.includes(p))) {
    return { points: 5, note: `Location match ${jobLocation} (India)` };
  }
  return { points: 0, note: `Location mismatch ${jobLocation}` };
}

function cosine(a: number[], b: number[]): number {
  return MockEmbeddingProvider.cosine(a, b);
}

/**
 * Map raw cosine ([-1,1]) to [0,1] with discrimination.
 * Normalized sentence embeddings cluster ~0.4-0.8 even for unrelated texts,
 * so the naive (c+1)/2 maps everything to 0.7-0.9 and all jobs score alike.
 * This stretches the realistic band [0.35, 0.95] to [0,1].
 */
function to01(rawCosine: number): number {
  return Math.max(0, Math.min(1, (rawCosine - 0.35) / 0.6));
}

/**
 * Detect job seniority from title + snippet.
 * Handles: senior/junior words, Sr./Jr. abbreviations, roman numerals
 * (Software Engineer II = mid, III/IV = senior), L3-L6 levels, and
 * "N+ years" requirements as a fallback signal.
 */
export function detectJobSeniority(title: string, description?: string | null): string | null {
  const text = `${title} ${description ?? ''}`;
  const lower = text.toLowerCase();
  if (/(principal|staff(\s+engineer)?|lead(\s+engineer|\s+dev)?|\bl[56]\b|iv\b|architect|manager)/.test(lower)) return 'lead';
  if (/\bsenior\b|\bsr\.?\b|iii\b|5\s*\+?\s*years?|6\s*\+?\s*years?|[7-9]\s*\+?\s*years?|10\s*\+?\s*years?/.test(lower)) return 'senior';
  // Indian-IT/US "Associate Software Engineer" (without "senior") is entry-level.
  if (/\bassociate\b/.test(lower) && /(engineer|developer)/.test(lower)) return 'junior';
  if (/\bjunior\b|\bjr\.?\b|entry[\s-]?level|fresher|1\s*\+\s*years?|0\s*[-–]\s*1\s*years?|0\s*[-–]\s*2\s*years?|intern(ship)?\b|engineer\s*[-–/]?\s*(1|i)\b|\bswe\s*[-–/]?\s*1\b/.test(lower)) return 'junior';
  if (/\bmid(\s+level)?\b|\bii\b|2\s*\+?\s*years?|3\s*\+?\s*years?|4\s*\+?\s*years?|\bl[34]\b/.test(lower)) return 'mid';
  return null;
}

async function semanticSimilarity(a: string, b: string): Promise<{ score: number; modelId: string; usedMock: boolean }> {
  if (!a.trim() || !b.trim()) return { score: 0, modelId: 'none', usedMock: true };
  const provider = getRankingEmbeddingProvider();
  const res = await provider.embed({ texts: [a, b], purpose: 'job' });
  const isMock = res.modelId.includes('mock');
  const c = cosine(res.vectors[0], res.vectors[1]);
  return { score: to01(c), modelId: res.modelId, usedMock: isMock };
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
    } else if (jobSkills.length <= 2) {
      // Thin Jooble snippets: 1-2 detected skills is noise, not signal.
      // A 1/1 "match" must not award full 30 points.
      requiredSkillScore = 15;
      const matchedThin = jobSkills.filter((s) => profileSet.has(s)).length;
      evidence.push(`Only ${jobSkills.length} skill signal${jobSkills.length === 1 ? '' : 's'} in snippet (${matchedThin} matched) — neutral, too thin to judge`);
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
  let jobSen: string | null = null;
  {
    const seniorityOrder = ['junior', 'mid', 'senior', 'lead'];
    const profileSen = profile.seniority;
    jobSen = detectJobSeniority(job.title, job.description);

    if (!profileSen || !jobSen) {
      seniority = 8; // partial when unknown
      evidence.push('Level: unknown — partial (no penalty)');
    } else if (profileSen === jobSen) {
      seniority = 15;
      evidence.push(`Level match: ${profileSen} = ${jobSen} (no penalty)`);
    } else {
      const diff = Math.abs(seniorityOrder.indexOf(profileSen) - seniorityOrder.indexOf(jobSen));
      // Steeper penalties: adjacent -7, far -12 to -15. Senior roles must not
      // top the list for entry-level candidates.
      seniority = diff === 1 ? 8 : diff === 2 ? 3 : 0;
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
      const { points, note } = locationScore(prefLocs, job.location, job.workMode);
      location = points;
      if (note) evidence.push(note);
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

  let fitScore = Object.values(breakdown).reduce((s, v) => s + v, 0);
  fitScore = Math.max(0, Math.min(100, fitScore));
  // Hard cap: senior/lead postings can never top the list for junior profiles,
  // no matter how well the keywords overlap.
  if (profile.seniority === 'junior' && (jobSen === 'senior' || jobSen === 'lead')) {
    if (fitScore > 65) {
      evidence.push(`Capped at 65: ${jobSen}-level role is out of reach for a junior profile`);
      fitScore = 65;
    }
  }

  return {
    fitScore,
    breakdown,
    evidence,
    embeddingModelId: rankingEmbeddingModelId,
    usedMock: rankingUsedMock,
  } as RankResult & { embeddingModelId: string; usedMock: boolean };
}

async function getAliases(): Promise<{ CANONICAL_SKILL_ALIASES: Record<string, string> }> {
  // Unified map — same source as resumeProfile + jdParser (bare react/python/html/css included).
  return { CANONICAL_SKILL_ALIASES };
}

export function rankJobsSync(
  profile: ResumeProfile,
  jobs: NormalizedJob[],
  opts?: { preferences?: { locations?: string[] | null } },
): Promise<RankResult[]> {
  return rankJobsBatch(profile, jobs, opts);
}

/**
 * Batch ranking — ONE provider instance, ONE embed call for all unique texts.
 * The old path called provider.embed per job (×2 for title fallback) and fanned
 * out ~100 concurrent InvokeEndpoints at a Serverless endpoint with
 * MaxConcurrency=1 → mass throttling ("UnknownError") → everything mock.
 * Batching turns N jobs into ceil(uniqueTexts/32) sequential invokes.
 */
export async function rankJobsBatch(
  profile: ResumeProfile,
  jobs: NormalizedJob[],
  opts?: { preferences?: { locations?: string[] | null } },
): Promise<(RankResult & { embeddingModelId: string; usedMock: boolean })[]> {
  // Resume side mirrors jd-match: skills line + experience chunks, best-match wins.
  // A single short summary vector is too noisy (ranks "Java SWE II" above a
  // matching junior JD); max-over-chunks discriminates correctly.
  const resumeChunks: string[] = [];
  if (profile.skills.length) resumeChunks.push(('Skills: ' + profile.skills.join(', ')).slice(0, 500));
  for (const exp of profile.experience.slice(0, 5)) {
    if (exp.title) resumeChunks.push(exp.title.slice(0, 200));
    if ((exp as any).description) resumeChunks.push(String((exp as any).description).slice(0, 500));
  }
  if (!resumeChunks.length) resumeChunks.push((profile.summary ?? '').slice(0, 1000));
  const resumeExpTitles = profile.experience.map((e) => (e.title ?? '').toLowerCase()).join(' ');
  const combinedBase = `${resumeExpTitles} ${(profile.summary ?? '').toLowerCase()}`.slice(0, 500);

  const perJobTexts = jobs.map((job) => ({
    jobDesc: (job.description ?? job.title).slice(0, 1000),
    combined: combinedBase,
    title: job.title,
  }));

  // Unique texts for a single embed call
  const uniq = [...new Set([...resumeChunks, ...perJobTexts.flatMap((t) => [t.jobDesc, t.combined, t.title])].map((t) => t.trim()).filter(Boolean))];

  const provider = getRankingEmbeddingProvider();
  const providerName = (provider as object).constructor?.name ?? 'unknown';
  const t0 = Date.now();
  let vec = new Map<string, number[]>();
  let modelId = 'mock-384';
  let usedMock = true;
  if (uniq.length) {
    try {
      const resp = await provider.embed({ texts: uniq, purpose: 'job' });
      modelId = resp.modelId;
      usedMock = modelId.includes('mock');
      uniq.forEach((t, i) => vec.set(t, resp.vectors[i]));
      console.log(`[ranking] batch embed provider=${providerName} model=${modelId}${usedMock ? ' (mock fallback)' : ''} jobs=${jobs.length} texts=${uniq.length} ms=${Date.now() - t0}`);
    } catch (e: any) {
      console.warn(`[ranking] batch embed failed provider=${providerName}: ${e?.name || ''} ${e?.message || e} — scoring with keyword-only fallback`);
      vec = new Map();
    }
  }

  const pairScore = (a: string, b: string): number => {
    const va = vec.get(a.trim());
    const vb = vec.get(b.trim());
    if (!va || !vb) return 0;
    return to01(cosine(va, vb));
  };

  return jobs.map((job, idx) => {
    const evidence: string[] = [];
    const { jobDesc, combined, title } = perJobTexts[idx];

    // 1) Required skill 30 (same as rankJob) + matched/missing lists for UI
    let requiredSkillScore = 0;
    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];
    {
      const jobText = `${job.title} ${job.description ?? ''}`.toLowerCase();
      const profileSet = normalizeSkillSet(profile.skills);
      const jobSkills: string[] = [];
      for (const key of Object.keys(CANONICAL_SKILL_ALIASES)) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`\\b${escaped}\\b`, 'i').test(jobText)) {
          const norm = normalizeSkill(key).toLowerCase();
          if (!jobSkills.includes(norm)) jobSkills.push(norm);
        }
      }
      const display = (s: string) => normalizeSkill(s);
      if (jobSkills.length === 0) {
        requiredSkillScore = 15;
        evidence.push('No skills detected in job — neutral skill score');
      } else if (jobSkills.length <= 2) {
        // Thin Jooble snippets: 1-2 detected skills is noise, not signal.
        const matchedThin = jobSkills.filter((s) => profileSet.has(s));
        matchedSkills = matchedThin.map(display);
        missingSkills = jobSkills.filter((s) => !profileSet.has(s)).map(display);
        requiredSkillScore = 15;
        evidence.push(`Only ${jobSkills.length} skill signal${jobSkills.length === 1 ? '' : 's'} in snippet (${matchedThin.length} matched) — neutral, too thin to judge`);
      } else {
        const matched = jobSkills.filter((s) => profileSet.has(s));
        const missing = jobSkills.filter((s) => !profileSet.has(s));
        matchedSkills = matched.map(display);
        missingSkills = missing.map(display);
        requiredSkillScore = Math.round((matched.length / jobSkills.length) * 30);
        evidence.push(`Skill coverage ${matched.length}/${jobSkills.length}`);
      }
    }

    // 2) Responsibility semantic 25 (best resume chunk vs job, from batch vectors)
    let responsibilitySemantic = 0;
    {
      let best = 0;
      let bestChunk = '';
      for (const rc of resumeChunks) {
        if (!rc.trim() || !jobDesc.trim()) continue;
        const s = pairScore(rc, jobDesc);
        if (s > best) { best = s; bestChunk = rc.slice(0, 80); }
      }
      responsibilitySemantic = Math.round(best * 25);
      evidence.push(`Semantic similarity ${best.toFixed(2)} via ${modelId}${usedMock ? ' (mock fallback)' : ''}${bestChunk ? ` (best: "${bestChunk}")` : ''}`);
    }

    // 3) Role/title 15
    let roleTitle = 0;
    let titleModel = modelId;
    {
      const titleLower = job.title.toLowerCase();
      const titleWords = titleLower.split(/\W+/).filter((w) => w.length > 2);
      let overlap = 0;
      for (const w of titleWords) {
        if (combined.includes(w)) overlap++;
      }
      const coverage = titleWords.length ? overlap / titleWords.length : 0;
      let score = coverage;
      if (score < 0.3 && combined.trim() && title.trim()) {
        const sim = pairScore(combined, title);
        score = Math.max(score, sim * 0.8);
        if (sim > coverage) {
          titleModel = modelId;
          evidence.push(`Title semantic ${sim.toFixed(2)} via ${modelId}`);
        }
      }
      roleTitle = Math.round(score * 15);
      evidence.push(`Title overlap ${overlap}/${titleWords.length}`);
    }

    // 4) Seniority 15
    let seniority = 0;
    const jobSen: string | null = detectJobSeniority(job.title, job.description);
    {
      const seniorityOrder = ['junior', 'mid', 'senior', 'lead'];
      const profileSen = profile.seniority;
      if (!profileSen || !jobSen) {
        seniority = 8;
        evidence.push('Level: unknown — partial (no penalty)');
      } else if (profileSen === jobSen) {
        seniority = 15;
        evidence.push(`Level match: ${profileSen} = ${jobSen} (no penalty)`);
      } else {
        const diff = Math.abs(seniorityOrder.indexOf(profileSen) - seniorityOrder.indexOf(jobSen));
        seniority = diff === 1 ? 8 : diff === 2 ? 3 : 0;
        evidence.push(`Level penalty: ${15 - seniority} pts — your ${profileSen} vs job ${jobSen} (diff ${diff})`);
      }
    }

    // 5) Domain/education 10
    let domainEducation = 0;
    {
      const jobLower = (job.description ?? '').toLowerCase();
      const hasEduReq = ['bachelor', 'master', 'degree', 'phd', 'education'].some((k) => jobLower.includes(k));
      if (!hasEduReq) domainEducation = 6;
      else if (profile.education.length > 0) {
        domainEducation = 10;
        evidence.push('Education matches requirement');
      } else {
        domainEducation = 2;
        evidence.push('Missing education for job requirement');
      }
    }

    // 6) Location 5
    let location = 0;
    {
      const prefLocs = opts?.preferences?.locations?.map((s) => s.toLowerCase()) ?? [];
      if (!prefLocs.length || !job.location) location = 3;
      else {
        const { points, note } = locationScore(prefLocs, job.location, job.workMode);
        location = points;
        if (note) evidence.push(note);
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
    let fitScore = Object.values(breakdown).reduce((s, v) => s + v, 0);
    fitScore = Math.max(0, Math.min(100, fitScore));
    // Hard cap: senior/lead postings can never top the list for junior profiles.
    if (profile.seniority === 'junior' && (jobSen === 'senior' || jobSen === 'lead')) {
      if (fitScore > 65) {
        evidence.push(`Capped at 65: ${jobSen}-level role is out of reach for a junior profile`);
        fitScore = 65;
      }
    }
    void titleModel;
    return {
      fitScore,
      breakdown,
      evidence,
      embeddingModelId: modelId,
      usedMock,
      matchedSkills,
      missingSkills,
    };
  });
}

export default rankJob;
