/**
 * Skill normalizer — canonical alias map + normalize function.
 */

export const CANONICAL_SKILL_ALIASES: Record<string, string> = {
  // JS ecosystem
  js: 'JavaScript',
  javascript: 'JavaScript',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  'node js': 'Node.js',
  'react.js': 'React',
  reactjs: 'React',
  'vue.js': 'Vue.js',
  vuejs: 'Vue.js',
  // TS
  ts: 'TypeScript',
  typescript: 'TypeScript',
  // Python
  py: 'Python',
  python3: 'Python',
  // others
  'c#': 'C#',
  'c++': 'C++',
  cpp: 'C++',
  golang: 'Go',
  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  docker: 'Docker',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  psql: 'PostgreSQL',
  mysql: 'MySQL',
  mongo: 'MongoDB',
  mongodb: 'MongoDB',
  redis: 'Redis',
  aws: 'AWS',
  gcp: 'GCP',
  azure: 'Azure',
  'express.js': 'Express',
  expressjs: 'Express',
  express: 'Express',
  nextjs: 'Next.js',
  'next.js': 'Next.js',
  tailwind: 'Tailwind CSS',
  'tailwind css': 'Tailwind CSS',
  html5: 'HTML',
  css3: 'CSS',
  sass: 'Sass',
  scss: 'Sass',
  graphql: 'GraphQL',
  rest: 'REST',
  'rest api': 'REST',
  restful: 'REST',
};

const aliasLowerMap = new Map<string, string>();
for (const [k, v] of Object.entries(CANONICAL_SKILL_ALIASES)) {
  aliasLowerMap.set(k.toLowerCase(), v);
}

/** All canonical skill names (values of alias map, deduped + sorted) */
export const CANONICAL_SKILLS: string[] = [...new Set(Object.values(CANONICAL_SKILL_ALIASES))].sort();

/** Normalize a single skill string to canonical form; returns original trimmed if no alias. */
export function normalizeSkill(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  const canonical = aliasLowerMap.get(lower);
  if (canonical) return canonical;
  // Title-ish fallback: keep original with trimmed spaces but consistent casing for known? return trimmed
  return trimmed;
}

/** Normalize a list, dedupe by canonical value (case-insensitive for non-canonical). */
export function normalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of skills) {
    const n = normalizeSkill(s);
    const key = n.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(n);
    }
  }
  return out;
}

/** Return canonical lookup map for extraction (normalized lower -> canonical). */
export function getAliasMap(): Map<string, string> {
  return new Map(aliasLowerMap);
}
