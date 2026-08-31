// src/pages/LoginPage.tsx — V2, violet/cyan, same instrument as AppShell/Landing
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { loginSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';
import { Mail, Lock, Eye, EyeOff, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      parsed.error.issues.forEach((iss) => {
        const k = String(iss.path[0] ?? 'form');
        if (!fe[k]) fe[k] = iss.message;
      });
      setFieldErrors(fe);
      return;
    }
    setLoading(true);
    try {
      await login(parsed.data.email, parsed.data.password);
      navigate('/app/ats', { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070a12] text-white flex flex-col">
      <header className="h-[64px] flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#070a12]/60 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400"><span className="h-2 w-2 rounded-full bg-white" /></span>
          <span className="font-semibold tracking-[-0.02em]">JobHunter</span>
          <span className="text-[10px] tracking-[0.14em] text-white/40 border border-white/10 rounded-full px-2 py-0.5">V2</span>
        </Link>
        <Link to="/signup" className="text-sm text-white/60 hover:text-white">Create account →</Link>
      </header>

      <div className="flex flex-1">
        {/* left: form */}
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-cyan-400/10 blur-2xl" />
          <div className="w-full max-w-[420px] relative">
            <div className="mb-7">
              <h1 className="text-[30px] font-[700] tracking-[-0.04em] leading-none">Welcome back</h1>
              <p className="text-sm text-white/50 mt-2">Sign in to your career workspace — HttpOnly cookies, no localStorage tokens.</p>
            </div>

            <form onSubmit={handleSubmit} className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-6 shadow-2xl shadow-black/30 space-y-4">
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    className="w-full h-11 bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-violet-400/40 focus:bg-white/[0.06] transition"
                    autoComplete="email"
                  />
                </div>
                {fieldErrors.email && <p className="text-xs text-rose-300 mt-1.5">{fieldErrors.email}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full h-11 bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-10 text-sm placeholder:text-white/30 focus:outline-none focus:border-violet-400/40 focus:bg-white/[0.06] transition"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs text-rose-300 mt-1.5">{fieldErrors.password}</p>}
              </div>

              {error && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 inline-flex items-center justify-center gap-2 bg-white text-black rounded-xl text-sm font-semibold hover:bg-white/90 disabled:opacity-50 transition"
              >
                {loading ? 'Signing in…' : 'Sign in'} {!loading && <ArrowRight size={16} />}
              </button>

              <p className="text-sm text-center text-white/50">
                Don&apos;t have an account? <Link to="/signup" className="text-white hover:text-violet-200 font-medium">Sign up</Link>
              </p>
            </form>

            <p className="text-xs text-center text-white/25 mt-4 flex items-center justify-center gap-1.5"><ShieldCheck size={12} /> Session is HttpOnly • SameSite None in prod • CSRF protected</p>
          </div>
        </div>

        {/* right: showcase */}
        <div className="hidden lg:flex flex-1 relative border-l border-white/[0.06] bg-[#0B0E1A] items-center justify-center p-8 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(600px_circle_at_70%_20%,rgba(139,92,246,0.18),transparent_60%),radial-gradient(500px_circle_at_10%_80%,rgba(34,211,238,0.12),transparent_60%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px] opacity-30" />
          <div className="relative w-full max-w-[440px]">
            <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.04] backdrop-blur p-[1px] shadow-2xl">
              <div className="rounded-[23px] bg-[#0B0E1A] p-6">
                <div className="flex items-center gap-2 text-xs font-medium text-white/70"><Sparkles size={14} className="text-violet-300" /> Diagnosing your PDF…</div>
                <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden"><div className="h-full w-[77%] bg-gradient-to-r from-violet-500 to-cyan-400" /></div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3"><div className="text-white/40">ATS</div><div className="font-semibold text-white">20/20</div></div>
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3"><div className="text-white/40">Impact</div><div className="font-semibold text-white">14/20</div></div>
                  <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3"><div className="text-white/40">Skills</div><div className="font-semibold text-white">8/10</div></div>
                </div>
                <div className="mt-4 text-xs text-white/50">Two signals: <span className="text-white">Resume Health</span> (rule-based) and <span className="text-white">Tailored Match</span> (separate JD fit) — never mixed.</div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-white/40 justify-center">● Encrypted storage • Supabase private bucket • No dangerouslySetInnerHTML</div>
          </div>
        </div>
      </div>
    </div>
  );
}
