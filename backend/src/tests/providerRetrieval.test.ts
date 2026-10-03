import { test, expect } from 'bun:test';
import { retrievalPlan, sourceEnvelope } from '../providers/jobs/retrievalPlan.js';

test('bounded plan covers multiple locations and supported pages toward target', () => {
  const plan = retrievalPlan(['jooble', 'adzuna', 'jobspipe', 'remotive', 'arbeitnow'], ['Toronto, Canada', 'Berlin, Germany'], ['Engineer'], 50);
  expect(plan.some(p => p.location === 'Toronto, Canada')).toBe(true);
  expect(plan.some(p => p.location === 'Berlin, Germany')).toBe(true);
  expect(plan.some(p => p.provider === 'jooble' && p.page === 2)).toBe(true);
  expect(plan.some(p => p.provider === 'adzuna' && p.page === 2)).toBe(true);
  expect(plan.filter(p => p.provider === 'jobspipe').map(p => p.page)).toEqual([1, 2, 3]);
  expect(plan.filter(p => p.provider === 'remotive')).toHaveLength(1);
  expect(plan.length).toBeLessThanOrEqual(18);
});

test('source envelope distinguishes empty, fallback, error and cached responses', () => {
  expect(sourceEnvelope('jooble', [], false).status).toBe('empty');
  expect(sourceEnvelope('jooble', [], false, 'error').status).toBe('error');
  expect(sourceEnvelope('jooble', [{source:'jooble', retrieval:{status:'fallback'}}] as any, false).status).toBe('fallback');
  expect(sourceEnvelope('jooble', [], true).status).toBe('cached');
});

test('bounded plan covers every location before extra keyword variants', () => {
  const plan = retrievalPlan(['jooble'], ['Toronto', 'Berlin', 'Paris'], ['Engineer', 'Developer', 'Architect'], 50);
  expect(plan.slice(0, 3).map(step => step.location)).toEqual(['Toronto', 'Berlin', 'Paris']);
  expect(plan.every(step => step.page >= 1 && step.page <= 3)).toBe(true);
});
