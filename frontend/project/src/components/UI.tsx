import React, { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';

export function Logo({ compact = false }: { compact?: boolean }) {
  return <Link to="/" className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="JobHunter home"><span className="brand__mark"><Icon name="target" size={18}/></span>{!compact && <span className="brand__word">JobHunter</span>}</Link>;
}
export function Button({ children, variant = 'primary', icon, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; icon?: string }) {
  return <button className={`button button--${variant} ${className}`} {...props}>{children}{icon && <Icon name={icon} size={16}/>}</button>;
}
export function Tag({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) { return <span className={`tag tag--${tone}`}>{children}</span>; }
export function Eyebrow({ children, tone = 'amber' }: { children: ReactNode; tone?: string }) { return <div className={`eyebrow eyebrow--${tone}`}><span className="eyebrow__dot"/>{children}</div>; }
const currentTheme = () => typeof document === 'undefined' ? 'dark' : document.documentElement.dataset.theme || 'dark';
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => { const sync = () => setTheme(currentTheme()); window.addEventListener('jobhunter-theme-change', sync); return () => window.removeEventListener('jobhunter-theme-change', sync); }, []);
  const toggle = () => { const next = theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f5f2ec' : '#0a0908'); localStorage.setItem('jh-theme', next); setTheme(next); window.dispatchEvent(new Event('jobhunter-theme-change')); };
  return <button className={`theme-toggle ${compact ? 'theme-toggle--compact' : ''}`} type="button" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16}/>{!compact && <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>}</button>;
}
type SelectOption = string | { value: string; label: string };
export function SelectMenu({ value, onChange, options = [], label = 'Choose option', className = '', disabled = false }: { value: string; onChange?: (value: string) => void; options?: SelectOption[]; label?: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const items = options.map(option => typeof option === 'string' ? { value: option, label: option } : option);
  const active = items.find(option => String(option.value) === String(value));
  useEffect(() => { if (!open) return; const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close); }, [open]);
  useEffect(() => {
    if (!open) return;
    const selected = menu.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const first = menu.current?.querySelector<HTMLElement>('[role="option"]');
    (selected ?? first)?.focus();
  }, [open]);
  const choose = (next: string) => { if (disabled) return; onChange?.(next); setOpen(false); trigger.current?.focus(); };
  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => { const buttons = [...menu.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') || []]; const index = buttons.indexOf(document.activeElement as HTMLButtonElement); if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length; buttons[next]?.focus(); } else if (event.key.length === 1) { const match = buttons.find(button => button.textContent?.toLowerCase().startsWith(event.key.toLowerCase())); match?.focus(); } };
  return <div className={`select-menu ${open ? 'select-menu--open' : ''} ${className}`} ref={root}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false); }}>
    <button ref={trigger} type="button" disabled={disabled} className="select-menu__trigger"
      aria-haspopup="listbox" aria-expanded={open && !disabled} aria-controls={id} aria-label={label}
      onClick={() => setOpen(v => !v)} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); }
      }}><span>{active?.label ?? value}</span><Icon name="chevron" size={15}/></button>
    {open && !disabled && <div ref={menu} id={id} className="select-menu__popover" role="listbox" aria-label={label} onKeyDown={onMenuKey}>
      {items.map(option => <button key={option.value} type="button" role="option" aria-selected={option.value === value}
        className={option.value === value ? 'is-selected' : ''} onClick={() => choose(option.value)}>
        <span>{option.label}</span>{option.value === value && <Icon name="check" size={14}/>}</button>)}
    </div>}
  </div>;
}
export function SectionTitle({ eyebrow, title, body, action }: { eyebrow?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) { return <div className="section-title"><div>{eyebrow && <div className="section-title__eyebrow">{eyebrow}</div>}<h2>{title}</h2>{body && <p>{body}</p>}</div>{action}</div>; }
export function ScoreRing({ value, size = 180, label = 'Resume Health', tone = 'amber' }: { value: number; size?: number; label?: string; tone?: string }) { const deg = Math.max(0, Math.min(100, value)) * 3.6; return <div className={`score-ring score-ring--${tone}`} style={{ '--score': `${deg}deg`, width: size, height: size } as React.CSSProperties} aria-label={`${label}: ${value} out of 100`}><div className="score-ring__inner"><strong>{value}</strong><span>/100</span><small>{label}</small></div></div>; }
export function ProgressRow({ label, value, max, note, tone = 'good', onClick }: { label: ReactNode; value: number; max: number; note?: ReactNode; tone?: string; onClick?: () => void }) { const pct = max > 0 ? Math.round(Math.max(0, Math.min(1, value / max)) * 100) : 0; const content = <><div className="progress-row__top"><span>{label}</span><b>{value}<em>/{max}</em></b></div><div className="progress-row__track"><span className={`progress-row__fill progress-row__fill--${tone}`} style={{ width: `${pct}%` }}/></div>{note && <p>{note}</p>}</>; return onClick ? <button type="button" className="progress-row progress-row--button" onClick={onClick}>{content}<Icon name="chevron" size={15}/></button> : <div className="progress-row">{content}</div>; }
export function EmptyState({ icon = 'file', title, body, action }: { icon?: string; title: ReactNode; body?: ReactNode; action?: ReactNode }) { return <div className="empty-state"><div className="empty-state__icon"><Icon name={icon} size={22}/></div><h3>{title}</h3>{body && <p>{body}</p>}{action}</div>; }
export function Toast({ children, tone = 'neutral' }: { children?: ReactNode; tone?: string }) { if (!children) return null; return <div className={`toast toast--${tone}`} role={tone === 'error' ? 'alert' : 'status'}><Icon name={tone === 'success' ? 'check' : tone === 'error' ? 'warning' : 'spark'} size={15}/><span>{children}</span></div>; }
export function Modal({ open, title, body, onClose, children }: { open: boolean; title: ReactNode; body?: ReactNode; onClose: () => void; children?: ReactNode }) {
  const dialog = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const id = useId();
  useEffect(() => { if (!open) return; previousFocus.current = document.activeElement as HTMLElement; const prior = document.body.style.overflow; document.body.style.overflow = 'hidden'; dialog.current?.querySelector<HTMLButtonElement>('.modal__close')?.focus(); const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); onClose(); } if (event.key !== 'Tab') return; const focusables = [...dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])') || []]; if (!focusables.length) return; const first = focusables[0], last = focusables[focusables.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }; document.addEventListener('keydown', key); return () => { document.body.style.overflow = prior; document.removeEventListener('keydown', key); previousFocus.current?.focus(); }; }, [open, onClose]);
  if (!open) return null;
  return <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialog} className="modal" role="dialog" aria-modal="true" aria-labelledby={id}><div className="modal__head"><div><small>Confirm action</small><h2 id={id}>{title}</h2></div><button type="button" className="modal__close" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>{body && <p className="modal__body">{body}</p>}<div className="modal__actions">{children}</div></section></div>;
}
