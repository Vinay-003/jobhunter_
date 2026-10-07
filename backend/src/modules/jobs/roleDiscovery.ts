import { createHash } from 'node:crypto';
import axios from 'axios';
import { z } from 'zod';
import type { ResumeProfile } from '../parsing/resumeProfile.js';

export const ROLE_DISCOVERY_VERSION = '2.2.0';
export const ALLOWED_FREE_MODELS = [
  'free/deepseek-v4.1-flash',
  'free/deepseek-v4-flash-0731',
  'free/glm-5.3-flash',
  'free/gpt-6-luna',
  'free/mimo-v2.6-pro',
  'free/mimo2.6'
] as const;
const MODELS = [
  'free/deepseek-v4.1-flash',
  'free/deepseek-v4-flash-0731',
  'free/glm-5.3-flash',
  'free/gpt-6-luna',
  'free/mimo-v2.6-pro'
] as const;
const INFERENCE_BUDGET_MS = 70_000;
const MODEL_TIMEOUTS_MS = [45_000, 25_000, 20_000] as const;
const TTL = 24 * 60 * 60_000;

export function normalizeRoleModel(model?: string | null): string {
  if (!model) return 'free/deepseek-v4.1-flash';
  const m = model.trim();
  if (m === 'free/mimo2.6' || m === 'mimo2.6' || m === 'mimo-v2.6-pro') return 'free/mimo-v2.6-pro';
  if (m === 'free/gpt-6-luna') return 'free/gpt-6-luna';
  if (m === 'free/deepseek-v4.1-flash') return 'free/deepseek-v4.1-flash';
  if (m === 'free/deepseek-v4-flash-0731') return 'free/deepseek-v4-flash-0731';
  if (m === 'free/glm-5.3-flash') return 'free/glm-5.3-flash';
  return m;
}

export function isAllowedFreeModel(model?: string | null): boolean {
  if (!model) return false;
  const m = model.trim();
  return m.startsWith('free/');
}

const cache = new Map<string, RoleDiscoveryResult>();
const pending = new Map<string, Promise<RoleDiscoveryResult>>();
export type DiscoveredRole = { title: string; reason: string; evidence: string[] };
export type RoleDiscoveryResult = { source: 'ai' | 'fallback'; model: string | null; version: string; cacheKey: string; createdAt: string; roles: DiscoveredRole[]; warning?: string };
export type RoleDiscoveryTransport = (input: { url: string; headers: Record<string, string>; body: string; timeoutMs: number; maxBytes: number }) => Promise<string>;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const redact = (s: string) => s.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gi, '[email]').replace(/(?:https?:\/\/|www\.)\S+/gi, '[link]').replace(/(?:\+?\d[\d ()-]{8,}\d)/g, '[phone]');
const normalized = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const FRONT = /\b(?:front[ -]?end|react(?:\.js)?|next\.js|vue(?:\.js)?|angular|html|css|user interfaces?|\bui\b|\bux\b)\b/i;
const BACK = /\b(?:back[ -]?end|fastapi|node(?:\.js)?|express(?:\.js)?|django|spring|rest(?:ful)? apis?|database|postgres(?:ql)?|mongodb|server(?:[- ]side)?|authentication|payment integration|queues?|python|apis?|\bssr\b|graphql)\b/i;

export function roleArea(text: string): string {
  if (/\bfull[ -]?stack\b/i.test(text)) return 'fullstack';
  if (/\b(?:data (?:engineer|scientist|analyst)|analytics engineer|data science|machine learning|ai engineer|ml engineer|ai forward|ai product|ai researcher|scientist|researcher)\b/i.test(text)) return 'data';
  if (/\b(?:devops|platform|cloud|sre|site reliability|infrastructure)\b/i.test(text)) return 'platform';
  if (/\b(?:embedded|firmware|autosar)\b/i.test(text)) return 'embedded';
  if (FRONT.test(text) || /\b(?:ui|ux|user interface)\b/i.test(text)) return 'frontend';
  if (/\b(?:back[ -]?end|api|server)\b/i.test(text)) return 'backend';
  return /\b(?:software|developer|engineer|web)\b/i.test(text) ? 'generic' : 'other';
}

function professionalLines(p: ResumeProfile): string[] {
  return [...(p.experience ?? []), ...(p.projects ?? [])].flatMap(e => [e.title, e.description]).filter((s): s is string => !!s).map(redact);
}

export function profileMaterial(p: ResumeProfile): string {
  return redact([
    'SUMMARY', p.summary ?? '', 'EXPERIENCE AND PROJECTS', ...professionalLines(p).map((line, i) => `[P${i + 1}] ${line}`),
    'SKILLS (declared, not necessarily demonstrated)', ...(p.skills ?? []),
    'EDUCATION', ...(p.education ?? []).map(e => `${e.degree ?? ''} ${e.field ?? ''}; completion=${e.completionDate ?? e.year ?? 'unknown'}; completed=${e.completed ?? 'unknown'}`),
    `SENIORITY: ${p.seniority}; employment years=${p.employmentYears ?? 'unknown'}; internship years=${p.internshipYears ?? 'unknown'}`,
  ].join('\n'));
}

export function profileRoleAreas(p: ResumeProfile): Set<string> {
  const text = professionalLines(p).join('\n');
  const areas = new Set<string>();
  if (FRONT.test(text)) areas.add('frontend');
  if (BACK.test(text)) areas.add('backend');
  if (areas.has('frontend') && areas.has('backend') || /\bfull[ -]?stack\b/i.test(text)) areas.add('fullstack');
  if (/\b(?:trained|fine.tuned|evaluated)\b.{0,80}\b(?:models?|machine learning)\b/i.test(text)) areas.add('data');
  if (/\b(?:kubernetes|terraform|site reliability)\b/i.test(text)) areas.add('platform');
  return areas;
}

export function inferRoleTitles(p: ResumeProfile): string[] {
  const areas = profileRoleAreas(p);
  const labels = { fullstack: 'Full Stack Developer', backend: 'Backend Developer', frontend: 'Frontend Developer', data: 'Machine Learning Engineer', platform: 'Platform Engineer' };
  const roles = Object.entries(labels).filter(([key]) => areas.has(key)).map(([, title]) => title).slice(0, 3);
  return roles.length ? roles : professionalLines(p).length ? ['Software Engineer'] : [];
}

function fallback(p: ResumeProfile): DiscoveredRole[] {
  const lines = professionalLines(p);
  return inferRoleTitles(p).map(title => ({
    title,
    reason: 'Deterministic fallback using demonstrated professional/project evidence.',
    evidence: lines.filter(s => roleArea(title) === 'frontend' ? FRONT.test(s) : roleArea(title) === 'backend' ? BACK.test(s) : true).slice(0, 2).map(s => s.slice(0, 400))
  }));
}

const roleSchema = z.object({
  roles: z.array(z.object({
    title: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{N} .,&()\-/]+$/u),
    reason: z.string().trim().min(5).max(1000),
    evidence: z.array(z.string().trim().min(3).max(12000)).min(1).max(10).optional(),
    evidenceIds: z.array(z.string().regex(/^P\d{1,3}$/)).min(1).max(10).optional(),
  })).min(1).max(5)
});

function hasGrounding(evidenceLine: string, resumeText: string): boolean {
  const normLine = normalized(evidenceLine);
  if (normLine.length < 5) return false;
  const normText = normalized(resumeText);
  if (normText.includes(normLine)) return true;
  const words = normLine.split(/[^a-z0-9+]+/i).filter(w => w.length > 3 && !['with', 'that', 'this', 'from', 'have', 'been', 'were', 'which', 'built', 'using', 'also'].includes(w));
  if (words.length === 0) return true;
  const matches = words.filter(w => normText.includes(w)).length;
  return (matches / words.length) >= 0.35;
}

export function validatedRoles(value: unknown, text: string, profile: ResumeProfile): DiscoveredRole[] {
  const parsed = roleSchema.parse(value);
  const lines = professionalLines(profile);
  const roles: DiscoveredRole[] = parsed.roles.map(r => ({
    title: r.title.trim(),
    reason: r.reason.trim(),
    evidence: r.evidenceIds
      ? r.evidenceIds.map(id => {
          const line = lines[Number(id.slice(1)) - 1];
          if (!line) throw Error('INVALID_EVIDENCE_ID');
          return line;
        })
      : (r.evidence ?? []).slice(0, 3)
  }));

  const seen = new Set<string>();
  for (const role of roles) {
    const key = normalized(role.title).replace(/engineer|developer/g, 'role');
    if (seen.has(key) || !role.evidence.length) throw Error('INVALID_EVIDENCE');
    if (role.evidence.some(e => !hasGrounding(e, text))) throw Error('INVALID_EVIDENCE');
    if (/\b(?:senior|principal|lead|staff|manager|director)\b/i.test(role.title) && ['intern', 'entry', 'junior'].includes(profile.seniority ?? '')) {
      throw Error('UNSUPPORTED_SENIORITY');
    }
    seen.add(key);
  }
  return roles;
}

const SKELETON = JSON.stringify({
  roles: [
    {
      title: "Backend Engineer",
      reason: "Candidate has 5+ years building scalable microservices and distributed transaction pipelines.",
      evidence: [
        "Designed distributed transaction processing engine in Go handling 50k req/sec.",
        "Built Kafka message queues and optimized PostgreSQL queries."
      ]
    }
  ]
}, null, 2);

const SYSTEM = `You are an expert technical recruiter and resume analyzer.
Analyze the candidate's professional material and determine up to 3 distinct standard job titles that best match their demonstrated experience.

STRICT INSTRUCTIONS:
1. Provide standard occupational titles without seniority prefixes (e.g. use "Backend Engineer" or "Data Scientist", not "Senior Backend Engineer").
2. "reason": Exactly 1-2 brief sentences explaining why this role fits the candidate based on evidence.
3. "evidence": Strictly 2 to 3 concise bullet points or lines (max 25 words each) citing demonstrated experience, tools, or projects. Do NOT output large essays or lengthy paragraphs.
4. Output strictly valid JSON matching this schema skeleton. Do NOT include markdown formatting or commentary outside the JSON.

SCHEMA SKELETON:
${SKELETON}`;

export function parseRoleOutput(content: string): { value: unknown; repaired: boolean } {
  let text = content.trim();
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim();
  } else {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1).trim();
    }
  }
  try {
    return { value: JSON.parse(text), repaired: false };
  } catch {
    /* Delimiter repair */
  }
  let t = text;
  while (t.endsWith('}') || t.endsWith(']')) {
    t = t.slice(0, -1).trim();
    try {
      return { value: JSON.parse(t), repaired: true };
    } catch {}
  }
  const stack: string[] = [];
  let quoted = false, escaped = false;
  for (const c of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      if (stack.pop() !== c) throw Error('INVALID_JSON');
    }
  }
  if (quoted || !stack.length || stack.length > 3) throw Error('INVALID_JSON');
  try {
    return { value: JSON.parse(text + stack.reverse().join('')), repaired: true };
  } catch {
    throw Error('INVALID_JSON');
  }
}

export async function discoverRoles(profile: ResumeProfile, options: { ownerId: string; cached?: RoleDiscoveryResult | null; transport?: RoleDiscoveryTransport }): Promise<RoleDiscoveryResult> {
  const material = profileMaterial(profile);
  const cacheKey = sha(`${options.ownerId}:${ROLE_DISCOVERY_VERSION}:${MODELS.join(',')}:${material}`);
  const usable = (v?: RoleDiscoveryResult | null) => {
    if (!v || v.version !== ROLE_DISCOVERY_VERSION || v.cacheKey !== cacheKey || v.source !== 'ai' || (!MODELS.some(model => model === v.model) && !isAllowedFreeModel(v.model))) return false;
    const age = Date.now() - Date.parse(v.createdAt);
    try { validatedRoles(v, material, profile); } catch { return false; }
    return Number.isFinite(age) && age >= 0 && age < TTL;
  };

  const configError = material.length > 40_000
    ? 'INPUT_TOO_LONG'
    : !process.env.APINEX_API_KEY
      ? 'NOT_CONFIGURED'
      : process.env.APINEX_ROLE_MODEL && !isAllowedFreeModel(process.env.APINEX_ROLE_MODEL)
        ? 'MODEL_NOT_ALLOWED'
        : null;

  if (!configError) {
    if (usable(options.cached)) return options.cached!;
    if (usable(cache.get(cacheKey))) return cache.get(cacheKey)!;
    if (pending.has(cacheKey)) return pending.get(cacheKey)!;
  }

  const task = (async () => {
    const base = { version: ROLE_DISCOVERY_VERSION, cacheKey, createdAt: new Date().toISOString() };
    try {
      if (configError) throw Error(configError);
      const transport: RoleDiscoveryTransport = options.transport ?? (async req => {
        const response = await axios.post(req.url, JSON.parse(req.body), { headers: req.headers, timeout: req.timeoutMs, maxContentLength: req.maxBytes, maxBodyLength: 100_000, maxRedirects: 0, responseType: 'text' });
        return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      });

      const candidateModels: string[] = (() => {
        if (process.env.APINEX_ROLE_MODEL) {
          const norm = normalizeRoleModel(process.env.APINEX_ROLE_MODEL);
          if (norm === 'free/mimo-v2.6-pro') return ['free/mimo-v2.6-pro', 'free/deepseek-v4.1-flash'];
          if (norm === 'free/gpt-6-luna') return ['free/gpt-6-luna', 'free/mimo-v2.6-pro'];
          return [norm, 'free/deepseek-v4.1-flash', 'free/deepseek-v4-flash-0731', 'free/glm-5.3-flash'];
        }
        return ['free/deepseek-v4.1-flash', 'free/deepseek-v4-flash-0731', 'free/glm-5.3-flash', 'free/gpt-6-luna', 'free/mimo-v2.6-pro'];
      })();

      const userContent = `Candidate Resume Profile:
${material}

Return strictly a JSON object with up to 3 distinct target job titles following this exact schema:
${SKELETON}`;

      const started = Date.now();
      let lastFailureCode = 'INVALID_RESPONSE_SCHEMA';

      for (const [index, candidateModel] of candidateModels.entries()) {
        const model = normalizeRoleModel(candidateModel);
        const timeoutMs = Math.min(MODEL_TIMEOUTS_MS[index] ?? 25_000, INFERENCE_BUDGET_MS - (Date.now() - started));
        if (timeoutMs <= 0) {
          lastFailureCode = 'INFERENCE_TIMEOUT';
          break;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const request = transport({
            url: 'https://api.apinex.bond/v1/chat/completions',
            headers: {
              Authorization: `Bearer ${process.env.APINEX_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: userContent }
              ],
              temperature: 0.1
            }),
            timeoutMs,
            maxBytes: 96_000
          });
          const raw = await Promise.race([
            request,
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(Error('INFERENCE_TIMEOUT')), timeoutMs);
            })
          ]);
          if (typeof raw !== 'string' || Buffer.byteLength(raw) > 96_000) throw Error('INVALID_RESPONSE_SCHEMA');
          const envelope = JSON.parse(raw);
          const content = envelope?.choices?.[0]?.message?.content;
          if (typeof content !== 'string' || !content.trim()) throw Error('INVALID_RESPONSE_SCHEMA');
          const output = parseRoleOutput(content);
          const roles = validatedRoles(output.value, material, profile);
          const warning = index > 0
            ? `${candidateModels[0].includes('luna') ? 'Luna' : candidateModels[0]} returned invalid role output or failed; validated fallback model ${model} was used.`
            : output.repaired
              ? 'AI response lacked closing JSON delimiters; repaired delimiters only, then validated all fields and evidence.'
              : undefined;
          const result: RoleDiscoveryResult = { ...base, source: 'ai', model, roles, ...(warning ? { warning } : {}) };
          cache.set(cacheKey, result);
          while (cache.size > 128) cache.delete(cache.keys().next().value!);
          console.info(`[role-discovery] source=ai model=${model} roles=${roles.length} ms=${Date.now() - started}`);
          return result;
        } catch (attemptErr: any) {
          console.warn(`[role-discovery] model=${model} attempt failed:`, attemptErr?.message || attemptErr);
          lastFailureCode = axios.isAxiosError(attemptErr)
            ? attemptErr.response?.status === 402
              ? 'HTTP_402_ACCOUNT_OR_QUOTA'
              : `HTTP_${attemptErr.response?.status ?? 'UNAVAILABLE'}`
            : attemptErr instanceof Error && /^[A-Z_]{3,40}$/.test(attemptErr.message)
              ? attemptErr.message
              : 'INVALID_RESPONSE_SCHEMA';
          if (axios.isAxiosError(attemptErr) && [401, 402, 403].includes(attemptErr.response?.status ?? 0)) {
            break;
          }
          continue;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }

      // If primary candidate models failed or exhausted, attempt configured fallback provider
      const fallbackKey = process.env.FALLBACK_AI_KEY || process.env.APINEX_BACKUP_KEY;
      if (fallbackKey) {
        const fallbackUrl = process.env.FALLBACK_AI_BASE_URL || 'https://api.apinex.bond/v1/chat/completions';
        const fallbackModel = process.env.FALLBACK_AI_MODEL || 'free/deepseek-v4-flash-0731';
        try {
          const raw = await transport({
            url: fallbackUrl,
            headers: {
              Authorization: `Bearer ${fallbackKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: fallbackModel,
              messages: [
                { role: 'system', content: SYSTEM },
                { role: 'user', content: userContent }
              ],
              temperature: 0.1
            }),
            timeoutMs: 25_000,
            maxBytes: 96_000
          });
          const envelope = JSON.parse(raw);
          const content = envelope?.choices?.[0]?.message?.content;
          if (typeof content === 'string' && content.trim()) {
            const output = parseRoleOutput(content);
            const roles = validatedRoles(output.value, material, profile);
            const result: RoleDiscoveryResult = {
              ...base,
              source: 'ai',
              model: fallbackModel,
              roles,
              warning: 'Primary AI provider exhausted or unavailable; fallback AI provider used successfully.'
            };
            cache.set(cacheKey, result);
            while (cache.size > 128) cache.delete(cache.keys().next().value!);
            return result;
          }
        } catch (fbErr: any) {
          console.warn('[role-discovery] fallback AI provider failed:', fbErr?.message || fbErr);
        }
      }

      throw Error(lastFailureCode);
    } catch (error) {
      const code = axios.isAxiosError(error)
        ? error.response?.status === 402
          ? 'HTTP_402_ACCOUNT_OR_QUOTA'
          : `HTTP_${error.response?.status ?? 'UNAVAILABLE'}`
        : error instanceof Error && /^[A-Z_]{3,40}$/.test(error.message) ? error.message : 'INVALID_RESPONSE_SCHEMA';
      console.warn(`[role-discovery] source=fallback code=${code}`);
      return { ...base, source: 'fallback' as const, model: null, roles: fallback(profile), warning: `AI role discovery unavailable (${code}); evidence-based fallback used.` };
    }
  })();

  if (!configError) pending.set(cacheKey, task);
  try { return await task; } finally { if (!configError) pending.delete(cacheKey); }
}

export default discoverRoles;
