import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon';
import { Button, Eyebrow, Logo, ThemeToggle } from '../components/UI';
export default function NotFoundPage() { const navigate = useNavigate(); return <div className="not-found-page"><header><Logo/><ThemeToggle compact/></header><main><div className="not-found-orb"><Icon name="target" size={28}/></div><Eyebrow>404 · Lost route</Eyebrow><h1>This page left the shortlist.</h1><p>The page you requested does not exist. Return home or sign in to your workspace.</p><div><Button onClick={() => navigate('/')} variant="secondary"><Icon name="back" size={15}/> Home</Button><Button onClick={() => navigate('/login')} icon="arrow">Sign in</Button></div></main></div>; }
