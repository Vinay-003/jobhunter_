import { useRouteError, isRouteErrorResponse, useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Eyebrow, Logo, ThemeToggle } from '../components/UI';

export default function ErrorPage() {
  const error = useRouteError();
  const navigate = useNavigate();

  let title = 'Something went wrong';
  let message = 'An unexpected error occurred while loading this page.';

  if (isRouteErrorResponse(error)) {
    title = `${error.status} · ${error.statusText || 'Error'}`;
    message = error.data?.message || 'We could not display this page.';
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="not-found-page">
      <header>
        <Logo />
        <ThemeToggle compact />
      </header>
      <main>
        <div
          className="not-found-orb"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.4)',
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.15) 0%, transparent 70%)',
          }}
        >
          <Icon name="shield" size={28} className="text-red-400" />
        </div>
        <Eyebrow tone="amber">Application Notice</Eyebrow>
        <h1>{title}</h1>
        <p>{message}</p>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button onClick={() => window.location.reload()} variant="secondary">
            <Icon name="refresh" size={15} /> Reload page
          </Button>
          <Button onClick={() => navigate('/app/ats')} icon="arrow">
            Go to dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}
