// src/pages/ProfilePage.tsx
import { useState } from 'react';
import { useAuth } from '../features/auth/AuthContext';
import api, { getApiErrorMessage } from '../lib/api';
import { Loader2 } from 'lucide-react';

export default function ProfilePage() {
  const { user, logout, logoutAll, refresh } = useAuth();
  const [prefs, setPrefs] = useState({ keywords: '', location: '', min_match_score: 50, days_posted: 30 });
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
      await api.put('/profile', { jobPreferences: prefs });
      setMsg('Preferences saved');
    } catch (e2) {
      setErr(getApiErrorMessage(e2));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoutAll = async () => {
    await logoutAll();
    window.location.href = '/login';
  };

  const handleDeleteResume = async () => {
    if (!confirm('Delete your latest resume? This cannot be undone.')) return;
    setDeleting(true);
    try {
      // Try to get latest id then delete
      const res = await api.get('/latest-resume');
      const id = (res.data as { resume?: { id: number } })?.resume?.id;
      if (!id) throw new Error('No resume found');
      await api.delete(`/resumes/${id}`).catch(() => api.delete(`/resume/${id}`));
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
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-sm text-gray-500">Manage your account and job preferences.</p>
      </div>

      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
        <p className="text-sm font-medium">Account</p>
        <div className="mt-3 text-sm">
          <p className="text-gray-300">Username: <span className="text-white">{user?.username ?? '—'}</span></p>
          <p className="text-gray-300">Email: <span className="text-white">{user?.email ?? '—'}</span></p>
          <p className="text-xs text-gray-500 mt-1">ID: {user?.id ?? '—'}</p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => logout().then(() => (window.location.href = '/login'))} className="text-sm border border-white/10 rounded-lg px-3 py-1.5">
            Logout
          </button>
          <button onClick={handleLogoutAll} className="text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-1.5">
            Logout all devices
          </button>
        </div>
      </div>

      <form onSubmit={savePrefs} className="rounded-xl border border-white/5 bg-white/[0.02] p-5 space-y-4">
        <p className="text-sm font-medium">Job preferences</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400">Keywords</label>
            <input
              value={prefs.keywords}
              onChange={(e) => setPrefs((p) => ({ ...p, keywords: e.target.value }))}
              placeholder="React, Node"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Location</label>
            <input
              value={prefs.location}
              onChange={(e) => setPrefs((p) => ({ ...p, location: e.target.value }))}
              placeholder="Remote"
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Min match score</label>
            <input
              type="number"
              value={prefs.min_match_score}
              onChange={(e) => setPrefs((p) => ({ ...p, min_match_score: parseInt(e.target.value) || 0 }))}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-gray-400">Days posted</label>
            <input
              type="number"
              value={prefs.days_posted}
              onChange={(e) => setPrefs((p) => ({ ...p, days_posted: parseInt(e.target.value) || 30 }))}
              className="mt-1 w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button type="submit" disabled={saving} className="bg-white text-black rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
          {saving && <Loader2 size={14} className="animate-spin" />} Save preferences
        </button>
        {msg && <p className="text-sm text-green-400">{msg}</p>}
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>

      <div className="rounded-xl border border-red-900/30 bg-red-950/10 p-5">
        <p className="text-sm font-medium text-red-400">Danger zone</p>
        <p className="text-xs text-gray-400 mt-1">Delete your latest resume from the server.</p>
        <button
          onClick={handleDeleteResume}
          disabled={deleting}
          className="mt-3 text-sm border border-red-500/30 text-red-400 rounded-lg px-3 py-1.5 hover:bg-red-500/10 disabled:opacity-50 flex items-center gap-1.5"
        >
          {deleting && <Loader2 size={14} className="animate-spin" />} Delete resume
        </button>
      </div>
    </div>
  );
}
