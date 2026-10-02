// src/app/router.tsx
import { createBrowserRouter, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import AppShell from './AppShell';
import { useAuth } from '../features/auth/AuthContext';
import LandingPage from '../pages/LandingPage';
import LoginPage from '../pages/LoginPage';
import SignupPage from '../pages/SignupPage';
import AtsPage from '../pages/AtsPage';
import AnalysisPage from '../pages/AnalysisPage';
import JobsPage from '../pages/JobsPage';
import ResumesPage from '../pages/ResumesPage';
import ResumeViewPage from '../pages/ResumeViewPage';
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

// Issue 3: structural shell skeleton while the single session check resolves —
// never a blank screen or text-only spinner (§0 rule 7).
function AppShellSkeleton() {
  return (
    <div className="min-h-screen bg-[#0C0A09] text-stone-100" aria-busy="true" aria-label="Checking session">
      <aside className="fixed inset-y-0 left-0 hidden w-[268px] animate-pulse border-r border-stone-800/70 p-5 lg:block">
        <div className="h-8 w-36 rounded-lg bg-stone-800/70" />
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-stone-800/50" />
          ))}
        </div>
      </aside>
      <main className="min-h-screen p-5 md:p-8 lg:pl-[268px]">
        <div className="h-7 w-44 rounded-lg bg-stone-800/70 animate-pulse" />
        <div className="mt-3 h-3.5 w-72 max-w-full rounded bg-stone-800/50 animate-pulse" />
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <div className="h-40 rounded-2xl border border-stone-800 bg-stone-900/60 animate-pulse" />
          <div className="h-40 rounded-2xl border border-stone-800 bg-stone-900/60 animate-pulse" />
        </div>
      </main>
    </div>
  );
}

// SessionGuard / PublicOnly both consume AuthProvider (single source of truth —
// Issue 3 fix 3: no more per-guard /auth/session calls or /latest-resume fallback).
function SessionGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  if (loading) return <AppShellSkeleton />;
  if (!user) return null;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  // Optimistic render (Issue 3 fix 1): the form shows immediately; we only
  // redirect away once the session check resolves to an authenticated user.
  if (!loading && user) return <Navigate to="/app/ats" replace />;
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
      { path: 'resumes/:id', element: <ResumeViewPage /> },
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
