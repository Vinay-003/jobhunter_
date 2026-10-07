import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Icon from './Icon';
import DragReturn from './DragReturn';
import { Button, Logo, ScoreRing, ThemeToggle } from './UI';
import { loginSchema, signupSchema } from '../lib/validation';
import { useAuth } from '../features/auth/AuthContext';
import { getApiErrorMessage } from '../lib/api';

export default function PublicAuth({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, signup, verifyOtp, resendOtp } = useAuth();

  const [step, setStep] = useState<'credentials' | 'otp'>('credentials');
  const [show, setShow] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');

  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // Resend cooldown timer (60s)
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    const urlEmail = searchParams.get('email');
    if (urlEmail) {
      setEmail(urlEmail);
      setStep('otp');
      setCountdown(60);
    }
  }, [searchParams]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setInfoMessage('');
    setFieldErrors({});

    if (step === 'otp') {
      const trimmedOtp = otp.trim();
      if (!/^\d{6}$/.test(trimmedOtp)) {
        setError('Please enter the 6-digit verification code.');
        return;
      }
      setLoading(true);
      try {
        await verifyOtp(email, trimmedOtp, mode === 'login' ? 'login' : 'verification');
        navigate('/app/ats', { replace: true });
      } catch (err) {
        setError(getApiErrorMessage(err));
      } finally {
        setLoading(false);
      }
      return;
    }

    const parsed = mode === 'login'
      ? loginSchema.safeParse({ email, password })
      : signupSchema.safeParse({ username, email, password });

    if (!parsed.success) {
      const fields: Record<string, string> = {};
      parsed.error.issues.forEach(issue => {
        const key = String(issue.path[0] ?? 'form');
        fields[key] ??= issue.message;
      });
      setFieldErrors(fields);
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const res = await signup(username, email, password);
        if (res.requiresVerification) {
          setStep('otp');
          setCountdown(60);
          setInfoMessage('Verification code sent to your email.');
        } else {
          navigate('/app/ats', { replace: true });
        }
      } else {
        const res = await login(email, password);
        if (res.requiresOtp || res.requiresVerification) {
          setStep('otp');
          setCountdown(60);
          setInfoMessage('Verification code sent to your email.');
        } else {
          navigate('/app/ats', { replace: true });
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || loading || !email) return;
    setError('');
    setInfoMessage('');
    setLoading(true);
    try {
      await resendOtp(email, mode === 'login' ? 'login' : 'verification');
      setCountdown(60);
      setInfoMessage('A new verification code has been sent to your email.');
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const fieldError = (field: string) =>
    fieldErrors[field] && <span className="auth-field-error" role="alert">{fieldErrors[field]}</span>;

  return (
    <div className="auth-page">
      <div className="auth-nav">
        <Logo />
        <div className="auth-nav__actions">
          <ThemeToggle compact />
          <Link to={mode === 'login' ? '/signup' : '/login'}>
            {mode === 'login' ? 'Create account' : 'Sign in'} <Icon name="arrow" size={14} />
          </Link>
        </div>
      </div>
      <div className="auth-grid">
        <section className="auth-form-wrap">
          <div className="auth-form">
            <div className="auth-kicker"><span /> JOBHUNTER WORKSPACE</div>
            {step === 'otp' ? (
              <>
                <h1>Check your inbox.</h1>
                <p>
                  We sent a 6-digit verification code to <strong>{email}</strong>. Enter it below to continue.
                </p>
                <form onSubmit={handleSubmit} noValidate>
                  <label>
                    <span id="auth-otp-label">Verification Code</span>
                    <div className="field">
                      <Icon name="lock" />
                      <input
                        aria-labelledby="auth-otp-label"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        autoFocus
                        style={{ letterSpacing: '0.25em', fontWeight: 600, fontSize: '18px' }}
                      />
                    </div>
                  </label>

                  {infoMessage && <p className="auth-message" role="status">{infoMessage}</p>}
                  {error && <p className="auth-message auth-message--error" role="alert">{error}</p>}

                  <Button className="auth-submit" icon="arrow" type="submit" disabled={loading || otp.length < 6}>
                    {loading ? 'Verifying…' : 'Verify & Continue'}
                  </Button>
                </form>

                <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p className="auth-switch">
                    Didn&apos;t receive the code?{' '}
                    <button
                      type="button"
                      onClick={handleResend}
                      disabled={countdown > 0 || loading}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: countdown > 0 ? 'var(--muted)' : 'var(--accent, #3b82f6)',
                        cursor: countdown > 0 ? 'not-allowed' : 'pointer',
                        textDecoration: 'underline',
                        padding: 0,
                        font: 'inherit',
                      }}
                    >
                      {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
                    </button>
                  </p>

                  <button
                    type="button"
                    onClick={() => { setStep('credentials'); setOtp(''); setError(''); setInfoMessage(''); }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--muted)',
                      cursor: 'pointer',
                      fontSize: '13px',
                      textAlign: 'left',
                      padding: 0,
                    }}
                  >
                    ← Use a different email
                  </button>
                </div>
              </>
            ) : (
              <>
                <h1>{mode === 'login' ? 'Welcome back.' : 'Build your career workspace.'}</h1>
                <p>
                  {mode === 'login'
                    ? 'Continue where you left off — reports, saved resumes and role matches included.'
                    : 'One private workspace for resume diagnostics, role matching and focused job discovery.'}
                </p>
                <form onSubmit={handleSubmit} noValidate>
                  {mode === 'signup' && (
                    <label>
                      <span id="auth-username-label">Username</span>
                      <div className="field">
                        <Icon name="user" />
                        <input
                          aria-labelledby="auth-username-label"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          placeholder="Your username"
                          autoComplete="username"
                          aria-invalid={!!fieldErrors.username}
                        />
                      </div>
                      {fieldError('username')}
                    </label>
                  )}
                  <label>
                    <span id="auth-email-label">Email</span>
                    <div className="field">
                      <span className="field__glyph" aria-hidden="true">@</span>
                      <input
                        aria-labelledby="auth-email-label"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        autoComplete="email"
                        aria-invalid={!!fieldErrors.email}
                      />
                    </div>
                    {fieldError('email')}
                  </label>
                  <label>
                    <span id="auth-password-label">Password</span>
                    <div className="field">
                      <Icon name="lock" />
                      <input
                        aria-labelledby="auth-password-label"
                        type={show ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="At least 8 characters"
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        aria-invalid={!!fieldErrors.password}
                      />
                      <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'}>
                        {show ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    {fieldError('password')}
                  </label>
                  {error && <p className="auth-message auth-message--error" role="alert">{error}</p>}
                  <Button className="auth-submit" icon="arrow" type="submit" disabled={loading}>
                    {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create workspace'}
                  </Button>
                </form>
                <p className="auth-switch">
                  {mode === 'login' ? "Don't have an account?" : 'Already have an account?'} <Link to={mode === 'login' ? '/signup' : '/login'}>{mode === 'login' ? 'Sign up' : 'Sign in'}</Link>
                </p>
              </>
            )}
            <div className="auth-security"><Icon name="lock" size={14} /> Secure session · email verified · private resume storage</div>
          </div>
        </section>
        <section className="auth-showcase" aria-label="Illustrative product preview">
          <div className="auth-showcase__copy">
            <span>ILLUSTRATIVE EXAMPLE · NOT YOUR DATA</span>
            <h2>Know the reason<br />behind every point.</h2>
            <p>Resume Health diagnoses the document. Tailored Match evaluates one role. They stay separate by design.</p>
          </div>
          <DragReturn className="auth-preview-drag" mode="absolute" label="Illustrative Resume Health preview">
            <div className="auth-preview">
              <div className="auth-preview__top">
                <div><small>EXAMPLE · RESUME HEALTH</small><b>Sample resume</b></div>
                <ScoreRing value={78} size={118} />
              </div>
              <div className="auth-preview__action"><span>01</span><div><small>HIGH IMPACT</small><b>Add measurable outcomes</b></div></div>
              <div className="auth-preview__row"><span>ATS structure</span><i /><b>20/20</b></div>
              <div className="auth-preview__row auth-preview__row--warn"><span>Impact</span><i /><b>8/20</b></div>
            </div>
            <div className="drag-caption drag-caption--auth"><span /> Drag report · release to reset</div>
          </DragReturn>
          <div className="auth-floating-chip"><Icon name="briefcase" /><div><small>EXAMPLE · TAILORED MATCH</small><b>86% · sample role</b></div></div>
        </section>
      </div>
    </div>
  );
}
