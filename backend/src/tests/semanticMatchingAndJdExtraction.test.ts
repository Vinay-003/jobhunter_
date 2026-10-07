import { describe, expect, test } from 'bun:test';
import { parseJd } from '../modules/jd/jdParser.js';
import { rankJobsBatch } from '../modules/jobs/ranking.js';

describe('Semantic matching and JD extraction improvements', () => {
  test('Rentickle JD with middle-dot bullets and compound heading parses required skills and responsibilities', () => {
    const rentickleJd = `Job Summary
Rentickle is seeking a motivated and talented Backend Developer Intern for a 6-month period. This position offers an exciting opportunity to gain hands-on experience in building scalable backend systems using Node.js, Express.js, NestJS, and AWS.

Key Responsibilities
· Develop and maintain scalable and efficient backend systems using Node.js, Express.js, and NestJS.
· Write clean, maintainable, and efficient code with a strong emphasis on TypeScript and JavaScript.
· Design and optimize database queries and manage data models for both SQL and MongoDB databases.
· Collaborate with front-end developers to integrate APIs and backend services seamlessly.
· Apply knowledge of data structures and algorithms to improve system performance and scalability.
· Implement and manage RESTful API services and integrate third-party APIs where necessary.
· Troubleshoot and debug backend issues, ensuring high availability and reliability of services.
· Work with cloud infrastructure using AWS services, Linux-based server environments, and Python for scripting/automation.

Required Skills & Qualifications
· Practical knowledge of the MERN Stack.
· Proficiency in JavaScript, TypeScript, Node.js, and Express.js.
· Familiarity with NestJS, SQL, and MongoDB.
· Strong understanding of data structures, algorithms, and problem-solving skills.
· Experience working with AWS cloud services (EC2, S3, Lambda, etc.) and Linux server management.`;

    const parsed = parseJd(rentickleJd);
    expect(parsed.responsibilities.length).toBe(8);
    expect(parsed.requiredSkills.length).toBeGreaterThanOrEqual(10);
    expect(parsed.requiredSkills).toContain('Node.js');
    expect(parsed.requiredSkills).toContain('Express');
    expect(parsed.requiredSkills).toContain('TypeScript');
    expect(parsed.requiredSkills).toContain('NestJS');
    expect(parsed.requiredSkills).toContain('AWS');
    expect(parsed.requiredSkills).toContain('MongoDB');
    expect(parsed.requirementGroups?.length).toBeGreaterThanOrEqual(4);
  });

  test('SAP ABAP job extracts enterprise skills and ranks candidate with missing ABAP/CDS/OData requirements', async () => {
    const sapJd = `Job Title: SAP ABAP & Backend Developer
Location: Bangalore, Karnataka
About the Role:
We are looking for an experienced SAP ABAP Backend Developer.

Required Skills:
- Extensive experience in OOPs ABAP, CDS Views, and OData service development.
- Hands-on experience with SAP HANA database optimization and RICEF components.
- Experience with SAP BTP and Fiori integration is a major plus.
- Understanding of RESTful architecture in RAP.`;

    const parsed = parseJd(sapJd);
    expect(parsed.requiredSkills).toContain('ABAP');
    expect(parsed.requiredSkills).toContain('CDS');
    expect(parsed.requiredSkills).toContain('OData');
    expect(parsed.requiredSkills).toContain('SAP HANA');
    expect(parsed.requiredSkills).toContain('RICEF');

    const candidateProfile = {
      skills: ['Python', 'Node.js', 'React', 'FastAPI', 'PostgreSQL', 'REST', 'Docker'],
      skillsNormalized: ['Python', 'Node.js', 'React', 'FastAPI', 'PostgreSQL', 'REST', 'Docker'],
      experience: [
        {
          title: 'Backend Developer Intern',
          description: 'Built REST APIs using Python and Node.js with PostgreSQL database.',
        },
      ],
      education: [],
      seniority: 'intern',
      totalExperienceYears: 0.5,
    } as any;

    const [ranked] = await rankJobsBatch(candidateProfile, [{
      title: 'SAP ABAP & Backend Developer',
      description: sapJd,
      company: 'Pontoonglobal',
      location: 'Bangalore, Karnataka',
      workMode: 'onsite',
      source: 'test',
      externalId: 'sap-1',
      descriptionQuality: 'full',
    } as any], {
      preferences: { locations: ['India'], targetRoles: ['Backend Developer'] },
      embeddingProvider: {
        modelId: 'mock-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.1, 0.9]),
          modelId: 'mock-test',
          dimension: 2,
        }),
      },
    });

    // Missing skills must capture the specialized requirements
    expect(ranked.missingSkills).toContain('ABAP');
    expect(ranked.missingSkills).toContain('CDS');
    expect(ranked.missingSkills).toContain('OData');

    // Required skill score must not be 30/30 (it was 30 previously!)
    expect(ranked.breakdown.requiredSkill).toBeLessThanOrEqual(15);
    expect(ranked.fitScore).toBeLessThanOrEqual(45);
  });

  test('providerSkills from metadata are included in job skills and evaluation', async () => {
    const jobWithProviderSkills = {
      title: 'Backend Developer',
      description: 'Looking for a developer to build scalable services.',
      company: 'Rentickle',
      location: 'Gurugram, Haryana',
      source: 'jobspipe',
      externalId: 'jp-1',
      providerSkills: ['NestJS', 'Node.js', 'PostgreSQL', 'Docker'],
      descriptionQuality: 'full',
    } as any;

    const candidateProfile = {
      skills: ['Node.js', 'PostgreSQL'],
      skillsNormalized: ['Node.js', 'PostgreSQL'],
      experience: [],
      education: [],
      seniority: 'intern',
    } as any;

    const [ranked] = await rankJobsBatch(candidateProfile, [jobWithProviderSkills], {
      preferences: { locations: ['India'] },
      embeddingProvider: {
        modelId: 'mock-test',
        embed: async ({ texts }: any) => ({
          vectors: texts.map(() => [0.5, 0.5]),
          modelId: 'mock-test',
          dimension: 2,
        }),
      },
    });

    expect(ranked.matchedSkills).toContain('Node.js');
    expect(ranked.matchedSkills).toContain('PostgreSQL');
    expect(ranked.missingSkills).toContain('NestJS');
    expect(ranked.missingSkills).toContain('Docker');
  });
});
