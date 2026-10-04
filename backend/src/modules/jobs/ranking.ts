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
import { detectSeniority, normalizeSeniority, seniorityPenalty } from './seniority.js';
import { inferCountry, normalizePlace } from './geography.js';

export const VERSION = '4.1.0';

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
  scoreDetails?: { relevanceScore: number; seniorityPenalty: number; candidateSeniority: string | null; jobSeniority: string | null; semanticStatus: 'embedded' | 'keyword-only'; responsibilityMatches: Array<{ responsibility: string; evidence: string | null; similarity: number; rawCosine: number; supported: boolean }>; scoreCap: number | null; scoreCapReasons: string[]; skillEvidence: Array<{skill:string;source:'demonstrated'|'declared'|'unverified'}> };
};

function normalizeSkillSet(skills: string[]): Set<string> {
  return new Set(skills.map((s) => normalizeSkill(s).toLowerCase()));
}

// Major Indian metros/states — Jooble returns city names ("Delhi") while users
// filter by country ("India"). Without this, Delhi-vs-India scores 0.
function locationScore(prefLocs: string[], jobLocation: string | null, workMode?: string | null): { points: number; note: string } {
  if (!prefLocs.length || !jobLocation) return { points: 3, note: '' };
  if (workMode && workMode.toLowerCase() === 'remote') return { points: 3, note: 'Remote role — geographic eligibility not verified' };
  const jl = jobLocation.toLowerCase();
  if (/\bremote\b/.test(jl)) return { points: 3, note: 'Remote — residency eligibility not verified' };
  const direct = prefLocs.some((pl) => jl.includes(pl) || pl.includes(jl));
  if (direct) return { points: 5, note: `Location match ${jobLocation}` };
  // Country containment: pref "india" + job in an Indian city
  const jobCountry = inferCountry(jobLocation);
  if (jobCountry && prefLocs.some(p => inferCountry(p) === jobCountry)) return { points: 5, note: `Location match ${jobLocation}` };
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
  return detectSeniority(title, description);
}

type RankOptions = { preferences?: { locations?: string[] | null; targetRoles?: string[] | null; emphasizedSkills?: string[] | null }; ownerId?: string; embeddingProvider?: EmbeddingProvider & { modelId?: string; modelRevision?: string | null } };

/** Single-item compatibility path delegates to the same scorer used by runs. */
export async function rankJob(profile: ResumeProfile, job: NormalizedJob, opts?: RankOptions): Promise<RankResult> {
  return (await rankJobsBatch(profile, [job], opts))[0];
}

export function rankJobsSync(
  profile: ResumeProfile,
  jobs: NormalizedJob[],
  opts?: RankOptions,
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
  opts?: RankOptions,
): Promise<(RankResult & { embeddingModelId: string; usedMock: boolean })[]> {
  // Resume side mirrors jd-match: skills line + experience chunks, best-match wins.
  // A single short summary vector is too noisy (ranks "Java SWE II" above a
  // matching junior JD); max-over-chunks discriminates correctly.
  if (!jobs.length) return [];
  const resumeChunks = professionalEvidence({ ...profile, skills: [] });

  const perJobTexts = jobs.map((job) => ({
     jobDesc: redactProfessionalText(job.description ?? job.title).slice(0, 5000),
    title: job.title,
    responsibilities: parseJd(`Job title: ${job.title}\n${job.description ?? ''}`).responsibilities.slice(0, 12),
  }));

  // Unique texts for a single embed call
  const uniq = [...new Set([...resumeChunks, ...perJobTexts.flatMap((t) => [t.jobDesc, t.title, ...t.responsibilities])].map((t) => t.trim()).filter(Boolean))];

  const provider = opts?.embeddingProvider ?? getRankingEmbeddingProvider();
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
       const resp = opts?.ownerId && !opts.embeddingProvider ? await embedCached(pool, provider, [
         { purpose: 'resume', ownerId: opts.ownerId, texts: [...new Set(resumeChunks.map(t => t.trim()).filter(Boolean))] },
         { purpose: 'job', texts: [...new Set(perJobTexts.flatMap(t => [t.jobDesc, t.title, ...t.responsibilities]).map(t => t.trim()).filter(Boolean))] },
       ], identity) : null;
       const direct = resp ? null : await provider.embed({ texts: uniq, purpose: 'job' });
       const embedded = resp ? new Map<string, number[]>([
         ...[...new Set(resumeChunks.map(t => t.trim()).filter(Boolean))].map((text, i) => [text, resp.groups[0][i]] as const),
         ...[...new Set(perJobTexts.flatMap(t => [t.jobDesc, t.title, ...t.responsibilities]).map(t => t.trim()).filter(Boolean))].map((text, i) => [text, resp.groups[1][i]] as const),
       ]) : null;
       const result = direct ?? { vectors: uniq.map(text => embedded!.get(text)!), modelId: resp!.modelId, dimension: resp!.dimension };
       modelId = result.modelId;
      usedMock = /mock|hash/i.test(modelId) || provider instanceof MockEmbeddingProvider;
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
    const { jobDesc } = perJobTexts[idx];

    // 1) Required skill 30 (same as rankJob) + matched/missing lists for UI
    let requiredSkillScore = 0;
    let matchedSkills: string[] = [];
     let missingSkills: string[] = [];
     const skillEvidence: NonNullable<RankResult['scoreDetails']>['skillEvidence'] = [];
    {
      const jobText = `${job.title} ${job.description ?? ''}`.toLowerCase();
       const demonstrated = normalizeSkillSet((profile as any).demonstratedSkills ?? []);
       const declared = normalizeSkillSet((profile as any).declaredSkills ?? profile.skills ?? []);
       const profileSet = normalizeSkillSet(profile.skills);
       const jobSkills = extractSkills(jobText).map(s => s.toLowerCase());
      const parsed = parseJd(`Job title: ${job.title}\n${job.description ?? ''}`);
      const structured = parsed.requirementGroups?.some(group => group.confidence >= .7);
      const display = (s: string) => normalizeSkill(s);
       if (structured) {
        const match = matchJd(profile, parsed);
        requiredSkillScore = Math.round(match.overallScore / 100 * (job.descriptionQuality === 'full' ? 30 : 18));
        matchedSkills = [...match.matchedRequired, ...match.matchedPreferred];
         missingSkills = match.missingRequired;
         [...matchedSkills, ...missingSkills].forEach(skill => skillEvidence.push({ skill: display(skill), source: demonstrated.has(normalizeSkill(skill).toLowerCase()) ? 'demonstrated' : declared.has(normalizeSkill(skill).toLowerCase()) ? 'declared' : 'unverified' }));
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
        requiredSkillScore = Math.round((matched.length / jobSkills.length) * 18);
        evidence.push(`Skill coverage ${matched.length}/${jobSkills.length}`);
      }
    }

    // 2) Responsibility semantic 25 (best resume chunk vs job, from batch vectors)
    let responsibilitySemantic = 0;
    const responsibilityMatches: NonNullable<RankResult['scoreDetails']>['responsibilityMatches'] = [];
    {
      const parsed = parseJd(`Job title: ${job.title}\n${job.description ?? ''}`);
       const responsibilities = parsed.responsibilities.slice(0, 12);
      for (const responsibility of responsibilities.slice(0, 12)) {
        let best = 0, bestChunk: string | null = null;
        for (const rc of resumeChunks) {
         const s = pairScore(rc, responsibility);
          if (s > best) { best = s; bestChunk = rc.slice(0, 140); }
        }
         const rawCosine = best ? Math.max(-1, Math.min(1, best * .6 + .35)) : 0;
         const supported = Boolean(bestChunk && best > .5);
         responsibilityMatches.push({ responsibility: responsibility.slice(0, 180), evidence: supported ? bestChunk : null, similarity: best, rawCosine, supported });
      }
      responsibilitySemantic = responsibilityMatches.length ? Math.round(responsibilityMatches.reduce((sum, r) => sum + r.similarity, 0) / responsibilityMatches.length * 25) : 0;
      evidence.push(vec.size ? `Responsibility coverage ${responsibilityMatches.filter(r => r.similarity > .5).length}/${responsibilityMatches.length} via ${modelId}` : 'Keyword-only fallback; semantic responsibility evidence unavailable');
    }

    // 3) Role/title 15
    let roleTitle = 0;
    {
       const family = roleFamily(job.title);
       const roleText = `${profile.experience.map(e => e.title ?? '').join(' ')} ${profile.projects?.map(e => e.title ?? '').join(' ')}`;
       const target = opts?.preferences?.targetRoles ?? [];
       const area = (s: string) => /\b(data|machine learning|ml)\b/i.test(s) ? 'data' : /\b(frontend|front.end|react|ui)\b/i.test(s) ? 'frontend' : /\b(backend|back.end|api|server)\b/i.test(s) ? 'backend' : /\b(devops|platform|cloud)\b/i.test(s) ? 'platform' : /\b(full.stack|fullstack)\b/i.test(s) ? 'fullstack' : /\b(software|developer|engineer|web)\b/i.test(s) ? 'generic' : 'other';
       const actual = area(job.title), demonstrated = area(roleText), desired = target.map(area);
       const skills = normalizeSkillSet([...profile.skills, ...(opts?.preferences?.emphasizedSkills ?? [])]);
       const specialized = actual !== 'generic' && actual !== 'other';
       const skillRelevant = actual === 'frontend' ? ['react', 'vue.js', 'angular', 'html'].some(s => skills.has(s)) : actual === 'backend' ? ['node.js', 'express', 'python', 'java'].some(s => skills.has(s)) : false;
       const compatible = actual === demonstrated || (actual === 'generic' && demonstrated !== 'other') || (specialized && demonstrated === 'fullstack') || (specialized && skillRelevant);
       const targeted = !desired.length || desired.includes(actual) || desired.includes('generic') && actual === 'generic' || desired.includes('fullstack') && actual !== 'data';
       roleTitle = family === 'other' || !compatible || !targeted ? 0 : actual === demonstrated ? 15 : 9;
       evidence.push(`Role ${actual}: ${roleTitle ? 'supported by professional titles or relevant skills' : 'specialization not demonstrated or outside target roles'}`);
    }

    // 4) Seniority 15
    let seniority = 0;
    const jobSen: string | null = detectJobSeniority(job.title, job.description);
    const profileSen = normalizeSeniority(profile.seniority);
    {
      const seniorityOrder = ['intern', 'entry', 'mid', 'senior', 'principal'];
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
      else {
        const expected = /\b(?:phd|doctorate)\b/i.test(jobLower) ? 'doctorate' : /\bmaster/i.test(jobLower) ? 'master' : /\b(?:bachelor|degree)\b/i.test(jobLower) ? 'bachelor' : null;
        const field = jobLower.match(/\b(?:in|of)\s+(computer science|information technology|software engineering|electrical engineering|mathematics)\b/i)?.[1];
        const matching = profile.education.find(entry => {
          const degree = entry.degree ?? '';
          const level = /phd|doctor/i.test(degree) ? 'doctorate' : /master|m\.?tech|m\.?sc/i.test(degree) ? 'master' : /bachelor|b\.?tech|b\.?sc|b\.?e\.?/i.test(degree) ? 'bachelor' : null;
          return (!expected || level === expected || expected === 'bachelor' && level === 'master') && (!field || entry.field?.toLowerCase() === field.toLowerCase());
        });
        domainEducation = matching ? matching.completed === true ? 10 : 5 : 0;
        evidence.push(matching ? matching.completed === true ? 'Verified completed education meets stated degree and field' : 'Degree listed; completion unverified' : 'Required degree or field not evidenced');
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
    const relevanceScore = Object.values(breakdown).reduce((s, v) => s + v, 0);
    const penalty = seniorityPenalty(profileSen, jobSen);
     let fitScore = Math.max(0, Math.min(100, relevanceScore - penalty));
     const scoreCapReasons: string[] = [];
     const scoreCap = (profileSen === 'entry' || profileSen === 'intern') && (jobSen === 'senior' || jobSen === 'principal') ? (jobSen === 'principal' ? 25 : 35) : null;
     if (scoreCap !== null) { fitScore = Math.min(fitScore, scoreCap); scoreCapReasons.push(`${jobSen === 'principal' ? 'Principal' : 'Senior'} role exceeds entry-level profile`); }
    if (penalty) evidence.push(`Seniority mismatch: -${penalty} points (${profileSen} → ${jobSen}); eligibility assessed separately`);
    const thin = !job.description || job.description.length < 120 || !resumeChunks.length;
    if (thin) fitScore = Math.min(fitScore, 55);
    return {
      fitScore,
      breakdown,
      evidence,
      embeddingModelId: modelId,
      usedMock,
      matchedSkills,
       missingSkills,
        confidence: !thin && vec.size && job.descriptionQuality === 'full' && responsibilityMatches.length ? 'Medium' : 'Low',
         scoreDetails: { relevanceScore, seniorityPenalty: penalty, candidateSeniority: profileSen, jobSeniority: jobSen, semanticStatus: vec.size ? 'embedded' : 'keyword-only', responsibilityMatches, scoreCap, scoreCapReasons, skillEvidence },
    };
  });
}

export default rankJob;
