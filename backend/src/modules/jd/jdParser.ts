import { extractSkills } from '../parsing/skillExtractor.js';
import { detectSeniority, type CanonicalSeniority } from '../jobs/seniority.js';
export type RequirementGroup = { allOf: string[]; anyOf: string[]; required: boolean; confidence: number; evidence: string; start: number; end: number };
export type ParsedJobDescription = {
  title: string | null; seniority: CanonicalSeniority | 'junior' | 'lead' | null;
  requiredSkills: string[]; preferredSkills: string[]; responsibilities: string[];
  yearsExperience: number | null; minYears?: number | null; maxYears?: number | null;
  requirementGroups?: RequirementGroup[]; responsibilityEvidence?: Array<{ text: string; start: number; end: number; confidence: number }>;
  domainTerms: string[]; rawText: string;
};
const DOMAINS = ['fintech', 'healthcare', 'e-commerce', 'ecommerce', 'saas', 'cloud', 'ai', 'ml', 'machine learning', 'data', 'security', 'devops', 'blockchain', 'gaming', 'edtech'];
const HEADINGS: Array<[RegExp, 'required' | 'preferred' | 'responsibilities' | 'other']> = [
  [/^(?:(?:key|job|primary|core|roles?\s*(?:and|&)\s*)\s+)?(?:responsibilities|duties|roles?\s*(?:and|&)\s*responsibilities|what you(?:'|’)?ll do|what you will do|the role|your role|day.to.day|what you will be doing|what you'll be doing)$/i, 'responsibilities'],
  [/^(?:preferred|desired|nice.to.have|good.to.have|bonus|plus)(?:\s*(?:skills|qualifications|requirements|experience))?$/i, 'preferred'],
  [/^(?:core|key|primary|must.have|minimum|essential|required|technical)?\s*(?:requirements|qualifications|skills|experience|competencies)(?:\s*(?:&|and|\/)\s*(?:qualifications|skills|experience|requirements|competencies))?$|^(?:core|key|primary|must.have|minimum|essential|required|technical)$/i, 'required'],
  [/^(?:what we(?:'|’)?re looking for|who you are|what you bring|your qualifications|technical proficiencies|key competencies)$/i, 'required'],
];
function heading(line: string): 'required' | 'preferred' | 'responsibilities' | 'other' | null {
  const normalized = line.trim().replace(/^#{1,6}\s*/, '').replace(/[:\s]+$/, '').replace(/^\*+|\*+$/g, '').trim();
  const classified = HEADINGS.find(([pattern]) => pattern.test(normalized));
  if (classified) return classified[1];
  if (/^#{1,6}\s/.test(line) || /^(?:benefits|about us|role overview|overview|company|location|compensation|education|application process|who we are|job details|application question\(s\))$/i.test(normalized)) return 'other';
  return null;
}
function yearRequirement(text: string): { min: number | null; max: number | null } {
  // Only professional-tenure labels are evidence. Do not interpret company age,
  // product age, or arbitrary "3-6 months" durations as candidate experience.
  if (!/\b(?:experience|exp\.?|professional|industry|engineering)\b/i.test(text) || /\b(?:company|business|founded|established|since)\b/i.test(text)) return { min: null, max: null };
  const bare = text.match(/\b(?:exp\.?|experience)\s*[:=-]?\s*(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})(\+)?\s*(?:years?|yrs?)\b/i)
    ?? text.match(/\b(?:exp\.?|experience)\s*[:=-]?\s*(\d{1,2})(\+)?\s*(?:years?|yrs?)\b/i);
  if (bare) {
    const isRange = /(?:[-–—]|to)/i.test(bare[0]);
    return { min: Number(bare[1]), max: isRange ? (bare[3] ? null : Number(bare[2])) : (bare[2] ? null : Number(bare[1])) };
  }
  const simpleRange = text.match(/\b(\d{1,2})\s*(?:[-–—]|to)\s*(\d{1,2})(\+)?\s*(?:years?|yrs?)\s*(?:of\s+)?(?:professional\s+)?(?:[a-z]+\s+){0,4}experience\b/i);
  if (simpleRange) return { min: Number(simpleRange[1]), max: simpleRange[3] ? null : Number(simpleRange[2]) };
  const range = text.match(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})(\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:[a-z]+\s+){0,5}experience\b/i);
  if (range) return { min: Number(range[1]), max: range[3] ? null : Number(range[2]) };
  const single = text.match(/\b(\d{1,2})(\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:[a-z]+\s+){0,5}(?:experience|engineering|software development)\b/i)
    ?? text.match(/\b(\d{1,2})(\+)?\s*(?:years?|yrs?)\s+(?:of\s+)?experience\s+(?:in|with|as)\b/i);
  return single ? { min: Number(single[1]), max: single[2] ? null : Number(single[1]) } : { min: null, max: null };
}
export function parseJd(jdText: string): ParsedJobDescription {
  const lines = [...jdText.matchAll(/[^\n]+/g)].map(match => ({ raw: match[0], start: match.index, end: match.index + match[0].length }));
  const explicit = jdText.match(/^(?:job\s*title|title|role)\s*[:\-]\s*(.+)$/im);
  const first = lines[0]?.raw.replace(/^#+\s*/, '').trim() ?? '';
  const title = (explicit?.[1] ?? (first.length <= 100 && !/[.!?]\s/.test(first) ? first : '')).trim().slice(0, 120) || null;
  const levelText = title ?? '';
  const seniority: ParsedJobDescription['seniority'] = detectSeniority(levelText, jdText);
  let section: 'required' | 'preferred' | 'responsibilities' | 'other' = 'other';
  let explicitSections = false;
  const groups: RequirementGroup[] = [];
  const responsibilityEvidence: NonNullable<ParsedJobDescription['responsibilityEvidence']> = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const nextSection = heading(line.raw);
    if (nextSection) { section = nextSection; explicitSections = true; continue; }
    const inline = line.raw.match(/^\s*(required|must.have|minimum|essential|preferred|desired|nice.to.have|good.to.have|bonus)\s*:\s*(.+)$/i);
    if (inline) section = /preferred|desired|nice|good|bonus/i.test(inline[1]) ? 'preferred' : 'required';
    const bulletPattern = /^\s*(?:[•\-*◦▪·●○■□▶►⁃–—✓✔➤➔]\s*|\d+[.)]\s+)/;
    const content = (inline?.[2] ?? line.raw).replace(bulletPattern, '').trim();
    const isBullet = bulletPattern.test(line.raw);
    if ((section === 'responsibilities' && (isBullet || /^(?:you will|design|build|develop|maintain|implement|collaborate|own|assist|work|support|learn|participate|contribute|help|create|write|test|debug|integrate|deploy|optimize|analyze|manage|handle|coordinate|review|document|setup|configure)\b/i.test(content)) || /^(?:you will|you(?:'|’)ll|responsible for|in this role,? you will)\b/i.test(content)) && content.length > 10) {
      if (content.includes(' – ') || content.includes(' - ')) {
        const subItems = content.split(/\s+[–—-]\s+/).map(s => s.trim()).filter(s => s.length > 10);
        if (subItems.length > 1) {
          for (const sub of subItems) {
            responsibilityEvidence.push({ text: sub, start: line.start, end: line.end, confidence: 1 });
          }
        } else {
          responsibilityEvidence.push({ text: content, start: line.start, end: line.end, confidence: 1 });
        }
      } else {
        responsibilityEvidence.push({ text: content, start: line.start, end: line.end, confidence: 1 });
      }
    }
    if (section !== 'required' && section !== 'preferred') continue;
    const parent = line.raw.match(/^(\s*)(?:[•\-*◦▪·●○■□▶►⁃–—✓✔➤➔]\s*|\d+[.)]\s+)/);
    const childLines: typeof lines = [];
    if (parent && /:\s*$/.test(content)) {
      const parentIndent = parent[1].length;
      for (let next = index + 1; next < lines.length; next++) {
        if (heading(lines[next].raw)) break;
        const child = lines[next].raw.match(/^(\s*)(?:[•\-*◦▪·●○■□▶►⁃–—✓✔➤➔]\s*|\d+[.)]\s+)/);
        if (!child || child[1].length <= parentIndent) break;
        childLines.push(lines[next]);
      }
    }
    const groupedContent = [content, ...childLines.map(child => child.raw.replace(bulletPattern, '').trim())].join('\n');
    const units = childLines.length ? [groupedContent] : groupedContent.split(/\s*;\s*|(?<=[.!?])\s+(?=[A-Z])/).filter(Boolean);
    for (const unit of units) {
      const found = [...new Set([...extractSkills(unit.replace(/\b(?:no|not|without|don't need|not required)\s+[\w.+#-]+(?:\s+required)?/gi, '')),
        ...(['Chroma', 'Qdrant', 'Pinecone', 'pgvector'].filter(skill => new RegExp(`\\b${skill}\\b`, 'i').test(unit)) )])];
      if (!found.length) continue;
      const or = /\b(?:at least one(?: of)?|one or more|one of|either|any of|such as)\b/i.test(unit) || (found.length > 1 && /\s+or\s+/i.test(unit));
      groups.push({ allOf: or ? [] : found, anyOf: or ? found : [], required: section === 'required', confidence: isBullet || inline ? 1 : .7, evidence: unit, start: line.start, end: childLines.at(-1)?.end ?? line.end });
    }
    index += childLines.length;
  }
  if (!groups.length) {
    const skills = extractSkills(jdText);
    if (skills.length) groups.push({ allOf: skills, anyOf: [], required: true, confidence: .4, evidence: jdText, start: 0, end: jdText.length });
  }
  const requiredSkills = [...new Set(groups.filter(group => group.required).flatMap(group => [...group.allOf, ...group.anyOf]))];
  const preferredSkills = [...new Set(groups.filter(group => !group.required).flatMap(group => [...group.allOf, ...group.anyOf]))];
  const years = lines.filter(line => !/^\s*(?:preferred|desired|nice|bonus)/i.test(line.raw)).map(line => yearRequirement(line.raw)).find(year => year.min !== null)
    ?? { min: null, max: null };
  return { title, seniority, requiredSkills, preferredSkills, responsibilities: responsibilityEvidence.map(item => item.text),
    responsibilityEvidence, requirementGroups: groups, yearsExperience: years.min, minYears: years.min, maxYears: years.max,
    domainTerms: DOMAINS.filter(term => new RegExp(`(?<![a-z])${term}(?![a-z])`, 'i').test(jdText)), rawText: jdText };
}
export default parseJd;
