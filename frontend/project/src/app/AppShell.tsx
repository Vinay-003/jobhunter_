import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import {
  Briefcase,
  BarChart3,
  Layers,
  LogOut,
  Menu,
  FileSearch,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/app/ats', label: 'Resume Health', hint: 'ATS + content report', icon: FileSearch },
  { to: '/app/jobs', label: 'Job Matches', hint: 'Ranked opportunities', icon: Briefcase },
  { to: '/app/resumes', label: 'Resumes', hint: 'Your versions', icon: Layers },
  { to: '/app/profile', label: 'Profile', hint: 'Preferences & account', icon: User },
];

function initials(value?: string | null) {
  if (!value) return 'JH';
  const parts = value.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join('') || 'JH';
}

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1.5">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
              isActive
                ? 'border-amber-400/20 bg-amber-400/[0.08] text-stone-100'
                : 'border-transparent text-stone-500 hover:border-stone-800 hover:bg-stone-900/50 hover:text-stone-300'
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${isActive ? 'bg-amber-400/15 text-amber-300' : 'bg-stone-800 text-stone-500 group-hover:text-stone-300'}`}>
                <item.icon size={17} strokeWidth={1.8} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className={`block truncate text-[11px] ${isActive ? 'text-amber-200/60' : 'text-stone-600 group-hover:text-stone-500'}`}>{item.hint}</span>
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const displayName = user?.username || user?.email || 'JobHunter user';

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen text-stone-100 bg-[#0C0A09]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[268px] border-r border-stone-800 bg-[#0C0A09]/95 px-4 py-5 backdrop-blur-xl lg:flex lg:flex-col">
        <button onClick={() => navigate('/app/ats')} className="mb-8 flex items-center gap-3 px-2 text-left group">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-stone-900 shadow-lg shadow-amber-900/20 group-hover:bg-amber-300 transition">
            <BarChart3 size={20} />
          </span>
          <span>
            <span className="block text-[17px] font-semibold tracking-[-0.03em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>JobHunter</span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-stone-600">Career workspace</span>
          </span>
        </button>

        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-700">Workspace</p>
        <Navigation />

        <div className="mt-auto space-y-3">
          <div className="rounded-2xl border border-amber-400/15 bg-amber-400/[0.06] p-3.5">
            <div className="flex items-center gap-2 text-xs font-medium text-stone-200">
              <Sparkles size={14} className="text-amber-300" /> One resume, two signals
            </div>
            <p className="mt-1.5 text-[11px] leading-5 text-stone-500">Resume Health measures document quality. Job Match measures fit for a specific role.</p>
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-stone-800 bg-stone-900/60 p-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-800 text-xs font-semibold text-stone-300">{initials(displayName)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-stone-300">{displayName}</p>
              <p className="text-[10px] text-stone-600">Signed in</p>
            </div>
            <button onClick={handleLogout} className="rounded-lg p-2 text-stone-600 transition hover:bg-stone-800 hover:text-amber-300" aria-label="Logout">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-stone-800 bg-[#0C0A09]/85 px-4 backdrop-blur-xl lg:hidden">
        <button onClick={() => navigate('/app/ats')} className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-stone-900"><BarChart3 size={18} /></span>
          <span className="font-semibold tracking-[-0.03em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>JobHunter</span>
        </button>
        <button onClick={() => setMobileOpen((value) => !value)} className="rounded-xl border border-stone-800 bg-stone-900 p-2.5 text-stone-300" aria-label="Toggle navigation">
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </header>

      {mobileOpen && (
        <div className="fixed inset-x-3 top-[72px] z-50 rounded-2xl border border-white/[0.08] bg-[#0d1019]/98 p-3 shadow-2xl shadow-black/50 backdrop-blur-xl lg:hidden">
          <Navigation onNavigate={() => setMobileOpen(false)} />
          <button onClick={handleLogout} className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-stone-500 hover:bg-stone-900 hover:text-amber-300">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/[0.035]"><LogOut size={17} /></span>
            Logout
          </button>
        </div>
      )}

      <main className="min-h-screen lg:pl-[268px]">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 md:py-8 xl:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
