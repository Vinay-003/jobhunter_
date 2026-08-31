import { describe, expect, it } from 'bun:test';
import { scoreReadiness } from '../modules/ats/readinessScorer.js';
import type { ParsedDocument } from '../modules/parsing/pdfParser.js';
import type { ResumeProfile } from '../modules/parsing/resumeProfile.js';

const strongText = `ANAS KHAN
anas@example.com | +91 9876543210 | linkedin.com/in/anas | github.com/anas
EDUCATION
B.Tech Computer Science 2026
SKILLS
TypeScript, React, Node.js, PostgreSQL, AWS, Docker, Python, Git
EXPERIENCE
Software Development Intern | Mar 2026 - Present
• Built 5 ad formats across 3 languages, reducing manual setup time by 45%.
• Automated analytics ingestion from 4 sources and cut reporting latency by 60%.
• Optimized checkout flows, improving mobile completion by 18%.
PROJECTS
JobHunter
• Engineered an ATS analysis pipeline processing 120 resumes with 92% parser success.
• Deployed a secure API and reduced repeated provider calls by 35% through caching.
• Integrated PostgreSQL and private storage, supporting 3 isolated environments.`;

function doc(text = strongText, overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    pages: [text],
    normalizedText: text,
    sections: { education: 'Education', skills: 'Skills', experience: 'Experience', projects: 'Projects' },
    layoutSignals: { pageCount: 1, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: text.length, hasImages: false, textDensity: text.length },
    extractionConfidence: 0.95,
    detectedAsScanned: false,
    sha256: 'fixture',
    charCount: text.length,
    ...overrides,
  };
}

function profile(overrides: Partial<ResumeProfile> = {}): ResumeProfile {
  return {
    skills: ['typescript', 'react', 'node.js', 'postgresql', 'aws', 'docker', 'python', 'git'],
    skillsNormalized: ['typescript', 'react', 'node.js', 'postgresql', 'aws', 'docker', 'python', 'git'],
    education: [{ degree: 'B.Tech', institution: 'IIIT', year: '2026', raw: 'B.Tech 2026' }],
    experience: [{ title: 'Software Development Intern', company: 'A', startDate: 'Mar 2026', endDate: 'Present', isCurrent: true, description: 'Built systems and improved metrics by 45%.' }],
    totalExperienceYears: 1,
    seniority: 'junior',
    contactSignals: { hasEmail: true, hasPhone: true, hasLinkedIn: true, hasGithub: true },
    summary: null,
    languages: [],
    ...overrides,
  } as ResumeProfile;
}

describe('Resume Health v3', () => {
  it('has an exact 100 point rubric and a bounded score', () => {
    const result = scoreReadiness(doc(), profile(), 'entry');
    expect(result.breakdown.reduce((sum, category) => sum + category.pointsPossible, 0)).toBe(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.methodology.mode).toBe('rule_based_no_jd');
  });

  it('rewards evidence-rich resumes over thin responsibility lists', () => {
    const weakText = `John Doe\njohn@example.com\nSKILLS\nPython\nI was responsible for things.\nI helped with tasks.\nI worked on stuff.`;
    const weak = scoreReadiness(
      doc(weakText, { sections: { skills: 'Python' }, charCount: weakText.length, extractionConfidence: 0.8 }),
      profile({ skills: ['python'], skillsNormalized: ['python'], education: [], experience: [], contactSignals: { hasEmail: true, hasPhone: false, hasLinkedIn: false, hasGithub: false } }),
      'entry',
    );
    const strong = scoreReadiness(doc(), profile(), 'entry');
    expect(strong.score).toBeGreaterThan(weak.score + 20);
    expect(strong.metrics.quantifiedBulletCount).toBeGreaterThan(weak.metrics.quantifiedBulletCount);
  });

  it('does not require a summary/objective to earn generic readiness points', () => {
    const withoutSummary = scoreReadiness(doc(), profile({ summary: null }), 'entry');
    const withSummary = scoreReadiness(doc(), profile({ summary: 'Software developer focused on reliable web systems.' }), 'entry');
    expect(withoutSummary.score).toBe(withSummary.score);
  });

  it('does not award points merely because inferred seniority matches a selected level', () => {
    const junior = scoreReadiness(doc(), profile({ seniority: 'junior' }), 'entry');
    const seniorLabelOnly = scoreReadiness(doc(), profile({ seniority: 'senior' }), 'entry');
    expect(junior.score).toBe(seniorLabelOnly.score);
  });

  it('flags parser/layout risk', () => {
    const clean = scoreReadiness(doc(), profile(), 'entry');
    const risky = scoreReadiness(doc(strongText, {
      layoutSignals: { pageCount: 3, hasMultiColumnRisk: true, excessiveTables: true, avgCharsPerPage: 600, hasImages: false, textDensity: 600 },
      extractionConfidence: 0.52,
    }), profile(), 'entry');
    expect(clean.score).toBeGreaterThan(risky.score);
    expect(risky.rules.some((rule) => rule.category === 'parseability' && rule.status !== 'pass')).toBe(true);
  });

  it('returns prioritized, actionable fixes rather than only a number', () => {
    const weakText = `Jane Doe\nSKILLS\nJava\nResponsible for tasks\nHelped team\nWorked on features`;
    const result = scoreReadiness(
      doc(weakText, { sections: { skills: 'Java' }, charCount: weakText.length }),
      profile({ skills: ['java'], skillsNormalized: ['java'], education: [], experience: [], contactSignals: { hasEmail: false, hasPhone: false, hasLinkedIn: false, hasGithub: false } }),
      'entry',
    );
    expect(result.priorityActions.length).toBeGreaterThan(0);
    expect(result.priorityActions[0].how.length).toBeGreaterThan(10);
    expect(result.issueCount).toBeGreaterThan(0);
  });
});
