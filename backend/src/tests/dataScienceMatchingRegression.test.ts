import { describe, expect, test } from 'bun:test';
import { rankJobsBatch, roleFamily } from '../modules/jobs/ranking.js';
import { eligibleJob, effectivePreferences } from '../modules/jobs/eligibility.js';

const dataScientistProfile = (overrides: any = {}) => ({
  skills: ['Python', 'SQL', 'Git', 'Docker', 'AWS', 'Machine Learning', 'LightGBM', 'Snowflake', 'dbt'],
  skillsNormalized: ['Python', 'SQL', 'Git', 'Docker', 'AWS', 'Machine Learning', 'LightGBM', 'Snowflake', 'dbt'],
  experience: [
    {
      title: 'Senior Data Scientist',
      company: 'Northstar Commerce Labs',
      description: 'Built LightGBM demand forecast for 18,000 SKUs. Created churn propensity pipeline in Snowflake/dbt serving 2.4M customers.',
      kind: 'employment',
    },
    {
      title: 'Data Scientist',
      company: 'Aster Mobility Analytics',
      description: 'Developed trip-demand and ETA models using gradient boosting. Fine-tuned sentence embeddings on support tickets.',
      kind: 'employment',
    },
  ],
  projects: [],
  education: [
    {
      degree: 'M.S.',
      field: 'Data Science',
      institution: 'University of Washington',
      completed: true,
      raw: 'M.S. Data Science, University of Washington - 2022',
    },
    {
      degree: 'B.S.',
      field: 'Applied Mathematics',
      institution: 'Oregon State University',
      completed: true,
      raw: 'B.S. Applied Mathematics, Oregon State University - 2020',
    },
  ],
  seniority: 'senior',
  totalExperienceYears: 4.17,
  contactSignals: { hasEmail: true, hasPhone: true, hasLinkedIn: true, hasGithub: true },
  ...overrides,
} as any);

const makeJob = (title: string, description: string, overrides: any = {}) => ({
  title,
  description,
  location: 'Bangalore, India',
  workMode: 'hybrid',
  source: 'jooble',
  externalId: title,
  descriptionQuality: 'full',
  ...overrides,
} as any);

describe('Data Science, Analytics & ML Engineer matching regressions', () => {
  test('roleFamily recognizes Data Scientist, Analytics Engineer and ML Engineer as data family', () => {
    expect(roleFamily('Data Scientist')).toBe('data');
    expect(roleFamily('Senior Data Scientist')).toBe('data');
    expect(roleFamily('Machine Learning Engineer')).toBe('data');
    expect(roleFamily('Analytics Engineer')).toBe('data');
    expect(roleFamily('AI Forward Engineer')).toBe('data');
    expect(roleFamily('Quantitative Researcher')).toBe('data');
  });

  test('eligibleJob does not block Data Science roles with Unrelated role family', () => {
    const prefs = effectivePreferences(null, {
      targetRoles: ['Data Scientist', 'Machine Learning Engineer', 'Analytics Engineer'],
      locations: ['India'],
      includeUnknownDates: true,
      includeUnknownLocations: true,
    });

    const dsJob = makeJob('Data Scientist', 'Work with Python and machine learning.');
    const mlJob = makeJob('Machine Learning Engineer', 'Deploy ML models.');
    const aeJob = makeJob('Analytics Engineer', 'Transform data models with dbt.');

    expect(eligibleJob(dsJob, 'senior', prefs).status).not.toBe('ineligible');
    expect(eligibleJob(mlJob, 'senior', prefs).status).not.toBe('ineligible');
    expect(eligibleJob(aeJob, 'senior', prefs).status).not.toBe('ineligible');
  });

  test('candidate with M.S. Data Science gets 10/10 education points for jobs requiring Data Science/Math/CS degrees', async () => {
    const jd = `Title: Senior Data Scientist
Requirements:
- Bachelor or Master degree in Data Science, Mathematics, Computer Science or related quantitative field.
- 4+ years of data science experience.`;

    const [result] = await rankJobsBatch(dataScientistProfile(), [makeJob('Senior Data Scientist', jd)], {
      preferences: {
        targetRoles: ['Data Scientist'],
        locations: ['India'],
      },
      embeddingProvider: {
        modelId: 'mock-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.8, 0.6]),
          modelId: 'mock-test',
          dimension: 2,
        }),
      },
    });

    expect(result.breakdown.domainEducation).toBe(10);
    expect(result.evidence.some(e => /Verified (?:completed )?education meets stated degree/i.test(e))).toBe(true);
  });

  test('candidate with past Data Scientist title gets 15/15 role title alignment for target Data Scientist and ML roles', async () => {
    const jd = `Title: Data Scientist
Responsibilities:
- Build predictive models in Python.`;

    const [result] = await rankJobsBatch(dataScientistProfile(), [makeJob('Data Scientist', jd)], {
      preferences: {
        targetRoles: ['Data Scientist', 'Machine Learning Engineer'],
        locations: ['India'],
      },
      embeddingProvider: {
        modelId: 'mock-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.8, 0.6]),
          modelId: 'mock-test',
          dimension: 2,
        }),
      },
    });

    expect(result.breakdown.roleTitle).toBe(15);
  });

  test('responsibility scoring scales with coverage ratio when candidate supports responsibilities', async () => {
    const jd = `Title: Data Scientist
Responsibilities:
- Build demand forecast models for retail SKUs.
- Create customer churn prediction pipelines.
- Standardize experiment power calculations and guardrails.`;

    // Provider produces matching vectors for candidate chunks vs responsibilities
    const [result] = await rankJobsBatch(dataScientistProfile(), [makeJob('Data Scientist', jd)], {
      preferences: {
        targetRoles: ['Data Scientist'],
        locations: ['India'],
      },
      embeddingProvider: {
        modelId: 'semantic-match-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.75, 0.65]),
          modelId: 'semantic-match-test',
          dimension: 2,
        }),
      },
    });

    expect(result.breakdown.responsibilitySemantic).toBeGreaterThanOrEqual(20);
  });
});
