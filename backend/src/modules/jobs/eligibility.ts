import type { NormalizedJob } from '../../providers/jobs/JobProvider.js';
import type { ResumeProfile } from '../parsing/resumeProfile.js';
import { parseJd } from '../jd/jdParser.js';
import { detectJobSeniority, roleFamily } from './ranking.js';
import { inferCountry, normalizePlace, countryAliases } from './geography.js';
import { normalizeSeniority } from './seniority.js';
import { roleArea } from './roleDiscovery.js';
import { CLOSURE_PATTERN } from './availability.js';

export type EffectivePreferences = { targetRoles: string[]; locations: string[]; workModes: string[]; emphasizedSkills: string[]; excludedRoles: string[]; seniority: string[]; daysPosted?: number; keywords?: string; sortBy?: 'match'|'newest'; includeUnknownDates?: boolean; verifiedOpenOnly?: boolean; includeUnknownLocations?:boolean };
export function effectivePreferences(saved: any, request: any): EffectivePreferences {
  const list = (key: string, column: string): string[] => (request[key] !== undefined ? request[key] : saved?.[column] ?? []).map((s: string) => s.trim()).filter(Boolean);
  return { targetRoles: list('targetRoles', 'target_roles'), locations: list('locations', 'locations'), workModes: list('workModes', 'work_modes'),
    emphasizedSkills: list('emphasizedSkills', 'emphasized_skills'), excludedRoles: list('excludedRoles', 'excluded_roles'), seniority: list('seniority', 'seniority').map(level => normalizeSeniority(level) ?? level),
    daysPosted: request.daysPosted === null ? undefined : request.daysPosted ?? 7, keywords: request.keywords?.trim() || undefined,
    sortBy: request.sortBy ?? 'match', includeUnknownDates: request.includeUnknownDates ?? false, verifiedOpenOnly: request.verifiedOpenOnly ?? false, includeUnknownLocations:request.includeUnknownLocations??false };
}
export type CandidateQualification = Partial<ResumeProfile> & { professionalYears?: number | null };
export type Eligibility = { status: 'eligible' | 'ineligible' | 'uncertain'; reasons: string[] };
const indianCities = /\b(?:delhi|mumbai|bengaluru|bangalore|hyderabad|pune|chennai|kolkata|noida|gurugram|gurgaon)\b/i;
const germanCities = /\b(?:hamburg|berlin|munich|münchen|frankfurt|nuremberg|nürnberg|cologne)\b/i;
// Provider feeds frequently omit the country for US listings and return only
// "City, ST". Treat these well-known state abbreviations as geographic
// evidence when the user explicitly requested India (rather than silently
// keeping the job as merely uncertain).
const usStateLocation = /,\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i;
const canadianProvince = /,\s*(?:AB|BC|MB|NB|NL|NS|NT|NU|ON|PE|QC|SK|YT)\b/i;
const countryOf = (value: string) => inferCountry(value) ?? Object.entries(countryAliases).find(([, aliases]) => aliases.some(alias => new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(value)))?.[0] ?? null;
export function countryCodeForLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const country = inferCountry(location);
  return country ? ({ india:'IN', 'united states':'US', canada:'CA', germany:'DE', 'united kingdom':'GB', australia:'AU' } as Record<string,string>)[country] ?? null : null;
}
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Explicit barriers only; absent evidence is uncertain, not proof of eligibility. */
export function eligibleJob(job: NormalizedJob, candidateLevel: string | null | undefined, prefs: EffectivePreferences, candidate?: CandidateQualification): Eligibility {
  const blockers: string[] = [];
  const unknown: string[] = [];
  if (job.availability?.status === 'closed') blockers.push('Job is closed');
  if (CLOSURE_PATTERN.test(job.description ?? '') || CLOSURE_PATTERN.test(job.title)) blockers.push('Job is closed (applications closed)');
  if (prefs.verifiedOpenOnly && (job.availability?.status !== 'open' || !job.availability.checkedAt || Date.now() - Date.parse(job.availability.checkedAt) > 300_000)) blockers.push('Open applications not verified recently');
  if (job.availability?.status === 'unknown') unknown.push('Application availability unverified');
  const title = job.title.toLowerCase();
  const description = job.description ?? '';
  const isDirectTargetMatch = prefs.targetRoles.some(tr => {
    const trL = tr.toLowerCase(), jL = title.toLowerCase();
    return jL.includes(trL) || trL.includes(jL) || trL.split(/\s+/).filter(w => w.length > 3).every(w => jL.includes(w));
  });
  if (roleFamily(job.title) === 'other' && !isDirectTargetMatch && !prefs.targetRoles.some(tr => roleFamily(tr) === 'other')) {
    blockers.push('Unrelated role family');
  }
  if (prefs.excludedRoles.some((role) => title.includes(role.toLowerCase()))) blockers.push('Excluded role');
  if (prefs.targetRoles.length && !isDirectTargetMatch) {
    const wanted = prefs.targetRoles.map(roleArea);
    const actual = roleArea(job.title);
    if (actual !== 'generic' && !wanted.includes('generic') && !wanted.includes(actual) && !(wanted.includes('fullstack') && ['backend','frontend'].includes(actual))) {
      blockers.push('Outside requested role specialization');
    }
  }
  const level = detectJobSeniority(job.title, job.description);
  if (['intern', 'entry'].includes(normalizeSeniority(candidateLevel) ?? '') && (level === 'senior' || level === 'principal')) blockers.push('Explicit senior role');
  const isExperienced = ['senior', 'principal', 'mid'].includes(normalizeSeniority(candidateLevel) ?? '') ||
    (typeof candidate?.totalExperienceYears === 'number' && candidate.totalExperienceYears >= 2) ||
    (typeof candidate?.employmentYears === 'number' && candidate.employmentYears >= 2) ||
    (typeof candidate?.professionalYears === 'number' && candidate.professionalYears >= 2);
  if (level === 'intern' && isExperienced && !prefs.seniority.includes('intern')) {
    blockers.push('Internship role not applicable for experienced candidate');
  }
  if (prefs.seniority.length && level && !prefs.seniority.map(s => normalizeSeniority(s) ?? s).includes(level)) blockers.push('Outside target seniority');
  if (prefs.keywords && !`${job.title} ${description}`.toLowerCase().includes(prefs.keywords.toLowerCase())) blockers.push('Keyword not found');
  const mode = /\b(remote|hybrid|onsite|on-site)\b/i.exec(job.workMode ?? job.location ?? '')?.[1].toLowerCase().replace('on-site','onsite') ?? null;
  if (prefs.workModes.length && mode && !prefs.workModes.map(s => s.toLowerCase().replace('on-site','onsite')).includes(mode)) blockers.push('Work mode differs');
  if (prefs.workModes.length && !mode) unknown.push('Work mode unavailable');

  const explicitRequirement = /\b(?:required|requires?|minimum|must have|at least|years?\s+of|professional experience|exp\.?\s*[:=-]?|experience\s*[:=-]?)\b/i.test(description);
  const years = explicitRequirement ? parseJd(`Job title: ${job.title}\n${description}`).minYears : null;
  if (years !== null && years !== undefined) {
    const fullTime = /\b(?:full[- ]?time|professional|industry)\b/i.test(description);
    const observed = candidate?.professionalYears ?? (fullTime ? candidate?.employmentYears : candidate?.totalExperienceYears) ?? (
      typeof candidate?.employmentYears === 'number'
        ? candidate.employmentYears
        : typeof candidate?.internshipYears === 'number' ? 0
        : null
    );
    if (typeof observed !== 'number' || !Number.isFinite(observed)) unknown.push(`Professional tenure for ${years}+ years requirement unavailable`);
    else if (observed < years) {
      const gap = years - observed;
      if (gap > 1.25 && (observed < 2 || observed < years * 0.75)) {
        blockers.push(`Requires ${years}+ professional years; observed ${observed}`);
      } else {
        unknown.push(`Requires ${years}+ professional years; observed ${observed}`);
      }
    }
  }
  if (job.descriptionQuality === 'snippet' && years === null && !/\b(?:degree|bachelor|master|security clearance)\b/i.test(description)) unknown.push('Qualification details unavailable in snippet');
  if (/\b(?:completed|earned|obtained|graduated|hold(?:s|ing)?)\b.{0,45}\b(?:bachelor(?:'s)?|master(?:'s)?|degree|phd)\b|\b(?:bachelor(?:'s)?|master(?:'s)?|degree|phd)\b.{0,45}\b(?:completed|required|earned|obtained)\b/i.test(description)) {
    const education = candidate?.education ?? [];
    const requestedLevel = /\b(?:phd|doctorate)\b/i.test(description) ? 'doctorate' : /\b(?:master(?:'s)?|msc|m\.?s\.?|ms|mtech)\b/i.test(description) ? 'master' : /\b(?:bachelor(?:'s)?|btech|bsc|b\.?s\.?|bs)\b/i.test(description) ? 'bachelor' : null;
    const requestedField = description.match(/\b(?:in|of)\s+([a-z\s]+(?:science|technology|engineering|mathematics|analytics|statistics))\b/i)?.[1]?.toLowerCase()?.trim();
    const completed = education.some(entry => {
      const degree = (entry.degree ?? '').toLowerCase();
      const level = /\b(?:phd|doctor|d\.?phil)\b/i.test(degree)
        ? 'doctorate'
        : /\b(?:master|m\.?tech|m\.?sc|m\.?s\.?|ms|mba|mca)\b/i.test(degree)
        ? 'master'
        : /\b(?:bachelor|b\.?tech|b\.?sc|b\.?s\.?|bs|b\.?e\.?|bca)\b/i.test(degree)
        ? 'bachelor'
        : null;
      const field = (entry.field ?? '').toLowerCase();
      const levelMatches = !requestedLevel || level === requestedLevel || (requestedLevel === 'bachelor' && (level === 'master' || level === 'doctorate'));
      const fieldMatches = !requestedField ||
        field.includes(requestedField) ||
        requestedField.includes(field) ||
        (/\b(?:computer|software|data|analytics|math|statistics|engineering|tech|stem)\b/i.test(field) &&
         /\b(?:computer|software|data|analytics|math|statistics|engineering|tech|stem|related)\b/i.test(requestedField));
      return (entry.completed === true || (entry as any).status === 'completed') && levelMatches && fieldMatches;
    });
    if (!completed) unknown.push('Completed degree, level or requested field unverified');
  }

  const location = job.location ?? '';
  if (prefs.locations.length) {
    const advertised = `${location} ${description}`;
    const requested = prefs.locations.map(value => countryOf(value) ?? normalize(value));
    if (requested.includes('india') && /\b(?:latin america|latam|us[ -]only|usa[ -]only|us citizens? only)\b/i.test(`${job.title} ${location} ${description}`)) blockers.push('Outside advertised applicant region');
    const residency = advertised.match(/\b(?:us|usa|united states|canada|india|germany|united kingdom|uk|australia)(?:\s*(?:and|or|,|\/)\s*(?:us|usa|united states|canada|india|germany|united kingdom|uk|australia))*\s*(?:residents?|candidates?|based|only|eligible)\b|\b(?:only|residents?|based in|eligible in)\s*(?:the\s+)?(?:us|usa|united states|canada|india|germany|united kingdom|uk|australia)\b/i)?.[0] ?? '';
    const allowed = [...new Set([...residency.matchAll(/\b(?:us|usa|united states|canada|india|germany|united kingdom|uk|australia)\b/gi)].map(match => countryOf(match[0])).filter(Boolean))];
     const locationCountries = [inferCountry(location)].filter(Boolean) as string[];
     const locationCountry = inferCountry(location);
    if (locationCountry && !locationCountries.includes(locationCountry)) locationCountries.push(locationCountry);
    const worldwide = /\b(?:worldwide|global(?:ly)?)\b/i.test(location);
    const remote = /\bremote\b/i.test(location) || mode === 'remote';
    if (allowed.length && !allowed.some(country => requested.includes(country!))) blockers.push('Geographic residency restriction');
    else if (!allowed.length && locationCountries.length && !locationCountries.some(country => requested.includes(country)) && !prefs.locations.some(loc => normalize(location).includes(normalize(loc)))) blockers.push('Location differs');
    else if (!allowed.length && /\b(?:europe|eu|eea)\b/i.test(location) && requested.includes('india')) blockers.push('Outside advertised European region');
    else if (!allowed.length && !worldwide && remote && !locationCountry) unknown.push('Remote residency eligibility unavailable');
    else if ((!location || (!locationCountries.length && !worldwide && !prefs.locations.some(loc => normalize(location).includes(normalize(loc))))) && !remote) unknown.push('Location eligibility unavailable');
  }
  const posted = job.postedAt ? Date.parse(job.postedAt) : NaN;
  const trustworthyDate = Number.isFinite(posted) && posted <= Date.now() && job.dateSource !== 'updated';
  if (!trustworthyDate) {
    if (prefs.includeUnknownDates === false) blockers.push('Posting date unavailable or invalid (strict freshness)');
    else if (prefs.daysPosted) unknown.push('Posting date unavailable or invalid');
  } else if (prefs.daysPosted && Date.now() - posted > prefs.daysPosted * 86400000) blockers.push('Posting too old');
  if(prefs.includeUnknownLocations===false && unknown.some(reason=>/Location eligibility unavailable|Remote residency eligibility unavailable/.test(reason))) blockers.push('Applicant location unverified (strict geography)');
  return blockers.length ? { status:'ineligible', reasons:blockers } : unknown.length ? { status:'uncertain', reasons:unknown } : { status:'eligible', reasons:[] };
}
