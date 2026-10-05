import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Icon from './Icon';
import DragReturn from './DragReturn';
import { Button, Logo, ScoreRing, ThemeToggle } from './UI';
import { loginSchema, signupSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';

export default function PublicAuth({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate();
  const { login, signup } = useAuth();
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(''); setFieldErrors({});
    const parsed = mode === 'login' ? loginSchema.safeParse({ email, password }) : signupSchema.safeParse({ username, email, password });
    if (!parsed.success) { const fields: Record<string,string> = {}; parsed.error.issues.forEach(issue => { const key = String(issue.path[0] ?? 'form'); fields[key] ??= issue.message; }); setFieldErrors(fields); return; }
    setLoading(true);
    try {
      if (mode === 'signup') { await signup(username, email, password); setSuccess(true); }
      else { await login(email, password); navigate('/app/ats', { replace: true }); }
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setLoading(false); }
  };
  const fieldError = (field: string) => fieldErrors[field] && <span className="auth-field-error" role="alert">{fieldErrors[field]}</span>;
  return <div className="auth-page">
    <div className="auth-nav"><Logo/><div className="auth-nav__actions"><ThemeToggle compact/><Link to={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={14}/></Link></div></div>
    <div className="auth-grid"><section className="auth-form-wrap"><div className="auth-form"><div className="auth-kicker"><span/> JOBHUNTER WORKSPACE</div><h1>{mode === 'login' ? 'Welcome back.' : 'Build your career workspace.'}</h1><p>{mode === 'login' ? 'Continue where you left off — reports, saved resumes and role matches included.' : 'One private workspace for resume diagnostics, role matching and focused job discovery.'}</p>
      <form onSubmit={handleSubmit} noValidate>
        {mode === 'signup' && <label><span id="auth-username-label">Username</span><div className="field"><Icon name="user"/><input aria-labelledby="auth-username-label" value={username} onChange={event => setUsername(event.target.value)} placeholder="Your username" autoComplete="username" aria-invalid={!!fieldErrors.username}/></div>{fieldError('username')}</label>}
        <label><span id="auth-email-label">Email</span><div className="field"><span className="field__glyph" aria-hidden="true">@</span><input aria-labelledby="auth-email-label" type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" aria-invalid={!!fieldErrors.email}/></div>{fieldError('email')}</label>
        <label><span id="auth-password-label">Password</span><div className="field"><Icon name="lock"/><input aria-labelledby="auth-password-label" type={show ? 'text' : 'password'} value={password} onChange={event => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} aria-invalid={!!fieldErrors.password}/><button type="button" onClick={() => setShow(v => !v)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button></div>{fieldError('password')}</label>
        {error && <p className="auth-message auth-message--error" role="alert">{error}</p>}
        {success && <p className="auth-message" role="status">Account created. <Link to="/login">Sign in now</Link>.</p>}
        <Button className="auth-submit" icon="arrow" type="submit" disabled={loading || success}>{loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create workspace'}</Button>
      </form><p className="auth-switch">{mode === 'login' ? "Don't have an account?" : 'Already have an account?'} <Link to={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Sign up' : 'Sign in'}</Link></p><div className="auth-security"><Icon name="lock" size={14}/> Secure session · private resume storage</div></div></section>
      <section className="auth-showcase" aria-label="Illustrative product preview"><div className="auth-showcase__copy"><span>ILLUSTRATIVE EXAMPLE · NOT YOUR DATA</span><h2>Know the reason<br/>behind every point.</h2><p>Resume Health diagnoses the document. Tailored Match evaluates one role. They stay separate by design.</p></div><DragReturn className="auth-preview-drag" mode="absolute" label="Illustrative Resume Health preview"><div className="auth-preview"><div className="auth-preview__top"><div><small>EXAMPLE · RESUME HEALTH</small><b>Sample resume</b></div><ScoreRing value={78} size={118}/></div><div className="auth-preview__action"><span>01</span><div><small>HIGH IMPACT</small><b>Add measurable outcomes</b></div></div><div className="auth-preview__row"><span>ATS structure</span><i/><b>20/20</b></div><div className="auth-preview__row auth-preview__row--warn"><span>Impact</span><i/><b>8/20</b></div></div><div className="drag-caption drag-caption--auth"><span/> Drag report · release to reset</div></DragReturn><div className="auth-floating-chip"><Icon name="briefcase"/><div><small>EXAMPLE · TAILORED MATCH</small><b>86% · sample role</b></div></div></section>
    </div></div>;
}
