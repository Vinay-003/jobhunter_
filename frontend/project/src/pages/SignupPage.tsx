// src/pages/SignupPage.tsx — Warm Ink
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signupSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight } from 'lucide-react';

export default function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSuccess(false);
    const parsed = signupSchema.safeParse({ username, email, password });
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
      await signup(parsed.data.username, parsed.data.email, parsed.data.password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 1100);
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
        <Link to="/login" className="text-sm text-stone-400 hover:text-stone-100">Sign in →</Link>
      </header>

      <div className="flex flex-1">
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-amber-500/[0.06] via-transparent to-stone-700/[0.04]" />
          <div className="w-full max-w-[420px] relative">
            <div className="mb-7">
              <h1 className="text-[30px] font-bold tracking-[-0.04em] leading-none text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>Create account</h1>
              <p className="text-sm text-stone-500 mt-2">Start your JobHunter V2 journey — 20 seconds.</p>
            </div>

            <form onSubmit={handleSubmit} className="rounded-[20px] border border-stone-800 bg-stone-900/70 backdrop-blur p-6 shadow-2xl shadow-black/20 space-y-4">
              <div>
                <label className="text-xs font-medium text-stone-300 mb-1.5 block">Username</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="johndoe"
                    className="w-full h-11 bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-3 text-sm placeholder:text-stone-600 text-stone-100 focus:outline-none focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/10 transition"
                    autoComplete="username"
                  />
                </div>
                {fieldErrors.username && <p className="text-xs text-red-400 mt-1.5">{fieldErrors.username}</p>}
              </div>

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
                    placeholder="At least 8 characters"
                    className="w-full h-11 bg-stone-950 border border-stone-800 rounded-xl pl-10 pr-10 text-sm placeholder:text-stone-600 text-stone-100 focus:outline-none focus:border-amber-400/40 focus:ring-2 focus:ring-amber-400/10 transition"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs text-red-400 mt-1.5">{fieldErrors.password}</p>}
              </div>

              {error && <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">{error}</div>}
              {success && <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">Account created — redirecting to login…</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 inline-flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 text-stone-900 rounded-xl text-sm font-semibold transition"
              >
                {loading ? 'Creating…' : 'Create account'} {!loading && <ArrowRight size={16} />}
              </button>

              <p className="text-sm text-center text-stone-500">
                Already have an account? <Link to="/login" className="text-amber-300 hover:text-amber-200 font-medium">Sign in</Link>
              </p>
            </form>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 relative border-l border-stone-800 bg-[#141210] items-center justify-center p-8 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(600px_circle_at_70%_20%,rgba(250,204,21,0.12),transparent_60%),radial-gradient(500px_circle_at_10%_80%,rgba(120,113,108,0.08),transparent_60%)]" />
          <div className="relative w-full max-w-[420px] space-y-4">
            <div className="rounded-[20px] border border-stone-800 bg-stone-900 p-5">
              <div className="text-sm font-medium text-stone-100">What you get</div>
              <ul className="mt-3 space-y-2 text-sm text-stone-400">
                <li className="flex gap-2"><span className="text-amber-400">•</span> ATS readiness with rule breakdown</li>
                <li className="flex gap-2"><span className="text-amber-400">•</span> Tailored Match vs any JD — evidence, not vibes</li>
                <li className="flex gap-2"><span className="text-amber-400">•</span> Job Matches with fit breakdown</li>
              </ul>
            </div>
            <div className="rounded-[20px] border border-amber-400/20 bg-amber-400/10 p-4 flex gap-3 items-center">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-stone-900">◆</span>
              <div><div className="text-sm font-medium text-stone-900">Secure by design</div><div className="text-xs text-stone-700">HttpOnly cookies + CSRF • Supabase private bucket</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
