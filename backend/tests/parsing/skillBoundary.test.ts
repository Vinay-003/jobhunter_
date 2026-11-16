import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractSkills } from '../../src/modules/parsing/skillExtractor.js';

describe('Skill Extractor: Single-Character & Single-Syllable Language Boundaries', () => {
  it('accurately extracts Go when used with "in Go for [purpose]"', () => {
    const text = 'Built high-throughput distributed microservices in Go for real-time telemetry processing.';
    const skills = extractSkills(text);
    assert.ok(skills.includes('Go'), `Expected "Go" to be extracted from "${text}", got: ${JSON.stringify(skills)}`);
  });

  it('accurately extracts Go at sentence boundary "in Go."', () => {
    const text = 'Architected and deployed cloud-native backend services in Go.';
    const skills = extractSkills(text);
    assert.ok(skills.includes('Go'), `Expected "Go" to be extracted from "${text}", got: ${JSON.stringify(skills)}`);
  });

  it('accurately extracts Go when written as "written in Go for [purpose]"', () => {
    const text = 'Event-driven caching proxy written in Go for low latency database access.';
    const skills = extractSkills(text);
    assert.ok(skills.includes('Go'), `Expected "Go" to be extracted from "${text}", got: ${JSON.stringify(skills)}`);
  });

  it('accurately extracts C when used with "in C for [purpose]"', () => {
    const text = 'Developed hardware abstraction firmware drivers in C for automotive microcontrollers.';
    const skills = extractSkills(text);
    assert.ok(skills.includes('C'), `Expected "C" to be extracted from "${text}", got: ${JSON.stringify(skills)}`);
  });

  it('accurately extracts C at sentence boundary "in C."', () => {
    const text = 'Kernel module optimization and low-level systems programming in C.';
    const skills = extractSkills(text);
    assert.ok(skills.includes('C'), `Expected "C" to be extracted from "${text}", got: ${JSON.stringify(skills)}`);
  });

  it('accurately extracts C when written as "written in C for [purpose]"', () => {
    const text = 'Real-time operating system kernel written in C for robotics telemetry.';
    const skills = extractSkills(text);
    assert.ok(skills.includes('C'), `Expected "C" to be extracted from "${text}", got: ${JSON.stringify(skills)}`);
  });

  it('does NOT falsely extract Go from common English verbs or idioms', () => {
    const phrases = [
      'Go to the market for office supplies',
      'Go ahead and proceed with the launch',
      'Ready to go live next week',
      'Way to go team',
      'Go for a walk after standup',
    ];

    for (const phrase of phrases) {
      const skills = extractSkills(phrase);
      assert.ok(!skills.includes('Go'), `False positive "Go" in English phrase: "${phrase}"`);
    }
  });

  it('does NOT falsely extract C from non-programming terms', () => {
    const phrases = [
      'Daily Vitamin C supplements provided in office',
      'Maintained a Grade C average in history',
      'Refer to Schedule C in the contract',
      'Appendix C contains benchmark data',
    ];

    for (const phrase of phrases) {
      const skills = extractSkills(phrase);
      assert.ok(!skills.includes('C'), `False positive "C" in non-programming phrase: "${phrase}"`);
    }
  });

  it('preserves C++ and C# without falsely extracting plain C', () => {
    const text = 'Experienced developer proficient in C++ and C# development.';
    const skills = extractSkills(text);
    assert.ok(skills.includes('C++'), 'Should extract C++');
    assert.ok(skills.includes('C#'), 'Should extract C#');
    assert.ok(!skills.includes('C'), 'Should NOT extract isolated C when only C++ and C# are present');
  });
});
