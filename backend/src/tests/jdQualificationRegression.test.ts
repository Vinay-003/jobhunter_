import { describe, expect, test } from 'bun:test';
import { parseJd } from '../modules/jd/jdParser.js';
import { detectJobSeniority } from '../modules/jobs/ranking.js';
import { eligibleJob, effectivePreferences } from '../modules/jobs/eligibility.js';
import { matchJd } from '../modules/jd/matcher.js';
import { scoreJdRubric } from '../modules/analysis/jdRubric.js';
import type { NormalizedJob } from '../providers/jobs/JobProvider.js';
import type { ResumeProfile } from '../modules/parsing/resumeProfile.js';

const candidate = { skills: ['Python', 'Git'], skillsNormalized: ['Python', 'Git'], experience: [{ title: 'Software Intern' }], projects: [], education: [], seniority: 'intern', totalExperienceYears: .33 } as ResumeProfile;
const job = (title: string, description: string, descriptionQuality: 'full' | 'snippet' = 'snippet') => ({ title, description, descriptionQuality, source: 'fixture', externalId: title, company: 'Example', location: 'Bangalore', url: null, salary: null, postedAt: null, workMode: null }) satisfies NormalizedJob;
const prefs = effectivePreferences({}, {});

describe('JD qualification regressions', () => {
  test('core requirements preserve actual skills and alternatives', () => {
    const jd = parseJd('Software Engineer\nCore Requirements\nProgramming: Python and Git.\nGenAI & RAG: experience with vector databases (Chroma, Qdrant, Pinecone, or pgvector)');
    expect(jd.requiredSkills).toContain('Python');
    expect(jd.requiredSkills).toContain('Git');
    expect(jd.requiredSkills).toContain('Chroma');
    expect(jd.requirementGroups?.some(group => group.anyOf.includes('Qdrant'))).toBe(true);
  });
  test('architect tenure and canonical seniority reject intern', () => {
    const description = 'Role: Java Architect\nExperience: 8-15 years\nQualifications & experience:\n10+ years in software engineering with Java and Spring';
    const jd = parseJd(description);
    expect(jd.minYears).toBe(8);
    expect(jd.seniority).toBe('principal');
    expect(eligibleJob(job('Software Engineer', description), 'intern', prefs, { totalExperienceYears: .33 }).status).toBe('ineligible');
    expect(scoreJdRubric(candidate, jd, matchJd(candidate, jd), []).eligibility).toBe('ineligible');
  });
  test('snippet experience is a barrier, with unknown qualification evidence', () => {
    const j = job('Software Engineer: Workday Integration Tech Dev', 'Exp:6+ Years');
    expect(eligibleJob(j, 'intern', prefs, { totalExperienceYears: .33 }).status).toBe('ineligible');
    const thin = job('Software Engineer', 'A team building enterprise integrations.');
    expect(eligibleJob(thin, 'intern', {...prefs,includeUnknownDates:true}, candidate).status).toBe('uncertain');
    expect(matchJd(candidate, parseJd(`Job title: ${thin.title}\n${thin.description}`)).missingRequired).toEqual([]);
    const jd = parseJd(`Role: Software Engineer\nExp:6+ Years`);
    expect(scoreJdRubric(candidate, jd, matchJd(candidate, jd), []).score).toBeNull();
  });
  test('higher senior associate and engineer II are not entry; coworker mention does not override', () => {
    expect(detectJobSeniority('Sr Associate Engineer L2')).not.toBe('entry');
    expect(detectJobSeniority('Software Engineer II')).toBe('mid');
    expect(detectJobSeniority('Junior Engineer', 'Work with senior architects')).toBe('entry');
    expect(detectJobSeniority('Software Integration Engineer-II')).toBe('mid');
    expect(detectJobSeniority('Senior Software Engineer II')).toBe('senior');
  });
  test('entry transition is not an automatic barrier and senior penalty reconciles', () => {
    const entry = parseJd('Junior Software Engineer\nRequired skills\nPython and Git');
    const junior = scoreJdRubric(candidate, entry, matchJd(candidate, entry), []);
    expect(junior.eligibility).toBe('eligible');
    expect(junior.seniorityPenalty).toBe(0);
    const principal = parseJd('Principal Software Engineer\nRequired skills\nPython and Git');
    const senior = scoreJdRubric(candidate, principal, matchJd(candidate, principal), []);
    expect(senior.eligibility).toBe('ineligible');
    expect(senior.seniorityPenalty).toBe(50);
    expect(senior.score).toBe(Math.max(0, senior.relevanceScore! - 50));
  });
});
