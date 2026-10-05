import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { useAuth } from '../features/auth/AuthContext';
import api, { getApiErrorMessage } from '../lib/api';
import { Button, Eyebrow, Modal, Tag } from '../components/UI';
import { type SavedResume } from './libraryData';
import './library.css';

type Preferences = {
  targetRoles: string; locations: string; seniority: string; workModes: string;
  emphasizedSkills: string; excludedRoles: string; minSalary: string;
};
const empty: Preferences = { targetRoles: '', locations: '', seniority: '', workModes: '', emphasizedSkills: '', excludedRoles: '', minSalary: '' };
type PreferenceResponse = { preferences?: { [K in Exclude<keyof Preferences, 'minSalary'>]?: string[] } & { minSalary?: number | null } };
const fromResponse = (response: PreferenceResponse): Preferences => {
  const p = response.preferences;
  return p ? { targetRoles: (p.targetRoles ?? []).join(', '), locations: (p.locations ?? []).join(', '), seniority: (p.seniority ?? []).join(', '), workModes: (p.workModes ?? []).join(', '), emphasizedSkills: (p.emphasizedSkills ?? []).join(', '), excludedRoles: (p.excludedRoles ?? []).join(', '), minSalary: p.minSalary == null ? '' : String(p.minSalary) } : { ...empty };
};
const split = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
const fields: Array<{ key: Exclude<keyof Preferences, 'minSalary'>; label: string; hint: string }> = [
  { key: 'targetRoles', label: 'Target roles', hint: 'Software Engineer, Frontend Developer' },
  { key: 'locations', label: 'Preferred locations', hint: 'New York, Remote' },
  { key: 'seniority', label: 'Seniority', hint: 'Junior, Mid-level' },
  { key: 'workModes', label: 'Work modes', hint: 'Remote, Hybrid' },
  { key: 'emphasizedSkills', label: 'Emphasized skills', hint: 'React, TypeScript' },
  { key: 'excludedRoles', label: 'Excluded roles', hint: 'Staff Engineer' },
];

export default function ProfilePage() {
  const { user, logout, logoutAll, refresh } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Preferences>({ ...empty });
  const [savedPrefs, setSavedPrefs] = useState<Preferences>({ ...empty });
  const [name, setName] = useState(user?.display_name ?? user?.username ?? '');
  const [savedName, setSavedName] = useState(user?.display_name ?? user?.username ?? '');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await api.get<PreferenceResponse>('/profile/job-preferences');
      const next = fromResponse(response.data);
      setPrefs(next); setSavedPrefs(next);
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const current = user?.display_name ?? user?.username ?? ''; setName(current); setSavedName(current); }, [user]);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(savedPrefs) || name !== savedName;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setError(''); setMessage('');
    const salary = prefs.minSalary.trim() === '' ? null : Number(prefs.minSalary);
    if (salary !== null && (!Number.isFinite(salary) || salary < 0)) { setError('Minimum salary must be a non-negative number.'); return; }
    if (!name.trim()) { setError('Display name cannot be empty.'); return; }
    setSaving(true);
    try {
      if (JSON.stringify(prefs) !== JSON.stringify(savedPrefs)) {
        await api.put('/profile/job-preferences', { targetRoles: split(prefs.targetRoles), locations: split(prefs.locations), seniority: split(prefs.seniority), workModes: split(prefs.workModes), emphasizedSkills: split(prefs.emphasizedSkills), excludedRoles: split(prefs.excludedRoles), minSalary: salary });
        setSavedPrefs({ ...prefs });
      }
      if (name !== savedName) {
        await api.patch('/profile', { display_name: name.trim() });
        setSavedName(name.trim()); setName(name.trim());
        await refresh();
      }
      setMessage('Changes saved.');
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setSaving(false); }
  };
  const signOut = async (all: boolean) => {
    setBusy(true); setError(''); setMessage('');
    try { if (all) await logoutAll(); else await logout(); navigate('/login', { replace: true }); }
    catch (err) { setError(getApiErrorMessage(err)); setBusy(false); }
  };
  const deleteLatest = async () => {
    setDeleting(true); setError(''); setMessage('');
    try {
      const response = await api.get<{ resumes: SavedResume[] }>('/resumes');
      const rows = response.data.resumes ?? [];
      const latest = rows.find(item => item.isLatest) ?? rows[0];
      if (!latest) { setMessage('You have no saved resume to delete.'); setConfirmDelete(false); return; }
      await api.delete(`/resumes/${latest.id}`);
      setMessage('Latest resume deleted.'); setConfirmDelete(false);
      await refresh();
    } catch (err) { setError(getApiErrorMessage(err)); setConfirmDelete(false); }
    finally { setDeleting(false); }
  };
  const setField = (key: keyof Preferences, value: string) => { setPrefs(previous => ({ ...previous, [key]: value })); setMessage(''); };

  return <div className="workspace-page profile-page profile-page--minimal library-page">
    <Modal open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} title="Delete your latest resume?" body="Your most recently uploaded PDF and its analyses will be permanently removed. This cannot be undone."><Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</Button><button type="button" className="button button--danger" disabled={deleting} onClick={() => void deleteLatest()}>{deleting ? 'Deleting…' : 'Delete resume'}</button></Modal>
    <div className="page-heading page-heading--compact"><div><Eyebrow>Preferences & account</Eyebrow><h1>Shape the search around you.</h1><p>These inputs guide job discovery. Resume Health remains independent.</p></div>{saving ? <Tag>Saving…</Tag> : message === 'Changes saved.' ? <Tag tone="green">Saved</Tag> : dirty ? <Tag>Unsaved changes</Tag> : null}</div>
    <div className="profile-identity-line"><span className="profile-identity-line__avatar">{(user?.display_name ?? user?.username ?? 'J').slice(0, 2).toUpperCase()}</span><div><h2>{user?.display_name ?? user?.username ?? 'Your account'}</h2><p>{user?.email ?? 'Email unavailable'}</p></div></div>
    {error && <div role="alert" className="library-inline-error">{error}{loading === false && !dirty && <button type="button" onClick={() => void load()}>Retry</button>}</div>}
    {message && <p className="library-success" role="status">{message}</p>}
    <div className="profile-layout profile-layout--editorial"><div className="profile-main profile-main--editorial"><form onSubmit={event => void save(event)}>
      <section className="settings-card settings-section"><div className="settings-card__head"><span className="settings-card__icon"><UserRound size={19}/></span><div><h2>Profile</h2><p>The identity shown across your workspace.</p></div></div><div className="form-grid"><label><span>Display name</span><input value={name} maxLength={100} onChange={event => { setName(event.target.value); setMessage(''); }} autoComplete="name" /></label><label><span>Email</span><input value={user?.email ?? ''} disabled aria-label="Email address"/><small>Email changes aren’t available here.</small></label></div></section>
      <section className="settings-card settings-section"><div className="settings-card__head"><span className="settings-card__icon settings-card__icon--blue"><Briefcase size={19}/></span><div><h2>Job preferences</h2><p>Use commas to separate multiple values. All seven fields are saved to your search profile.</p></div></div>{loading ? <div className="library-skeleton" aria-busy="true" aria-label="Loading preferences"><div/><div/></div> : <><div className="form-stack">{fields.map(field => <label key={field.key}><span>{field.label}</span><textarea value={prefs[field.key]} onChange={event => setField(field.key, event.target.value)} placeholder={field.hint} /><small>Comma-separated entries</small></label>)}</div><div className="form-grid library-salary"><label><span>Minimum salary</span><input type="number" min="0" step="any" value={prefs.minSalary} onChange={event => setField('minSalary', event.target.value)} placeholder="No minimum" /></label></div></>}</section>
      <div className="profile-save"><p><ShieldCheck size={16}/> Preferences affect discovery, not document-quality scoring.</p><div className="profile-save__actions"><button className="text-button" type="button" disabled={!dirty || saving} onClick={() => { setPrefs({ ...savedPrefs }); setName(savedName); setError(''); setMessage('Changes reset.'); }}>Reset</button><Button type="submit" disabled={loading || saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</Button></div></div>
    </form><section className="settings-card settings-section library-account-actions"><div className="settings-card__head"><span className="settings-card__icon"><ShieldCheck size={19}/></span><div><h2>Account & sessions</h2><p>Choose where to end your session.</p></div></div><div className="library-action-line"><button type="button" disabled={busy} onClick={() => void signOut(false)}>Log out</button><button type="button" disabled={busy} onClick={() => void signOut(true)}>Log out on all devices</button></div></section><section className="settings-card settings-section library-danger"><div className="settings-card__head"><span className="settings-card__icon"><Trash2 size={19}/></span><div><h2>Stored resume</h2><p>Remove the latest saved PDF and its analysis history.</p></div></div><button type="button" className="button button--danger" onClick={() => setConfirmDelete(true)}>Delete latest resume</button></section></div>
      <aside className="profile-rail"><div className="profile-rail__head"><small>Search profile</small><h2>What JobHunter will look for.</h2><p>A snapshot of the saved preferences shaping discovery.</p></div><dl className="profile-rail__stats"><div><dt>Role families</dt><dd>{split(savedPrefs.targetRoles).length}</dd></div><div><dt>Locations</dt><dd>{split(savedPrefs.locations).length}</dd></div><div><dt>Work modes</dt><dd>{split(savedPrefs.workModes).join(', ') || 'Any'}</dd></div><div><dt>Minimum salary</dt><dd>{savedPrefs.minSalary || 'Not set'}</dd></div></dl><div className="profile-rail__note"><ShieldCheck size={18}/><p><b>Scoring stays independent.</b> Your search preferences do not affect your Resume Health score.</p></div></aside>
    </div>
  </div>;
}
