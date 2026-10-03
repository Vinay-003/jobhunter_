import { test, expect } from 'bun:test';
import { retrievalPlan, sourceEnvelope } from '../providers/jobs/retrievalPlan.js';

test('bounded plan covers multiple locations and supported pages toward target', () => {
  const plan = retrievalPlan(['jooble', 'adzuna', 'jobspipe', 'remotive', 'arbeitnow'], ['Toronto, Canada', 'Berlin, Germany'], ['Engineer'], 50);
  expect(plan.some(p => p.location === 'Toronto, Canada')).toBe(true);
  expect(plan.some(p => p.location === 'Berlin, Germany')).toBe(true);
  expect(plan.some(p => p.provider === 'jooble' && p.page === 2)).toBe(true);
  expect(plan.some(p => p.provider === 'adzuna' && p.page === 2)).toBe(true);
  expect(plan.filter(p => p.provider === 'jobspipe')).toHaveLength(1);
  expect(plan.filter(p => p.provider === 'remotive')).toHaveLength(1);
  expect(plan.length).toBeLessThanOrEqual(18);
});

test('source envelope distinguishes empty, fallback, error and cached responses', () => {
  expect(sourceEnvelope('jooble', [], false).status).toBe('empty');
  expect(sourceEnvelope('jooble', [], false, 'error').status).toBe('error');
  expect(sourceEnvelope('jooble', [{source:'jooble', retrieval:{status:'fallback'}}] as any, false).status).toBe('fallback');
  expect(sourceEnvelope('jooble', [], true).status).toBe('cached');
});
