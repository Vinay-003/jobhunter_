import { canonicalJobUrl, deduplicateJobs, contentHash, upsertJob, upsertJobsBatch, markFallback, normalizedPostedAt } from '../providers/jobs/jobStore.js';
import { detectJobSeniority, roleFamily } from '../modules/jobs/ranking.js';
import { eligibleJob, effectivePreferences, countryCodeForLocation } from '../modules/jobs/eligibility.js';
import { JobQueryPlanner } from '../modules/jobs/queryPlanner.js';

const job = (overrides: Record<string, unknown> = {}) => ({ source: 'jooble', externalId: 'a', title: 'Junior Software Engineer', company: 'Example', location: 'India', description: 'Build TypeScript APIs', url: 'https://example.com/job/1?utm_source=feed', salary: null, workMode: 'remote', postedAt: '2026-10-02', ...overrides });

describe('recommendation integrity', () => {
  test('canonical URL ignores tracking but preserves distinct geographic openings', () => {
    expect(canonicalJobUrl(job().url)).toBe('https://example.com/job/1');
    expect(deduplicateJobs([job(), job({ source: 'adzuna', externalId: 'b', url: 'https://example.com/job/1?utm_campaign=x', description: 'Build TypeScript APIs and PostgreSQL systems' })])).toHaveLength(1);
    expect(deduplicateJobs([job(), job({ source: 'adzuna', externalId: 'c', location: 'Germany', url: 'https://example.com/job/2' })])).toHaveLength(2);
    expect(contentHash(job())).not.toBe(contentHash(job({ description: 'A different job description' })));
  });
  test('upsert resolves existing job ID and hashes actual description', async () => {
    let sql = '';
    const id = '00000000-0000-4000-8000-000000000001';
    const client = { query: async (text: string) => { sql = text; return { rows: [{ id }] }; } };
    expect(await upsertJob(job(), client)).toBe(id);
    expect(sql).toContain('ON CONFLICT (source, external_id) DO UPDATE');
    expect(sql).toContain('RETURNING id');
    expect(upsertJob(job(), { query: async () => ({ rows: [] }) })).rejects.toThrow('did not return an id');
  });
  test('upsertJobsBatch handles multi-job arrays with single query and deduplication', async () => {
    let sql = '';
    const client = {
      query: async (text: string) => {
        sql = text;
        return { rows: [{ id: 'id-1', source: 'jooble', external_id: 'a' }, { id: 'id-2', source: 'adzuna', external_id: 'b' }] };
      },
    };
    const map = await upsertJobsBatch([job({ externalId: 'a' }), job({ source: 'adzuna', externalId: 'b' }), job({ externalId: 'a' })], client);
    expect(sql).toContain('INSERT INTO jobs');
    expect(sql).toContain('ON CONFLICT (source, external_id) DO UPDATE');
    expect(map.get('jooble:a')).toBe('id-1');
    expect(map.get('adzuna:b')).toBe('id-2');
  });
  test('title level ignores colleagues and school; role family excludes unrelated work', () => {
    expect(detectJobSeniority('Junior Data Engineer', 'Work with senior managers leading teams')).toBe('entry');
    expect(detectJobSeniority('Senior React Developer')).toBe('senior');
    expect(detectJobSeniority('Software Engineer I', 'Senior Secondary School')).toBe('entry');
    expect(roleFamily('Remote Office Assistant')).toBe('other');
  });
  test('saved preferences merge with request and eligibility rejects explicit barriers', () => {
    const prefs = effectivePreferences({ target_roles: ['Backend Engineer'], locations: ['India'], work_modes: ['remote'] }, { workModes: ['onsite'] });
    expect(prefs.targetRoles).toEqual(['Backend Engineer']);
    expect(prefs.workModes).toEqual(['onsite']);
    expect(eligibleJob(job({ title: 'Senior React Developer' }), 'junior', prefs).status).toBe('ineligible');
    expect(eligibleJob(job({ description: 'Remote US and Canada residents only' }), 'junior', prefs).status).toBe('ineligible');
    expect(eligibleJob(job({ postedAt: null, workMode: 'onsite' }), 'junior', { ...prefs, daysPosted: 1 }).status).toBe('ineligible');
    expect(eligibleJob(job({ postedAt: null, workMode: 'onsite' }), 'junior', { ...prefs, daysPosted: 1, includeUnknownDates:true }).status).toBe('uncertain');
  });
  test('minimum professional years and completed-degree evidence stay separate from fit', () => {
    const prefs = effectivePreferences({ locations: ['India'] }, {});
    expect(eligibleJob(job({ description: 'Requires 4–7+ years of professional software development experience' }), 'junior', prefs, { professionalYears: .33 }).status).toBe('ineligible');
    expect(eligibleJob(job({ description: 'Requires 4–7+ years of professional software development experience' }), 'junior', prefs, { employmentYears: null, internshipYears: .33 }).status).toBe('ineligible');
    expect(eligibleJob(job({ description: 'Requires 4+ years of professional software development experience' }), 'junior', prefs).status).toBe('uncertain');
    expect(eligibleJob(job({ description: 'Completed bachelor degree required in Computer Science' }), 'junior', prefs, { education: [{ degree: 'Bachelor of Engineering', status: 'in-progress' }] }).status).toBe('uncertain');
    expect(eligibleJob(job({ description: 'Completed bachelor degree required in Computer Science' }), 'junior', prefs, { education: [{ degree: 'Bachelor of Engineering', field: 'Computer Science', status: 'completed' }] }).status).toBe('eligible');
    expect(eligibleJob(job({ description: 'Completed bachelor degree required in Computer Science' }), 'junior', prefs, { education: [{ degree: 'Bachelor of Engineering', field: 'History', status: 'completed' }] }).status).toBe('uncertain');
  });
  test('remote residency never implies worldwide eligibility', () => {
    const india = effectivePreferences({ locations: ['India'] }, {});
    expect(eligibleJob(job({ location: 'Remote', workMode: 'remote' }), 'junior', india).status).toBe('ineligible');
    expect(eligibleJob(job({ location: 'Remote', workMode: 'remote' }), 'junior', {...india,includeUnknownLocations:true}).status).toBe('uncertain');
    expect(eligibleJob(job({ location: 'Remote — US only', workMode: 'remote' }), 'junior', india).status).toBe('ineligible');
    expect(eligibleJob(job({ location: 'Worldwide', workMode: 'remote' }), 'junior', india).status).toBe('eligible');
    const canada = effectivePreferences({ locations: ['Canada'] }, {});
    expect(eligibleJob(job({ location: 'Remote — Canada residents only' }), 'junior', canada).status).not.toBe('ineligible');
    expect(eligibleJob(job({ location: 'Berlin, Germany', workMode: 'onsite' }), 'junior', canada).status).toBe('ineligible');
  });
  test('role preferences reject unrelated roles but retain generic software engineer', () => {
    const prefs = effectivePreferences({ target_roles: ['Backend Engineer'] }, {});
    expect(eligibleJob(job({ title: 'Frontend Engineer' }), 'junior', prefs).status).toBe('ineligible');
    expect(eligibleJob(job({ title: 'Software Engineer I' }), 'junior', prefs).status).not.toBe('ineligible');
  });
  test('same-source cache fallback is marked; excluded planner roles never return as fallback', () => {
    const [fallback] = markFallback([job()], 'jooble');
    expect(fallback.source).toBe('jooble');
    expect(fallback.retrieval).toEqual({ status:'fallback', requestedProvider:'jooble', fallbackSource:'jooble' });
    const queries = new JobQueryPlanner().plan({ targetRoles:['Software Engineer'], excludedRoles:['Software Engineer','Developer'] }, { skills:[], seniority:'junior' } as any);
    expect(queries).toEqual([]);
  });
  test('numeric provider dates are seconds or milliseconds, not 1970 timestamps', () => {
    expect(normalizedPostedAt(1790985600)).toBe('2026-10-03T00:00:00.000Z');
    expect(normalizedPostedAt(1790985600000)).toBe('2026-10-03T00:00:00.000Z');
    expect(normalizedPostedAt('nonsense')).toBeNull();
  });
  test('provider country capability uses validated country codes, not arbitrary city text', () => {
    expect(countryCodeForLocation('Toronto, Canada')).toBe('CA');
    expect(countryCodeForLocation('Bengaluru')).toBe('IN');
    expect(countryCodeForLocation('Remote')).toBeNull();
  });
});
