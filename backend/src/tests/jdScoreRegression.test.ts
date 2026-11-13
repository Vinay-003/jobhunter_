import { describe, expect, it } from 'bun:test';
import { parseJd } from '../modules/jd/jdParser.js';
import { matchJd, profileSkillSet } from '../modules/jd/matcher.js';
import { scoreJdRubric } from '../modules/analysis/jdRubric.js';
import { buildResumeProfile, buildParsedResumeSections } from '../modules/parsing/resumeProfile.js';
import type { ParsedDocument } from '../modules/parsing/pdfParser.js';
import type { ResumeProfile } from '../modules/parsing/resumeProfile.js';

function document(text: string, sections: Record<string, string>): ParsedDocument {
  return { pages: [text], normalizedText: text, sections, layoutSignals: { pageCount: 1, hasMultiColumnRisk: false, excessiveTables: false, avgCharsPerPage: text.length, hasImages: false, textDensity: text.length }, extractionConfidence: 1, detectedAsScanned: false, sha256: 'test', charCount: text.length };
}

// Numbered bold markdown headings ("## **3. Required Technical Skills**") used to
// fall through to the generic fallback: one mega-group, preferred flattened into
// required, zero responsibilities — a 25/100 score with 20 matched skills.
const juniorSdeJd = `Job Title: Junior Software Development Engineer (SDE-I)
Experience: 0–2 years (Freshers eligible)

## **1. Job Overview**
We are looking for a motivated Junior Software Development Engineer to join our engineering team.

## **2. Roles and Responsibilities**
1. Develop, test, and maintain web applications and software solutions.
2. Write clean, efficient, reusable, and maintainable code.
3. Build and integrate RESTful APIs and backend services.
4. Work with frontend technologies to develop responsive user interfaces.
5. Design, write, and optimize SQL queries and database operations.
6. Identify, troubleshoot, and resolve bugs and performance issues.
7. Collaborate with senior developers, designers, and product teams.
8. Participate in code reviews and follow software development best practices.
9. Use Git and GitHub for version control and collaborative development.
10. Write unit tests and perform application debugging.
11. Understand existing codebases and contribute to ongoing projects.
12. Learn new technologies and adapt to changing project requirements.

## **3. Required Technical Skills**
| Category | Required Skills |
| --- | --- |
| Programming | Java, Python, C++, JavaScript |
| Frontend | HTML, CSS, JavaScript, React.js |
| Backend | Node.js, Express.js, REST APIs |
| Database | SQL, PostgreSQL, MySQL, MongoDB |
| Version Control | Git, GitHub |
| Tools | VS Code, Postman, Docker |

## **4. Educational Qualifications**
- Bachelor's degree in Computer Science or a related field.
- Fresh graduates and candidates with 0–2 years of experience can apply.

## **5. Preferred Skills**
- Familiarity with cloud platforms such as AWS, Azure, or GCP.
- Understanding of CI/CD pipelines and deployment.
- Basic knowledge of system design and software architecture.`;

describe('JD score regressions', () => {
  it('parses numbered bold headings into required, preferred and responsibilities', () => {
    const jd = parseJd(juniorSdeJd);
    expect(jd.responsibilities).toHaveLength(12);
    expect(jd.requiredSkills).toEqual(expect.arrayContaining(['Java', 'Python', 'C++', 'JavaScript', 'HTML', 'CSS', 'React', 'Node.js', 'REST', 'SQL', 'Git']));
    expect(jd.preferredSkills).toEqual(expect.arrayContaining(['AWS', 'Azure', 'GCP', 'CI/CD', 'System Design']));
    // Preferred skills must never leak into the required list.
    expect(jd.requiredSkills).not.toContain('Azure');
    expect(jd.requiredSkills).not.toContain('GCP');
    expect(jd.requiredSkills).not.toContain('System Design');
    expect(jd.requirementGroups!.filter(group => group.required).length).toBeGreaterThan(1);
    expect(jd.requirementGroups!.filter(group => !group.required).length).toBeGreaterThanOrEqual(3);
  });

  it('treats resume C/C++ as satisfying a JD asking for C++', () => {
    const profile = { skills: ['C/C++'], skillsNormalized: ['C/C++'], experience: [], projects: [], education: [], seniority: 'entry', totalExperienceYears: null } as unknown as ResumeProfile;
    expect(profileSkillSet(profile).has('c++')).toBe(true);
    expect(profileSkillSet(profile).has('c')).toBe(true);
    const jd = parseJd('Junior Developer\nRequired Skills\n- C++');
    const match = matchJd(profile, jd);
    expect(match.missingRequired).not.toContain('C++');
    expect(scoreJdRubric(profile, jd, match, []).breakdown.explicitMustHave).toBe(35);
  });

  it('awards education points for a Freshers-eligible JD with an in-progress degree', () => {
    const jd = parseJd("Junior Developer\nExperience: 0–2 years (Freshers eligible)\nRequirements:\n- Bachelor's degree in Computer Science required.");
    const profile = { skills: ['Python'], skillsNormalized: ['Python'], experience: [], projects: [], seniority: 'entry', totalExperienceYears: 0, education: [{ degree: "Bachelor's degree in Computer Science", institution: 'Example University', field: 'Computer Science', year: '2027', completionDate: null, completed: false, raw: "Bachelor's degree in Computer Science expected 2027" }] } as unknown as ResumeProfile;
    expect(scoreJdRubric(profile, jd, matchJd(profile, jd), []).breakdown.education).toBe(10);
  });

  it('splits a "Must have | Good to have" table into required and preferred columns', () => {
    const jd = parseJd(`Java Backend Engineer\nKey Responsibilities\n- Build Java services.\nRequirements\n| Must have | Good to have |\n| --- | --- |\n| Java, Spring Boot, REST, SQL, Git | Apache Kafka, AWS, Docker, Kubernetes |`);
    expect(jd.requiredSkills).toEqual(expect.arrayContaining(['Java', 'Spring Boot', 'REST', 'SQL', 'Git']));
    expect(jd.preferredSkills).toEqual(expect.arrayContaining(['Kafka', 'AWS', 'Docker', 'Kubernetes']));
    expect(jd.requiredSkills).not.toContain('Docker');
    expect(jd.requiredSkills).not.toContain('Kubernetes');
    expect(jd.requirementGroups!.filter(g => g.required).length).toBeGreaterThan(0);
    expect(jd.requirementGroups!.filter(g => !g.required).length).toBeGreaterThan(0);
  });

  it('reads the person from the header, not the institution banner', () => {
    const text = [
      'Indian Institute of Information Technology Vadodara',
      'Vinay Saini',
      'jadamvinay2003@gmail.com | +91 86198 65958 | LinkedIn | GitHub |',
      'Portfolio',
      'Education',
      'Bachelor of Technology in Computer Science, expected 2027',
      'Experience',
      'Acme Corp | Software Development Intern | March 2026 – July 2026',
      '• Built REST APIs.',
      'Technical Skills',
      'Python, Git',
    ].join('\n');
    const doc = document(text, { experience: 'Acme Corp | Software Development Intern | March 2026 – July 2026\n• Built REST APIs.' });
    const { contactInfo } = buildParsedResumeSections(doc, buildResumeProfile(doc));
    expect(contactInfo.name).toBe('Vinay Saini');
    expect(contactInfo.title).toBeNull();
    expect(contactInfo.location).not.toBe('LinkedIn');
    expect(contactInfo.links).not.toContain('jadamvinay2003@gmail.com');
  });

  it('does not append a re-spaced PDF bullet twice to the entry description', () => {
    // The visual bullet (pages) and the section body can differ only in whitespace
    // after PDF line-wrapping; exact includes() missed and duplicated the sentence.
    const page = 'Experience\nAcme Corp | Software Development Intern | March 2026 – July 2026\n• Built the control plane and   4:5 / 9:16 export pipeline for ads.';
    const body = 'Acme Corp | Software Development Intern | March 2026 – July 2026\n• Built the control plane and 4:5 / 9:16 export pipeline for ads.';
    const profile = buildResumeProfile(document(page, { experience: body }));
    const entry = profile.experience[0];
    expect(entry.bullets).toHaveLength(1);
    expect((entry.description ?? '').match(/4:5 \/ 9:16/g)).toHaveLength(1);
  });
});
