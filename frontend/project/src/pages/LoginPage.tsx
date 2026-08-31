// src/pages/LoginPage.tsx — Warm Ink — amber, Fraunces, editorial
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react';

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
    <div className="min-h-screen bg-[#0C0A09] text-stone-100 flex flex-col">
      <header className="h-[64px] flex items-center justify-between px-6 border-b border-stone-800/60 bg-[#0C0A09]/70 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-400 text-stone-900"><span className="h-2 w-2 rounded-full bg-stone-900" /></span>
          <span className="font-semibold tracking-[-0.02em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>JobHunter</span>
          <span className="text-[10px] tracking-[0.14em] text-stone-500 border border-stone-800 rounded-full px-2 py-0.5">V2</span>
        </Link>
        <Link to="/signup" className="text-sm text-stone-400 hover:text-stone-100">Create account →</Link>
      </header>

      <div className="flex flex-1">
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-stone-700/[0.04]" />
          <div className="w-full max-w-[420px] relative">
            <div className="mb-7">
              <h1 className="text-[30px] font-bold tracking-[-0.04em] leading-none text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>Welcome back</h1>
              <p className="text-sm text-stone-500 mt-2">Career workspace — HttpOnly cookies, no localStorage tokens.</p>
            </div>

            <form onSubmit={handleSubmit} className="rounded-[20px] border border-stone-800 bg-stone-900/70 backdrop-blur p-6 shadow-2xl shadow-black/20 space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-300 mb-1.5 block">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="you@example.com"
                    className="w-full h-11 bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-3 text-sm placeholder:text-stone-600 text-stone-100 focus:outline-none focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/10 transition"
                    autoComplete="email"
                  />
                </div>
                {fieldErrors.email && <p className="text-xs text-red-400 mt-1.5">{fieldErrors.email}</p>}
              </div>

              <div>
                <label className="text-xs font-medium text-stone-300 mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type={show ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full h-11 bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-10 text-sm placeholder:text-stone-600 text-stone-100 focus:outline-none focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/10 transition"
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs text-red-400 mt-1.5">{fieldErrors.password}</p>}
              </div>

              {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 inline-flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-stone-900 rounded-xl text-sm font-semibold transition"
              >
                {loading ? 'Signing in…' : 'Sign in'} {!loading && <ArrowRight size={16} />}
              </button>

              <p className="text-sm text-center text-stone-500">
                Don&apos;t have an account? <Link to="/signup" className="text-amber-300 hover:text-amber-200 font-medium">Sign up</Link>
              </p>
            </form>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 relative border-l border-stone-800 bg-[#141210] items-center justify-center p-8 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(600px_circle_at_70%_20%,rgba(250,204,21,0.12),transparent_60%),radial-gradient(500px_circle_at_10%_80%,rgba(120,113,108,0.08),transparent_60%)]" />
          <div className="relative w-full max-w-[440px]">
            <div className="rounded-[24px] border border-stone-800 bg-stone-900 p-[1px] shadow-2xl">
              <div className="rounded-[23px] bg-[#0C0A09] p-6">
                <div className="text-xs tracking-[0.16em] text-stone-500">RESUME HEALTH — V3</div>
                <div className="mt-3 h-2 rounded-full bg-stone-800 overflow-hidden"><div className="h-full w-[77%] bg-amber-400" /></div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-xl bg-stone-900 border border-stone-800 p-3"><div className="text-stone-500">ATS</div><div className="font-semibold text-stone-100">20/20</div></div>
                  <div className="rounded-xl bg-stone-900 border border-stone-800 p-3"><div className="text-stone-500">Impact</div><div className="font-semibold text-stone-100">8/20</div></div>
                  <div className="rounded-xl bg-stone-900 border border-stone-800 p-3"><div className="text-stone-500">Skills</div><div className="font-semibold text-stone-100">9/10</div></div>
                </div>
                <p className="mt-3 text-xs text-stone-500">Two signals: <span className="text-stone-300">Health</span> (rule-based) and <span className="text-stone-300">Tailored</span> (JD fit) — never mixed.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
