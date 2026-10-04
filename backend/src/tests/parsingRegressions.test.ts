import { describe, expect, it } from 'bun:test';
import { buildResumeProfile, PROFILE_VERSION } from '../modules/parsing/resumeProfile.js';
import { parseJd } from '../modules/jd/jdParser.js';
import { detectSeniority, normalizeSeniority, seniorityPenalty } from '../modules/jobs/seniority.js';
import type { ParsedDocument } from '../modules/parsing/pdfParser.js';
import { detectSections } from '../modules/parsing/pdfParser.js';

function document(text: string, sections: Record<string, string>): ParsedDocument {
  return { pages: [text], normalizedText: text, sections, layoutSignals: { pageCount: 1, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: text.length, hasImages: false, textDensity: text.length }, extractionConfidence: 1, detectedAsScanned: false, sha256: 'test', charCount: text.length };
}

describe('profile evidence boundaries', () => {
  it('keeps technical category headings inside skills and excludes human languages', () => {
    const text = 'Technical Skills\nLanguages: Python, TypeScript, JavaScript, C/C++, Java, SQL\nFrameworks & Databases: React, Drizzle, Supabase\nAutomation & Cloud: Docker, SageMaker\nPlatforms & APIs: OAuth, Postman\nCore CS: Data Structures\nLanguages: English, Hindi';
    const profile = buildResumeProfile(document(text, {
      skills: 'Technical Skills\nLanguages: Python, TypeScript, JavaScript, C/C++, Java, SQL\nFrameworks & Databases: React, Drizzle, Supabase\nAutomation & Cloud: Docker, SageMaker\nPlatforms & APIs: OAuth, Postman\nCore CS: Data Structures',
      languages: 'Languages: English, Hindi',
    }));
    expect(profile.declaredSkills).toEqual(expect.arrayContaining(['Python', 'TypeScript', 'JavaScript', 'C/C++', 'Java', 'SQL', 'React', 'Drizzle', 'Supabase', 'SageMaker', 'OAuth', 'Postman']));
    expect(profile.declaredSkills).not.toContain('English');
    expect(profile.declaredSkills).not.toContain('Hindi');
    expect(profile.skillsNormalized).toContain('JavaScript');
  });

  it('retains programming languages from a technical Languages: prefix', () => {
    const sections = detectSections('Technical Skills\nLanguages: Python, TypeScript, JavaScript, C/C++, Java, SQL\nFrameworks & Databases: FastAPI, React.js\nAutomation & Cloud: Docker\nLeadership\nStudent club coordinator');
    const profile = buildResumeProfile(document('Technical Skills', sections));
    expect(profile.declaredSkills).toEqual(expect.arrayContaining(['Python', 'TypeScript', 'JavaScript', 'C/C++', 'Java', 'SQL', 'FastAPI', 'React', 'Docker']));
    const natural = detectSections('Technical Skills\nFrameworks: React\nLanguages: English, Hindi');
    const naturalProfile = buildResumeProfile(document('Technical Skills', natural));
    expect(naturalProfile.declaredSkills).not.toEqual(expect.arrayContaining(['English', 'Hindi']));
  });

  it('keeps declared and demonstrated technologies distinct across alternate headings', () => {
    const text = 'Technical Proficiencies\nLanguages: Python3, JS\nFrameworks: React.js, FastAPI\nTools: Terraform, Kafka\nEmployment History\nAcme | Developer | Jan 2022 – Jan 2024\n• Built Java APIs with Docker.\nSelected Projects\nPortal\n• Used PostgreSQL and Kubernetes.\nSummary\nInterested in Rust.';
    const profile = buildResumeProfile(document(text, { 'technical proficiencies': 'Languages: Python3, JS\nFrameworks: React.js, FastAPI\nTools: Terraform, Kafka', 'employment history': 'Acme | Developer | Jan 2022 – Jan 2024\n• Built Java APIs with Docker.', 'selected projects': 'Portal\n• Used PostgreSQL and Kubernetes.', summary: 'Interested in Rust.' }));
    expect(profile.declaredSkills).toEqual(expect.arrayContaining(['Python', 'JavaScript', 'React', 'FastAPI', 'Terraform', 'Kafka']));
    expect(profile.demonstratedSkills).toEqual(expect.arrayContaining(['Java', 'Docker', 'PostgreSQL', 'Kubernetes']));
    expect(profile.demonstratedSkills).not.toContain('Rust');
    expect(profile.demonstratedSkills).not.toContain('Python');
    expect(profile.skillsNormalized).toEqual(expect.arrayContaining(['Python', 'Java']));
    expect(profile.experience).toHaveLength(1);
    expect(profile.projects).toHaveLength(1);
    expect(PROFILE_VERSION).not.toBe('4.0.0');
  });
});

describe('JD bounded evidence', () => {
  it('parses inline requirements, preferences and responsibility prose without headings', () => {
    const jd = parseJd('Senior Backend Engineer\nWe are a company with 20 years of history.\nYou will design distributed services with your team.\nMust have: Python or Java; Docker and Kubernetes.\nNice to have: Terraform, Kafka.\nWork with senior engineers.');
    expect(jd.seniority).toBe('senior');
    expect(jd.yearsExperience).toBeNull();
    expect(jd.requirementGroups?.some(g => g.required && g.anyOf.includes('Python') && g.anyOf.includes('Java'))).toBe(true);
    expect(jd.requiredSkills).toEqual(expect.arrayContaining(['Docker', 'Kubernetes']));
    expect(jd.preferredSkills).toEqual(expect.arrayContaining(['Terraform', 'Kafka']));
    expect(jd.responsibilities).toContain('You will design distributed services with your team.');
  });
  it('ignores negated requirements and binds years to professional experience', () => {
    const jd = parseJd('Backend Engineer\nRequired: 3+ years of professional experience with JavaScript. No Java required.\nPreferred: 5 years of experience with Python.');
    expect(jd.minYears).toBe(3);
    expect(jd.requiredSkills).toContain('JavaScript');
    expect(jd.requiredSkills).not.toContain('Java');
    expect(jd.preferredSkills).toContain('Python');
  });
});

describe('canonical seniority', () => {
  it('normalizes legacy and detects title before coworker references', () => {
    expect(normalizeSeniority('junior')).toBe('entry');
    expect(normalizeSeniority('lead')).toBe('principal');
    expect(normalizeSeniority('student')).toBe('intern');
    expect(detectSeniority('Junior Developer', 'Collaborate with senior engineers; 10 years in business')).toBe('entry');
    expect(detectSeniority('Engineer', 'Requires 5+ years of professional experience')).toBe('senior');
    expect(detectSeniority('Engineer', 'A company with 20 years of history')).toBeNull();
  });
  it('returns positive asymmetric penalties', () => {
    expect(seniorityPenalty('intern', 'mid')).toBe(20);
    expect(seniorityPenalty('intern', 'senior')).toBe(40);
    expect(seniorityPenalty('intern', 'principal')).toBe(50);
    expect(seniorityPenalty('entry', 'senior')).toBe(35);
    expect(seniorityPenalty('mid', 'senior')).toBe(5);
    expect(seniorityPenalty('mid', 'principal')).toBe(20);
    expect(seniorityPenalty('senior', 'principal')).toBe(5);
    expect(seniorityPenalty('principal', 'entry')).toBe(0);
  });
});
