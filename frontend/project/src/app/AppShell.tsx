// src/app/AppShell.tsx - authenticated layout
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { LogOut, FileText, Briefcase, Layers, User, Menu, X } from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { to: '/app/ats', label: 'ATS Check', icon: FileText },
  { to: '/app/jobs', label: 'Job Matches', icon: Briefcase },
  { to: '/app/resumes', label: 'Resumes', icon: Layers },
  { to: '/app/profile', label: 'Profile', icon: User },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-[#0a0a0f]/80 backdrop-blur border-b border-red-900/20">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2 rounded hover:bg-white/5"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="text-lg font-bold tracking-tight">
              Job<span className="text-red-500">Hunter</span>
            </span>
            <span className="hidden lg:inline text-xs text-gray-500 border border-white/10 rounded-full px-2 py-0.5 ml-2">
              V2
            </span>
          </div>

          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                    isActive ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-gray-400 truncate max-w-[160px]">
              {user?.username || user?.email}
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-400 transition-colors px-2 py-1.5"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden border-t border-white/5 bg-[#111116] px-2 py-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    isActive ? 'bg-red-500 text-white' : 'text-gray-400'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400"
            >
              <LogOut size={18} /> Logout
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6 lg:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-white/5 py-4 text-center text-xs text-gray-500">
        <span>© {new Date().getFullYear()} JobHunter V2 • </span>
        <a href="/privacy" className="hover:text-gray-300">Privacy</a>
        <span> • </span>
        <a href="/terms" className="hover:text-gray-300">Terms</a>
      </footer>
    </div>
  );
}
