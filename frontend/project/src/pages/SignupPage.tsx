// src/pages/SignupPage.tsx — same instrument as Login
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signupSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Layers, Sparkles } from 'lucide-react';

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
    <div className="min-h-screen bg-[#070a12] text-white flex flex-col">
      <header className="h-[64px] flex items-center justify-between px-6 border-b border-white/[0.06] bg-[#070a12]/60 backdrop-blur">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400"><span className="h-2 w-2 rounded-full bg-white" /></span>
          <span className="font-semibold tracking-[-0.02em]">JobHunter</span>
          <span className="text-[10px] tracking-[0.14em] text-white/40 border border-white/10 rounded-full px-2 py-0.5">V2</span>
        </Link>
        <Link to="/login" className="text-sm text-white/60 hover:text-white">Sign in →</Link>
      </header>

      <div className="flex flex-1">
        <div className="flex-1 flex items-center justify-center p-6 sm:p-8 relative">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-600/10 via-transparent to-cyan-400/10 blur-2xl" />
          <div className="w-full max-w-[420px] relative">
            <div className="mb-7">
              <h1 className="text-[30px] font-[700] tracking-[-0.04em] leading-none">Create account</h1>
              <p className="text-sm text-white/50 mt-2">Start your JobHunter V2 journey — it takes 20 seconds.</p>
            </div>

            <form onSubmit={handleSubmit} className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-6 shadow-2xl shadow-black/30 space-y-4">
              <div>
                <label className="text-xs font-medium text-white/70 mb-1.5 block">Username</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="johndoe"
                    className="w-full h-11 bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-3 text-sm placeholder:text-white/30 focus:outline-none focus:border-violet-400/40 focus:bg-white/[0.06] transition"
                    autoComplete="username"
                  />
                </div>
                {fieldErrors.username && <p className="text-xs text-rose-300 mt-1.5">{fieldErrors.username}</p>}
              </div>

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
                    placeholder="At least 8 characters"
                    className="w-full h-11 bg-white/[0.04] border border-white/[0.08] rounded-xl pl-10 pr-10 text-sm placeholder:text-white/30 focus:outline-none focus:border-violet-400/40 focus:bg-white/[0.06] transition"
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {fieldErrors.password && <p className="text-xs text-rose-300 mt-1.5">{fieldErrors.password}</p>}
              </div>

              {error && <div className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5">{error}</div>}
              {success && <div className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5">Account created — redirecting to login…</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 inline-flex items-center justify-center gap-2 bg-white text-black rounded-xl text-sm font-semibold hover:bg-white/90 disabled:opacity-50 transition"
              >
                {loading ? 'Creating…' : 'Create account'} {!loading && <ArrowRight size={16} />}
              </button>

              <p className="text-sm text-center text-white/50">
                Already have an account? <Link to="/login" className="text-white hover:text-violet-200 font-medium">Sign in</Link>
              </p>
            </form>
          </div>
        </div>

        <div className="hidden lg:flex flex-1 relative border-l border-white/[0.06] bg-[#0B0E1A] items-center justify-center p-8 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(600px_circle_at_70%_20%,rgba(139,92,246,0.18),transparent_60%),radial-gradient(500px_circle_at_10%_80%,rgba(34,211,238,0.12),transparent_60%)]" />
          <div className="relative w-full max-w-[420px] space-y-4">
            <div className="rounded-[20px] border border-white/[0.06] bg-white/[0.03] p-5 backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-medium text-white"><Sparkles size={16} className="text-violet-300" /> What you get</div>
              <ul className="mt-3 space-y-2 text-sm text-white/60">
                <li className="flex gap-2"><span className="text-violet-300">•</span> ATS readiness with rule breakdown + priority actions</li>
                <li className="flex gap-2"><span className="text-violet-300">•</span> Tailored Match vs any JD — evidence, not vibes</li>
                <li className="flex gap-2"><span className="text-violet-300">•</span> Job Matches workspace with fit breakdown</li>
              </ul>
            </div>
            <div className="rounded-[20px] border border-white/[0.06] bg-gradient-to-br from-violet-500/10 to-cyan-400/10 p-[1px]">
              <div className="rounded-[19px] bg-[#0B0E1A] p-5 flex gap-4 items-center">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-black"><Layers size={18} /></span>
                <div><div className="text-sm font-medium text-white">Secure by design</div><div className="text-xs text-white/50">HttpOnly cookies + CSRF • Supabase private bucket • No localStorage JWT</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Layers(props: { size?: number }) {
  return <svg width={props.size ?? 18} height={props.size ?? 18} viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
