import { extractSkills } from '../parsing/skillExtractor.js';
export type RequirementGroup = { allOf: string[]; anyOf: string[]; required: boolean; confidence: number; evidence: string; start: number; end: number };
export type ParsedJobDescription = {
  title: string | null; seniority: 'junior' | 'mid' | 'senior' | 'lead' | null;
  requiredSkills: string[]; preferredSkills: string[]; responsibilities: string[];
  yearsExperience: number | null; minYears?: number | null; maxYears?: number | null;
  requirementGroups?: RequirementGroup[]; responsibilityEvidence?: Array<{ text: string; start: number; end: number; confidence: number }>;
  domainTerms: string[]; rawText: string;
};
const DOMAINS = ['fintech', 'healthcare', 'e-commerce', 'ecommerce', 'saas', 'cloud', 'ai', 'ml', 'machine learning', 'data', 'security', 'devops', 'blockchain', 'gaming', 'edtech'];
const HEADINGS: Array<[RegExp, 'required' | 'preferred' | 'responsibilities' | 'other']> = [
  [/^(?:key )?(?:responsibilities|duties|what you(?:'|’)?ll do|what you will do|the role|your role)$/i, 'responsibilities'],
  [/^(?:required|minimum|must.have|essential)(?: skills| qualifications| requirements| experience)?$/i, 'required'],
  [/^(?:requirements|qualifications|technical skills)$/i, 'required'],
  [/^(?:preferred|desired|nice.to.have|bonus)(?: skills| qualifications| requirements)?$/i, 'preferred'],
];
function heading(line: string): 'required' | 'preferred' | 'responsibilities' | 'other' | null {
  const normalized = line.trim().replace(/^#{1,6}\s*/, '').replace(/[:\s]+$/, '');
  const classified = HEADINGS.find(([pattern]) => pattern.test(normalized));
  if (classified) return classified[1];
  if (/^#{1,6}\s/.test(line) || /^(?:benefits|about us|role overview|overview|company|location|compensation|education|application process|who we are)$/i.test(normalized)) return 'other';
  return null;
}
function yearRequirement(text: string): { min: number | null; max: number | null } {
  const range = text.match(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})(\+)?\s*(?:years?|yrs?)\b/i);
  if (range) return { min: Number(range[1]), max: range[3] ? null : Number(range[2]) };
  const single = text.match(/\b(\d{1,2})(\+)?\s*(?:years?|yrs?)\b(?:.{0,75}?\bexperience\b)?/i);
  return single ? { min: Number(single[1]), max: single[2] ? null : Number(single[1]) } : { min: null, max: null };
}
export function parseJd(jdText: string): ParsedJobDescription {
  const lines = [...jdText.matchAll(/[^\n]+/g)].map(match => ({ raw: match[0], start: match.index, end: match.index + match[0].length }));
  const explicit = jdText.match(/^(?:job\s*title|title|role)\s*[:\-]\s*(.+)$/im);
  const first = lines[0]?.raw.replace(/^#+\s*/, '').trim() ?? '';
  const title = (explicit?.[1] ?? (first.length <= 100 && !/[.!?]\s/.test(first) ? first : '')).trim().slice(0, 120) || null;
  const levelText = title ?? '';
  let seniority: ParsedJobDescription['seniority'] = /\b(?:staff|principal|lead|director|vp|avp)\b/i.test(levelText) ? 'lead' : /\bsenior\b/i.test(levelText) ? 'senior' : /\b(?:junior|entry(?:-level)?|graduate|intern|fresher)\b/i.test(levelText) ? 'junior' : /\b(?:mid|intermediate)\b/i.test(levelText) ? 'mid' : null;
  let section: 'required' | 'preferred' | 'responsibilities' | 'other' = 'other';
  let explicitSections = false;
  const groups: RequirementGroup[] = [];
  const responsibilityEvidence: NonNullable<ParsedJobDescription['responsibilityEvidence']> = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const nextSection = heading(line.raw);
    if (nextSection) { section = nextSection; explicitSections = true; continue; }
    const inline = line.raw.match(/^\s*(required|preferred)\s*:\s*(.+)$/i);
    if (inline) section = inline[1].toLowerCase() as 'required' | 'preferred';
    const content = (inline?.[2] ?? line.raw).replace(/^\s*(?:[-*•◦▪]\s+|\d+[.)]\s+)/, '').trim();
    const isBullet = /^\s*(?:[-*•◦▪]\s+|\d+[.)]\s+)/.test(line.raw);
    if (section === 'responsibilities' && isBullet && content.length > 10) {
      responsibilityEvidence.push({ text: content, start: line.start, end: line.end, confidence: 1 });
    }
    if (section !== 'required' && section !== 'preferred') continue;
    const parent = line.raw.match(/^(\s*)(?:[-*•◦▪]\s+|\d+[.)]\s+)/);
    const childLines: typeof lines = [];
    if (parent && /:\s*$/.test(content)) {
      const parentIndent = parent[1].length;
      for (let next = index + 1; next < lines.length; next++) {
        if (heading(lines[next].raw)) break;
        const child = lines[next].raw.match(/^(\s*)(?:[-*•◦▪]\s+|\d+[.)]\s+)/);
        if (!child || child[1].length <= parentIndent) break;
        childLines.push(lines[next]);
      }
    }
    const groupedContent = [content, ...childLines.map(child => child.raw.replace(/^\s*(?:[-*•◦▪]\s+|\d+[.)]\s+)/, '').trim())].join('\n');
    const skills = extractSkills(groupedContent);
    if (!skills.length) continue;
    const alternative = /\b(?:at least one(?: of)?|one or more|one of|either|any of|such as)\b/i.test(content) || (skills.length > 1 && /\s+or\s+/i.test(content));
    groups.push({ allOf: alternative ? [] : skills, anyOf: alternative ? skills : [], required: section === 'required', confidence: isBullet || inline ? 1 : .7, evidence: groupedContent, start: line.start, end: childLines.at(-1)?.end ?? line.end });
    index += childLines.length;
  }
  if (!explicitSections && !groups.length) {
    const skills = extractSkills(jdText);
    if (skills.length) groups.push({ allOf: skills, anyOf: [], required: true, confidence: .4, evidence: jdText, start: 0, end: jdText.length });
  }
  const requiredSkills = [...new Set(groups.filter(group => group.required).flatMap(group => [...group.allOf, ...group.anyOf]))];
  const preferredSkills = [...new Set(groups.filter(group => !group.required).flatMap(group => [...group.allOf, ...group.anyOf]))];
  const years = yearRequirement(jdText);
  return { title, seniority, requiredSkills, preferredSkills, responsibilities: responsibilityEvidence.map(item => item.text),
    responsibilityEvidence, requirementGroups: groups, yearsExperience: years.min, minYears: years.min, maxYears: years.max,
    domainTerms: DOMAINS.filter(term => new RegExp(`(?<![a-z])${term}(?![a-z])`, 'i').test(jdText)), rawText: jdText };
}
export default parseJd;
