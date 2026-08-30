// src/pages/LoginPage.tsx - V2
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { loginSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';
import { Mail, Lock, Eye, EyeOff, Briefcase } from 'lucide-react';

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
    <div className="min-h-screen bg-[#0a0a0f] text-white flex">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <Briefcase className="mx-auto text-red-500 mb-3" size={36} />
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-sm text-gray-400 mt-1">Sign in to continue to JobHunter V2</p>
          </div>

          <form onSubmit={handleSubmit} className="bg-white/[0.02] border border-white/5 rounded-xl p-6 space-y-4">
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
                  placeholder="••••••••"
                  className="w-full bg-black/30 border border-white/10 rounded-lg pl-9 pr-9 py-2.5 text-sm focus:outline-none focus:border-red-500"
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-xs text-red-400 mt-1">{fieldErrors.password}</p>}
            </div>

            {error && <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>

            <p className="text-sm text-center text-gray-400">
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="text-red-400 hover:text-red-300">
                Sign up
              </Link>
            </p>
          </form>

          <p className="text-xs text-center text-gray-500 mt-4">
            Session is stored in httpOnly cookies — no tokens in localStorage.
          </p>
        </div>
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-red-950/20 to-black border-l border-white/5 items-center justify-center p-8">
        <div className="max-w-sm text-sm text-gray-400 leading-relaxed">
          <p className="text-white font-semibold mb-2">Secure by design</p>
          <p>All requests use <code className="text-gray-200">withCredentials: true</code> and <code className="text-gray-200">X-CSRF-Token</code>. Base URL comes from <code className="text-gray-200">VITE_API_BASE_URL</code>.</p>
        </div>
      </div>
    </div>
  );
}
