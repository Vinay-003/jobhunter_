export type CanonicalSeniority = 'intern' | 'entry' | 'mid' | 'senior' | 'principal';

export function normalizeSeniority(value: string | null | undefined): CanonicalSeniority | null {
  if (!value) return null;
  const level = value.trim().toLowerCase().replace(/[\s-]+/g, ' ');
  if (/^(intern|internship|student)$/.test(level)) return 'intern';
  if (/^(entry|entry level|junior|graduate|fresher|associate)$/.test(level)) return 'entry';
  if (/^(mid|mid level|intermediate)$/.test(level)) return 'mid';
  if (/^(senior|sr)$/.test(level)) return 'senior';
  if (/^(principal|staff|lead|director|vp|avp|manager|architect)$/.test(level)) return 'principal';
  return null;
}

export function detectSeniority(title: string | null | undefined, description?: string | null): CanonicalSeniority | null {
  const name = title ?? '';
  const explicitRole = description?.match(/^\s*(?:role|job\s*title)\s*:\s*([^\n]+)/im)?.[1];
  if (explicitRole && /\b(?:architect|principal|staff|senior|sr\.?|intern|junior|entry|lead)\b/i.test(explicitRole)) return detectSeniority(explicitRole);
  if (/\b(?:principal|staff|lead|director|architect|manager)\b/i.test(name)) return 'principal';
  if (/\b(?:sr\.?|senior)\b/i.test(name)) return 'senior';
  if (/\b(?:intern(?:ship)?|student)\b/i.test(name)) return 'intern';
  if (/\b(?:junior|jr\.?|entry(?:[ -]?level)?|graduate|fresher)\b/i.test(name)) return 'entry';
  if (/\b(?:engineer|developer|analyst|designer|architect)[\s-]+(?:ii|2)\b/i.test(name)) return 'mid';
  if (/\b(?:engineer|developer|analyst|designer|architect)\s+(?:i|1)\b|\bl1\b/i.test(name)) return 'entry';
  if (/\b(?:engineer|developer|analyst|designer|architect)\s+(?:iii|3)\b|\bl3\b/i.test(name)) return 'mid';
  if (/\b(?:engineer|developer|analyst|designer|architect)\s+(?:iv|4)\b|\bl[4-5]\b/i.test(name)) return 'senior';
  if (/\bl6\b/i.test(name)) return 'principal';
  const tokens: Array<[RegExp, CanonicalSeniority]> = [
    [/\b(?:intern(?:ship)?|student)\b/i, 'intern'],
    [/\b(?:junior|jr\.?|entry[ -]?level|graduate|fresher|associate)\b/i, 'entry'],
    [/\b(?:principal|staff|lead|director|vp|avp|manager|architect)\b/i, 'principal'],
    [/\b(?:senior|sr\.?)\b/i, 'senior'],
    [/\b(?:mid[ -]?level|intermediate)\b/i, 'mid'],
  ];
  for (const [pattern, level] of tokens) if (pattern.test(name)) return level;
  // Some feeds put the canonical role label in the opening description rather
  // than the title field. Only accept an anchored title-shaped phrase; do not
  // infer seniority from generic mentions such as "work with senior engineers".
  const openingRole = description?.match(/\b(?:intern|junior|entry[ -]?level|associate|senior|sr\.?|principal|staff|lead)\s+(?:backend|frontend|front.end|software|data|platform|cloud|full[ -]?stack)?\s*(?:engineer|developer|architect)\b/i);
  if (openingRole) return normalizeSeniority(openingRole[0].split(/\s+/)[0]);
  const required = description?.match(/\b(?:requires?|minimum|at least|must have|need(?:ed)?|qualification[s]?:?)\b[^\n.!?]{0,100}?\b(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional|relevant|industry|work|engineering|software|development)\s+experience\b/i)
    ?? description?.match(/\b(\d{1,2})\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional|relevant|industry|work|engineering|software|development)\s+experience\s+(?:required|needed|minimum)\b/i);
  if (!required) return null;
  const years = Number(required[1]);
  return years >= 10 ? 'principal' : years >= 5 ? 'senior' : years >= 2 ? 'mid' : 'entry';
}

export function seniorityPenalty(candidate: string | null | undefined, job: string | null | undefined): number {
  const from = normalizeSeniority(candidate), to = normalizeSeniority(job);
  if (!from || !to) return 0;
  const levels: CanonicalSeniority[] = ['intern', 'entry', 'mid', 'senior', 'principal'];
  const i = levels.indexOf(from), j = levels.indexOf(to);
  if (i === j) return 0;

  if (j > i) {
    // Underqualified (candidate lower than job)
    const penalties: Record<CanonicalSeniority, number[]> = {
      intern: [0, 0, 20, 40, 50],
      entry:  [0, 0, 20, 35, 45],
      mid:    [0, 0,  0,  5, 20],
      senior: [0, 0,  0,  0,  5],
      principal: [0, 0, 0, 0, 0],
    };
    return penalties[from][j];
  }

  // Overqualified (candidate higher than job, j < i)
  // An internship is strictly for students/interns; experienced candidates face severe mismatch penalties.
  if (to === 'intern') {
    if (from === 'principal') return 50;
    if (from === 'senior') return 40;
    if (from === 'mid') return 30;
    if (from === 'entry') return 10;
  }

  // Senior applying to entry-level has a moderate overqualification penalty
  if (to === 'entry' && from === 'senior') {
    return 15;
  }

  return 0;
}
