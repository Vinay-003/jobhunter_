import type { ResumeProfile } from '../parsing/resumeProfile.js';
import type { NormalizedJob } from '../../providers/jobs/JobProvider.js';
import { normalizeSkill } from '../parsing/skillNormalizer.js';
import { extractSkills, extractSkillMatches, ambiguousShortWords } from '../parsing/skillExtractor.js';
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
  if (/\b(?:data|analytics|machine learning|ml|ai|artificial intelligence|deep learning|nlp|cv|computer vision|bi|business intelligence|statistician|quantitative)\b/i.test(title)) return 'data';
  if (/\b(?:software|developer|frontend|front.end|backend|back.end|full.stack|web|react|javascript|typescript|swe|sde|programmer|devops|platform|cloud|sre|systems|infrastructure|qa|test|security|engineer|architect)\b/i.test(title)) return 'software';
  return 'other';
}

/**
 * Ranking — compose fit score: Required skill 30 + Responsibility semantic 25 + Role/title 15 + Seniority 15 + Domain/education 10 + Location 5 =100
 * Without ATS/salary/freshness.
 * Embedding: SageMaker (aws) or Local when EMBEDDING_PROVIDER set; Mock ONLY as fallback — never default.
 */

export function getRankingEmbeddingProvider(): EmbeddingProvider & { modelId?: string; modelRevision?: string | null } {
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
    ...(opts?.preferences?.targetRoles ?? []),
    ...((profile as any).roleDiscovery?.roles ?? []).map((r: any) => r.title),
    ...profile.experience.map(e => e.title).filter((t): t is string => Boolean(t)),
    ...((profile as any).projects ?? []).map((p: any) => p.title).filter((t: any): t is string => Boolean(t)),
    (profile as any).title ? String((profile as any).title) : null,
  ].filter((t): t is string => Boolean(t)))];

  const experienceSkills = extractSkills([
    ...resumeChunks,
    ...profile.experience.map(e => `${e.title || ''} ${e.description || ''}`),
    ...((profile as any).projects ?? []).map((p: any) => `${p.title || ''} ${p.description || ''}`),
  ].join('\n'));

  const candidateSkills = [...new Set([
    ...(profile.skills ?? []),
    ...(profile.skillsNormalized ?? []),
    ...((profile as any).declaredSkills ?? []),
    ...((profile as any).demonstratedSkills ?? []),
    ...experienceSkills,
  ].map((s) => s.trim()).filter(Boolean))];

  const perJobTexts = jobs.map((job) => {
    const jobText = `${job.title} ${job.description ?? ''}`;
    const sentences = (job.description ?? '').split(/(?<=[.!?\n])\s+/);
    const eduSentences = sentences.filter(s =>
      /\b(?:bachelor(?:'s)?|master(?:'s)?|b\.?tech|b\.?e\.?|bca|mca|degree|ph\.?d|graduate|undergraduate|diploma)\b/i.test(s)
    );
    const eduText = eduSentences.length ? eduSentences.slice(0, 2).join(' ').trim().slice(0, 250) : null;
    const parsed = parseJd(`Job title: ${job.title}\n${job.description ?? ''}`);
    const responsibilities = parsed.responsibilities;
    const jobSkills = [...new Set([
      ...(parsed.requiredSkills ?? []),
      ...(parsed.preferredSkills ?? []),
      ...(job.providerSkills ?? []),
      ...extractSkills(jobText.toLowerCase()),
    ].map((s) => s.trim()).filter(Boolean))];
    const jobDescSnippet = redactProfessionalText(job.description ?? job.title).slice(0, 1500);

    return {
      jobDesc: jobDescSnippet,
      title: job.title,
      responsibilities,
      eduText,
      jobSkills,
      parsed,
    };
  });

  // Unique texts for a single embed call: embed all candidate evidence & job criteria
  const resumeGroup = [...new Set([
    ...resumeChunks,
    ...eduChunks,
    ...profileRoles,
    ...candidateSkills,
  ].map((t) => t.trim()).filter(Boolean))];

  const jobGroup = [...new Set(perJobTexts.flatMap((t) => [
    t.title,
    ...(t.responsibilities.length ? t.responsibilities : [t.jobDesc]),
    ...(t.eduText ? [t.eduText] : []),
    ...t.jobSkills,
  ]).map((t) => t.trim()).filter(Boolean))];

  const uniq = [...new Set([
    ...resumeGroup,
    ...jobGroup,
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
    const { jobDesc, jobSkills, parsed } = perJobTexts[idx];

    // 1) Required skill 30 (same as rankJob) + matched/missing lists for UI with semantic support
    let requiredSkillScore = 0;
    let matchedSkills: string[] = [];
    let missingSkills: string[] = [];
    const skillEvidence: NonNullable<RankResult['scoreDetails']>['skillEvidence'] = [];
    {
      const demonstrated = normalizeSkillSet([
        ...((profile as any).demonstratedSkills ?? []),
        ...experienceSkills,
      ]);
      const declared = normalizeSkillSet((profile as any).declaredSkills ?? profile.skills ?? []);
      const profileSet = normalizeSkillSet([
        ...(profile.skills ?? []),
        ...experienceSkills,
      ]);
      const structured = parsed.requirementGroups?.some(group => group.confidence >= .7);
      const display = (s: string) => normalizeSkill(s);

      // Evaluate every job skill semantically against candidate skills and resume chunks
      const semanticallyMatchedSkills: string[] = [];
      const skillEvidenceMap = new Map<string, { source: 'demonstrated' | 'declared' | 'unverified'; similarity: number }>();

      for (const skill of jobSkills) {
        const normSkill = normalizeSkill(skill).toLowerCase();
        let bestSim = 0;
        let matchedWith: string | null = null;
        let isFromResumeChunk = false;

        // Direct skill identity check
        const isDirectSkill = candidateSkills.some(cs => cs.toLowerCase() === skill.toLowerCase() || normalizeSkill(cs).toLowerCase() === normSkill);
        if (isDirectSkill) {
          bestSim = 1.0;
          matchedWith = skill;
        }

        // Semantic match against all candidate skills
        if (vec.size && candidateSkills.length && bestSim < 0.95) {
          for (const cs of candidateSkills) {
            const sim = pairScore(cs, skill);
            if (sim > bestSim) {
              bestSim = sim;
              matchedWith = cs;
              isFromResumeChunk = false;
            }
          }
        }

        // Semantic match against candidate resume chunks
        if (vec.size && resumeChunks.length && bestSim < 0.95) {
          for (const rc of resumeChunks) {
            const sim = pairScore(rc, skill);
            if (sim > bestSim) {
              bestSim = sim;
              matchedWith = rc;
              isFromResumeChunk = true;
            }
          }
        }

        // Matched if direct or semantic similarity >= 0.40 (raw cosine >= ~0.50)
        const isMatched = isDirectSkill || bestSim >= 0.40;
        if (isMatched) {
          semanticallyMatchedSkills.push(skill);
        }

        let source: 'demonstrated' | 'declared' | 'unverified' = 'unverified';
        if (isMatched) {
          if (isFromResumeChunk || demonstrated.has(normSkill)) {
            source = 'demonstrated';
          } else if (matchedWith) {
            const normMatched = normalizeSkill(matchedWith).toLowerCase();
            source = demonstrated.has(normMatched) ? 'demonstrated' : declared.has(normMatched) ? 'declared' : 'demonstrated';
          } else {
            source = demonstrated.has(normSkill) ? 'demonstrated' : declared.has(normSkill) ? 'declared' : 'demonstrated';
          }
        }

        skillEvidenceMap.set(normSkill, { source, similarity: bestSim });
      }

      const effectiveSkills = [...new Set([...profile.skills, ...semanticallyMatchedSkills])];
      const effectiveProfile: ResumeProfile = semanticallyMatchedSkills.length ? {
        ...profile,
        skills: effectiveSkills,
        skillsNormalized: effectiveSkills.map(normalizeSkill),
      } : profile;

      if (structured) {
        const match = matchJd(effectiveProfile, parsed);
        requiredSkillScore = Math.round((match.overallScore / 100) * (job.descriptionQuality === 'full' ? 30 : 18));
        matchedSkills = [...new Set([...match.matchedRequired, ...match.matchedPreferred, ...semanticallyMatchedSkills].map(s => normalizeSkill(s)))];
        missingSkills = match.missingRequired
          .filter(s => !semanticallyMatchedSkills.some(sup => normalizeSkill(sup).toLowerCase() === normalizeSkill(s).toLowerCase()))
          .map(s => normalizeSkill(s));
        [...new Set([...matchedSkills, ...missingSkills])].forEach(skill => {
          const norm = normalizeSkill(skill).toLowerCase();
          const ev = skillEvidenceMap.get(norm);
          const src = ev?.source ?? (demonstrated.has(norm) ? 'demonstrated' : declared.has(norm) ? 'declared' : 'unverified');
          skillEvidence.push({ skill: display(skill), source: src });
        });
        const semanticCount = semanticallyMatchedSkills.filter(s => !candidateSkills.some(cs => normalizeSkill(cs).toLowerCase() === normalizeSkill(s).toLowerCase())).length;
        evidence.push(`Structured requirement coverage ${Math.round(match.requiredCoverage * 100)}%${semanticCount ? ` (${semanticCount} via semantic alignment)` : ''}; alternatives are grouped`);
      } else if (jobSkills.length === 0) {
        requiredSkillScore = 0;
        evidence.push('Requirements unavailable; no skill points inferred');
      } else if (jobSkills.length <= 2) {
        matchedSkills = semanticallyMatchedSkills.map(display);
        missingSkills = jobSkills.filter(s => !semanticallyMatchedSkills.includes(s)).map(display);
        requiredSkillScore = Math.round(semanticallyMatchedSkills.length / jobSkills.length * 15);
        evidence.push(`Only ${jobSkills.length} skill signal${jobSkills.length === 1 ? '' : 's'} (${semanticallyMatchedSkills.length} matched); limited evidence`);
      } else {
        matchedSkills = semanticallyMatchedSkills.map(display);
        missingSkills = jobSkills.filter(s => !semanticallyMatchedSkills.includes(s)).map(display);
        const hasStructuredGroups = Boolean(parsed.requirementGroups && parsed.requirementGroups.length > 0);
        const maxSkill = hasStructuredGroups ? (job.descriptionQuality === 'full' ? 30 : 18) : 18;
        requiredSkillScore = Math.round((semanticallyMatchedSkills.length / jobSkills.length) * maxSkill);
        const semanticCount = semanticallyMatchedSkills.filter(s => !candidateSkills.some(cs => normalizeSkill(cs).toLowerCase() === normalizeSkill(s).toLowerCase())).length;
        evidence.push(`Skill coverage ${semanticallyMatchedSkills.length}/${jobSkills.length}${semanticCount ? ` (${semanticCount} via semantic alignment)` : ''}${!hasStructuredGroups ? ' (unstructured JD)' : ''}`);
      }
    }

    // 2) Responsibility semantic 25 (best resume chunk vs job, from batch vectors)
    let responsibilitySemantic = 0;
    const responsibilityMatches: NonNullable<RankResult['scoreDetails']>['responsibilityMatches'] = [];
    {
      const responsibilities = perJobTexts[idx].responsibilities;
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
        const supported = responsibilityMatches.filter(r => r.supported).length;
        const total = responsibilityMatches.length;
        const coverageRatio = total > 0 ? supported / total : 0;
        const avg = total > 0 ? responsibilityMatches.reduce((sum, r) => sum + r.similarity, 0) / total : 0;
        if (supported === 0) {
          responsibilitySemantic = 0;
        } else {
          const scoreRatio = (coverageRatio * 0.70) + (Math.min(1, Math.max(0, avg / 0.55)) * 0.30);
          responsibilitySemantic = Math.round(scoreRatio * 25);
        }
        evidence.push(vec.size ? `Responsibility coverage ${supported}/${responsibilityMatches.length} via ${modelId}` : 'Keyword-only fallback; semantic responsibility evidence unavailable');
      } else if (vec.size && resumeChunks.length) {
        // Unstructured JD or snippet: compute semantic similarity directly between resume chunks and jobDesc
        const scores = resumeChunks.map(rc => pairScore(rc, jobDesc)).sort((a, b) => b - a);
        const top = scores.slice(0, 3);
        const avg = top.length ? top.reduce((a, b) => a + b, 0) / top.length : 0;
        const effectiveAvg = Math.min(1, Math.max(0, avg / 0.55));
        responsibilitySemantic = Math.round(effectiveAvg * 25);
        evidence.push(`Job description semantic alignment: ${Math.round(avg * 100)}% via ${modelId}`);
      } else {
        evidence.push('Semantic responsibility evidence unavailable');
      }
    }

    // 3) Role/title 15 — Semantic alignment between demonstrated roles & job title
    let roleTitle = 0;
    {
      const target = opts?.preferences?.targetRoles ?? [];
      const titleLower = job.title.toLowerCase();

      const isDirectMatch = profileRoles.some(r => {
        const rL = r.toLowerCase();
        return titleLower.includes(rL) || rL.includes(titleLower) ||
          rL.split(/\s+/).filter(w => w.length > 3).every(w => titleLower.includes(w));
      });

      let maxRoleSim = 0;
      if (vec.size && profileRoles.length) {
        for (const pr of profileRoles) {
          const s = pairScore(pr, job.title);
          if (s > maxRoleSim) maxRoleSim = s;
        }
      }

      if (profileRoles.length === 0) {
        roleTitle = 0;
      } else if (isDirectMatch) {
        roleTitle = 15;
      } else if (maxRoleSim >= 0.60) {
        roleTitle = 15;
      } else if (maxRoleSim >= 0.45) {
        roleTitle = Math.max(12, Math.round(maxRoleSim * 15));
      } else if (maxRoleSim >= 0.30) {
        roleTitle = Math.max(8, Math.round(maxRoleSim * 15));
      } else if (maxRoleSim >= 0.15) {
        roleTitle = Math.round(maxRoleSim * 15);
      } else {
        const actual = roleArea(job.title);
        const areas = profileRoleAreas(profile);
        const desired = target.map(roleArea);
        const compatible = areas.has(actual) || (actual === 'generic' && areas.size > 0);
        const targeted = !desired.length || desired.includes(actual) || desired.includes('generic') || (desired.includes('fullstack') && ['backend', 'frontend'].includes(actual));
        roleTitle = !compatible || !targeted ? 0 : actual === 'generic' ? 9 : 15;
      }

      const roleLabel = roleArea(job.title);
      evidence.push(`Role ${roleLabel}: ${roleTitle ? `supported by candidate profile${maxRoleSim >= 0.30 ? ` (${Math.round(maxRoleSim * 100)}% semantic alignment)` : ''}` : 'specialization not demonstrated or outside target roles'}`);
    }

    // 4) Seniority 15
    let seniority = 0;
    const jobSen: string | null = detectJobSeniority(job.title, job.description);
    const profileSen = normalizeSeniority(profile.seniority);
    const isExperiencedCandidate = ['senior', 'principal', 'mid'].includes(profileSen ?? '') ||
      (typeof profile.totalExperienceYears === 'number' && profile.totalExperienceYears >= 2) ||
      (typeof (profile as any).employmentYears === 'number' && (profile as any).employmentYears >= 2);
    {
      const seniorityOrder = ['intern', 'entry', 'mid', 'senior', 'principal'];
      if (!profileSen || !jobSen) {
        // When job seniority is unspecified (e.g. general "Full Stack Developer"):
        // Award moderate fit points (8/15) rather than 0
        seniority = !profileSen ? 0 : 8;
        evidence.push(!profileSen
          ? 'Candidate level unknown — no seniority points awarded'
          : 'Level: general role without explicit seniority requirement — moderate fit assumed');
      } else if (profileSen === jobSen) {
        seniority = 15;
        evidence.push(`Level ${profileSen} matches job seniority (${jobSen})`);
      } else {
        const candIdx = seniorityOrder.indexOf(profileSen);
        const jobIdx = seniorityOrder.indexOf(jobSen);
        const diff = candIdx - jobIdx;
        if (diff > 0) {
          // Candidate is more senior than job (overqualified)
          if (jobSen === 'intern') {
            seniority = 0;
            evidence.push(`Seniority mismatch: experienced ${profileSen} candidate for an internship role (0/15 pts)`);
          } else if (diff === 1) {
            seniority = profileSen === 'principal' ? 12 : 11;
            evidence.push(`Level ${profileSen} slightly exceeds ${jobSen} (${seniority}/15 pts)`);
          } else if (diff === 2) {
            seniority = 4;
            evidence.push(`Level ${profileSen} significantly exceeds ${jobSen} (-11 pts)`);
          } else {
            seniority = 0;
            evidence.push(`Level ${profileSen} severely exceeds ${jobSen} (0/15 pts)`);
          }
        } else {
          // Candidate is less senior than job (underqualified, diff < 0)
          const absDiff = Math.abs(diff);
          seniority = absDiff === 1 ? 8 : absDiff === 2 ? 3 : 0;
          evidence.push(`Level penalty: ${15 - seniority} pts — your ${profileSen} vs job ${jobSen} (diff ${absDiff})`);
        }
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
            const s = pairScore(ec, job.title);
            if (s > semanticEduScore) semanticEduScore = s;
          }
        }
      }

      const expected = /\b(?:phd|doctorate)\b/i.test(jobLower) ? 'doctorate' : /\bmaster\b/i.test(jobLower) ? 'master' : /\b(?:bachelor|degree|b\.?tech|b\.?e\.?|bca)\b/i.test(jobLower) ? 'bachelor' : null;
      const technicalKeywords = /\b(?:computer science|cs|cse|information technology|it|software|computing|data science|data analytics|machine learning|artificial intelligence|mathematics|applied math|statistics|engineering|computer applications|physics|stem)\b/i;
      const matchingDegree = profile.education.find(entry => {
        const degree = entry.degree ?? '';
        const level = /phd|doctor|d\.?phil/i.test(degree)
          ? 'doctorate'
          : /\b(?:master|m\.?tech|m\.?sc|m\.?s\.?|ms|mca|mba)\b/i.test(degree)
          ? 'master'
          : /\b(?:bachelor|b\.?tech|b\.?sc|b\.?s\.?|bs|b\.?e\.?|bca)\b/i.test(degree)
          ? 'bachelor'
          : null;
        const levelMatches = !expected || level === expected || (expected === 'bachelor' && (level === 'master' || level === 'doctorate'));
        if (!levelMatches) return false;

        const fLower = (entry.field ?? '').toLowerCase();
        const rLower = (entry.raw ?? '').toLowerCase();
        const isCandidateStem = technicalKeywords.test(`${fLower} ${rLower}`);
        const isJdStem = /\b(?:computer science|cs|cse|information technology|it|software|data science|analytics|statistics|mathematics|engineering|stem)\b/i.test(jobLower);
        const jdAcceptsRelated = /\b(?:related (?:field|degree|discipline)|or related|equivalent|stem|technical degree|engineering)\b/i.test(jobLower);

        if (isCandidateStem && (isJdStem || jdAcceptsRelated || !isJdStem)) return true;

        const jdField = jobLower.match(/\b(?:in|of)\s+([a-z\s]+(?:science|technology|engineering|mathematics|analytics|statistics))\b/i)?.[1]?.trim()?.toLowerCase();
        if (!jdField) return true;
        return fLower.includes(jdField) || jdField.includes(fLower);
      });

      if (vec.size && eduChunks.length && semanticEduScore > 0) {
        if (!hasEduReq) {
          // No explicit degree required by job — award soft credit based on domain alignment
          domainEducation = semanticEduScore >= 0.35 ? 7 : Math.round(semanticEduScore * 7);
          evidence.push(domainEducation >= 5
            ? `Candidate holds relevant technical education (${Math.round(semanticEduScore * 100)}% semantic domain alignment); no strict degree requirement stated`
            : 'No education requirement stated; no technical education verified');
        } else {
          // Explicit education requirement stated in job
          if (semanticEduScore >= 0.35 || matchingDegree) {
            const verified = (matchingDegree?.completed === true) || profile.education.some(e => e.completed === true);
            if (verified || isEarlyCareer) {
              domainEducation = 10;
              evidence.push(isEarlyCareer && !verified
                ? `Degree in progress/pursuing meets early-career or internship qualification (${Math.round(semanticEduScore * 100)}% semantic alignment)`
                : `Verified education meets stated degree and field (${Math.round(semanticEduScore * 100)}% semantic alignment)`);
            } else {
              domainEducation = 5;
              evidence.push(`Degree listed (${Math.round(semanticEduScore * 100)}% semantic alignment); completion unverified`);
            }
          } else if (semanticEduScore >= 0.25) {
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
            return /\b(?:computer|software|information|technology|engineering|b\.?tech|b\.?e\.?|bca|mca|cs|cse|it|data|analytics|math(?:ematics)?|statistics?|physics|stem|science)\b/i.test(text);
          });
          domainEducation = hasRelevantEdu ? 7 : 0;
          evidence.push(hasRelevantEdu
            ? 'Candidate holds relevant technical education; no strict degree requirement stated'
            : 'No education requirement stated; no technical education verified');
        } else {
          if (matchingDegree) {
            if (matchingDegree.completed === true) {
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
      const prefLocs = (opts?.preferences?.locations?.map((s) => s.toLowerCase()) ?? []).filter(Boolean);
      const effectiveLocs = prefLocs.length ? prefLocs : ['india'];
      if (!job.location) {
        location = 0;
        evidence.push('Location eligibility unknown; no compatibility points');
      } else {
        const { points, note } = locationScore(effectiveLocs, job.location, job.workMode);
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

     if (jobSen === 'intern' && isExperiencedCandidate) {
       const internCap = profileSen === 'principal' ? 25 : profileSen === 'senior' ? 35 : 40;
       scoreCap = scoreCap !== null ? Math.min(scoreCap, internCap) : internCap;
       fitScore = Math.min(fitScore, scoreCap);
       scoreCapReasons.push(`Internship role is severely misaligned for experienced candidate (${profileSen ?? '2+ yrs experience'}); capped at ${internCap}`);
     }
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
