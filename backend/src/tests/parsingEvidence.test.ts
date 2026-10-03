import { describe, expect, it } from 'bun:test';
import { extractSkillMatches } from '../modules/parsing/skillExtractor.js';
import { buildDocumentBlocks } from '../modules/parsing/documentBlocks.js';
import { buildResumeProfile, unionMonths, type ExperienceEntry } from '../modules/parsing/resumeProfile.js';
import { parseJd } from '../modules/jd/jdParser.js';
import { matchJd } from '../modules/jd/matcher.js';
import { scoreReadiness } from '../modules/ats/readinessScorer.js';
import type { ParsedDocument } from '../modules/parsing/pdfParser.js';

const text = `Candidate\ncandidate@example.test\nEducation\nExample Institute | Bachelor of Technology in Computer Science | May 2027\nExperience\nExample Labs | Software Development Intern | March 2026 – July 2026\n• Built C++ APIs serving 100 users and reduced latency by 25%.\n  Integrated PostgreSQL across 3 services.\nProjects\nSample Project\n• Developed React features for 5 formats.\nLeadership\nEditorial Club | Joint Secretary | January 2024 – January 2025\n• Mentored 20 members.\nTechnical Skills\nC++, C#, React, PostgreSQL`;
const sections = {
  education: 'Example Institute | Bachelor of Technology in Computer Science | May 2027',
  experience: 'Example Labs | Software Development Intern | March 2026 – July 2026\n• Built C++ APIs serving 100 users and reduced latency by 25%.\n  Integrated PostgreSQL across 3 services.',
  projects: 'Sample Project\n• Developed React features for 5 formats.',
  leadership: 'Editorial Club | Joint Secretary | January 2024 – January 2025\n• Mentored 20 members.',
  skills: 'C++, C#, React, PostgreSQL',
};
const doc: ParsedDocument = { pages: [text], normalizedText: text, sections, layoutSignals: { pageCount: 1, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: text.length, hasImages: false, textDensity: text.length }, extractionConfidence: .92, detectedAsScanned: false, sha256: 'synthetic', charCount: text.length };

describe('structured parsing evidence', () => {
  it('keeps symbol-bearing languages separate and rejects substrings', () => {
    expect(extractSkillMatches('C++, C#, .NET, Node.js, JavaScript').map(s => s.skill)).toEqual(['C++', 'C#', '.NET', 'Node.js', 'JavaScript']);
  });
  it('joins multiline physical bullets with provenance and omits headings', () => {
    const blocks = buildDocumentBlocks(doc);
    expect(blocks.bullets).toHaveLength(3);
    expect(blocks.bullets[0].text).toContain('Integrated PostgreSQL');
    expect(blocks.bullets.map(b => b.section)).toEqual(['experience', 'projects', 'leadership']);
  });
  it('counts four internship months, not overlapping club time, and marks future graduation incomplete', () => {
    const profile = buildResumeProfile(doc, new Date('2026-10-03'));
    expect(profile.totalExperienceYears).toBeCloseTo(4 / 12, 1);
    expect(profile.experience).toHaveLength(1);
    expect(profile.leadership).toHaveLength(1);
    expect(profile.projects).toHaveLength(1);
    expect(profile.education[0].completed).toBe(false);
    expect(profile.summary).toBeNull();
  });
  it('uses bounded JD sections and treats at-least-one as a single OR requirement', () => {
    const jd = parseJd(`# Junior Developer\n## Role Overview\nCollaborate with senior engineers.\n## Responsibilities\n- Build reliable APIs.\n- Maintain services.\n## Required Qualifications\n- At least one of Python, Java or C++.\n## Preferred Qualifications\n- React is a plus.\n## Benefits\n- Free lunch.`);
    expect(jd.seniority).toBe('junior');
    expect(jd.responsibilities).toEqual(['Build reliable APIs.', 'Maintain services.']);
    expect(jd.requirementGroups?.filter(g => g.required)).toHaveLength(1);
    expect(matchJd({ ...buildResumeProfile(doc), skillsNormalized: ['C++'], skills: ['C++'] }, jd).missingRequired).toEqual([]);
  });
  it('counts only professional bullets, percentages and visible Health points', () => {
    const result = scoreReadiness(doc, buildResumeProfile(doc), 'entry');
    expect(result.metrics.bulletCount).toBe(2);
    expect(result.metrics.quantifiedBulletCount).toBe(2);
    expect(result.score).toBeCloseTo(result.breakdown.reduce((sum, c) => sum + c.pointsAwarded, 0), 1);
  });
  it('unions overlapping intervals and freezes current work at evaluation date', () => {
    const dated = (startDate: string, endDate: string): ExperienceEntry => ({ title: 'Engineer', company: 'Example', startDate, endDate, isCurrent: endDate === 'Present', description: null });
    expect(unionMonths([dated('March 2026', 'July 2026'), dated('May 2026', 'Present')], new Date('2026-10-03'))).toBe(7);
    expect(unionMonths([dated('2020', '2022'), dated('2021', '2023')], new Date('2026-10-03'))).toBe(47);
    expect(unionMonths([dated('unknown', 'Present')], new Date('2026-10-03'))).toBeNull();
  });
  it('does not count a weak phrase twice or a continuation as a second achievement', () => {
    const weakText = text.replace('Built C++ APIs serving 100 users and reduced latency by 25%.', 'Worked on C++ APIs serving 100 users and reduced latency by 25%.');
    const weakDoc = { ...doc, pages: [weakText], normalizedText: weakText, sections: { ...sections, experience: sections.experience.replace('Built C++', 'Worked on C++') } };
    const result = scoreReadiness(weakDoc, buildResumeProfile(weakDoc), 'entry');
    expect(result.metrics.bulletCount).toBe(2);
    expect(result.metrics.weakPhraseHits).toBe(1);
  });
  it('uses graduation end of a date range and keeps company, role and internship months separate', () => {
    const body = `Example Institute August 2023 – May 2027\nBachelor of Technology in Computer Science\nExperience\nExample Labs March 2026 – July 2026\nSoftware Development Intern, Backend Platform Team\n• Built an API.`;
    const parsed = { ...doc, normalizedText: body, pages: [body], sections: {
      education: 'Example Institute August 2023 – May 2027\nBachelor of Technology in Computer Science',
      experience: 'Example Labs March 2026 – July 2026\nSoftware Development Intern, Backend Platform Team\n• Built an API.',
    } };
    const profile = buildResumeProfile(parsed, new Date('2026-10-03'));
    expect(profile.education[0].year).toBe('2027');
    expect(profile.education[0].completionDate).toBe('May 2027');
    expect(profile.education[0].completed).toBe(false);
    expect(profile.experience[0].company).toBe('Example Labs');
    expect(profile.experience[0].title).toBe('Software Development Intern, Backend Platform Team');
    expect(profile.experience[0].kind).toBe('internship');
    expect(profile.internshipYears).toBeCloseTo(4 / 12, 1);
  });
  it('does not turn wrapped project prose into separate projects', () => {
    const body = `Projects\nJobHunter\nBuilt a full-stack resume analysis system using React and PostgreSQL\nwith local embeddings and deterministic ranking.\n• Improved retrieval for 3 sources.\nPortfolio\n• Deployed a responsive UI.`;
    const parsed = { ...doc, normalizedText: body, pages: [body], sections: { projects: body } };
    const projects = buildResumeProfile(parsed).projects ?? [];
    expect(projects.map(project => project.title)).toEqual(['JobHunter', 'Portfolio']);
    expect(projects[0].description).toContain('with local embeddings');
  });
  it('groups nested language lists as one alternative, bounded by next parent bullet and section', () => {
    const jd = parseJd(`# Junior Engineer\n## Required Skills\n- Proficiency in at least one programming language such as:\n  - Java\n  - C++\n  - Python\n  - JavaScript/TypeScript\n- Understanding of Object-Oriented Programming.\n## Preferred Skills\n- React or Django.\n## Benefits\n- Docker laptop provided.`);
    const required = jd.requirementGroups?.filter(group => group.required) ?? [];
    expect(required).toHaveLength(2);
    expect(required[0].anyOf).toEqual(['Java', 'C++', 'Python', 'JavaScript', 'TypeScript']);
    expect(required[0].evidence).toContain('JavaScript/TypeScript');
    expect(required[1].allOf).toEqual(['OOP']);
    expect(jd.preferredSkills).toEqual(['React', 'Django']);
    expect(jd.requiredSkills).not.toContain('Docker');
    expect(matchJd({ ...buildResumeProfile(doc), skills: ['Python', 'OOP'], skillsNormalized: ['Python', 'OOP'] }, jd).missingRequired).toEqual([]);
  });
  it('canonicalizes whole alternate headings and does not merge unrelated blocks', () => {
    const source = `Work Experience\nExample Labs March 2026 – July 2026\nSoftware Development Intern\nProjects\nJobHunter\n• Built an API.\nTechnical Skills\nPython, Git\nLeadership\nEditorial Club\n• Mentored members.`;
    const parsed = { ...doc, normalizedText: source, pages: [source], sections: { 'work experience': 'Work Experience\nExample Labs March 2026 – July 2026\nSoftware Development Intern', 'technical skills': 'Technical Skills\nPython, Git', projects: 'Projects\nJobHunter\n• Built an API.', leadership: 'Leadership\nEditorial Club\n• Mentored members.' } };
    const profile = buildResumeProfile(parsed, new Date('2026-10-03'));
    expect(profile.experience).toHaveLength(1);
    expect(profile.experience[0].kind).toBe('internship');
    expect(profile.projects).toHaveLength(1);
    expect(scoreReadiness(parsed, profile, 'entry').metrics.bulletCount).toBe(1);
  });
});
