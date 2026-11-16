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

  // Inspect experience bullets
  const expEntries = candidate.profile.experience || [];
  for (let itemIdx = 0; itemIdx < expEntries.length; itemIdx++) {
    const exp = expEntries[itemIdx];
    const bullets = exp.bullets?.map((b) => (typeof b === 'string' ? b : b.text)) || [];

    for (let bulletIdx = 0; bulletIdx < bullets.length; bulletIdx++) {
      const bullet = bullets[bulletIdx];
      if (!bullet || bullet.length < 15) continue;

      let rewrite: string | null = null;
      let rationale: string = '';

      // Check for weak phrases
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

      // Check for repeated / generic built / worked verbs
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
  if (suggestions.length < 3 && candidate.profile.projects) {
    for (let pIdx = 0; pIdx < candidate.profile.projects.length; pIdx++) {
      const proj = candidate.profile.projects[pIdx];
      const bullets = proj.bullets?.map((b) => (typeof b === 'string' ? b : b.text)) || [];

      for (let bIdx = 0; bIdx < bullets.length; bIdx++) {
        const bullet = bullets[bIdx];
        if (!bullet || bullet.length < 15) continue;

        let rewrite: string | null = null;
        for (const weak of WEAK_PHRASES) {
          const regex = new RegExp(`\\b${weak}\\b`, 'i');
          if (regex.test(bullet)) {
            const sug = WEAK_PHRASE_SUGGESTIONS[weak];
            const repl = sug ? sug.alternatives[0] : 'Engineered';
            rewrite = bullet.replace(regex, repl);
            break;
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
              rationale: `Upgraded project achievement statement with active outcome verb.`,
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

  const systemPrompt = `You are an expert resume tailoring and ATS optimization engine. Your goal is to improve the candidate's resume for a specific target job without ANY user input.

CRITICAL INTEGRITY CONSTRAINTS:
1. You must NEVER invent, infer, or recommend adding any skill, technology, tool, credential, framework, or experience that the candidate does not already possess in their original resume or demonstrated in their projects.
2. The candidate's verified skills whitelist is:
${candidateSkillsList.slice(0, 80).join(', ')}
3. You may ONLY:
   - Rephrase existing bullets to emphasize verified candidate skills that match target job requirements;
   - Align bullet phrasing and vocabulary to directly reflect the target job responsibilities using candidate's actual accomplishments;
   - Replace weak or passive phrasing (e.g. "worked on", "helped with", "responsible for") with strong, quantified action verbs (e.g. "Architected", "Engineered", "Optimized", "Scaled");
   - Clarify metrics and outcomes without inventing false numbers.
4. Any suggestion that introduces a skill absent from the candidate's verified skills whitelist will be automatically discarded by programmatic guardrails.

OUTPUT FORMAT:
Return a valid JSON object with a single key "suggestions" containing an array of suggestion objects:
{
  "suggestions": [
    {
      "section": "experience",
      "itemIndex": 0,
      "bulletIndex": 1,
      "originalText": "exact original bullet text",
      "suggestedText": "tailored high-impact bullet text",
      "rationale": "Clear 1-sentence rationale explaining the ATS and semantic improvement"
    }
  ]
}`;

  const userPrompt = `Target Job Title: ${job.title}
Target Company: ${job.company || 'Not specified'}
Job Required Skills: ${job.requiredSkills.join(', ')}
Job Preferred Skills: ${job.preferredSkills.join(', ')}
Key Job Responsibilities:
${job.responsibilities.slice(0, 6).map((r) => `- ${r}`).join('\n')}

Candidate Experience Bullets available to improve:
${JSON.stringify(experienceBullets.slice(0, 10), null, 2)}

Candidate Project Bullets available to improve:
${JSON.stringify(projectBullets.slice(0, 6), null, 2)}

Provide up to 5 highest-impact bullet rewrite suggestions that improve ATS friendliness and semantic similarity for this role, while strictly adhering to the candidate verified skills whitelist.`;

  try {
    const response = await axios.post(
      mercuryUrl,
      {
        model: mercuryModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${mercuryKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 45000,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (!content) {
      console.warn('[suggestionService] Mercury 3 returned empty content — falling back to deterministic');
      return generateDeterministicSuggestions(candidate, job, whitelist);
    }

    let parsedPayload: any;
    try {
      const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      parsedPayload = JSON.parse(cleaned);
    } catch (e: any) {
      console.warn('[suggestionService] Failed to parse Mercury 3 JSON — raw content:', content);
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
      if (!raw.originalText || !raw.suggestedText) continue;

      const original = String(raw.originalText).trim();
      const suggested = String(raw.suggestedText).trim();

      // Programmatic Whitelist Guardrail Check
      const guard = validateSuggestionGuardrail(original, suggested, whitelist);

      if (!guard.valid) {
        console.warn(
          `[suggestionGuardrail] REJECTED suggestion introducing unpossessed skills: ${guard.introducedUnpossessedSkills.join(', ')}`
        );
        continue; // Discard invalid suggestion!
      }

      validatedSuggestions.push({
        id: `sug-${sugCounter++}`,
        section: (raw.section === 'projects' ? 'projects' : 'experience') as 'experience' | 'projects',
        itemIndex: typeof raw.itemIndex === 'number' ? raw.itemIndex : 0,
        bulletIndex: typeof raw.bulletIndex === 'number' ? raw.bulletIndex : 0,
        originalText: original,
        suggestedText: suggested,
        rationale: String(raw.rationale || 'Tailored to improve ATS friendliness and role alignment.').trim(),
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
