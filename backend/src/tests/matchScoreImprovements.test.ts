import { describe, expect, test } from 'bun:test';
import { rankJobsBatch } from '../modules/jobs/ranking.js';
import { scoreJdRubric } from '../modules/analysis/jdRubric.js';
import { matchJd } from '../modules/jd/matcher.js';
import { parseJd } from '../modules/jd/jdParser.js';

const studentProfile = (overrides: any = {}) => ({
  skills: ['React', 'TypeScript', 'Node.js', 'Express.js', 'PostgreSQL', 'Git', 'AWS'],
  skillsNormalized: ['React', 'TypeScript', 'Node.js', 'Express.js', 'PostgreSQL', 'Git', 'AWS'],
  experience: [
    {
      title: 'Full Stack Developer Intern',
      company: 'Tech Corp',
      startDate: 'Jan 2026',
      endDate: 'Present',
      isCurrent: true,
      description: 'Built React.js frontend interfaces and Node.js REST APIs with PostgreSQL.',
      kind: 'internship',
    },
  ],
  projects: [
    {
      title: 'JobHunter',
      description: 'React, TypeScript, Express.js, PostgreSQL, AWS SageMaker. Built and deployed resume analysis and job matching.',
      kind: 'project',
    },
  ],
  education: [
    {
      degree: 'Bachelor of Technology',
      field: 'Computer Science Engineering',
      institution: 'IIIT Vadodara',
      year: '2027',
      completionDate: 'May 2027',
      completed: false,
      raw: 'IIIT Vadodara | Bachelor of Technology in Computer Science Engineering 2023 - 2027',
    },
  ],
  seniority: 'intern',
  totalExperienceYears: 0.33,
  contactSignals: { hasEmail: true, hasPhone: true, hasLinkedIn: true, hasGithub: true },
  summary: 'Passionate developer',
  languages: ['English', 'Hindi'],
  ...overrides,
} as any);

const makeJob = (title: string, description: string, descriptionQuality: 'full' | 'snippet' = 'full') => ({
  title,
  description,
  location: 'Noida, Uttar Pradesh',
  workMode: 'onsite',
  source: 'test',
  externalId: title,
  descriptionQuality,
} as any);

describe('Match score improvements and bug fixes', () => {
  test('CS Engineering student with in-progress B.Tech gets full 10/10 education points for intern role requesting CS/IT degree', async () => {
    const oscormJd = `Job Title: Full Stack Developer Intern
Key Responsibilities:
- Work with React.js to create responsive and user-friendly frontend interfaces.
- Learn and contribute to backend development using Node.js and Express.js.
- Work with databases such as PostgreSQL or MongoDB.
Required Skills & Qualifications:
- Pursuing or recently completed B.Tech / B.E. / BCA / MCA in Computer Science or Information Technology.
- Basic understanding of React.js and Node.js.
- Git/GitHub knowledge.`;

    const [result] = await rankJobsBatch(studentProfile(), [makeJob('Full Stack Developer Intern', oscormJd)], {
      preferences: { locations: ['Noida'] },
      embeddingProvider: {
        modelId: 'mock-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.7, 0.7]),
          modelId: 'mock-test',
          dimension: 2,
        }),
      },
    });

    expect(result.breakdown.domainEducation).toBe(10);
    expect(result.evidence).toContain('Degree in progress/pursuing meets early-career or internship qualification');
  });

  test('student gets 7/10 soft credit for holding technical education when job has no degree requirement', async () => {
    const startupJd = `Title: Full Stack Developer
Responsibilities:
- Build React interfaces and Node.js backend.
Required:
- React, Node.js, TypeScript.`;

    const [result] = await rankJobsBatch(studentProfile(), [makeJob('Full Stack Developer', startupJd)], {
      preferences: { locations: ['Noida'] },
      embeddingProvider: {
        modelId: 'mock-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.7, 0.7]),
          modelId: 'mock-test',
          dimension: 2,
        }),
      },
    });

    expect(result.breakdown.domainEducation).toBe(7);
    expect(result.evidence).toContain('Candidate holds relevant technical education; no strict degree requirement stated');
  });

  test('role title without explicit seniority (e.g. Full Stack Developer) gets 8/15 baseline points instead of 0', async () => {
    const dmcJd = `Title: Full Stack Developer
Responsibilities:
- Develop web applications using React and Node.js.
Required:
- React, JavaScript.`;

    const [result] = await rankJobsBatch(studentProfile(), [makeJob('Full Stack Developer', dmcJd)], {
      preferences: { locations: ['Noida'] },
      embeddingProvider: {
        modelId: 'mock-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.7, 0.7]),
          modelId: 'mock-test',
          dimension: 2,
        }),
      },
    });

    expect(result.breakdown.seniority).toBe(8);
  });

  test('unstructured job descriptions earn semantic similarity points against resume chunks', async () => {
    const unformattedJd = `We are looking for a backend developer interested in Node.js, Express.js, REST APIs, and PostgreSQL. The developer will work closely with engineering teams to develop and maintain backend services.`;

    const [result] = await rankJobsBatch(studentProfile(), [makeJob('Backend Developer', unformattedJd)], {
      preferences: { locations: ['Noida'] },
      embeddingProvider: {
        modelId: 'semantic-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.75, 0.65]),
          modelId: 'semantic-test',
          dimension: 2,
        }),
      },
    });

    expect(result.breakdown.responsibilitySemantic).toBeGreaterThanOrEqual(15);
    expect(result.evidence.some(e => e.includes('Job description semantic alignment'))).toBe(true);
  });

  test('jdRubric awards education points and eligible status for in-progress student applying to intern role', () => {
    const jdText = `Job Title: Full Stack Developer Intern
Qualifications:
Pursuing B.Tech or B.E. in Computer Science.
Required Skills:
React and Node.js.`;

    const parsed = parseJd(jdText);
    const match = matchJd(studentProfile(), parsed);
    const rubric = scoreJdRubric(studentProfile(), parsed, match, []);

    expect(rubric.eligibilityChecks.education).toBe('evidenced');
    expect(rubric.breakdown.education).toBe(10);
    expect(rubric.eligibility).toBe('eligible');
  });
});
