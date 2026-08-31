// src/app/router.tsx
import { createBrowserRouter, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import api from '../lib/api';
import AppShell from './AppShell';
import LandingPage from '../pages/LandingPage';
import LoginPage from '../pages/LoginPage';
import SignupPage from '../pages/SignupPage';
import AtsPage from '../pages/AtsPage';
import AnalysisPage from '../pages/AnalysisPage';
import JobsPage from '../pages/JobsPage';
import ResumesPage from '../pages/ResumesPage';
import ProfilePage from '../pages/ProfilePage';

function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-stone-400">
      <h1 className="text-2xl font-bold text-stone-100 mb-4" style={{ fontFamily: 'Fraunces, serif' }}>Privacy Policy</h1>
      <p className="text-sm leading-relaxed">We store resumes securely and only use data to provide ATS scoring and job matching. Contact support for data deletion requests.</p>
      <a href="/" className="text-amber-300 hover:text-amber-200 text-sm mt-4 inline-block">← Back to home</a>
    </div>
  );
}
function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-stone-400">
      <h1 className="text-2xl font-bold text-stone-100 mb-4" style={{ fontFamily: 'Fraunces, serif' }}>Terms of Service</h1>
      <p className="text-sm leading-relaxed">Use JobHunter responsibly. Uploaded content must be your own. We provide analysis for informational purposes only.</p>
      <a href="/" className="text-amber-300 hover:text-amber-200 text-sm mt-4 inline-block">← Back to home</a>
    </div>
  );
}

function SessionGuard({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'authed' | 'guest'>('loading');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        // V2 session endpoint is /auth/session (baseURL already is /api/v1)
        const res = await api.get('/auth/session').catch(() =>
          api.get('/latest-resume').then(() => ({ data: { user: { id: 1 } } })),
        );
        // If we get 200, consider authed (even if shape varies)
        if (!cancelled) {
          const data = res.data as { user?: unknown; success?: boolean };
          if (data?.user || data?.success) setState('authed');
          else setState('guest');
        }
      } catch {
        if (!cancelled) setState('guest');
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state === 'guest') navigate('/login', { replace: true });
  }, [state, navigate]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-[#0C0A09] flex items-center justify-center text-stone-500 text-sm">
        Checking session…
      </div>
    );
  }
  if (state === 'guest') return null;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    api
      .get('/auth/session')
      .then(() => setIsAuthed(true))
      .catch(() => setIsAuthed(false))
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return <div className="min-h-screen bg-[#0C0A09]" />;
  if (isAuthed) return <Navigate to="/app/ats" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: '/', element: <LandingPage /> },
  {
    path: '/login',
    element: (
      <PublicOnly>
        <LoginPage />
      </PublicOnly>
    ),
  },
  {
    path: '/signup',
    element: (
      <PublicOnly>
        <SignupPage />
      </PublicOnly>
    ),
  },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  {
    path: '/app',
    element: (
      <SessionGuard>
        <AppShell />
      </SessionGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/app/ats" replace /> },
      { path: 'ats', element: <AtsPage /> },
      { path: 'analysis/:id', element: <AnalysisPage /> },
      { path: 'jobs', element: <JobsPage /> },
      { path: 'resumes', element: <ResumesPage /> },
      { path: 'profile', element: <ProfilePage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

// Also export a bare outlet for nested usage
export function RootOutlet() {
  return <Outlet />;
}

export default router;
