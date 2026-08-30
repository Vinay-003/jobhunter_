// src/pages/SignupPage.tsx - V2
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signupSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';
import { Mail, Lock, User, Eye, EyeOff, Briefcase } from 'lucide-react';

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
      setTimeout(() => navigate('/login'), 1200);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Briefcase className="mx-auto text-red-500 mb-3" size={36} />
            <h1 className="text-2xl font-bold">Create account</h1>
            <p className="text-sm text-gray-400 mt-1">Start your JobHunter V2 journey</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white/[0.02] border border-white/5 rounded-xl p-6 space-y-4">
            <div>
              <label className="text-sm text-gray-300 mb-1.5 block">Username</label>
              <div className="relative">
                <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="johndoe"
                  className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-red-500"
                  autoComplete="username"
                />
              </div>
              {fieldErrors.username && <p className="text-xs text-red-400 mt-1">{fieldErrors.username}</p>}
            </div>

            <div>
              <label className="text-sm text-gray-300 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="you@example.com"
                  className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:border-red-500"
                  autoComplete="email"
                />
              </div>
              {fieldErrors.email && <p className="text-xs text-red-400 mt-1">{fieldErrors.email}</p>}
            </div>

            <div>
              <label className="text-sm text-gray-300 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={show ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-red-500"
                  autoComplete="new-password"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-xs text-red-400 mt-1">{fieldErrors.password}</p>}
            </div>

            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
            {success && <div className="text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">Account created — redirecting to login…</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
            >
              {loading ? 'Creating…' : 'Create account'}
            </button>

            <p className="text-sm text-center text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-red-400 hover:text-red-300">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-red-950/20 to-black border-l border-white/5 items-center justify-center p-8">
        <div className="max-w-sm text-sm text-gray-400 leading-relaxed">
          <p className="text-white font-semibold mb-2">What you get</p>
          <ul className="list-disc list-inside space-y-1">
            <li>ATS readiness with rule breakdown</li>
            <li>Job matches with evidence</li>
            <li>Secure cookie sessions + CSRF</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
