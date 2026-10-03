import { describe, expect, test } from 'bun:test';
import { professionalEvidence } from '../modules/matching/evidenceBuilder.js';
import { scoreJdRubric } from '../modules/analysis/jdRubric.js';
import { analysisSnapshot } from '../modules/analysis/reportSchema.js';
import { validateVectors } from '../providers/embeddings/validateVectors.js';
import type { ResumeProfile } from '../modules/parsing/resumeProfile.js';

const profile = { skills:['JavaScript','PostgreSQL'], skillsNormalized:['JavaScript','PostgreSQL'],
  experience:[{title:'Software development intern',company:'Test',startDate:'March 2026',endDate:'July 2026',isCurrent:false,
    description:'Built backend API with PostgreSQL. student@example.org +91 98765 43210 github.com/student/private'}],
  projects:[{title:'Inventory software project',description:'Implemented API tests and database design.'}],
  education:[{degree:'Bachelor of Engineering expected 2027',raw:'Bachelor of Engineering expected 2027',year:'2027',institution:null}],
  totalExperienceYears:0.3, seniority:'junior', summary:'Student student@example.org', contactSignals:{hasEmail:true,hasPhone:true,hasGithub:true,hasLinkedIn:false},languages:[] } as ResumeProfile;

describe('canonical reports and professional evidence', () => {
  test('snapshot restores fractional health and JD details', () => {
    const result = { success:true, resultSchemaVersion:1, analysisId:'a', resumeId:'b', readiness:{score:65.5},
      jdMatch:{score:41, jd:{title:'Senior Engineer'},breakdown:{explicitMustHave:12}}, confidence:'Low' };
    expect(analysisSnapshot({result_json: JSON.stringify(result)})?.readiness.score).toBe(65.5);
    expect(analysisSnapshot({result_json:result})?.jdMatch?.jd.title).toBe('Senior Engineer');
    expect(analysisSnapshot({result_json:null})).toBeNull();
  });
  test('professional chunks include projects without contact/header fallback', () => {
    const chunks = professionalEvidence(profile);
    expect(chunks.join(' ')).toContain('Inventory software project');
    expect(chunks.join(' ')).not.toContain('student@example.org');
    expect(chunks.join(' ')).not.toContain('github.com/student');
    expect(chunks.join(' ')).not.toContain('98765');
    expect(professionalEvidence({...profile, skills:[], experience:[], projects:[], summary:'student@example.org'} as ResumeProfile)).toEqual([]);
  });
  test('invalid vectors fail rather than padding or silently mixing', () => {
    expect(() => validateVectors([[1,2], [1]], 2, 2)).toThrow();
    expect(() => validateVectors([[NaN,1]], 1, 2)).toThrow();
    expect(() => validateVectors([[0,0]], 1, 2)).toThrow();
  });
  test('structured bullets remain text evidence, never object serialization', () => {
    const chunks = professionalEvidence({...profile, experience:[], projects:[{
      title:'Project',company:null,startDate:null,endDate:null,isCurrent:false,description:'fallback',kind:'project',
      bullets:[{text:'Built a database with tested transactions.',section:'projects',start:0,end:45} as any],
    }]});
    expect(chunks.join(' ')).toContain('tested transactions');
    expect(chunks.join(' ')).not.toContain('[object Object]');
  });
  test('unavailable JD score remains null on database reload', () => {
    expect(analysisSnapshot({result_json:{resultSchemaVersion:1,readiness:{score:60},jdMatch:{score:null}}})?.jdMatch?.score).toBeNull();
  });
  test('senior experience gap is independent of technology overlap', () => {
    const jd = {title:'Senior Software Engineer',seniority:'senior',requiredSkills:['JavaScript'],preferredSkills:[],responsibilities:['Build APIs'],yearsExperience:4,domainTerms:[],rawText:'Senior Software Engineer. 4 years experience. Bachelor degree required.'} as any;
    const match = {requiredCoverage:1,preferredCoverage:1} as any;
    const score = scoreJdRubric(profile,jd,match,[{responsibility:'Build APIs',matchScore:.9,candidateEvidence:'Built backend API'}]);
    expect(score.eligibility).toBe('ineligible');
    expect(score.qualificationReasons.join(' ')).toContain('below required');
    expect(score.eligibilityChecks.education).toBe('in_progress');
    expect(score.breakdown.education).toBe(0);
    expect(score.rawScore).toBe(Object.values(score.breakdown).reduce((a,b)=>a+b,0));
    expect(score.pointsPossible).toBe(90);
  });
});
