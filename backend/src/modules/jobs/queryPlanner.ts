import type { ResumeProfile } from '../parsing/resumeProfile.js';
import { normalizeSeniority } from './seniority.js';

export const VERSION = '3.0.0';

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
    const professionalTitles = [...(profile?.experience ?? []), ...(profile?.projects ?? [])].map(entry => entry.title ?? '').join(' ');
    const inferred = /\b(?:frontend|front.end|react|ui)\b/i.test(professionalTitles) ? 'Frontend Engineer'
      : /\b(?:backend|back.end|api)\b/i.test(professionalTitles) ? 'Backend Engineer'
      : /\b(?:data|machine learning|ml)\b/i.test(professionalTitles) ? 'Data Engineer'
      : /\b(?:devops|platform|cloud)\b/i.test(professionalTitles) ? 'Platform Engineer'
      : /\b(?:full.stack|fullstack)\b/i.test(professionalTitles) ? 'Full Stack Engineer'
      : profileSkills.some(skill => /react|vue|angular/i.test(skill)) ? 'Frontend Engineer'
      : profileSkills.some(skill => /node|express|java/i.test(skill)) ? 'Backend Engineer' : 'Software Engineer';
    const fallbackRoles = [inferred, 'Software Engineer', 'Developer'];

    const baseRoles = targetRoles.length ? targetRoles : fallbackRoles;
    // Filter excluded
    const allowed = (role: string) => ![...excluded].some(term => role.toLowerCase().includes(term) || term.includes(role.toLowerCase()));
    const filteredRoles = baseRoles.filter(allowed);
    const roles = filteredRoles.length ? filteredRoles : fallbackRoles.filter(allowed);
    if (!roles.length) return [];

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

    const requestedSeniority = this.normalizeList(preferences?.seniority ?? null).map(normalizeSeniority);
    const isJunior = requestedSeniority.includes('entry') || requestedSeniority.includes('intern') || (!requestedSeniority.length && ['entry', 'intern'].includes(normalizeSeniority(profile?.seniority) ?? ''));
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
      queries.push({ keywords: `New Grad ${roles[0]} ${skillB ?? skillA}` });
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
      const extraSkill = skillPool[deduped.length] ?? '';
      const role = roles[deduped.length % roles.length] ?? 'Software Engineer';
      const kw = `${role} ${extraSkill || (isJunior ? 'Entry Level' : 'Jobs')}`;
      if (!seen.has(kw.toLowerCase())) {
        seen.add(kw.toLowerCase());
        deduped.push({ keywords: kw });
      } else {
        deduped.push({ keywords: `${role} ${isJunior ? 'New Grad' : 'Jobs'}` });
        break;
      }
      if (deduped.length >= 4) break;
    }

    return deduped.filter(q => ![...excluded].some(term => q.keywords.toLowerCase().includes(term))).slice(0, 4);
  }

  private normalizeList(arr: string[] | null | undefined): string[] {
    if (!arr || !Array.isArray(arr)) return [];
    return arr.map((s) => String(s).trim()).filter(Boolean).slice(0, 10);
  }
}

export default JobQueryPlanner;
