import { CANONICAL_SKILL_ALIASES } from './skillNormalizer.js';

export type SkillEvidence = { skill: string; alias: string; start: number; end: number };
const aliases = Object.entries(CANONICAL_SKILL_ALIASES)
  .filter(([alias]) => !['go', 'next', 'express', 'rest', 'ts', 'py'].includes(alias))
  .sort((a, b) => b[0].length - a[0].length);
/** Longest non-overlapping alias spans; punctuation-bearing names are bounded by tokens, not \b. */
export function extractSkillMatches(text: string): SkillEvidence[] {
  const matches: SkillEvidence[] = [];
  const occupied: Array<[number, number]> = [];
  for (const [alias, skill] of aliases) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_+#])${escaped}(?![\\p{L}\\p{N}_+#])`, 'giu');
    for (const match of text.matchAll(regex)) {
      const start = match.index;
      const end = start + match[0].length;
      if (occupied.some(([a, b]) => start < b && end > a)) continue;
      occupied.push([start, end]);
      matches.push({ skill, alias: match[0], start, end });
    }
  }
  return matches.sort((a, b) => a.start - b.start);
}

export function extractSkills(text: string): string[] {
  return [...new Set(extractSkillMatches(text).map(match => match.skill))];
}
