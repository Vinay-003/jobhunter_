import type { ResumeProfile } from '../parsing/resumeProfile.js';
import { inferRoleTitles } from './roleDiscovery.js';
export const VERSION='4.0.0';
export type JobPreferences={target_roles?:string[]|null;targetRoles?:string[];seniority?:string[]|null;locations?:string[]|null;emphasized_skills?:string[]|null;emphasizedSkills?:string[];excluded_roles?:string[]|null;excludedRoles?:string[]};
export type PlannedQuery={keywords:string;location?:string};
/** Search distinct occupations, not four keyword variants of one chosen role. */
export class JobQueryPlanner {
  version=VERSION;
  plan(preferences:JobPreferences|null|undefined,profile:ResumeProfile|null|undefined):PlannedQuery[] {
    const explicit=preferences?.target_roles??preferences?.targetRoles??[];
    const excluded=(preferences?.excluded_roles??preferences?.excludedRoles??[]).map(x=>x.toLowerCase().trim()).filter(Boolean);
    const roles=explicit.length?explicit:profile?inferRoleTitles(profile):[];
    const seen=new Set<string>();
    return roles.map(s=>s.trim()).filter(s=>{
      const key=s.toLowerCase();
      if(!key||seen.has(key)||excluded.some(term=>key.includes(term)))return false;
      seen.add(key);return true;
    }).slice(0,3).map(keywords=>({keywords}));
  }
}
export default JobQueryPlanner;
