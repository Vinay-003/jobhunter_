// src/pages/ProfilePage.tsx — Warm Ink + Amber
import { useEffect, useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import api, { getApiErrorMessage } from '../lib/api';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { user, logout, logoutAll, refresh } = useAuth();
  const [prefs, setPrefs] = useState({ targetRoles: '', locations: '', seniority: '', workModes: '', emphasizedSkills: '', excludedRoles: '', minSalary: '' });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  useEffect(() => {
    api.get('/profile/job-preferences').then(({ data }) => {
      const p = data.preferences;
      if (p) setPrefs({ targetRoles: (p.targetRoles ?? []).join(', '), locations: (p.locations ?? []).join(', '), seniority: (p.seniority ?? []).join(', '), workModes: (p.workModes ?? []).join(', '), emphasizedSkills: (p.emphasizedSkills ?? []).join(', '), excludedRoles: (p.excludedRoles ?? []).join(', '), minSalary: p.minSalary == null ? '' : String(p.minSalary) });
    }).catch(e => setErr(getApiErrorMessage(e))).finally(() => setLoadingPrefs(false));
  }, []);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [deleting, setDeleting] = useState(false);

  const savePrefs = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    setMsg('');
    try {
      const list = (value: string) => value.split(',').map(x => x.trim()).filter(Boolean);
      await api.put('/profile/job-preferences', { targetRoles: list(prefs.targetRoles), locations: list(prefs.locations), seniority: list(prefs.seniority), workModes: list(prefs.workModes), emphasizedSkills: list(prefs.emphasizedSkills), excludedRoles: list(prefs.excludedRoles), minSalary: prefs.minSalary ? Number(prefs.minSalary) : null });
      setMsg('Preferences saved');
    } catch (e2) {
      setErr(getApiErrorMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    try { await logoutAll(); window.location.href = '/login'; }
    catch (error) { setErr(getApiErrorMessage(error)); }
  };

  const handleDeleteResume = async () => {
    setDeleting(true);
    setErr('');
    setMsg('');
    try {
      const res = await api.get('/resumes');
      const resumes = (res.data as { resumes: Array<{ id: string; isLatest?: boolean }> }).resumes;
      const id = (resumes.find(r => r.isLatest) ?? resumes[0])?.id;
      if (!id) { setMsg('No resume to delete'); return; }
      if (!confirm('Delete your latest resume? This cannot be undone.')) return;
      await api.delete(`/resumes/${id}`);
      setMsg('Resume deleted');
      await refresh();
    } catch (e2) {
      setErr(getApiErrorMessage(e2));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>Profile</h1>
        <p className="text-sm text-stone-500">Manage your account and job preferences.</p>
      </div>

      <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-5">
        <p className="text-sm font-medium text-stone-100">Account</p>
        <div className="mt-3 text-sm">
          <p className="text-stone-400">Name: <span className="text-stone-100">{user?.display_name ?? user?.username ?? '—'}</span></p>
          <p className="text-stone-400">Email: <span className="text-stone-100">{user?.email ?? '—'}</span></p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => logout().then(() => (window.location.href = '/login'))} className="text-sm border border-stone-800 bg-stone-900 rounded-lg px-3 py-1.5 text-stone-300 hover:bg-stone-800 hover:text-stone-100 transition">
            Logout
          </button>
          <button onClick={handleLogoutAll} className="text-sm bg-amber-400 hover:bg-amber-300 text-stone-900 font-semibold rounded-lg px-3 py-1.5 transition">
            Logout all devices
          </button>
        </div>
      </div>

      <form onSubmit={savePrefs} className="rounded-xl border border-stone-800 bg-stone-900/60 p-5 space-y-4">
        <p className="text-sm font-medium text-stone-100">Job preferences</p>
        {loadingPrefs ? <p className="text-sm text-stone-400">Loading preferences…</p> : <div className="grid sm:grid-cols-2 gap-3">
          {([
            ['targetRoles', 'Target roles', 'Junior Software Engineer'],
            ['locations', 'Locations', 'India, Remote'],
            ['seniority', 'Seniority', 'Junior'],
            ['workModes', 'Work modes', 'remote, hybrid'],
            ['emphasizedSkills', 'Emphasized skills', 'React, Node'],
            ['excludedRoles', 'Excluded roles', 'Staff Engineer'],
            ['minSalary', 'Minimum salary', ''],
          ] as const).map(([key, label, placeholder]) => <label key={key} className="text-xs text-stone-400">{label}{key !== 'minSalary' ? ' (comma-separated)' : ''}
            <input type={key === 'minSalary' ? 'number' : 'text'} min={key === 'minSalary' ? 0 : undefined}
              value={prefs[key]} onChange={e => setPrefs(p => ({ ...p, [key]: e.target.value }))} placeholder={placeholder}
              className="mt-1 w-full bg-stone-950 border border-stone-800 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-400/40" />
          </label>)}
        </div>}
        <button type="submit" disabled={saving || loadingPrefs} className="bg-amber-400 hover:bg-amber-300 text-stone-900 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 flex items-center gap-1.5 transition">
          {saving && <Loader2 size={14} className="animate-spin" />} Save preferences
        </button>
        {msg && <p className="text-sm text-emerald-300">{msg}</p>}
        {err && <p className="text-sm text-amber-200 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2">{err}</p>}
      </form>

      <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-5">
        <p className="text-sm font-medium text-amber-300">Danger zone</p>
        <p className="text-xs text-stone-500 mt-1">Delete your latest resume from the server.</p>
        <button
          onClick={handleDeleteResume}
          disabled={deleting}
          className="mt-3 text-sm border border-amber-400/20 bg-amber-400/10 text-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-400/15 disabled:opacity-50 flex items-center gap-1.5 transition"
        >
          {deleting && <Loader2 size={14} className="animate-spin" />} Delete resume
        </button>
      </div>
    </div>
  );
}
