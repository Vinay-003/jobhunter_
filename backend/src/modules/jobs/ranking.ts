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
import { roleArea, profileRoleAreas } from './roleDiscovery.js';

export const VERSION = '5.0.0';

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
  scoreDetails?: { relevanceScore: number; seniorityPenalty: number; candidateSeniority: string | null; jobSeniority: string | null; semanticStatus: 'embedded' | 'keyword-only'; responsibilityMatches: Array<{ responsibility: string; evidence: string | null; similarity: number; rawCosine: number; supported: boolean }>; scoreCap: number | null; scoreCapReasons: string[]; skillEvidence: Array<{skill:string;source:'demonstrated'|'declared'|'unverified'}>; components: Array<{key:string;label:string;points:number;maxPoints:number;reason:string}> };
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
  if (rawCosine <= 0.25) return 0;
  if (rawCosine <= 0.50) return (rawCosine - 0.25) / 0.25 * 0.40;
  return Math.min(1, 0.40 + (rawCosine - 0.50) / 0.40 * 0.60);
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
  const eduChunks = profile.education.map(e =>
    `${e.degree ?? 'Degree'}${e.field ? ` in ${e.field}` : ''}${e.institution ? ` from ${e.institution}` : ''} ${e.raw ?? ''}`.trim()
  ).filter(Boolean);
  const profileRoles = [...new Set([
    ...profile.experience.map(e => e.title).filter((t): t is string => Boolean(t)),
    ...((profile as any).projects ?? []).map((p: any) => p.title).filter((t: any): t is string => Boolean(t)),
  ])];

  const perJobTexts = jobs.map((job) => {
    const jobText = `${job.title} ${job.description ?? ''}`;
    const sentences = (job.description ?? '').split(/(?<=[.!?\n])\s+/);
    const eduSentences = sentences.filter(s =>
      /\b(?:bachelor(?:'s)?|master(?:'s)?|b\.?tech|b\.?e\.?|bca|mca|degree|ph\.?d|graduate|undergraduate|diploma)\b/i.test(s)
    );
    const eduText = eduSentences.length ? eduSentences.slice(0, 3).join(' ').trim().slice(0, 400) : null;
    const jobSkills = extractSkills(jobText.toLowerCase());

    return {
      jobDesc: redactProfessionalText(job.description ?? job.title).slice(0, 5000),
      title: job.title,
      responsibilities: parseJd(`Job title: ${job.title}\n${job.description ?? ''}`).responsibilities.slice(0, 12),
      eduText,
      jobSkills,
    };
  });

  // Unique texts for a single embed call
  const uniq = [...new Set([
    ...resumeChunks,
    ...eduChunks,
    ...profileRoles,
    ...perJobTexts.flatMap((t) => [t.jobDesc, t.title, ...t.responsibilities, ...(t.eduText ? [t.eduText] : []), ...t.jobSkills]),
  ].map((t) => t.trim()).filter(Boolean))];

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
       const resumeGroup = [...new Set([...resumeChunks, ...eduChunks, ...profileRoles].map(t => t.trim()).filter(Boolean))];
       const jobGroup = [...new Set(perJobTexts.flatMap(t => [t.jobDesc, t.title, ...t.responsibilities, ...(t.eduText ? [t.eduText] : []), ...t.jobSkills]).map(t => t.trim()).filter(Boolean))];
       // Without an authenticated owner, never persist or read private resume vectors.
       const resp = opts?.ownerId && !opts.embeddingProvider ? await embedCached(pool, provider, [
         { purpose: 'resume', ownerId: opts.ownerId, texts: resumeGroup },
         { purpose: 'job', texts: jobGroup },
       ], identity) : null;
       const direct = resp ? null : await provider.embed({ texts: uniq, purpose: 'job' });
       const embedded = resp ? new Map<string, number[]>([
         ...resumeGroup.map((text, i) => [text, resp.groups[0][i]] as const),
         ...jobGroup.map((text, i) => [text, resp.groups[1][i]] as const),
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
    const { jobDesc, jobSkills } = perJobTexts[idx];

    // 1) Required skill 30 (same as rankJob) + matched/missing lists for UI with semantic support
    let requiredSkillScore = 0;
    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];
    const skillEvidence: NonNullable<RankResult['scoreDetails']>['skillEvidence'] = [];
    {
      const demonstrated = normalizeSkillSet((profile as any).demonstratedSkills ?? []);
      const declared = normalizeSkillSet((profile as any).declaredSkills ?? profile.skills ?? []);
      const profileSet = normalizeSkillSet(profile.skills);
      const parsed = parseJd(`Job title: ${job.title}\n${job.description ?? ''}`);
      const structured = parsed.requirementGroups?.some(group => group.confidence >= .7);
      const display = (s: string) => normalizeSkill(s);

      // Raw exact matches
      const rawMatched = jobSkills.filter((s) => profileSet.has(s.toLowerCase()));
      const rawMissing = jobSkills.filter((s) => !profileSet.has(s.toLowerCase()));

      // Check semantic support for missing skills
      const semanticallySupported: string[] = [];
      if (vec.size && resumeChunks.length && rawMissing.length) {
        for (const miss of rawMissing) {
          let bestSim = 0;
          for (const rc of resumeChunks) {
            const s = pairScore(rc, miss);
            if (s > bestSim) bestSim = s;
          }
          if (bestSim >= 0.45) { // Raw cosine >= 0.52
            semanticallySupported.push(miss);
          }
        }
      }

      const allMatched = [...rawMatched, ...semanticallySupported];
      const finalMissing = rawMissing.filter(s => !semanticallySupported.includes(s));

      const effectiveSkills = [...profile.skills, ...semanticallySupported];
      const effectiveProfile: ResumeProfile = semanticallySupported.length ? {
        ...profile,
        skills: effectiveSkills,
        skillsNormalized: effectiveSkills.map(normalizeSkill),
      } : profile;

      if (structured) {
        const match = matchJd(effectiveProfile, parsed);
        requiredSkillScore = Math.round((match.overallScore / 100) * (job.descriptionQuality === 'full' ? 30 : 18));
        matchedSkills = [...new Set([...match.matchedRequired, ...match.matchedPreferred, ...semanticallySupported].map(s => normalizeSkill(s)))];
        missingSkills = match.missingRequired.filter(s => !semanticallySupported.some(sup => normalizeSkill(sup).toLowerCase() === normalizeSkill(s).toLowerCase()));
        [...new Set([...matchedSkills, ...missingSkills])].forEach(skill => {
          const norm = normalizeSkill(skill).toLowerCase();
          const src = demonstrated.has(norm) ? 'demonstrated' : declared.has(norm) ? 'declared' : semanticallySupported.some(s => normalizeSkill(s).toLowerCase() === norm) ? 'demonstrated' : 'unverified';
          skillEvidence.push({ skill: display(skill), source: src });
        });
        evidence.push(`Structured requirement coverage ${Math.round(match.requiredCoverage * 100)}%${semanticallySupported.length ? ` (${semanticallySupported.length} via semantic alignment)` : ''}; alternatives are grouped`);
      } else if (jobSkills.length === 0) {
        requiredSkillScore = 0;
        evidence.push('Requirements unavailable; no skill points inferred');
      } else if (jobSkills.length <= 2) {
        matchedSkills = allMatched.map(display);
        missingSkills = finalMissing.map(display);
        requiredSkillScore = Math.round(allMatched.length / jobSkills.length * 15);
        evidence.push(`Only ${jobSkills.length} skill signal${jobSkills.length === 1 ? '' : 's'} (${allMatched.length} matched); limited evidence`);
      } else {
        matchedSkills = allMatched.map(display);
        missingSkills = finalMissing.map(display);
        const maxSkill = job.descriptionQuality === 'full' ? 30 : 18;
        requiredSkillScore = Math.round((allMatched.length / jobSkills.length) * maxSkill);
        evidence.push(`Skill coverage ${allMatched.length}/${jobSkills.length}${semanticallySupported.length ? ` (${semanticallySupported.length} via semantic alignment)` : ''}`);
      }
    }

    // 2) Responsibility semantic 25 (best resume chunk vs job, from batch vectors)
    let responsibilitySemantic = 0;
    const responsibilityMatches: NonNullable<RankResult['scoreDetails']>['responsibilityMatches'] = [];
    {
      const parsed = parseJd(`Job title: ${job.title}\n${job.description ?? ''}`);
      const responsibilities = parsed.responsibilities.slice(0, 12);
      for (const responsibility of responsibilities) {
        let best = 0, bestChunk: string | null = null;
        for (const rc of resumeChunks) {
          const s = pairScore(rc, responsibility);
          if (s > best) { best = s; bestChunk = rc.slice(0, 140); }
        }
        const rawCosine = best ? Math.max(-1, Math.min(1, best * .6 + .35)) : 0;
        const supported = Boolean(bestChunk && (best >= 0.40 || rawCosine >= 0.48));
        responsibilityMatches.push({ responsibility: responsibility.slice(0, 180), evidence: supported ? bestChunk : null, similarity: best, rawCosine, supported });
      }
      if (responsibilityMatches.length) {
        responsibilitySemantic = Math.round(responsibilityMatches.reduce((sum, r) => sum + r.similarity, 0) / responsibilityMatches.length * 25);
        evidence.push(vec.size ? `Responsibility coverage ${responsibilityMatches.filter(r => r.supported).length}/${responsibilityMatches.length} via ${modelId}` : 'Keyword-only fallback; semantic responsibility evidence unavailable');
      } else if (vec.size && resumeChunks.length) {
        // Unstructured JD or snippet: compute semantic similarity directly between resume chunks and jobDesc
        const scores = resumeChunks.map(rc => pairScore(rc, jobDesc)).sort((a, b) => b - a);
        const top = scores.slice(0, 3);
        const avg = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
        responsibilitySemantic = Math.round(avg * 25);
        evidence.push(`Job description semantic alignment: ${Math.round(avg * 100)}% via ${modelId}`);
      } else {
        evidence.push('Semantic responsibility evidence unavailable');
      }
    }

    // 3) Role/title 15 — Semantic alignment between demonstrated roles & job title
    let roleTitle = 0;
    {
      const family = roleFamily(job.title);
      const target = opts?.preferences?.targetRoles ?? [];
      const actual = roleArea(job.title), areas = profileRoleAreas(profile), desired = target.map(roleArea);
      const compatible = areas.has(actual) || (actual === 'generic' && areas.size > 0);
      const targeted = !desired.length || desired.includes(actual) || desired.includes('generic') || desired.includes('fullstack') && ['backend', 'frontend'].includes(actual);
      const rulePoints = family === 'other' || !compatible || !targeted ? 0 : actual === 'generic' ? 9 : areas.has('fullstack') && actual !== 'fullstack' ? 12 : 15;

      let maxRoleSim = 0;
      if (vec.size && profileRoles.length) {
        for (const pr of profileRoles) {
          const s = pairScore(pr, job.title);
          if (s > maxRoleSim) maxRoleSim = s;
        }
      }

      if (maxRoleSim >= 0.55 && rulePoints > 0) {
        roleTitle = Math.max(rulePoints, Math.round(maxRoleSim * 15));
      } else {
        roleTitle = rulePoints;
      }

      evidence.push(`Role ${actual}: ${roleTitle ? `supported by demonstrated ${[...areas].join(', ')} work${maxRoleSim >= 0.50 ? ` (${Math.round(maxRoleSim * 100)}% semantic alignment)` : ''}` : 'specialization not demonstrated or outside target roles'}`);
    }

    // 4) Seniority 15
    let seniority = 0;
    const jobSen: string | null = detectJobSeniority(job.title, job.description);
    const profileSen = normalizeSeniority(profile.seniority);
    {
      const seniorityOrder = ['intern', 'entry', 'mid', 'senior', 'principal'];
      if (!profileSen || !jobSen) {
        // When job seniority is unspecified (e.g. general "Full Stack Developer"):
        // Award moderate fit points (8/15) rather than 0
        seniority = !profileSen ? 0 : 8;
        evidence.push(!profileSen
          ? 'Candidate level unknown — no seniority points awarded'
          : 'Level: general role without explicit seniority requirement — moderate fit assumed');
      } else if (seniorityOrder.indexOf(profileSen) >= seniorityOrder.indexOf(jobSen)) {
        seniority = 15;
        evidence.push(`Level ${profileSen} meets ${jobSen}; no downward penalty`);
      } else {
        const diff = Math.abs(seniorityOrder.indexOf(profileSen) - seniorityOrder.indexOf(jobSen));
        seniority = diff === 1 ? 8 : diff === 2 ? 3 : 0;
        evidence.push(`Level penalty: ${15 - seniority} pts — your ${profileSen} vs job ${jobSen} (diff ${diff})`);
      }
    }

    // 5) Domain/education 10 — Semantic ML similarity with deterministic fallback
    let domainEducation = 0;
    {
      const jobLower = (job.description ?? '').toLowerCase();
      const hasEduReq = /\b(?:bachelor(?:'s)?|master(?:'s)?|b\.?tech|b\.?e\.?|bca|mca|degree|ph\.?d|undergraduate|graduate)\b/i.test(jobLower);
      const isEarlyCareer = /intern|fresher|graduate|trainee|apprentice/i.test(job.title) ||
        (profileSen === 'intern' && /intern/i.test(job.title)) ||
        /\b(?:pursuing|student|intern|fresher|recent grad|new grad|in progress)\b/i.test(jobLower);

      const jobEdu = perJobTexts[idx].eduText;
      let semanticEduScore = 0;
      if (vec.size && eduChunks.length) {
        if (jobEdu) {
          for (const ec of eduChunks) {
            const s = pairScore(ec, jobEdu);
            if (s > semanticEduScore) semanticEduScore = s;
          }
        } else {
          // If no explicit degree requirement is stated, measure alignment with job title & description domain
          for (const ec of eduChunks) {
            const s = pairScore(ec, `${job.title} ${jobDesc.slice(0, 300)}`);
            if (s > semanticEduScore) semanticEduScore = s;
          }
        }
      }

      if (vec.size && eduChunks.length && semanticEduScore > 0) {
        if (!hasEduReq) {
          // No explicit degree required by job — award soft credit based on domain alignment
          domainEducation = semanticEduScore >= 0.35 ? 7 : Math.round(semanticEduScore * 7);
          evidence.push(domainEducation >= 5
            ? `Candidate holds relevant technical education (${Math.round(semanticEduScore * 100)}% semantic domain alignment); no strict degree requirement stated`
            : 'No education requirement stated; no technical education verified');
        } else {
          // Explicit education requirement stated in job
          if (semanticEduScore >= 0.45) {
            const matchingCompleted = profile.education.find(e => e.completed === true);
            if (matchingCompleted || isEarlyCareer) {
              domainEducation = 10;
              evidence.push(isEarlyCareer && !matchingCompleted
                ? `Degree in progress/pursuing meets early-career or internship qualification (${Math.round(semanticEduScore * 100)}% semantic alignment)`
                : `Verified education meets stated degree and field (${Math.round(semanticEduScore * 100)}% semantic alignment)`);
            } else {
              domainEducation = 5;
              evidence.push(`Degree listed (${Math.round(semanticEduScore * 100)}% semantic alignment); completion unverified`);
            }
          } else if (semanticEduScore >= 0.30) {
            domainEducation = 5;
            evidence.push(`Partial domain education alignment (${Math.round(semanticEduScore * 100)}%)`);
          } else {
            domainEducation = 0;
            evidence.push('Required degree or field not evidenced');
          }
        }
      } else {
        // Deterministic fallback (when embeddings not available or mocked)
        if (!hasEduReq) {
          const hasRelevantEdu = profile.education.some(entry => {
            const text = `${entry.degree ?? ''} ${entry.field ?? ''} ${entry.raw ?? ''}`.toLowerCase();
            return /\b(?:computer|software|information|technology|engineering|b\.?tech|b\.?e\.?|bca|mca|cs|cse|it)\b/i.test(text);
          });
          domainEducation = hasRelevantEdu ? 7 : 0;
          evidence.push(hasRelevantEdu
            ? 'Candidate holds relevant technical education; no strict degree requirement stated'
            : 'No education requirement stated; no technical education verified');
        } else {
          const expected = /\b(?:phd|doctorate)\b/i.test(jobLower) ? 'doctorate' : /\bmaster\b/i.test(jobLower) ? 'master' : /\b(?:bachelor|degree|b\.?tech|b\.?e\.?|bca)\b/i.test(jobLower) ? 'bachelor' : null;
          const matching = profile.education.find(entry => {
            const degree = entry.degree ?? '';
            const level = /phd|doctor/i.test(degree) ? 'doctorate' : /master|m\.?tech|m\.?sc|mca/i.test(degree) ? 'master' : /bachelor|b\.?tech|b\.?sc|b\.?e\.?|bca/i.test(degree) ? 'bachelor' : null;
            const levelMatches = !expected || level === expected || (expected === 'bachelor' && (level === 'master' || level === 'doctorate'));
            if (!levelMatches) return false;

            const fLower = (entry.field ?? '').toLowerCase();
            const rLower = (entry.raw ?? '').toLowerCase();
            const isCandidateCs = /\b(?:computer science|cs|cse|information technology|it|software|computing|data science|computer applications)\b/i.test(`${fLower} ${rLower}`);
            const isJdCs = /\b(?:computer science|cs|cse|information technology|it|software engineering|data science|computer applications)\b/i.test(jobLower);
            const jdAcceptsRelated = /\b(?:related (?:field|degree|discipline)|or related|equivalent|stem|technical degree|engineering)\b/i.test(jobLower);

            if (isCandidateCs && (isJdCs || jdAcceptsRelated || !isJdCs)) return true;

            const jdField = jobLower.match(/\b(?:in|of)\s+([a-z\s]+(?:science|technology|engineering|mathematics))\b/i)?.[1]?.trim()?.toLowerCase();
            if (!jdField) return true;
            return fLower.includes(jdField) || jdField.includes(fLower);
          });

          if (matching) {
            if (matching.completed === true) {
              domainEducation = 10;
              evidence.push('Verified completed education meets stated degree and field');
            } else if (isEarlyCareer) {
              domainEducation = 10;
              evidence.push('Degree in progress/pursuing meets early-career or internship qualification');
            } else {
              domainEducation = 5;
              evidence.push('Degree listed; completion unverified');
            }
          } else {
            domainEducation = 0;
            evidence.push('Required degree or field not evidenced');
          }
        }
      }
    }

    // 6) Location 5
    let location = 0;
    {
      const prefLocs = opts?.preferences?.locations?.map((s) => s.toLowerCase()) ?? [];
      if (!prefLocs.length || !job.location) { location = 0; evidence.push('Location eligibility unknown; no compatibility points'); }
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
     let scoreCap = (profileSen === 'entry' || profileSen === 'intern') && (jobSen === 'senior' || jobSen === 'principal') ? (jobSen === 'principal' ? 25 : 35) : null;
     if (scoreCap !== null) { fitScore = Math.min(fitScore, scoreCap); scoreCapReasons.push(`${jobSen === 'principal' ? 'Principal' : 'Senior'} role exceeds entry-level profile`); }
    if (penalty) evidence.push(`Seniority mismatch: -${penalty} points (${profileSen} → ${jobSen}); eligibility assessed separately`);
    const thin = !job.description || job.description.length < 120 || !resumeChunks.length;
     if (thin) { scoreCap=Math.min(scoreCap??100,55);fitScore = Math.min(fitScore, scoreCap); scoreCapReasons.push('Thin job or profile evidence caps score at 55'); }
     matchedSkills=[...new Set(matchedSkills.map(normalizeSkill))];missingSkills=[...new Set(missingSkills.map(normalizeSkill))];
     if(!skillEvidence.length) for(const skill of [...matchedSkills,...missingSkills]) skillEvidence.push({skill,source:normalizeSkillSet((profile as any).demonstratedSkills??[]).has(skill.toLowerCase())?'demonstrated':normalizeSkillSet((profile as any).declaredSkills??profile.skills).has(skill.toLowerCase())?'declared':'unverified'});
     const components = [
       {key:'requiredSkill',label:'Required skills',points:requiredSkillScore,maxPoints:30,reason:evidence.find(x=>/skill|requirement/i.test(x)) ?? 'No requirement evidence'},
       {key:'responsibilitySemantic',label:'Responsibilities',points:responsibilitySemantic,maxPoints:25,reason:evidence.find(x=>/responsibility|keyword-only|semantic alignment/i.test(x)) ?? 'No responsibility evidence'},
       {key:'roleTitle',label:'Role alignment',points:roleTitle,maxPoints:15,reason:evidence.find(x=>x.startsWith('Role ')) ?? 'No role alignment'},
       {key:'seniority',label:'Seniority',points:seniority,maxPoints:15,reason:evidence.find(x=>x.startsWith('Level')||x.startsWith('Seniority')) ?? 'Unknown seniority'},
       {key:'domainEducation',label:'Education',points:domainEducation,maxPoints:10,reason:evidence.find(x=>x.includes('education')||x.includes('degree')||x.includes('Degree')) ?? 'No education requirement'},
       {key:'location',label:'Location',points:location,maxPoints:5,reason:evidence.find(x=>x.includes('Location')||x.includes('Remote')) ?? 'Unknown location'},
     ];
    return {
      fitScore,
      breakdown,
      evidence,
      embeddingModelId: modelId,
      usedMock,
      matchedSkills,
       missingSkills,
        confidence: !thin && vec.size && job.descriptionQuality === 'full' && responsibilityMatches.length ? 'Medium' : 'Low',
          scoreDetails: { relevanceScore, seniorityPenalty: penalty, candidateSeniority: profileSen, jobSeniority: jobSen, semanticStatus: vec.size ? 'embedded' : 'keyword-only', responsibilityMatches, scoreCap, scoreCapReasons, skillEvidence, components },
    };
  });
}

export default rankJob;
