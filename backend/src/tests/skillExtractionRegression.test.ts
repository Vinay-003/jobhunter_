import { describe, it, expect } from 'bun:test';
import { extractSkills, extractSkillMatches } from '../modules/parsing/skillExtractor.js';
import { parseJd } from '../modules/jd/jdParser.js';

describe('skill extraction regressions: prevent false positive matches on common English words', () => {
  it('does NOT extract Go from Google or Good', () => {
    const textGoogle = 'Deployed control plane with Google OAuth and synced data with Google Analytics and Google Sheets';
    const skillsGoogle = extractSkills(textGoogle);
    expect(skillsGoogle).not.toContain('Go');

    const textGood = 'Good problem-solving and logical thinking skills. Good communication and teamwork skills.';
    const skillsGood = extractSkills(textGood);
    expect(skillsGood).not.toContain('Go');
  });

  it('does NOT extract Go from common English phrases', () => {
    const phrases = [
      'Ready to Go',
      'Go to the meeting',
      'Go through existing code',
      'Go forward with implementation',
      'Go-getter attitude',
      'On the go mobile experience',
      'Go deep into database internals',
    ];
    for (const phrase of phrases) {
      expect(extractSkills(phrase)).not.toContain('Go');
    }
  });

  it('correctly extracts genuine Go / Golang skills', () => {
    expect(extractSkills('Languages: Python, Go, Java')).toContain('Go');
    expect(extractSkills('Backend written in Golang and Docker')).toContain('Go');
    expect(extractSkills('Experience with go lang')).toContain('Go');
    expect(extractSkills('Go developer needed for microservices')).toContain('Go');
    expect(extractSkills('Built microservices using Go.')).toContain('Go');
    expect(extractSkills('Python / Go / C++')).toContain('Go');
  });

  it('does NOT extract REST from RESTAURANT or RESTART', () => {
    expect(extractSkills('Dinner at a RESTAURANT with team')).not.toContain('REST');
    expect(extractSkills('RESTART the service after crash')).not.toContain('REST');
    expect(extractSkills('Designed 40+ REST endpoints and RESTful APIs')).toContain('REST');
  });

  it('does NOT extract Express from Express ideas or American Express', () => {
    expect(extractSkills('Express ideas clearly in team discussions')).not.toContain('Express');
    expect(extractSkills('Accepted payments via American Express')).not.toContain('Express');
    expect(extractSkills('Built web services with Express.js and Node')).toContain('Express');
    expect(extractSkills('Node/Express backend')).toContain('Express');
    expect(extractSkills('Stack: React, Express, MongoDB')).toContain('Express');
  });

  it('does NOT extract C from arbitrary letters or common words', () => {
    expect(extractSkills('Option c) do something')).not.toContain('C');
    expect(extractSkills('High dose of vitamin c')).not.toContain('C');
    expect(extractSkills('Languages: C, Python, Java')).toContain('C');
    expect(extractSkills('Proficient in C programming and data structures')).toContain('C');
  });

  it('verifies user resume and python intern job do not extract Go', () => {
    const resumeExperience = `
• Developed Ad Factory (Live), a FastAPI/MongoDB system generating structured ad copy and prompts across 5 formats and 3 language modes for ChatGPT and Gemini.
• Deployed its control plane on Render with Google OAuth and engineered a paired Playwright agent for browser generation jobs, run tracking, artifact transfer, and 4:5 / 9:16 creative workflows.
• Maintained the Shopify storefront by shipping product and content updates and resolving cart, variant, location, popup, and responsive-layout issues.
• Integrated 4 data sources—Meta, Google Analytics, Shopify, and Shiprocket—into scheduled reporting pipelines syncing advertising, traffic, sales, order, and delivery metrics into Google Sheets.
`;
    expect(extractSkills(resumeExperience)).not.toContain('Go');

    const jd = `
Job Summary
We are looking for a Python Developer Intern / Trainee who is interested in software development and wants to build practical experience in Python programming. Freshers with basic Python knowledge and a strong willingness to learn are welcome.
Key Responsibilities
- Assist in developing and maintaining software applications using Python.
- Write clean, simple, and efficient Python code under guidance.
- Work with the development team on assigned tasks and projects.
- Debug and troubleshoot basic application issues.
- Assist in database-related tasks and API integration.
- Participate in testing and improving application functionality.
- Learn and follow coding standards and development practices.
- Collaborate with senior developers and other team members.
Required Skills
- Basic knowledge of Python programming.
- Understanding of programming fundamentals such as variables, loops, functions, and OOP concepts.
- Basic knowledge of SQL / databases is an advantage.
- Basic understanding of HTML, CSS, or JavaScript is a plus.
- Good problem-solving and logical thinking skills.
- Good communication and teamwork skills.
- Strong willingness to learn and grow in software development.
`;
    const parsed = parseJd(jd);
    expect(parsed.requiredSkills).not.toContain('Go');
    expect(parsed.preferredSkills).not.toContain('Go');
    expect(parsed.requiredSkills).toContain('Python');
    expect(parsed.requiredSkills).toContain('OOP');
    expect(parsed.requiredSkills).toContain('SQL');
  });
});
