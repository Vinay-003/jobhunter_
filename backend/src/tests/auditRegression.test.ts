import { describe, expect, it } from 'bun:test';
import { parseJd } from '../modules/jd/jdParser.js';
import { scoreReadiness } from '../modules/ats/readinessScorer.js';
import { buildResumeProfile } from '../modules/parsing/resumeProfile.js';
import type { ParsedDocument } from '../modules/parsing/pdfParser.js';
import { detectJobSeniority } from '../modules/jobs/ranking.js';

function document(): ParsedDocument {
  const text = `Candidate\ncandidate@example.test\nEducation\nInstitute September 2023 – May 2027\nBachelor of Technology in Computer Science\nExperience\nExample Company March 2026 – July 2026\nSoftware Development Intern\n• Built Python APIs serving 100 users and reduced latency by 25%.\n• Integrated PostgreSQL and implemented authentication for 3 services.\nProjects\n• Built a React application with automated tests and SQL persistence.\nSkills\nPython, React, SQL, PostgreSQL, Git\nLeadership\nEditorial Club January 2024 – January 2025\nJoint Secretary\n• Mentored 20 members and reviewed editorial drafts.`;
  return { pages: [text], normalizedText: text, sections: {
    education: 'Institute September 2023 – May 2027\nBachelor of Technology in Computer Science',
    experience: 'Example Company March 2026 – July 2026\nSoftware Development Intern\n• Built Python APIs serving 100 users and reduced latency by 25%.\n• Integrated PostgreSQL and implemented authentication for 3 services.',
    projects: '• Built a React application with automated tests and SQL persistence.',
    skills: 'Python, React, SQL, PostgreSQL, Git',
    leadership: 'Editorial Club January 2024 – January 2025\nJoint Secretary\n• Mentored 20 members and reviewed editorial drafts.',
  }, layoutSignals: { pageCount: 1, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: text.length, hasImages: false, textDensity: text.length }, extractionConfidence: .92, detectedAsScanned: false, sha256: 'synthetic-audit-fixture', charCount: text.length };
}

describe('audit regressions: factual parsing and explainable scoring', () => {
  it('preserves C++ and C# as separate skills, not C', () => {
    const skills = parseJd('Developer\nRequired Skills\nC++, C#').requiredSkills;
    expect(skills).toContain('C++'); expect(skills).toContain('C#'); expect(skills).not.toContain('C');
  });
  it('understands spelled-out Object-Oriented Programming', () => {
    expect(parseJd('Developer\nRequired Skills\nObject-Oriented Programming').requiredSkills).toContain('OOP');
  });
  it('takes the lower bound of professional experience ranges', () => {
    expect(parseJd('Senior Developer\n4–7+ years of professional software development experience.').yearsExperience).toBe(4);
    expect(parseJd('Developer\n3–5 years experience.').yearsExperience).toBe(3);
  });
  it('does not treat a manager or employer leading as candidate seniority', () => {
    expect(detectJobSeniority('Junior Software Engineer', 'Join a leading company and collaborate with product managers.')).toBe('junior');
  });
  it('does not promote a junior job because it mentions senior coworkers', () => {
    expect(parseJd('Junior Developer\nCollaborate with senior engineers.').seniority).toBe('junior');
  });
  it('counts internship months, not the editorial club year', () => {
    const profile = buildResumeProfile(document());
    expect(profile.totalExperienceYears).toBeGreaterThan(0);
    expect(profile.totalExperienceYears).toBeLessThan(.6);
  });
  it('reconciles Health total with its visible category points', () => {
    const doc = document(); const result = scoreReadiness(doc, buildResumeProfile(doc), 'entry');
    expect(result.score).toBeCloseTo(result.breakdown.reduce((sum, c) => sum + c.pointsAwarded, 0), 1);
  });
  it('does not penalize omitting an optional summary section', () => {
    const doc = document(); const profile = buildResumeProfile(doc);
    expect(scoreReadiness(doc, profile, 'entry').score).toBe(scoreReadiness({ ...doc, sections: { ...doc.sections, summary: 'Software developer.' } }, profile, 'entry').score);
  });
});
