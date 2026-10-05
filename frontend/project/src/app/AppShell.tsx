import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Logo, ThemeToggle, Toast } from '../components/UI';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';

const nav = [
  { to: '/app/ats', label: 'Resume Health', hint: 'Diagnostics', icon: 'target' },
  { to: '/app/jobs', label: 'Job Matches', hint: 'Ranked roles', icon: 'briefcase' },
  { to: '/app/resumes', label: 'Resumes', hint: 'Versions & reports', icon: 'file' },
  { to: '/app/profile', label: 'Profile', hint: 'Preferences', icon: 'user' },
];
const initials = (name: string) => name.trim().split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase()).join('') || 'JH';
export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const active = (to: string) => pathname === to || to === '/app/resumes' && pathname.startsWith('/app/resumes/') || to === '/app/ats' && pathname.startsWith('/app/analysis/');
  const crumb = pathname.startsWith('/app/analysis/') ? 'Resume Report' : nav.find(item => active(item.to))?.label || 'Workspace';
  useEffect(() => {
    if (!mobileOpen) return;
    const returnFocus = menuRef.current;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const resize = () => { if (window.innerWidth > 900) setMobileOpen(false); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
      if (event.key !== 'Tab') return;
      const drawer = document.querySelector<HTMLElement>('.sidebar--open');
      const focusable = [...drawer?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') || []];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('resize', resize);
    document.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('resize', resize);
      document.removeEventListener('keydown', key);
      document.body.style.overflow = priorOverflow;
      returnFocus?.focus();
    };
  }, [mobileOpen]);
  useEffect(() => setMobileOpen(false), [pathname]);
  const signOut = async () => { setLogoutError(''); try { await logout(); navigate('/login', { replace: true }); } catch (error) { setLogoutError(getApiErrorMessage(error)); } };
  const displayName = user?.display_name || user?.username || user?.email || 'Account';
  return <div className="app-shell">
    {logoutError && <Toast tone="error">Could not sign out: {logoutError}</Toast>}
    <aside className={`sidebar ${mobileOpen ? 'sidebar--open' : ''}`} aria-label="Workspace navigation">
      <div className="sidebar__top"><Logo/><button ref={closeRef} type="button" className="sidebar__close" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><Icon name="close"/></button></div>
      <div className="sidebar__label">Workspace</div>
      <nav className="sidebar__nav" aria-label="Main navigation">{nav.map(item => <NavLink key={item.to} to={item.to} onClick={() => setMobileOpen(false)} className={`nav-item ${active(item.to) ? 'nav-item--active' : ''}`}><span className="nav-item__icon"><Icon name={item.icon} size={17}/></span><span><b>{item.label}</b><small>{item.hint}</small></span>{active(item.to) && <i/>}</NavLink>)}</nav>
      <div className="sidebar__footer"><div className="sidebar__user"><span>{initials(displayName)}</span><div><b>{displayName}</b><small>{user?.email || 'Signed in'}</small></div></div><button type="button" className="text-button" onClick={signOut}>Sign out</button></div>
    </aside>
    {mobileOpen && <button type="button" className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Close navigation"/>}
    <div className="app-main"><header className="app-topbar"><button ref={menuRef} type="button" className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation" aria-expanded={mobileOpen}><Icon name="menu"/></button><div className="app-topbar__crumb">Career workspace <span>/</span> {crumb}</div><div className="app-topbar__actions"><ThemeToggle compact/></div></header><main className="app-content"><Outlet/></main><footer className="app-footer"><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></footer></div>
  </div>;
}
