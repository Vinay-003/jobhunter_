import { CANONICAL_SKILL_ALIASES } from './skillNormalizer.js';

export type SkillEvidence = { skill: string; alias: string; start: number; end: number };

export const ambiguousShortWords = new Set(['go', 'next', 'express', 'rest', 'ts', 'py', 'c']);
const aliases = Object.entries(CANONICAL_SKILL_ALIASES)
  .filter(([alias]) => !ambiguousShortWords.has(alias.toLowerCase()))
  .sort((a, b) => b[0].length - a[0].length);

// Context-aware patterns for ambiguous words and short acronyms to eliminate false positives
const goPattern = /(?<![\p{L}\p{N}_+#])Go(?!\s*(?:to|through|ahead|forward|over|on|for|back|down|up|off|away|out|into|live|getter|above|with|deep|market)\b)(?:(?=\s*(?:programming|language|lang|developer|engineer|backend|microservices?|services?|routines?|code|runtime|compiler|sdk|stack|api|apis)\b)|(?<=[\/,|•·:;\(\[]\s*Go)|(?<=Languages\b[^\n]*\bGo)|(?=\s*[\/,|•·\)\];])|(?=\s*,\s*(?:[\p{L}\p{N}_+#]))|(?<=\b(?:using|written in)\s+Go)|(?<=\b(?:and|or)\s+Go(?=[\s,.;]))|(?=\s+(?:and|or)\s+(?:Python|Java|Rust|C\+\+|TypeScript|JavaScript|Docker|Kubernetes|PostgreSQL|AWS|C|C#)\b))(?![\p{L}\p{N}_+#])/gu;

const expressPattern = /(?<![\p{L}\p{N}_+#])Express(?!\s*(?:interest|ideas|gratitude|concern|opinions|satisfaction|delivery|mail|way|lane|train)\b)(?:(?=\s*(?:framework|server|backend|middleware|app|router|api|apis|\.js)\b)|(?<=[\/,|•·:;\(\[]\s*Express)|(?=\s*[\/,|•·\)\];])|(?<=\b(?:Node|React|MERN|MEAN)\s*[\/,]\s*Express)|(?<=Express\s*[\/,]\s*(?:Node|Mongo|Postgres))|(?=\s*,\s*(?:[\p{L}\p{N}_+#])))(?![\p{L}\p{N}_+#])/gui;

const cPattern = /(?<![\p{L}\p{N}_+#])C(?!\s*(?:to|through|ahead|level|suite|corp|inc|llc|class|sharp|plus)\b)(?:(?=\s*(?:language|programming|developer|engineer|compiler|code)\b)|(?<=[\/,|•·:;\(\[]\s*C(?=[\/,|•·\)\];]|\s*$|\s+(?:and|or)\b))|(?<=\b(?:Languages|Programming Languages)\s*[:\-][^\n]*\bC(?=[\s,;]))|(?<=\b(?:ANSI|Embedded)\s+C\b))(?![\p{L}\p{N}_+#])/gu;

const caseSensitiveTechnicalPatterns: Array<[RegExp, string]> = [
  [/(?<![\p{L}\p{N}_+#])REST(?![\p{L}\p{N}_+#])/gu, 'REST'],
  [goPattern, 'Go'],
  [/(?<![\p{L}\p{N}_+#])TS(?![\p{L}\p{N}_+#])/gu, 'TypeScript'],
  [expressPattern, 'Express'],
  [cPattern, 'C'],
];

/** Longest non-overlapping alias spans; punctuation-bearing names are bounded by tokens, not \b. */
export function extractSkillMatches(text: string): SkillEvidence[] {
  const matches: SkillEvidence[] = [];
  const occupied: Array<[number, number]> = [];

  // 1. Longest multi-word & canonical aliases (case-insensitive)
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

  // 2. Case-sensitive short technical symbols (e.g. uppercase REST, Go, TS)
  for (const [regex, skill] of caseSensitiveTechnicalPatterns) {
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
