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

    // Build skill-augmented queries without concatenating all skills
    // Pick 1-2 skills per query, rotate
    const skillPool = emphasized.length ? emphasized : profileSkills;
    const skillA = skillPool[0];
    const skillB = skillPool[1];
    const skillC = skillPool[2];

    const queries: PlannedQuery[] = [];

    // Query 1: primary role alone
    if (roles[0]) queries.push({ keywords: roles[0] });
    // Query 2: second role or primary + skillA
    if (roles[1]) {
      queries.push({ keywords: skillA ? `${roles[1]} ${skillA}` : roles[1] });
    } else if (skillA) {
      queries.push({ keywords: `${roles[0]} ${skillA}` });
    }
    // Query 3: fallback role + skillB or skillA
    if (queries.length < 3) {
      const role = roles[0] ?? 'Software Engineer';
      const skill = skillB ?? skillA;
      if (skill) queries.push({ keywords: `${role} ${skill}` });
      else queries.push({ keywords: `${role} Developer` });
    }
    // Query 4: another skill combo
    if (queries.length < 4 && skillC) {
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
