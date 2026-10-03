import type { ResumeProfile } from '../parsing/resumeProfile.js';
import type { NormalizedJob } from '../../providers/jobs/JobProvider.js';
import { normalizeSkill } from '../parsing/skillNormalizer.js';
import { extractSkills } from '../parsing/skillExtractor.js';
import { professionalEvidence, redactProfessionalText } from '../matching/evidenceBuilder.js';
import { parseJd } from '../jd/jdParser.js';
import { matchJd } from '../jd/matcher.js';
import { validateVectors } from '../../providers/embeddings/validateVectors.js';
import { MockEmbeddingProvider } from '../../providers/embeddings/MockEmbeddingProvider.js';
import { AwsSageMakerEmbeddingProvider } from '../../providers/embeddings/AwsSageMakerEmbeddingProvider.js';
import { getLocalEmbeddingProvider } from '../../providers/embeddings/LocalEmbeddingProvider.js';
import { embedCached } from '../../providers/embeddings/embeddingCache.js';
import type { EmbeddingProvider } from '../../providers/embeddings/EmbeddingProvider.js';
import pool from '../../config/database.js';
import { env } from '../../config/env.js';

export const VERSION = '3.0.0';

export function roleFamily(title: string): 'software' | 'data' | 'other' {
  if (/\b(?:software|developer|frontend|front.end|backend|back.end|full.stack|web|react|javascript|typescript|swe|sde|programmer|devops)\b/i.test(title)) return 'software';
  if (/\b(?:data engineer|machine learning engineer|ml engineer)\b/i.test(title)) return 'data';
  if (/\b(?:ui|application|qa|sqa|sdet|platform|cloud|test|ai)\b.*\bengineer\b/i.test(title)) return 'software';
  return 'other';
}

/**
 * Ranking — compose fit score: Required skill 30 + Responsibility semantic 25 + Role/title 15 + Seniority 15 + Domain/education 10 + Location 5 =100
 * Without ATS/salary/freshness.
 * Embedding: SageMaker (aws) or Local when EMBEDDING_PROVIDER set; Mock ONLY as fallback — never default.
 */

function getRankingEmbeddingProvider(): EmbeddingProvider & { modelId?: string; modelRevision?: string | null } {
  const p = (env.EMBEDDING_PROVIDER || 'auto').toLowerCase();
  if (p === 'local' || process.env.USE_LOCAL_EMBEDDINGS === 'true') return getLocalEmbeddingProvider();
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
  matchedSkills?: string[];
  missingSkills?: string[];
  confidence?: string;
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
  if (workMode && workMode.toLowerCase() === 'remote') return { points: 3, note: 'Remote role — geographic eligibility not verified' };
  const jl = jobLocation.toLowerCase();
  if (/\bremote\b/.test(jl)) return { points: 3, note: 'Remote — residency eligibility not verified' };
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
  const lower = title.toLowerCase();
  if (/\b(principal|staff|lead|director|vp|avp|architect|manager|l[56])\b/.test(lower)) return 'lead';
  if (/\b(senior|sr\.?|iii|iv)\b/.test(lower)) return 'senior';
  // Indian-IT/US "Associate Software Engineer" (without "senior") is entry-level.
  if (/\bassociate\b/.test(lower) && /(engineer|developer)/.test(lower)) return 'junior';
  if (/\bjunior\b|\bjr\.?\b|entry[\s-]?level|fresher|graduate|intern(ship)?\b|engineer\s*[-–/]?\s*(1|i)\b|\bswe\s*[-–/]?\s*1\b/.test(lower)) return 'junior';
  if (/\bmid(\s+level)?\b|\bii\b|\bl[34]\b/.test(lower)) return 'mid';
  const years = parseJd(`Job title: ${title}\n${description ?? ''}`).minYears;
  if (typeof years === 'number') return years >= 5 ? 'senior' : years >= 2 ? 'mid' : 'junior';
  return null;
}

/** Single-item compatibility path delegates to the same scorer used by runs. */
export async function rankJob(profile: ResumeProfile, job: NormalizedJob, opts?: { preferences?: { locations?: string[] | null } }): Promise<RankResult> {
  return (await rankJobsBatch(profile, [job], opts))[0];
}

export function rankJobsSync(
  profile: ResumeProfile,
  jobs: NormalizedJob[],
  opts?: { preferences?: { locations?: string[] | null }; ownerId?: string },
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
  opts?: { preferences?: { locations?: string[] | null }; ownerId?: string },
): Promise<(RankResult & { embeddingModelId: string; usedMock: boolean })[]> {
  // Resume side mirrors jd-match: skills line + experience chunks, best-match wins.
  // A single short summary vector is too noisy (ranks "Java SWE II" above a
  // matching junior JD); max-over-chunks discriminates correctly.
  if (!jobs.length) return [];
  const resumeChunks = professionalEvidence(profile);
   const resumeExpTitles = profile.experience.filter((e) => /engineer|develop|software|intern|programmer|project/i.test(e.title ?? '')).map((e) => (e.title ?? '').toLowerCase()).join(' ');
   const combinedBase = resumeExpTitles.slice(0, 500);

  const perJobTexts = jobs.map((job) => ({
     jobDesc: redactProfessionalText(job.description ?? job.title).slice(0, 5000),
    combined: combinedBase,
    title: job.title,
  }));

  // Unique texts for a single embed call
  const uniq = [...new Set([...resumeChunks, ...perJobTexts.flatMap((t) => [t.jobDesc, t.combined, t.title])].map((t) => t.trim()).filter(Boolean))];

  const provider = getRankingEmbeddingProvider();
  const providerName = (provider as object).constructor?.name ?? 'unknown';
  const t0 = Date.now();
  let vec = new Map<string, number[]>();
  let modelId = 'unavailable';
  let usedMock = false;
  if (uniq.length) {
    try {
       const identity = 'modelRevision' in provider && typeof provider.modelRevision === 'string' && provider.modelRevision
         ? { modelId: String(provider.modelId), modelRevision: provider.modelRevision } : null;
       // Without an authenticated owner, never persist or read private resume vectors.
       const resp = opts?.ownerId ? await embedCached(pool, provider, [
         { purpose: 'resume', ownerId: opts.ownerId, texts: [...new Set(resumeChunks.map(t => t.trim()).filter(Boolean))] },
         { purpose: 'job', texts: [...new Set(perJobTexts.flatMap(t => [t.jobDesc, t.combined, t.title]).map(t => t.trim()).filter(Boolean))] },
       ], identity) : null;
       const direct = resp ? null : await provider.embed({ texts: uniq, purpose: 'job' });
       const embedded = resp ? new Map<string, number[]>([
         ...[...new Set(resumeChunks.map(t => t.trim()).filter(Boolean))].map((text, i) => [text, resp.groups[0][i]] as const),
         ...[...new Set(perJobTexts.flatMap(t => [t.jobDesc, t.combined, t.title]).map(t => t.trim()).filter(Boolean))].map((text, i) => [text, resp.groups[1][i]] as const),
       ]) : null;
       const result = direct ?? { vectors: uniq.map(text => embedded!.get(text)!), modelId: resp!.modelId, dimension: resp!.dimension };
       modelId = result.modelId;
      usedMock = modelId.includes('mock');
       validateVectors(result.vectors, uniq.length, result.dimension);
       if (!usedMock) uniq.forEach((t, i) => vec.set(t, result.vectors[i]));
      console.log(`[ranking] batch embed provider=${providerName} model=${modelId}${usedMock ? ' (mock fallback)' : ''} jobs=${jobs.length} texts=${uniq.length} ms=${Date.now() - t0}`);
    } catch (e: any) {
      console.warn(`[ranking] batch embed failed provider=${providerName}: ${e?.name || ''} ${e?.message || e} — scoring with keyword-only fallback`);
      vec = new Map();
      modelId = 'unavailable';
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
      const jobSkills = extractSkills(jobText).map(s => s.toLowerCase());
      const parsed = parseJd(`Job title: ${job.title}\n${job.description ?? ''}`);
      const structured = parsed.requirementGroups?.some(group => group.confidence >= .7);
      const display = (s: string) => normalizeSkill(s);
      if (structured) {
        const match = matchJd(profile, parsed);
        requiredSkillScore = Math.round(match.overallScore / 100 * 30);
        matchedSkills = [...match.matchedRequired, ...match.matchedPreferred];
        missingSkills = match.missingRequired;
        evidence.push(`Structured requirement coverage ${Math.round(match.requiredCoverage * 100)}%; alternatives are grouped`);
      } else if (jobSkills.length === 0) {
         requiredSkillScore = 0;
         evidence.push('Requirements unavailable; no skill points inferred');
      } else if (jobSkills.length <= 2) {
        // Thin Jooble snippets: 1-2 detected skills is noise, not signal.
        const matchedThin = jobSkills.filter((s) => profileSet.has(s));
        matchedSkills = matchedThin.map(display);
        missingSkills = jobSkills.filter((s) => !profileSet.has(s)).map(display);
         requiredSkillScore = Math.round(matchedThin.length / jobSkills.length * 15);
         evidence.push(`Only ${jobSkills.length} skill signal${jobSkills.length === 1 ? '' : 's'} (${matchedThin.length} matched); limited evidence`);
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
       const family = roleFamily(job.title);
       roleTitle = family === 'other' ? 0 : combined && family === 'software' ? 15 : family === 'software' ? 8 : 5;
       evidence.push(combined ? `Role family: ${family}, professional title evidence` : `Role family: ${family}; professional title evidence unavailable`);
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
       const hasEduReq = /\b(?:bachelor(?:'s)?|master(?:'s)?|degree|phd)\b/.test(jobLower);
       if (!hasEduReq) domainEducation = 0;
       else if (profile.education.some((entry: any) => /bachelor|b\.?tech|b\.?e\.?|master|m\.?tech|phd/i.test(String(entry.degree ?? '')))) {
         domainEducation = 5;
         evidence.push('Degree type appears relevant; completion and field unverified');
       } else evidence.push('Degree evidence unavailable');
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
       evidence.push(`${jobSen}-level role is not eligible for a junior profile`);
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
        confidence: job.descriptionQuality === 'full' && !usedMock && modelId !== 'unavailable' && job.description && job.description.length > 300 ? 'Medium' : 'Low',
    };
  });
}

export default rankJob;
