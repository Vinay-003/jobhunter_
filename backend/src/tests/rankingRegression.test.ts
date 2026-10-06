import { describe, expect, test } from 'bun:test';
import { rankJobsBatch } from '../modules/jobs/ranking.js';
import { eligibleJob } from '../modules/jobs/eligibility.js';
import { JobQueryPlanner } from '../modules/jobs/queryPlanner.js';
import { detectSeniority } from '../modules/jobs/seniority.js';

const profile = (overrides: any = {}) => ({ skills: ['React', 'TypeScript'], skillsNormalized: ['React', 'TypeScript'], experience: [{ title: 'Frontend Engineer', company: 'A', startDate: null, endDate: null, isCurrent: false, description: 'Built React interfaces and accessible dashboards', kind: 'employment' }], projects: [], education: [], seniority: 'entry', totalExperienceYears: 1, contactSignals: { hasEmail: false, hasPhone: false, hasLinkedIn: false, hasGithub: false }, summary: null, languages: [], ...overrides } as any);
const job = (title: string, description = '') => ({ title, description, location: null, workMode: null, source: 'test', externalId: title, descriptionQuality: 'full' } as any);
const prefs = (overrides: any = {}) => ({ targetRoles: [], locations: [], workModes: [], emphasizedSkills: [], excludedRoles: [], seniority: [], ...overrides });

describe('recommendation ranking regressions', () => {
  test('detects a senior role label in a feed description without treating coworker mentions as seniority', () => {
    expect(detectSeniority('Backend Engineer', 'Role overview: Senior Backend Engineer building APIs.')).toBe('senior');
    expect(detectSeniority('Junior Software Engineer', 'Work with senior engineers.')).toBe('entry');
  });
  test('entry profile cannot score senior/principal highly even on direct batch calls', async () => {
    const [senior, principal] = await rankJobsBatch(profile(), [job('Senior Frontend Engineer', 'React TypeScript'), job('Principal Frontend Engineer', 'React TypeScript')], { embeddingProvider: { modelId: 'mock-test', embed: async ({ texts }: any) => ({ vectors: texts.map(() => [1, 0]), modelId: 'mock-test', dimension: 2 }) } });
    expect(senior.scoreDetails?.seniorityPenalty).toBe(35);
    expect(principal.scoreDetails?.seniorityPenalty).toBe(45);
    expect(senior.fitScore).toBeLessThanOrEqual(35);
    expect(principal.fitScore).toBeLessThanOrEqual(25);
    expect(senior.scoreDetails?.semanticStatus).toBe('keyword-only');
  });
  test('skill-list alone is not responsibility evidence or a role-title match', async () => {
    const [rank] = await rankJobsBatch(profile({ experience: [], projects: [] }), [job('Data Engineer', 'Responsibilities:\n- Design data pipelines with Python and Spark\nRequired:\n- Python or Java')], { embeddingProvider: { modelId: 'mock-test', embed: async ({ texts }: any) => ({ vectors: texts.map(() => [1, 0]), modelId: 'mock-test', dimension: 2 }) } });
    expect(rank.breakdown.responsibilitySemantic).toBe(0);
    expect(rank.breakdown.roleTitle).toBe(0);
    expect(rank.confidence).toBe('Low');
  });
  test('education requires verified completion and field for full points', async () => {
    const j = job('Frontend Engineer', 'Bachelor degree in Computer Science required');
    const pending = await rankJobsBatch(profile({ education: [{ degree: 'Bachelor', field: 'Computer Science', completed: null }] }), [j], { embeddingProvider: { modelId: 'mock-test', embed: async ({ texts }: any) => ({ vectors: texts.map(() => [1, 0]), modelId: 'mock-test', dimension: 2 }) } });
    const verified = await rankJobsBatch(profile({ education: [{ degree: 'Bachelor', field: 'Computer Science', completed: true }] }), [j], { embeddingProvider: { modelId: 'mock-test', embed: async ({ texts }: any) => ({ vectors: texts.map(() => [1, 0]), modelId: 'mock-test', dimension: 2 }) } });
    expect(pending[0].breakdown.domainEducation).toBe(5);
    expect(verified[0].breakdown.domainEducation).toBe(10);
  });
  test('country matching is symmetric and remote residency supports multiple countries', () => {
    expect(eligibleJob({ ...job('Frontend Engineer', 'Remote US or Canada residents only'), location: 'Remote' }, 'entry', prefs({ locations: ['Canada'] })).status).toBe('eligible');
    expect(eligibleJob({ ...job('Frontend Engineer'), location: 'Toronto, ON' }, 'entry', prefs({ locations: ['United States'] })).status).toBe('ineligible');
    expect(eligibleJob({ ...job('Frontend Engineer'), location: 'San Francisco, CA' }, 'entry', prefs({ locations: ['Canada'] })).status).toBe('ineligible');
  });
  test('planner derives specialization without premature new-grad variants', () => {
    const queries = new JobQueryPlanner().plan({ excludedRoles: ['Software Engineer', 'Backend Developer'] }, profile({ experience: [{ title: 'Frontend Engineer', description: 'React applications' }], seniority: 'entry' }));
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some(q => /frontend/i.test(q.keywords))).toBe(true);
    expect(queries.some(q => /new.grad/i.test(q.keywords))).toBe(false);
    expect(queries.every(q => !/software engineer|backend developer/i.test(q.keywords))).toBe(true);
  });
  test('semantic coverage averages separate responsibilities rather than promoting one matching bullet', async () => {
    const p = profile();
    const j = job('Frontend Engineer', 'Responsibilities:\n- Build React interfaces\n- Maintain Kubernetes production clusters');
    const provider = { embed: async ({ texts }: any) => ({ vectors: texts.map((text: string) => /kubernetes/i.test(text) ? [0, 1] : [1, 0]), modelId: 'deterministic-semantic', dimension: 2 }) };
    const [rank] = await rankJobsBatch(p, [j], { embeddingProvider: provider });
    expect(rank.scoreDetails?.responsibilityMatches).toHaveLength(2);
    expect(rank.breakdown.responsibilitySemantic).toBeLessThan(20);
    expect(rank.scoreDetails?.semanticStatus).toBe('embedded');
  });
  test('skill evidence distinguishes demonstrated from declared and exposes caps', async () => {
    const [rank] = await rankJobsBatch(profile({ declaredSkills: ['Kubernetes'], demonstratedSkills: ['React'] }), [job('Senior Frontend Engineer', 'Responsibilities:\n- Build React interfaces\nRequired: React and Kubernetes')], { embeddingProvider: { modelId: 'mock-test', embed: async ({ texts }: any) => ({ vectors: texts.map(() => [1, 0]), modelId: 'mock-test', dimension: 2 }) } });
    expect(rank.scoreDetails?.skillEvidence).toEqual(expect.arrayContaining([
      { skill: 'React', source: 'demonstrated' }, { skill: 'Kubernetes', source: 'declared' },
    ]));
    expect(rank.scoreDetails?.scoreCap).toBe(35);
    expect(rank.scoreDetails?.scoreCapReasons).toContain('Senior role exceeds entry-level profile');
    expect(rank.scoreDetails?.responsibilityMatches[0]).toEqual(expect.objectContaining({ rawCosine: expect.any(Number), supported: expect.any(Boolean) }));
  });
  test('semantically matches synonymous skills without requiring exact string equality', async () => {
    const p = profile({ skills: ['REST API'], skillsNormalized: ['REST API'] });
    const j = job('Backend Engineer', 'Responsibilities:\n- Design microservice architectures\nRequired:\n- API Designing');
    // Provider returns vectors where "REST API" and "API Designing" are close [1, 0] vs [0.95, 0.31] (cos > 0.9)
    const provider = {
      embed: async ({ texts }: any) => ({
        vectors: texts.map((t: string) => /api design|rest api/i.test(t) ? [0.95, 0.31] : [0, 1]),
        modelId: 'semantic-synonym-test',
        dimension: 2,
      }),
    };
    const [rank] = await rankJobsBatch(p, [j], { embeddingProvider: provider });
    expect(rank.matchedSkills).toContain('API Design');
    expect(rank.missingSkills).not.toContain('API Design');
    expect(rank.breakdown.requiredSkill).toBeGreaterThan(0);
  });
  test('evaluates all responsibilities without a cap when JD has more than 10 bullets', async () => {
    const bullets = Array.from({ length: 14 }, (_, i) => `- Deliver technical responsibility item number ${i + 1}`).join('\n');
    const p = profile();
    const j = job('Platform Engineer', `Responsibilities:\n${bullets}\nRequired:\n- React`);
    const provider = {
      embed: async ({ texts }: any) => ({
        vectors: texts.map(() => [1, 0]),
        modelId: 'uncapped-test',
        dimension: 2,
      }),
    };
    const [rank] = await rankJobsBatch(p, [j], { embeddingProvider: provider });
    expect(rank.scoreDetails?.responsibilityMatches.length).toBe(14);
  });
});
