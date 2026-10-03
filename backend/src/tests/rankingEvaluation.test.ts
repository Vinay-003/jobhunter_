import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { evaluateRanking, groupDuplicateCandidates, parseLabelJsonl, assertDisjointSplit } from '../modules/evaluation/rankingEvaluation.js';

const fixture = parseLabelJsonl(readFileSync(new URL('../modules/evaluation/fixtures/synthetic-labels.v1.jsonl', import.meta.url), 'utf8'));

describe('offline label-driven ranking evaluation', () => {
  test('versioned schema rejects invalid or unjudged relevance and reports line number', () => {
    expect(() => parseLabelJsonl('{"schemaVersion":2}')).toThrow('line 1');
    expect(() => parseLabelJsonl(JSON.stringify({ ...fixture[0], eligibility: 'unknown' }))).toThrow('Relevance');
    expect(() => parseLabelJsonl('\n' + JSON.stringify({ ...fixture[0], score: NaN }))).toThrow('line 2');
  });
  test('duplicates collapse by candidate/requisition and conflicts fail closed', () => {
    expect(groupDuplicateCandidates(fixture)).toHaveLength(4);
    expect(groupDuplicateCandidates(fixture).find(r => r.groupId === 'req-1')?.jobId).toBe('feed-1');
    expect(() => groupDuplicateCandidates([fixture[0], { ...fixture[1], relevance: 0 }])).toThrow('Conflicting');
    expect(groupDuplicateCandidates([...fixture].reverse()).find(r => r.groupId === 'req-1')?.jobId).toBe('feed-1');
  });
  test('precision, recall, NDCG, explicit ineligibility and ECE are reported with denominators', () => {
    const result = evaluateRanking(fixture.filter(r => r.candidateId === 'synthetic-a'), 2, 2);
    expect(result.uniqueJobs).toBe(3);
    expect(result.precisionAtK).toEqual({ value: .5, numerator: 1, denominator: 2 });
    expect(result.recallAtK).toEqual({ value: .5, numerator: 1, denominator: 2 });
    expect(result.explicitIneligibleAtK.value).toBe(.5);
    expect(result.ndcgAtK).toBeCloseTo(7 / (7 + 1 / Math.log2(3)));
    expect(result.calibration.ece).toBeCloseTo(.2);
    expect(result.calibration.count).toBe(2);
  });
  test('ties use stable group/job IDs; zero judged data yields null rather than invented accuracy', () => {
    const tied = [fixture[2], { ...fixture[0], score: 80 }];
    expect(evaluateRanking(tied, 1)).toEqual(evaluateRanking([...tied].reverse(), 1));
    const unknown = fixture.filter(r => r.eligibility === 'unknown');
    const result = evaluateRanking(unknown, 1);
    expect(result.precisionAtK.value).toBeNull();
    expect(result.recallAtK.value).toBeNull();
    expect(result.ndcgAtK).toBeNull();
    expect(result.calibration.ece).toBeNull();
  });
  test('candidate and employer leakage across train/test is rejected', () => {
    const train = [fixture[0]];
    expect(() => assertDisjointSplit(train, [{ ...fixture[3], candidateId: fixture[0].candidateId }])).toThrow('leakage');
    expect(() => assertDisjointSplit(train, [{ ...fixture[3], employerId: fixture[0].employerId }])).toThrow('leakage');
    expect(() => assertDisjointSplit(train, [fixture[4]])).not.toThrow();
  });
});
