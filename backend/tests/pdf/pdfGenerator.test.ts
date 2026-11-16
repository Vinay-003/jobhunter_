import { describe, it } from 'node:test';
import assert from 'node:assert';
import { generateResumePdf, sanitizePdfText, type StructuredResumeData } from '../../src/modules/pdf/pdfGenerator.js';
import { parsePdfBuffer } from '../../src/modules/parsing/pdfParser.js';

describe('PDF Generator & ATS Parseability', () => {
  it('generates a valid %PDF document from structured resume data', async () => {
    const data: StructuredResumeData = {
      contactInfo: {
        name: 'Jordan Lee',
        title: 'Lead Software Architect',
        email: 'jordan.lee@example.com',
        phone: '+1 555-0144',
        location: 'Seattle, WA',
        linkedin: 'linkedin.com/in/jordanlee',
        github: 'github.com/jordanlee',
      },
      summary:
        'Accomplished software architect with 8+ years designing fault-tolerant cloud systems, leading high-velocity engineering squads, and driving technology modernization.',
      skills: [
        { category: 'Languages', skills: ['TypeScript', 'Node.js', 'Python', 'Go', 'SQL'] },
        { category: 'Cloud & Infrastructure', skills: ['AWS', 'Docker', 'PostgreSQL', 'Redis', 'CI/CD'] },
      ],
      experience: [
        {
          title: 'Principal Engineer',
          company: 'Vertex Cloud Systems',
          date: '2021 – Present',
          bullets: [
            'Architected distributed event streaming platform processing 40M events daily with 99.99% uptime.',
            'Spearheaded transition from monolith to containerized microservices, reducing deployment cycle times by 65%.',
            'Mentored 12 staff and senior engineers across multiple global cross-functional product squads.',
          ],
        },
      ],
      projects: [
        {
          title: 'Enterprise Metrics Gateway',
          date: '2023',
          bullets: [
            'Engineered sub-millisecond telemetry aggregation pipeline utilizing Go and PostgreSQL partitioning.',
            'Implemented automated Canary testing pipelines cutting rollback incident frequency to zero.',
          ],
        },
      ],
      education: [
        {
          degree: 'Master of Science in Computer Science',
          institution: 'University of Washington',
          year: '2018',
        },
      ],
    };

    const pdfBuffer = await generateResumePdf(data);

    // 1. Validate buffer
    assert.ok(pdfBuffer instanceof Buffer);
    assert.ok(pdfBuffer.length > 1000, 'PDF buffer should be at least 1KB');

    // 2. Validate magic bytes
    const magic = pdfBuffer.subarray(0, 4).toString('utf8');
    assert.strictEqual(magic, '%PDF', 'PDF buffer must begin with %PDF magic bytes');

    // 3. Parse with ATS parser
    const parsed = await parsePdfBuffer(pdfBuffer);
    assert.strictEqual(parsed.detectedAsScanned, false, 'Generated PDF must never be detected as scanned');
    assert.ok(parsed.normalizedText.length > 500, 'Normalized text should be extracted');

    // 4. Validate sections recognized by ATS
    assert.ok(parsed.sections.summary, 'Summary section must be detected');
    assert.ok(parsed.sections.skills, 'Skills section must be detected');
    assert.ok(parsed.sections.experience, 'Experience section must be detected');
    assert.ok(parsed.sections.projects, 'Projects section must be detected');
    assert.ok(parsed.sections.education, 'Education section must be detected');

    // 5. Validate layout signals
    assert.strictEqual(parsed.layoutSignals.hasMultiColumnRisk, false, 'Must be single-column clean layout');
    assert.strictEqual(parsed.layoutSignals.excessiveTables, false);
    assert.ok(parsed.layoutSignals.pageCount >= 1);
  });

  it('sanitizePdfText maps non-WinAnsi symbols, smart quotes, and emojis cleanly', () => {
    const raw = '★ Leading star “quoted text” with ‘apostrophe’ — em-dash – en-dash & ✓ checkmark 🚀 rocket 🔥';
    const clean = sanitizePdfText(raw);
    assert.ok(!clean.includes('★'), 'Black star should be replaced');
    assert.ok(clean.includes('*'), 'Star replaced with *');
    assert.ok(!clean.includes('“') && !clean.includes('”'), 'Smart double quotes replaced');
    assert.ok(clean.includes('"quoted text"'), 'Standard double quotes retained');
    assert.ok(!clean.includes('‘') && !clean.includes('’'), 'Smart single quotes replaced');
    assert.ok(clean.includes("'apostrophe'"), 'Standard single quote retained');
    assert.ok(!clean.includes('✓'), 'Checkmark replaced');
    assert.ok(clean.includes('[x]'), 'Checkmark mapped to [x]');
    assert.ok(!clean.includes('🚀') && !clean.includes('🔥'), 'Emojis removed');
    assert.ok(clean.includes('rocket'), 'Text next to emojis retained');
  });

  it('generates valid %PDF without throwing encoding errors on adversarial unicode and emoji inputs', async () => {
    const adversarialData: StructuredResumeData = {
      contactInfo: {
        name: 'Alex ★ “The Builder” Chen 🚀',
        title: 'Senior Distributed Systems Architect & Lead ⚡',
        email: 'alex.chen@example.com',
        phone: '+1 555-0199',
        location: 'San Francisco, CA — Bay Area',
        linkedin: 'linkedin.com/in/alexchen',
      },
      summary:
        '“Accomplished architect” specializing in cloud-native microservices: ★ 99.999% availability, ➔ 10x throughput, and 🔥 zero incident records across multi-region clusters (EU € & US $).',
      skills: [
        {
          category: 'Core & Languages ★',
          skills: ['TypeScript', 'Go', 'Python', 'C++', 'SQL', 'Rust 🚀'],
        },
        {
          category: 'Cloud & Infrastructure ⚡',
          skills: ['AWS', 'Docker', 'Kubernetes', 'PostgreSQL', 'Redis', 'Kafka'],
        },
      ],
      experience: [
        {
          title: 'Staff Infrastructure Engineer 🚀',
          company: 'Acme Cloud Corp “Global”',
          date: '2020 – 2024',
          bullets: [
            '★ Architected distributed message pipeline in Go processing 50M+ events/day with 99.99% reliability.',
            '✓ Led migration from legacy monolith to Kubernetes microservices — reduced deployment cycle by 70%.',
            '🚀 Optimized database query engine; lowered p99 latency from 120ms to ≤ 15ms.',
            '• Mentored 15 junior/senior engineers with weekly 1-on-1s & technical architectural reviews.',
            'Integrated multi-currency billing engine supporting USD $, EUR €, and GBP £.',
          ],
        },
      ],
      projects: [
        {
          title: 'Telemetry Aggregation Engine 📈',
          date: '2023',
          bullets: [
            '★ Designed custom telemetry collector using Go and eBPF; cutting network overhead by 45%.',
            '✓ Implemented automated canary rollback system preventing production degradation incidents.',
          ],
        },
      ],
      education: [
        {
          degree: 'B.S. in Computer Science “Honors”',
          institution: 'University of California, Berkeley ★',
          year: '2019',
        },
      ],
    };

    // Must never throw an encoding exception
    const pdfBuffer = await generateResumePdf(adversarialData);
    assert.ok(pdfBuffer instanceof Buffer);
    assert.ok(pdfBuffer.length > 1000);
    assert.strictEqual(pdfBuffer.subarray(0, 4).toString('utf8'), '%PDF');

    // ATS Parser verification
    const parsed = await parsePdfBuffer(pdfBuffer);
    assert.strictEqual(parsed.detectedAsScanned, false);
    assert.ok(parsed.normalizedText.length > 500);
    assert.ok(parsed.sections.summary, 'Summary detected');
    assert.ok(parsed.sections.skills, 'Skills detected');
    assert.ok(parsed.sections.experience, 'Experience detected');
    assert.ok(parsed.sections.projects, 'Projects detected');
    assert.ok(parsed.sections.education, 'Education detected');
  });
});
