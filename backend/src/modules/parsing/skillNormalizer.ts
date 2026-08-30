/**
 * Skill normalizer — canonical alias map + normalize function.
 */

export const CANONICAL_SKILL_ALIASES: Record<string, string> = {
  // Languages
  python: 'Python', py: 'Python', python3: 'Python',
  java: 'Java',
  'c++': 'C++', cpp: 'C++', 'c/c++': 'C/C++', c: 'C',
  'c#': 'C#',
  sql: 'SQL', javascript: 'JavaScript', js: 'JavaScript',
  typescript: 'TypeScript', ts: 'TypeScript',
  go: 'Go', golang: 'Go',
  // JS ecosystem
  'node.js': 'Node.js', nodejs: 'Node.js', 'node js': 'Node.js',
  'react.js': 'React', reactjs: 'React', react: 'React',
  'vue.js': 'Vue.js', vuejs: 'Vue.js',
  'next.js': 'Next.js', nextjs: 'Next.js', next: 'Next.js',
  'express.js': 'Express', expressjs: 'Express', express: 'Express',
  // Frameworks & DB
  fastapi: 'FastAPI', flask: 'Flask', django: 'Django',
  postgresql: 'PostgreSQL', postgres: 'PostgreSQL', psql: 'PostgreSQL',
  mongodb: 'MongoDB', mongo: 'MongoDB',
  mysql: 'MySQL', redis: 'Redis',
  // Cloud & Tools
  docker: 'Docker', kubernetes: 'Kubernetes', k8s: 'Kubernetes',
  aws: 'AWS', gcp: 'GCP', azure: 'Azure',
  git: 'Git', github: 'GitHub',
  postman: 'Postman', linux: 'Linux',
  playwright: 'Playwright', selenium: 'Selenium',
  // Web
  html: 'HTML', html5: 'HTML', css: 'CSS', css3: 'CSS',
  tailwind: 'Tailwind CSS', 'tailwind css': 'Tailwind CSS',
  sass: 'Sass', scss: 'Sass',
  graphql: 'GraphQL', rest: 'REST', 'rest api': 'REST', restful: 'REST',
  // Platforms
  shopify: 'Shopify', razorpay: 'Razorpay',
  cloudinary: 'Cloudinary', render: 'Render',
  // CS
  'data structures': 'Data Structures and Algorithms',
  dsa: 'Data Structures and Algorithms',
  oop: 'OOP', dbms: 'DBMS',
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
