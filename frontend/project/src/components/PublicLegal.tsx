import { Link } from 'react-router-dom';
import { Logo, ThemeToggle } from './UI';
export default function PublicLegal({ type }: { type: 'privacy' | 'terms' }) {
  const privacy = type === 'privacy';
  return <div className="legal-page"><header className="legal-nav"><Logo/><div className="legal-nav__actions"><ThemeToggle compact/><Link to="/">Back to home</Link></div></header><main className="legal-wrap"><span>JOBHUNTER · {privacy ? 'PRIVACY' : 'TERMS'}</span><h1>{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1>{privacy ? <><h2>Privacy and resume data</h2><p>We store resumes securely and only use data to provide ATS scoring and job matching. Contact support for data deletion requests.</p></> : <><h2>Responsible use</h2><p>Use JobHunter responsibly. Uploaded content must be your own. We provide analysis for informational purposes only.</p></>}</main></div>;
}
