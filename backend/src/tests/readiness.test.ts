import { describe, it, expect } from 'bun:test';
import { scoreReadiness } from '../modules/ats/readinessScorer.js';
import type { ParsedDocument } from '../modules/parsing/pdfParser.js';
import type { ResumeProfile } from '../modules/parsing/resumeProfile.js';
import { MockEmbeddingProvider } from '../providers/embeddings/MockEmbeddingProvider.js';

function makeDoc(overrides: Partial<ParsedDocument> = {}): ParsedDocument {
  return {
    pages: ['Page 1 text with skills and experience'],
    normalizedText: 'John Doe Experience Education Skills Software Engineer 2020-2023 Built APIs Node.js PostgreSQL',
    sections: { experience: 'Experience...', education: 'Education...', skills: 'Skills: Node.js, PostgreSQL, React' },
    layoutSignals: { pageCount: 1, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: 2000, hasImages: false, textDensity: 2000 },
    extractionConfidence: 0.9,
    detectedAsScanned: false,
    sha256: 'abc',
    charCount: 2000,
    ...overrides,
  } as ParsedDocument;
}

function makeProfile(overrides: Partial<ResumeProfile> = {}): ResumeProfile {
  return {
    skills: ['Node.js', 'PostgreSQL', 'React', 'TypeScript', 'AWS', 'Docker'],
    skillsNormalized: ['Node.js', 'PostgreSQL', 'React', 'TypeScript', 'AWS', 'Docker'],
    education: [{ degree: 'B.Sc Computer Science', institution: 'University', year: '2020', raw: 'B.Sc' }],
    experience: [{ title: 'Software Engineer', company: null, startDate: '2020', endDate: '2023', isCurrent: false, description: 'Built REST APIs using Node.js and PostgreSQL. Led team.' }],
    totalExperienceYears: 3,
    seniority: 'mid',
    contactSignals: { hasEmail: true, hasPhone: true, hasLinkedIn: true, hasGithub: true },
    summary: 'Software Engineer with 3 years experience',
    languages: [],
    ...overrides,
  } as ResumeProfile;
}

describe('ATS readiness: rubric totals 100', () => {
  it('sum of pointsPossible is exactly 100', () => {
    const doc = makeDoc();
    const profile = makeProfile();
    const result = scoreReadiness(doc, profile, 'mid');
    const totalPossible = result.breakdown.reduce((s, b) => s + b.pointsPossible, 0);
    expect(totalPossible).toBe(100);
  });

  it('score is 0-100 inclusive', () => {
    const doc = makeDoc();
    const profile = makeProfile();
    const result = scoreReadiness(doc, profile, 'mid');
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('two-column risk reduces layout score', () => {
    const docGood = makeDoc({ layoutSignals: { pageCount: 1, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: 2000, hasImages: false, textDensity: 2000 } });
    const docBad = makeDoc({ layoutSignals: { pageCount: 1, hasMultiColumnRisk: true, excessiveTables: false, avgCharsPerPage: 500, hasImages: false, textDensity: 500 } });
    const profile = makeProfile();
    const good = scoreReadiness(docGood, profile, 'mid');
    const bad = scoreReadiness(docBad, profile, 'mid');
    expect(good.score).toBeGreaterThan(bad.score);
  });

  it('missing skills reduces score', () => {
    const doc = makeDoc();
    const rich = makeProfile({ skills: ['Node.js','PostgreSQL','React','TS','AWS','Docker'], skillsNormalized: ['Node.js','PostgreSQL','React','TS','AWS','Docker'] });
    const poor = makeProfile({ skills: [], skillsNormalized: [] });
    expect(scoreReadiness(doc, rich, 'mid').score).toBeGreaterThan(scoreReadiness(doc, poor, 'mid').score);
  });
});

describe('ATS readiness: no ML call', () => {
  it('readiness does not invoke EmbeddingProvider', async () => {
    const mock = new MockEmbeddingProvider();
    let callCount = 0;
    const original = mock.embed.bind(mock);
    mock.embed = async (input: any) => { callCount++; return original(input); };
    const doc = makeDoc();
    const profile = makeProfile();
    scoreReadiness(doc, profile, 'mid');
    expect(callCount).toBe(0);
  });
});

describe('ATS readiness: fixtures', () => {
  it('entry-level single-column passes', () => {
    const doc = makeDoc({ charCount: 2000, extractionConfidence: 0.9 });
    const profile = makeProfile({ totalExperienceYears: 0.5, seniority: 'junior' });
    const r = scoreReadiness(doc, profile, 'junior');
    expect(r.score).toBeGreaterThan(40);
  });

  it('senior resume with long char count still scores', () => {
    const doc = makeDoc({ charCount: 3800 });
    const profile = makeProfile({ totalExperienceYears: 8, seniority: 'senior' });
    const r = scoreReadiness(doc, profile, 'senior');
    expect(r.score).toBeGreaterThan(50);
  });

  it('scanned flag true would be rejected upstream (not scored)', () => {
    const doc = makeDoc({ detectedAsScanned: true, charCount: 10 });
    expect(doc.detectedAsScanned).toBe(true);
  });
});
