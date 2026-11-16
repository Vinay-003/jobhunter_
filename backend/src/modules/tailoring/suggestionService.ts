import axios from 'axios';
import { extractSkills } from '../parsing/skillExtractor.js';
import type { ResumeProfile } from '../parsing/resumeProfile.js';
import type { ParsedJobDescription } from '../jd/jdParser.js';
import { WEAK_PHRASES, WEAK_PHRASE_SUGGESTIONS, VERB_ALTERNATIVES } from '../ats/readinessScorer.js';

export interface TailorSuggestion {
  id: string;
  section: 'experience' | 'projects' | 'summary';
  itemIndex?: number;
  bulletIndex?: number;
  originalText: string;
  suggestedText: string;
  rationale: string;
  verifiedSkillsUsed: string[];
  status: 'pending' | 'accepted' | 'rejected';
}

export interface CandidateContext {
  resumeText: string;
  profile: ResumeProfile;
  parsedSections?: Array<{
    title: string;
    heading: string;
    text?: string;
    items?: Array<{
      title?: string | null;
      company?: string | null;
      bullets?: string[];
      text?: string;
    }>;
  }>;
}

export interface JobContext {
  id?: string;
  title: string;
  company?: string;
  requiredSkills: string[];
  preferredSkills: string[];
  responsibilities: string[];
  description?: string;
  unmatchedResponsibilities?: string[];
  missingSkills?: string[];
  scoreBreakdownSummary?: string;
}

/**
 * Build the strict set of candidate skills allowed in suggestions.
 */
export function buildCandidateSkillWhitelist(
  resumeText: string,
  profile: ResumeProfile
): Set<string> {
  const whitelist = new Set<string>();

  // 1. All skills extracted from candidate resume text
  const extracted = extractSkills(resumeText || '');
  for (const s of extracted) {
    whitelist.add(s.toLowerCase());
  }

  // 2. All skills from profile
  for (const s of profile.skills || []) {
    whitelist.add(s.toLowerCase());
  }
  for (const s of profile.skillsNormalized || []) {
    whitelist.add(s.toLowerCase());
  }
  for (const s of profile.declaredSkills || []) {
    whitelist.add(s.toLowerCase());
  }
  for (const s of profile.demonstratedSkills || []) {
    whitelist.add(s.toLowerCase());
  }

  // Expand composite / alias skills (e.g. C/C++ -> C, C++; REST API -> REST, API Design)
  const currentSkills = Array.from(whitelist);
  for (const s of currentSkills) {
    if (s === 'c/c++' || s === 'c and c++') {
      whitelist.add('c');
      whitelist.add('c++');
    }
    if (s.includes('rest') || s.includes('api design')) {
      whitelist.add('rest');
      whitelist.add('api design');
    }
  }

  return whitelist;
}

/**
 * Deterministic Whitelist Guardrail:
 * Programmatically inspects a suggestion's text and verifies that NO skills
 * outside the candidate's verified skills whitelist are introduced.
 */
export function validateSuggestionGuardrail(
  originalText: string,
  suggestedText: string,
  whitelist: Set<string>
): { valid: boolean; introducedUnpossessedSkills: string[]; verifiedSkillsUsed: string[] } {
  const suggestedSkills = extractSkills(suggestedText);
  const originalSkills = new Set(extractSkills(originalText).map((s) => s.toLowerCase()));

  const introducedUnpossessedSkills: string[] = [];
  const verifiedSkillsUsed: string[] = [];

  for (const skill of suggestedSkills) {
    const lower = skill.toLowerCase();
    if (whitelist.has(lower) || originalSkills.has(lower)) {
      verifiedSkillsUsed.push(skill);
    } else {
      introducedUnpossessedSkills.push(skill);
    }
  }

  return {
    valid: introducedUnpossessedSkills.length === 0,
    introducedUnpossessedSkills,
    verifiedSkillsUsed: [...new Set(verifiedSkillsUsed)],
  };
}

/**
 * Deterministic fallback suggestion generator:
 * Used if Mercury 3 is unavailable or as a baseline engine.
 */
export function generateDeterministicSuggestions(
  candidate: CandidateContext,
  job: JobContext,
  whitelist: Set<string>
): TailorSuggestion[] {
  const suggestions: TailorSuggestion[] = [];
  let sugId = 1;

  const buildGapRewrite = (bullet: string, gap: string): { rewrite: string; rationale: string } | null => {
    const targetGap = (gap || '').toLowerCase();
    const missingSkillList = (job.missingSkills || []).map((s) => s.toLowerCase());
    const hasSkill = (s: string) => whitelist.has(s.toLowerCase());
    const trimmed = bullet.replace(/[.;\s]+$/, '');

    // 1. Debugging, code reviews, testing, quality assurance, documentation gaps
    if (
      targetGap.includes('debug') ||
      targetGap.includes('review') ||
      targetGap.includes('test') ||
      targetGap.includes('quality') ||
      targetGap.includes('document')
    ) {
      return {
        rewrite: `${trimmed}, conducting rigorous debugging and peer code reviews while maintaining comprehensive technical documentation for release stability.`,
        rationale: `Directly evidences debugging, code review practices, and documentation standards to satisfy target quality responsibilities.`,
      };
    }
    // 2. Target API / Backend / Microservices / REST gaps
    if (
      targetGap.includes('api') ||
      targetGap.includes('backend') ||
      targetGap.includes('service') ||
      missingSkillList.some((s) => s.includes('rest') || s.includes('api'))
    ) {
      const apiSkill = hasSkill('rest') ? 'REST API design' : hasSkill('fastapi') ? 'FastAPI service' : 'modular API';
      return {
        rewrite: `${trimmed}, incorporating structured ${apiSkill} and modular backend architecture to ensure reliable inter-service communication.`,
        rationale: `Evidences structured API design and backend architecture to directly bridge service integration gaps.`,
      };
    }
    // 3. Target Cloud / Infrastructure / Pipeline / Deployment gaps
    if (
      targetGap.includes('cloud') ||
      targetGap.includes('deploy') ||
      targetGap.includes('pipeline') ||
      targetGap.includes('infrastructure') ||
      targetGap.includes('geospatial')
    ) {
      return {
        rewrite: `${trimmed}, establishing automated cloud deployment pipelines and reliable multi-environment data workflows.`,
        rationale: `Demonstrates cloud deployment and data pipeline engineering to satisfy target infrastructure criteria.`,
      };
    }
    // 4. Target UI / Visualization / Frontend / Dashboard gaps
    if (
      targetGap.includes('ui') ||
      targetGap.includes('visual') ||
      targetGap.includes('dashboard') ||
      targetGap.includes('component')
    ) {
      return {
        rewrite: `${trimmed}, engineering responsive UI components and data visualization interfaces for intuitive real-time monitoring.`,
        rationale: `Evidences frontend UI and data visualization capabilities to meet user interface engineering requirements.`,
      };
    }
    // 5. Target Collaboration / Teamwork / Cross-functional gaps
    if (
      targetGap.includes('collaborat') ||
      targetGap.includes('senior') ||
      targetGap.includes('ramp') ||
      targetGap.includes('team')
    ) {
      return {
        rewrite: `${trimmed}, collaborating closely with cross-functional engineers to accelerate release cycles and technical alignment.`,
        rationale: `Demonstrates close engineering collaboration and rapid codebase onboarding to fulfill team delivery expectations.`,
      };
    }

    return null;
  };

  const gaps = (job.unmatchedResponsibilities && job.unmatchedResponsibilities.length > 0)
    ? job.unmatchedResponsibilities
    : (job.responsibilities || []);

  // Inspect experience bullets — Gap bridging FIRST
  const expEntries = candidate.profile.experience || [];
  for (let itemIdx = 0; itemIdx < expEntries.length; itemIdx++) {
    const exp = expEntries[itemIdx];
    const bullets = exp.bullets?.map((b) => (typeof b === 'string' ? b : b.text)) || [];

    for (let bulletIdx = 0; bulletIdx < bullets.length; bulletIdx++) {
      const bullet = bullets[bulletIdx];
      if (!bullet || bullet.length < 15) continue;

      let rewrite: string | null = null;
      let rationale: string = '';

      // 1. Substantive gap enhancement (PRIMARY)
      if (gaps.length > 0) {
        const gapIdx = (suggestions.length) % gaps.length;
        const gapResult = buildGapRewrite(bullet, gaps[gapIdx]);
        if (gapResult) {
          rewrite = gapResult.rewrite;
          rationale = gapResult.rationale;
        }
      }

      // 2. Check for weak phrases if no gap rewrite
      if (!rewrite) {
        for (const weak of WEAK_PHRASES) {
          const regex = new RegExp(`\\b${weak}\\b`, 'i');
          if (regex.test(bullet)) {
            const sug = WEAK_PHRASE_SUGGESTIONS[weak];
            const repl = sug ? sug.alternatives[0] : 'Engineered';
            rewrite = bullet.replace(regex, repl);
            rationale = `Replaced passive phrase "${weak}" with strong action verb "${repl}" to increase ATS impact.`;
            break;
          }
        }
      }

      // 3. Check for repeated / generic built / worked verbs
      if (!rewrite) {
        const firstWord = bullet.trim().split(/\s+/)[0]?.toLowerCase();
        if (firstWord && VERB_ALTERNATIVES[firstWord]) {
          const repl = VERB_ALTERNATIVES[firstWord][0];
          rewrite = bullet.replace(new RegExp(`^${firstWord}\\b`, 'i'), repl);
          rationale = `Replaced generic verb "${firstWord}" with higher-impact leadership verb "${repl}".`;
        }
      }

      // If rewrite found, validate against whitelist
      if (rewrite && rewrite !== bullet) {
        const guard = validateSuggestionGuardrail(bullet, rewrite, whitelist);
        if (guard.valid) {
          suggestions.push({
            id: `sug-${sugId++}`,
            section: 'experience',
            itemIndex: itemIdx,
            bulletIndex: bulletIdx,
            originalText: bullet,
            suggestedText: rewrite,
            rationale,
            verifiedSkillsUsed: guard.verifiedSkillsUsed,
            status: 'pending',
          });
        }
      }

      if (suggestions.length >= 5) break;
    }
    if (suggestions.length >= 5) break;
  }

  // Inspect project bullets if more suggestions needed
  if (suggestions.length < 5 && candidate.profile.projects) {
    for (let pIdx = 0; pIdx < candidate.profile.projects.length; pIdx++) {
      const proj = candidate.profile.projects[pIdx];
      const bullets = proj.bullets?.map((b) => (typeof b === 'string' ? b : b.text)) || [];

      for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
        const bullet = bullets[bIdx];
        if (!bullet || bullet.length < 15) continue;

        let rewrite: string | null = null;
        let rationale: string = '';

        // 1. Substantive gap enhancement for projects (PRIMARY)
        if (gaps.length > 0) {
          const gapIdx = (suggestions.length) % gaps.length;
          const gapResult = buildGapRewrite(bullet, gaps[gapIdx]);
          if (gapResult) {
            rewrite = gapResult.rewrite;
            rationale = gapResult.rationale;
          }
        }

        // 2. Weak phrase check for projects
        if (!rewrite) {
          for (const weak of WEAK_PHRASES) {
            const regex = new RegExp(`\\b${weak}\\b`, 'i');
            if (regex.test(bullet)) {
              const sug = WEAK_PHRASE_SUGGESTIONS[weak];
              const repl = sug ? sug.alternatives[0] : 'Engineered';
              rewrite = bullet.replace(regex, repl);
              rationale = `Replaced "${weak}" with strong active verb "${repl}".`;
              break;
            }
          }
        }

        if (rewrite && rewrite !== bullet) {
          const guard = validateSuggestionGuardrail(bullet, rewrite, whitelist);
          if (guard.valid) {
            suggestions.push({
              id: `sug-${sugId++}`,
              section: 'projects',
              itemIndex: pIdx,
              bulletIndex: bIdx,
              originalText: bullet,
              suggestedText: rewrite,
              rationale: rationale || `Upgraded project achievement statement with active outcome verb.`,
              verifiedSkillsUsed: guard.verifiedSkillsUsed,
              status: 'pending',
            });
          }
        }
        if (suggestions.length >= 5) break;
      }
      if (suggestions.length >= 5) break;
    }
  }

  return suggestions;
}

/**
 * Generate suggestions using Mercury 3 LLM with deterministic whitelist post-validation.
 */
export async function generateTailorSuggestions(
  candidate: CandidateContext,
  job: JobContext
): Promise<TailorSuggestion[]> {
  const whitelist = buildCandidateSkillWhitelist(candidate.resumeText, candidate.profile);
  const candidateSkillsList = Array.from(whitelist);

  // Collect candidate experience & project bullets with indices
  const experienceBullets: Array<{ itemIndex: number; bulletIndex: number; text: string; role: string; company: string }> = [];
  (candidate.profile.experience || []).forEach((exp, itemIdx) => {
    const bullets = exp.bullets?.map((b) => (typeof b === 'string' ? b : b.text)) || [];
    bullets.forEach((bullet, bulletIdx) => {
      if (bullet && bullet.trim().length > 15) {
        experienceBullets.push({
          itemIndex: itemIdx,
          bulletIndex: bulletIdx,
          text: bullet.trim(),
          role: exp.title || 'Role',
          company: exp.company || 'Company',
        });
      }
    });
  });

  const projectBullets: Array<{ itemIndex: number; bulletIndex: number; text: string; project: string }> = [];
  (candidate.profile.projects || []).forEach((proj, itemIdx) => {
    const bullets = proj.bullets?.map((b) => (typeof b === 'string' ? b : b.text)) || [];
    bullets.forEach((bullet, bulletIdx) => {
      if (bullet && bullet.trim().length > 15) {
        projectBullets.push({
          itemIndex: itemIdx,
          bulletIndex: bulletIdx,
          text: bullet.trim(),
          project: proj.title || 'Project',
        });
      }
    });
  });

  const mercuryKey = (process.env.MERCURY_API_KEY || process.env.INCEPTION_API_KEY || '').trim();
  const mercuryUrl = (process.env.MERCURY_BASE_URL || 'https://api.inceptionlabs.ai/v1/chat/completions').trim();
  const mercuryModel = (process.env.MERCURY_MODEL || 'mercury-3').trim();

  if (!mercuryKey) {
    console.warn('[suggestionService] MERCURY_API_KEY not configured — using deterministic rule engine');
    return generateDeterministicSuggestions(candidate, job, whitelist);
  }

  const systemPrompt = `You are an expert resume tailoring and ATS/Semantic matching optimization engine. Your goal is to maximize the candidate's Job Similarity Score (Semantic Match) and ATS readiness for a specific target job.

CRITICAL OBJECTIVES & INTEGRITY CONSTRAINTS:
1. 1-TO-1 DISTINCT GAP BRIDGING (CRITICAL):
   Look closely at the "PRIMARY SCORING GAPS TO IMPROVE" section below. Each listed gap is a specific responsibility or skill requirement where the candidate is currently losing points.
   - Suggestion #1 MUST directly bridge Gap #1.
   - Suggestion #2 MUST directly bridge Gap #2.
   - Suggestion #3 MUST directly bridge Gap #3.
   Do NOT generate multiple suggestions that all target the same responsibility or technology! Each suggestion must target a different gap from the list, so that accepting each suggestion incrementally turns an unmatched requirement into a matched one and monotonically increases the score.
2. SUBSTANTIVE TECHNICAL DEPTH:
   - Do NOT just substitute a single verb or add cosmetic buzzwords.
   - Rewrites MUST be substantive: clearly explain the architecture, engineering outcome, scale, or workflow (e.g., debugging & peer code review, automated data pipelines, responsive UI visualization, API design, testing) using the candidate's actual projects and technologies.
3. NEVER INVENT UNVERIFIED SKILLS OR FALSE CLAIMS:
   - You must NEVER invent, infer, or recommend adding any skill, technology, tool, credential, framework, or experience that the candidate does not already possess.
   - The candidate's verified skills whitelist is:
${candidateSkillsList.slice(0, 80).join(', ')}
   - Any suggestion introducing a skill absent from this whitelist will be programmatically rejected by guardrails.

OUTPUT FORMAT:
You MUST respond with ONLY a valid raw JSON object. Do NOT write ANY introduction, greeting, preamble, thinking, or markdown block wrapping.
Format:
{
  "suggestions": [
    {
      "section": "experience",
      "itemIndex": 0,
      "bulletIndex": 1,
      "originalText": "exact original bullet text",
      "suggestedText": "tailored high-impact bullet text directly aligning with target gaps",
      "rationale": "Clear 1-sentence rationale explaining which target responsibility/gap this solves and how it lifts job similarity"
    }
  ]
}`;

  const gapsSection = (job.unmatchedResponsibilities && job.unmatchedResponsibilities.length > 0)
    ? `Target Responsibilities Currently UNMATCHED (Scoring Gaps):\n${job.unmatchedResponsibilities.map((r, i) => `  - [GAP #${i + 1}] ${r}`).join('\n')}`
    : `Key Job Responsibilities:\n${job.responsibilities.length ? job.responsibilities.slice(0, 8).map((r, i) => `  - [GAP #${i + 1}] ${r}`).join('\n') : 'See Job Description below.'}`;

  const missingSkillsSection = (job.missingSkills && job.missingSkills.length > 0)
    ? `Missing / Desired Skills: ${job.missingSkills.join(', ')}`
    : '';

  const userPrompt = `Target Job Title: ${job.title}
Target Company: ${job.company || 'Not specified'}
Job Required Skills: ${job.requiredSkills.length ? job.requiredSkills.join(', ') : 'Not explicitly listed'}
Job Preferred Skills: ${job.preferredSkills.length ? job.preferredSkills.join(', ') : 'None'}

PRIMARY SCORING GAPS TO IMPROVE:
${gapsSection}
${missingSkillsSection}

Target Role Description & Context:
"""
${(job.description || '').slice(0, 2000)}
"""

Candidate Experience Bullets available to improve:
${JSON.stringify(experienceBullets.slice(0, 10), null, 2)}

Candidate Project Bullets available to improve:
${JSON.stringify(projectBullets.slice(0, 8), null, 2)}

TASK:
Provide up to 5 customized bullet rewrite suggestions specifically tailored to bridge the PRIMARY SCORING GAPS above for ${job.title} at ${job.company || 'the target company'}.
- MANDATORY: Suggestion 1 bridges Gap #1, Suggestion 2 bridges Gap #2, Suggestion 3 bridges Gap #3. Distribute across different gaps so each accepted suggestion provides an incremental score gain.
- Target specific bullets from Candidate Experience or Project lists.
- Set "section" to "experience" when rewriting an experience bullet, or "projects" when rewriting a project bullet.
- Reframe candidate's existing work to semantically cover the unmatched responsibilities (e.g. data pipelines, UI visualization, testing & code reviews, cloud infrastructure) using ONLY verified candidate skills from the whitelist.
- Strictly adhere to the candidate verified skills whitelist.`;

  try {
    const MAX_RETRIES = 3;
    let parsedPayload: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        mercuryUrl,
        {
          model: mercuryModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: attempt === 1 ? 0.2 : 0.4,
          max_tokens: 4096,
          ...(attempt <= 2 ? { response_format: { type: 'json_object' } } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${mercuryKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 45000,
        }
      );

      const choice = response.data?.choices?.[0];
      const content = choice?.message?.content || choice?.message?.reasoning_content || choice?.text;

      if (!content || typeof content !== 'string' || !content.trim()) {
        console.warn(`[suggestionService] Mercury 3 attempt ${attempt}/${MAX_RETRIES} returned empty content`);
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
        break;
      }

      // Multi-strategy JSON extraction
      let payload: any = null;
      // 1. Try markdown code block ```json ... ```
      const matchBlock = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (matchBlock) {
        try { payload = JSON.parse(matchBlock[1].trim()); } catch {}
      }
      // 2. Try outermost { ... }
      if (!payload) {
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          try { payload = JSON.parse(content.slice(firstBrace, lastBrace + 1).trim()); } catch {}
        }
      }
      // 3. Try outermost [ ... ]
      if (!payload) {
        const firstBracket = content.indexOf('[');
        const lastBracket = content.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket > firstBracket) {
          try { payload = JSON.parse(content.slice(firstBracket, lastBracket + 1).trim()); } catch {}
        }
      }
      // 4. Try cleaned direct parse
      if (!payload) {
        const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        try { payload = JSON.parse(cleaned); } catch {}
      }

      if (payload && (Array.isArray(payload.suggestions) || Array.isArray(payload))) {
        parsedPayload = payload;
        break; // Successfully got suggestions!
      } else {
        console.warn(`[suggestionService] Mercury 3 attempt ${attempt}/${MAX_RETRIES} JSON parse yielded invalid structure:`, content.slice(0, 150));
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 600 * attempt));
          continue;
        }
      }
    } catch (err: any) {
      console.warn(`[suggestionService] Mercury 3 attempt ${attempt}/${MAX_RETRIES} error: ${err.response?.status || err.message}`);
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 600 * attempt));
        continue;
      }
    }
  }

  if (!parsedPayload) {
    console.warn('[suggestionService] Mercury 3 exhausted retries — using deterministic fallback');
    return generateDeterministicSuggestions(candidate, job, whitelist);
  }

    const rawSuggestions = Array.isArray(parsedPayload.suggestions)
      ? parsedPayload.suggestions
      : Array.isArray(parsedPayload)
      ? parsedPayload
      : [];

    const validatedSuggestions: TailorSuggestion[] = [];
    let sugCounter = 1;

    for (const raw of rawSuggestions) {
      let original = '';
      let suggested = '';
      let rationale = 'Tailored to improve ATS friendliness and role alignment.';
      let rawSection = '';

      if (typeof raw === 'string') {
        suggested = raw.trim();
        const allCandidates = [...experienceBullets, ...projectBullets];
        let bestScore = 0;
        let bestBullet: typeof allCandidates[0] | null = null;
        for (const cb of allCandidates) {
          const words = cb.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
          const matches = words.filter((w) => suggested.toLowerCase().includes(w)).length;
          if (matches > bestScore) {
            bestScore = matches;
            bestBullet = cb;
          }
        }
        if (bestBullet) {
          original = bestBullet.text;
        } else {
          continue;
        }
      } else if (typeof raw === 'object' && raw !== null) {
        suggested = String(raw.suggestedText || raw.text || raw.rewritten || raw.suggestion || '').trim();
        original = String(raw.originalText || raw.original || '').trim();
        rationale = String(raw.rationale || raw.why || 'Tailored to improve ATS friendliness and role alignment.').trim();
        rawSection = String(raw.section || '');
        if (!original && suggested) {
          const allCandidates = [...experienceBullets, ...projectBullets];
          let bestScore = 0;
          let bestBullet: typeof allCandidates[0] | null = null;
          for (const cb of allCandidates) {
            const words = cb.text.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
            const matches = words.filter((w) => suggested.toLowerCase().includes(w)).length;
            if (matches > bestScore) {
              bestScore = matches;
              bestBullet = cb;
            }
          }
          if (bestBullet) original = bestBullet.text;
        }
      }

      if (!original || !suggested) continue;

      // Programmatic Whitelist Guardrail Check
      const guard = validateSuggestionGuardrail(original, suggested, whitelist);

      if (!guard.valid) {
        console.warn(
          `[suggestionGuardrail] REJECTED suggestion introducing unpossessed skills: ${guard.introducedUnpossessedSkills.join(', ')}`
        );
        continue; // Discard invalid suggestion!
      }

      // Deterministically resolve section & indices from candidate context
      const expMatch = experienceBullets.find((b) => b.text === original || original.includes(b.text) || b.text.includes(original));
      const projMatch = projectBullets.find((b) => b.text === original || original.includes(b.text) || b.text.includes(original));

      let section: 'experience' | 'projects' = 'experience';
      let itemIndex = 0;
      let bulletIndex = 0;

      if (projMatch && (!expMatch || rawSection === 'projects')) {
        section = 'projects';
        itemIndex = projMatch.itemIndex;
        bulletIndex = projMatch.bulletIndex;
      } else if (expMatch) {
        section = 'experience';
        itemIndex = expMatch.itemIndex;
        bulletIndex = expMatch.bulletIndex;
      } else {
        section = (rawSection === 'projects' ? 'projects' : 'experience');
        itemIndex = typeof (raw as any)?.itemIndex === 'number' ? (raw as any).itemIndex : 0;
        bulletIndex = typeof (raw as any)?.bulletIndex === 'number' ? (raw as any).bulletIndex : 0;
      }

      validatedSuggestions.push({
        id: `sug-${sugCounter++}`,
        section,
        itemIndex,
        bulletIndex,
        originalText: original,
        suggestedText: suggested,
        rationale,
        verifiedSkillsUsed: guard.verifiedSkillsUsed,
        status: 'pending',
      });

      if (validatedSuggestions.length >= 5) break;
    }

    if (validatedSuggestions.length === 0) {
      console.warn('[suggestionService] No LLM suggestions passed guardrail — falling back to deterministic');
      return generateDeterministicSuggestions(candidate, job, whitelist);
    }

    return validatedSuggestions;
  } catch (err: any) {
    console.warn(`[suggestionService] Mercury 3 error: ${err.message} — using deterministic fallback`);
    return generateDeterministicSuggestions(candidate, job, whitelist);
  }
}
