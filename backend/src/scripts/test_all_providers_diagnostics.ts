import fs from 'fs';
import pool from '../config/database.js';
import { env } from '../config/env.js';
import axios from 'axios';
import { rankJobsBatch } from '../modules/jobs/ranking.js';
import { parseJd } from '../modules/jd/jdParser.js';
import { JobsPipeProvider } from '../providers/jobs/JobsPipeProvider.js';
import { AdzunaProvider } from '../providers/jobs/AdzunaProvider.js';
import { JoobleProvider } from '../providers/jobs/JoobleProvider.js';
import { RemotiveProvider } from '../providers/jobs/RemotiveProvider.js';
import { ArbeitnowProvider } from '../providers/jobs/ArbeitnowProvider.js';

const userId = '37de4290-45fd-4ebb-a0be-09d2816b26f9';
const res = await pool.query('SELECT rp.profile_json FROM resumes r JOIN resume_profiles rp ON r.id = rp.resume_id WHERE r.user_id = $1 ORDER BY r.created_at DESC LIMIT 1', [userId]);
const profile = res.rows[0].profile_json;

console.log('--- Candidate Profile Summary ---');
console.log('Seniority:', profile.seniority);
console.log('Skills count:', profile.skills?.length);
console.log('Skills:', profile.skills);

const rawResults: Record<string, any> = {};

// 1. Raw JobsPipe
console.log('\nFetching raw JobsPipe...');
try {
  const resp = await axios.post('https://api.jobspipe.dev/v1/jobs/search', {
    job_title_or: ['Backend Developer'],
    limit: 10,
    status: 'active',
    posted_at_max_age_days: 30,
    job_country_code_or: ['IN'],
  }, {
    headers: { Authorization: `Bearer ${env.JOBSPIPE_API_KEY}`, 'Content-Type': 'application/json' },
    timeout: 20000
  });
  rawResults.jobspipe = resp.data;
  console.log(`JobsPipe returned ${resp.data?.data?.length} jobs`);
} catch (e: any) {
  console.error('JobsPipe fetch failed:', e.message);
  rawResults.jobspipe = { error: e.message };
}

// 2. Raw Adzuna
console.log('\nFetching raw Adzuna...');
try {
  const resp = await axios.get(`https://api.adzuna.com/v1/api/jobs/in/search/1`, {
    params: {
      app_id: env.ADZUNA_APP_ID,
      app_key: env.ADZUNA_APP_KEY,
      results_per_page: 10,
      what: 'Backend Developer',
      where: 'India',
    },
    timeout: 20000
  });
  rawResults.adzuna = resp.data;
  console.log(`Adzuna returned ${resp.data?.results?.length} jobs`);
} catch (e: any) {
  console.error('Adzuna fetch failed:', e.message);
  rawResults.adzuna = { error: e.message };
}

// 3. Raw Jooble
console.log('\nFetching raw Jooble...');
try {
  const resp = await axios.post(`https://jooble.org/api/${env.JOOBLE_API_KEY}`, {
    keywords: 'Backend Developer',
    location: 'India',
    page: 1
  }, { timeout: 20000 });
  rawResults.jooble = resp.data;
  console.log(`Jooble returned ${resp.data?.jobs?.length} jobs`);
} catch (e: any) {
  console.error('Jooble fetch failed:', e.message);
  rawResults.jooble = { error: e.message };
}

// 4. Raw Remotive
console.log('\nFetching raw Remotive...');
try {
  const resp = await axios.get('https://remotive.com/api/remote-jobs', {
    params: { search: 'Backend Developer', limit: 10 },
    timeout: 20000
  });
  rawResults.remotive = resp.data;
  console.log(`Remotive returned ${resp.data?.jobs?.length} jobs`);
} catch (e: any) {
  console.error('Remotive fetch failed:', e.message);
  rawResults.remotive = { error: e.message };
}

// 5. Raw Arbeitnow
console.log('\nFetching raw Arbeitnow...');
try {
  const resp = await axios.get('https://www.arbeitnow.com/api/job-board-api', { timeout: 20000 });
  rawResults.arbeitnow = {
    total: resp.data?.data?.length,
    sample: resp.data?.data?.slice(0, 5)
  };
  console.log(`Arbeitnow returned ${resp.data?.data?.length} total dump jobs`);
} catch (e: any) {
  console.error('Arbeitnow fetch failed:', e.message);
  rawResults.arbeitnow = { error: e.message };
}

fs.writeFileSync(
  '/home/mylappy/.gemini/antigravity/brain/ba8f321b-4da0-41f4-834d-71408934d6e6/scratch/raw_provider_responses.json',
  JSON.stringify(rawResults, null, 2)
);
console.log('\nSaved raw responses to scratch/raw_provider_responses.json');

// Now fetch through normalized providers
console.log('\n--- Fetching Normalized Jobs Across Providers ---');
const query = { keywords: 'Backend Developer', country: 'IN', location: 'India', limit: 10 };
const normalizedJobs: any[] = [];

try {
  const jpJobs = await new JobsPipeProvider().search(query);
  console.log(`Normalized JobsPipe: ${jpJobs.length}`);
  normalizedJobs.push(...jpJobs);
} catch (e: any) { console.error('JobsPipe search failed:', e.message); }

try {
  const adzJobs = await new AdzunaProvider().search(query);
  console.log(`Normalized Adzuna: ${adzJobs.length}`);
  normalizedJobs.push(...adzJobs);
} catch (e: any) { console.error('Adzuna search failed:', e.message); }

try {
  const jooJobs = await new JoobleProvider().search(query);
  console.log(`Normalized Jooble: ${jooJobs.length}`);
  normalizedJobs.push(...jooJobs);
} catch (e: any) { console.error('Jooble search failed:', e.message); }

try {
  const remJobs = await new RemotiveProvider().search(query);
  console.log(`Normalized Remotive: ${remJobs.length}`);
  normalizedJobs.push(...remJobs);
} catch (e: any) { console.error('Remotive search failed:', e.message); }

try {
  const arbJobs = await new ArbeitnowProvider().search(query);
  console.log(`Normalized Arbeitnow: ${arbJobs.length}`);
  normalizedJobs.push(...arbJobs);
} catch (e: any) { console.error('Arbeitnow search failed:', e.message); }

console.log(`\nTotal Normalized Jobs Collected: ${normalizedJobs.length}`);

// Deduplicate by url/title+company
const seen = new Set();
const dedupedJobs = normalizedJobs.filter(j => {
  const key = (j.url || `${j.title}-${j.company}`).toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
console.log(`Unique Deduplicated Jobs: ${dedupedJobs.length}`);

// Now Rank them with AWS SageMaker embeddings (or fallback)
console.log('\n--- Ranking Jobs with Profile ---');
const ranked = await rankJobsBatch(profile, dedupedJobs, {
  preferences: { targetRoles: ['Backend Developer', 'Full Stack Developer', 'Frontend Developer'], locations: ['India'] },
  ownerId: userId
});

const diagnostics = ranked.map((r, i) => {
  const orig = dedupedJobs[i];
  const parsed = parseJd(orig.description || '');
  return {
    rank: i + 1,
    fitScore: r.fitScore,
    provider: orig.source,
    title: orig.title,
    company: orig.company,
    location: orig.location,
    url: orig.url,
    breakdown: r.breakdown,
    matchedSkills: r.matchedSkills,
    missingSkills: r.missingSkills,
    extractedSkillsFromJd: {
      required: [...new Set([...(parsed.requiredSkills ?? []), ...(orig.providerSkills ?? [])])],
      preferred: parsed.preferredSkills,
      groupsCount: parsed.requirementGroups?.length ?? 0
    },
    skillEvidence: r.scoreDetails?.skillEvidence,
    evidence: r.evidence,
    descSnippet: orig.description?.slice(0, 300)
  };
}).sort((a, b) => b.fitScore - a.fitScore);

fs.writeFileSync(
  '/home/mylappy/.gemini/antigravity/brain/ba8f321b-4da0-41f4-834d-71408934d6e6/scratch/ranked_jobs_diagnostics.json',
  JSON.stringify(diagnostics, null, 2)
);
console.log('Saved diagnostics to scratch/ranked_jobs_diagnostics.json');

console.log('\n=== Top 20 Ranked Jobs Summary ===');
diagnostics.slice(0, 20).forEach((d, idx) => {
  console.log(`#${idx + 1} [${d.fitScore}%] [${d.provider}] "${d.title}" @ "${d.company}" (${d.location})`);
  console.log(`   Breakdown:`, JSON.stringify(d.breakdown));
  console.log(`   JD Extracted Skills:`, d.extractedSkillsFromJd.required);
  console.log(`   Matched Skills:`, d.matchedSkills, `Missing:`, d.missingSkills);
  console.log(`   Key Evidence:`, d.evidence?.slice(0, 2));
  console.log('');
});

await pool.end();
process.exit(0);
