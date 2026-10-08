// src/app/router.tsx
import { createBrowserRouter, Navigate, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { lazy, Suspense, useEffect, useLayoutEffect } from 'react';
import AppShell from './AppShell';
import { useAuth } from '../features/auth/AuthContext';
import LoginPage from '../pages/LoginPage';
import SignupPage from '../pages/SignupPage';
import AtsPage from '../pages/AtsPage';
import AnalysisPage from '../pages/AnalysisPage';
import ResumesPage from '../pages/ResumesPage';
import ResumeViewPage from '../pages/ResumeViewPage';
import ProfilePage from '../pages/ProfilePage';

import PrivacyPage from '../pages/PrivacyPage';
import TermsPage from '../pages/TermsPage';
import NotFoundPage from '../pages/NotFoundPage';
import ErrorPage from '../pages/ErrorPage';

const LandingPage = lazy(() => import('../pages/LandingPage'));
const JobsPage = lazy(() => import('../pages/JobsPage'));

// Issue 3: structural shell skeleton while the single session check resolves —
// never a blank screen or text-only spinner (§0 rule 7).
function AppShellSkeleton() {
  return (
    <div className="session-skeleton min-h-screen" aria-busy="true" aria-label="Checking session">
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

  // Keep authenticated forms mounted during a profile/session refresh so their
  // pending edits and save confirmation survive. Initial auth still blocks.
  if (loading && !user) return <AppShellSkeleton />;
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

function RouteFrame() {
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }, [pathname]);
  return <Suspense fallback={<div className="session-skeleton library-skeleton" aria-busy="true" aria-label="Loading page"><div/><div/><div/></div>}><Outlet /></Suspense>;
}

export const router = createBrowserRouter([{
  element: <RouteFrame />,
  errorElement: <ErrorPage />,
  children: [
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
  {
    path: '/verify-email',
    element: (
      <PublicOnly>
        <LoginPage />
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
    errorElement: <ErrorPage />,
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
  { path: '*', element: <NotFoundPage /> },
]}]);

// Also export a bare outlet for nested usage
export function RootOutlet() {
  return <Outlet />;
}

export default router;
