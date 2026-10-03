import { describe, expect, it } from 'bun:test';
import { eligibleJob } from '../modules/jobs/eligibility.js';

const prefs = { targetRoles: [], locations: ['India'], workModes: [], emphasizedSkills: [], excludedRoles: [], seniority: [] };
const job = (location: string) => ({ title: 'Junior Software Engineer', location, description: '', workMode: null, source: 'test', externalId: location } as any);

describe('job location eligibility', () => {
  it('excludes US city/state listings from an India search', () => {
    expect(eligibleJob(job('Minneapolis, MN'), 'junior', prefs).status).toBe('ineligible');
  });

  it('keeps Indian listings eligible', () => {
    expect(eligibleJob(job('Noida, Uttar Pradesh, India'), 'junior', prefs).status).toBe('eligible');
  });
});
