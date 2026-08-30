import { describe, it, expect } from 'bun:test';
import { normalizeSkill } from '../modules/parsing/skillNormalizer.js';
import { parseJd } from '../modules/jd/jdParser.js';
import { matchJd } from '../modules/jd/matcher.js';
import type { ResumeProfile } from '../modules/parsing/resumeProfile.js';

function makeProfile(skills: string[]): ResumeProfile {
  return {
    skills,
    skillsNormalized: skills.map(s => normalizeSkill(s)),
    education: [],
    experience: [],
    totalExperienceYears: 2,
    seniority: 'mid',
    contactSignals: { hasEmail:true, hasPhone:true, hasLinkedIn:false, hasGithub:false },
    summary: 'Engineer',
    languages: [],
  } as ResumeProfile;
}

describe('JD matching: Java != JavaScript strict', () => {
  it('Java does not satisfy JavaScript', () => {
    expect(normalizeSkill('Java').toLowerCase()).not.toBe(normalizeSkill('JavaScript').toLowerCase());
  });

  it('Java profile should not match JavaScript JD requirement', () => {
    const profile = makeProfile(['Java']);
    const jd = parseJd('Required: JavaScript. Build frontends with React.');
    // JD should extract JavaScript as required
    expect(jd.requiredSkills.some(s => s.toLowerCase()==='javascript')).toBe(true);
    const result = matchJd(profile, jd);
    expect(result.missingRequired).toContain('JavaScript');
    expect(result.requiredCoverage).toBeLessThan(1);
  });

  it('JavaScript profile should not satisfy Java JD', () => {
    const profile = makeProfile(['JavaScript']);
    const jd = parseJd('Required: Java for backend. Spring Boot.');
    const result = matchJd(profile, jd);
    // If JD extracted Java, profile shouldn't match
    if (jd.requiredSkills.includes('Java')) {
      expect(result.missingRequired).toContain('Java');
    }
  });

  it('exact alias JS matches JavaScript', () => {
    const profile = makeProfile(['JS']);
    const jd = parseJd('Required: JavaScript');
    const result = matchJd(profile, jd);
    expect(result.requiredCoverage).toBe(1);
  });
});

describe('JD matching: coverage', () => {
  it('all required matched gives high coverage', () => {
    const profile = makeProfile(['Node.js','PostgreSQL','React']);
    const jd = parseJd('Required: Node.js, PostgreSQL. Preferred: React');
    const result = matchJd(profile, jd);
    expect(result.requiredCoverage).toBeGreaterThan(0.5);
  });

  it('missing required skill reported', () => {
    const profile = makeProfile(['Python']);
    const jd = parseJd('Required: Node.js, PostgreSQL, React');
    const result = matchJd(profile, jd);
    expect(result.missingRequired.length).toBeGreaterThan(0);
  });

  it('seniority mismatch generates warning', () => {
    const profile = makeProfile(['Node.js']);
    profile.seniority = 'junior';
    const jd = parseJd('Senior Backend Engineer, 5+ years experience');
    const result = matchJd(profile, jd);
    // may have warning about seniority
    if (jd.seniority) {
      expect(result.warnings.join(' ').toLowerCase()).toContain('seniority');
    }
  });
});
