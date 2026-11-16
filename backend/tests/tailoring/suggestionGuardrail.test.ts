import { describe, it } from 'node:test';
import assert from 'node:assert';
import dotenv from 'dotenv';
import path from 'node:path';
import {
  buildCandidateSkillWhitelist,
  validateSuggestionGuardrail,
  generateDeterministicSuggestions,
  generateTailorSuggestions,
  type CandidateContext,
  type JobContext,
} from '../../src/modules/tailoring/suggestionService.js';
import type { ResumeProfile } from '../../src/modules/parsing/resumeProfile.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const sampleProfile: ResumeProfile = {
  skills: ['TypeScript', 'JavaScript', 'Node.js', 'React', 'PostgreSQL', 'Docker', 'REST'],
  skillsNormalized: ['typescript', 'javascript', 'node.js', 'react', 'postgresql', 'docker', 'rest'],
  declaredSkills: ['TypeScript', 'JavaScript', 'Node.js', 'React', 'PostgreSQL', 'Docker'],
  demonstratedSkills: ['Node.js', 'React', 'PostgreSQL', 'Docker'],
  education: [],
  experience: [
    {
      title: 'Full Stack Engineer',
      company: 'TechCorp',
      startDate: '2022',
      endDate: '2024',
      isCurrent: false,
      description: 'Worked on backend APIs using Node.js and PostgreSQL. Built React frontend dashboards.',
      bullets: [
        { text: 'Worked on backend APIs using Node.js and PostgreSQL.' } as any,
        { text: 'Built React frontend dashboards.' } as any,
      ],
    },
  ],
  projects: [
    {
      title: 'Portfolio Site',
      company: null,
      startDate: null,
      endDate: null,
      isCurrent: false,
      description: 'Built a portfolio using React and Docker.',
      bullets: [{ text: 'Built a portfolio using React and Docker.' } as any],
    },
  ],
  totalExperienceYears: 2,
  seniority: 'mid',
  contactSignals: { hasEmail: true, hasPhone: true, hasLinkedIn: false, hasGithub: false },
  summary: 'Full Stack Engineer with 2 years of experience.',
  languages: ['English'],
};

const sampleCandidate: CandidateContext = {
  resumeText: 'Full Stack Engineer with experience in TypeScript, JavaScript, Node.js, React, PostgreSQL, and Docker.',
  profile: sampleProfile,
};

const sampleJob: JobContext = {
  title: 'Senior Backend Engineer',
  requiredSkills: ['Node.js', 'PostgreSQL', 'Docker', 'Kubernetes', 'Go'],
  preferredSkills: ['AWS', 'Redis'],
  responsibilities: [
    'Design and develop high throughput REST APIs using Node.js and PostgreSQL.',
    'Deploy containerized services using Docker and Kubernetes.',
  ],
};

describe('Suggestion Engine & Whitelist Guardrail', () => {
  it('buildCandidateSkillWhitelist extracts all candidate skills', () => {
    const whitelist = buildCandidateSkillWhitelist(sampleCandidate.resumeText, sampleProfile);
    assert.strictEqual(whitelist.has('node.js'), true);
    assert.strictEqual(whitelist.has('react'), true);
    assert.strictEqual(whitelist.has('docker'), true);
    assert.strictEqual(whitelist.has('kubernetes'), false); // candidate does not have kubernetes
    assert.strictEqual(whitelist.has('go'), false); // candidate does not have Go
  });

  it('validateSuggestionGuardrail allows valid edits using candidate verified skills', () => {
    const whitelist = buildCandidateSkillWhitelist(sampleCandidate.resumeText, sampleProfile);
    const original = 'Worked on backend APIs using Node.js and PostgreSQL.';
    const validRewrite = 'Architected high-scale REST APIs using Node.js and PostgreSQL, improving query response by 30%.';

    const result = validateSuggestionGuardrail(original, validRewrite, whitelist);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.introducedUnpossessedSkills.length, 0);
    assert.ok(result.verifiedSkillsUsed.includes('Node.js'));
  });

  it('validateSuggestionGuardrail strictly REJECTS edits introducing unpossessed skills', () => {
    const whitelist = buildCandidateSkillWhitelist(sampleCandidate.resumeText, sampleProfile);
    const original = 'Worked on backend APIs using Node.js and PostgreSQL.';
    // Adversarial rewrite: attempts to invent Kubernetes and Go skills to match the JD!
    const invalidRewrite = 'Architected backend APIs using Node.js, Kubernetes, and Go microservices.';

    const result = validateSuggestionGuardrail(original, invalidRewrite, whitelist);
    assert.strictEqual(result.valid, false, 'Guardrail must reject unpossessed skills');
    assert.ok(
      result.introducedUnpossessedSkills.map((s) => s.toLowerCase()).includes('kubernetes') ||
      result.introducedUnpossessedSkills.map((s) => s.toLowerCase()).includes('go'),
      'Must identify Kubernetes or Go as unpossessed'
    );
  });

  it('generateDeterministicSuggestions creates valid ATS improvements without hallucination', () => {
    const whitelist = buildCandidateSkillWhitelist(sampleCandidate.resumeText, sampleProfile);
    const suggestions = generateDeterministicSuggestions(sampleCandidate, sampleJob, whitelist);
    assert.ok(suggestions.length > 0, 'Should generate suggestions');

    for (const sug of suggestions) {
      assert.strictEqual(sug.status, 'pending');
      assert.ok(sug.suggestedText.length > 0);
      const guard = validateSuggestionGuardrail(sug.originalText, sug.suggestedText, whitelist);
      assert.strictEqual(guard.valid, true, 'Every generated suggestion must pass whitelist');
    }
  });

  it('generateTailorSuggestions calls Mercury 3 or fallback and passes guardrail with zero user prompt', async () => {
    const suggestions = await generateTailorSuggestions(sampleCandidate, sampleJob);
    assert.ok(suggestions.length > 0, 'Should return at least one suggestion');

    const whitelist = buildCandidateSkillWhitelist(sampleCandidate.resumeText, sampleProfile);
    for (const sug of suggestions) {
      assert.ok(sug.id.startsWith('sug-'));
      assert.ok(sug.originalText.length > 0);
      assert.ok(sug.suggestedText.length > 0);
      assert.ok(sug.rationale.length > 0);

      // Verify guardrail
      const guard = validateSuggestionGuardrail(sug.originalText, sug.suggestedText, whitelist);
      assert.strictEqual(
        guard.valid,
        true,
        `Suggestion "${sug.suggestedText}" introduced forbidden skills: ${guard.introducedUnpossessedSkills.join(', ')}`
      );
    }
  });
});
