import type { ResumeProfile } from '../parsing/resumeProfile.js';

export const VERSION = '2.0.0';

export type JobPreferences = {
  target_roles?: string[] | null;
  seniority?: string[] | null;
  locations?: string[] | null;
  emphasized_skills?: string[] | null;
  excluded_roles?: string[] | null;
  // also support camelCase variants
  targetRoles?: string[];
  emphasizedSkills?: string[];
  excludedRoles?: string[];
};

export type PlannedQuery = {
  keywords: string;
  location?: string;
};

/**
 * JobQueryPlanner — takes preferences + profile and returns 3-4 focused queries
 * (e.g., ["Backend Engineer", "Backend Developer Node.js", "Software Engineer Express PostgreSQL"])
 * NOT concatenating all skills.
 */
export class JobQueryPlanner {
  version = VERSION;

  plan(preferences: JobPreferences | null | undefined, profile: ResumeProfile | null | undefined): PlannedQuery[] {
    const targetRoles = this.normalizeList(
      preferences?.target_roles ?? preferences?.targetRoles ?? null,
    );
    const emphasized = this.normalizeList(
      preferences?.emphasized_skills ?? preferences?.emphasizedSkills ?? null,
    );
    const excluded = new Set(
      this.normalizeList(preferences?.excluded_roles ?? preferences?.excludedRoles ?? null).map((s) => s.toLowerCase()),
    );
    const profileSkills = profile?.skills?.slice(0, 8) ?? [];
    const fallbackRoles = ['Software Engineer', 'Developer'];

    const baseRoles = targetRoles.length ? targetRoles : fallbackRoles;
    // Filter excluded
    const filteredRoles = baseRoles.filter((r) => !excluded.has(r.toLowerCase()));
    const roles = filteredRoles.length ? filteredRoles : baseRoles.slice(0, 1);

    // Build skill-augmented queries without concatenating all skills.
    // Academic/list-only skills ("Data Structures and Algorithms", "DBMS",
    // "OOP", single letters) are useless as search terms — Jooble ignores them
    // and returns generic senior-heavy results. Prefer tool skills.
    const SEARCH_STOPWORDS = new Set([
      'data structures and algorithms', 'dsa', 'dbms', 'oops', 'oop',
      'object-oriented programming', 'operating systems', 'computer networks',
      'computer science', 'c', 'sql',
    ]);
    const searchable = (list: string[]) =>
      list.filter((s) => !SEARCH_STOPWORDS.has(s.toLowerCase()) && s.length > 1);
    const rawPool = emphasized.length ? emphasized : profileSkills;
    const skillPool = searchable(rawPool).length ? searchable(rawPool) : rawPool;
    const skillA = skillPool[0];
    const skillB = skillPool[1];
    const skillC = skillPool[2];

    const isJunior = profile?.seniority === 'junior';
    const queries: PlannedQuery[] = [];

    // Query 1: primary role alone (broad recall)
    if (roles[0]) queries.push({ keywords: roles[0] });
    // Query 2: junior-qualified role so the pool isn't all seniors.
    // Without this, "Software Engineer" returns Mastercard Senior/Staff rows.
    if (isJunior && roles[0]) {
      queries.push({ keywords: `Junior ${roles[0]}` });
    } else if (roles[1]) {
      queries.push({ keywords: skillA ? `${roles[1]} ${skillA}` : roles[1] });
    } else if (skillA) {
      queries.push({ keywords: `${roles[0]} ${skillA}` });
    }
    // Query 3: role + top tool skill
    if (queries.length < 3) {
      const role = roles[0] ?? 'Software Engineer';
      const skill = skillB ?? skillA;
      if (skill) queries.push({ keywords: `${role} ${skill}` });
      else queries.push({ keywords: `${role} Developer` });
    }
    // Query 4: fresher/entry variant for juniors, skill combo otherwise
    if (queries.length < 4 && isJunior && (skillB ?? skillA)) {
      queries.push({ keywords: `Fresher ${skillB ?? skillA} Developer` });
    } else if (queries.length < 4 && skillC) {
      const role = roles.length > 1 ? roles[1] : roles[0] ?? 'Software Engineer';
      queries.push({ keywords: `${role} ${skillC}` });
    } else if (queries.length < 4 && skillA && skillB) {
      // already used, make variant with both? keep focused so just use skillB with other role
      const role = roles[0] ?? 'Software Engineer';
      if (!queries.some((q) => q.keywords === `${role} ${skillB}`)) {
        queries.push({ keywords: `${role} ${skillB}` });
      }
    }

    // Deduplicate and cap 4
    const seen = new Set<string>();
    const deduped: PlannedQuery[] = [];
    for (const q of queries) {
      const key = q.keywords.toLowerCase();
      if (!seen.has(key) && q.keywords.trim()) {
        seen.add(key);
        deduped.push(q);
      }
      if (deduped.length >= 4) break;
    }

    // Ensure 3-4 queries: if fewer than 3, pad with variants
    while (deduped.length < 3) {
      const extraSkill = skillPool[deduped.length] ?? 'Developer';
      const role = roles[deduped.length % roles.length] ?? 'Software Engineer';
      const kw = `${role} ${extraSkill}`;
      if (!seen.has(kw.toLowerCase())) {
        seen.add(kw.toLowerCase());
        deduped.push({ keywords: kw });
      } else {
        deduped.push({ keywords: `${role} Engineer` });
        break;
      }
      if (deduped.length >= 4) break;
    }

    return deduped.slice(0, 4);
  }

  private normalizeList(arr: string[] | null | undefined): string[] {
    if (!arr || !Array.isArray(arr)) return [];
    return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  }
}

export default JobQueryPlanner;
