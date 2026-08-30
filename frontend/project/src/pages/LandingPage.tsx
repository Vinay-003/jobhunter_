// src/pages/LandingPage.tsx
import { Link } from 'react-router-dom';
import { FileText, Briefcase, Shield, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <header className="border-b border-white/5 sticky top-0 bg-[#0a0a0f]/80 backdrop-blur z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="font-bold text-lg">Job<span className="text-red-500">Hunter</span> <span className="text-xs font-normal text-gray-500 ml-1 border border-white/10 rounded-full px-1.5 py-0.5">V2</span></span>
          <div className="flex items-center gap-2">
            <Link to="/login" className="text-sm text-gray-400 hover:text-white px-3 py-1.5">Sign in</Link>
            <Link to="/signup" className="text-sm bg-red-500 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg">Get started</Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-16 lg:py-24">
        <div className="max-w-3xl">
          <p className="text-xs tracking-widest text-red-400 font-semibold mb-3">ATS • JOB MATCH • RESUME INTEL</p>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
            Optimize your resume.<br />
            <span className="text-red-500">Match better jobs.</span>
          </h1>
          <p className="text-gray-400 text-lg mb-8 max-w-2xl">
            Upload your PDF, get an ATS readiness breakdown, then discover jobs ranked by real skill overlap — no hallucinated bullet points, just evidence.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/login" className="bg-red-500 hover:bg-red-600 text-white px-6 py-2.5 rounded-lg font-medium">Go to ATS Check →</Link>
            <Link to="/signup" className="border border-white/10 hover:bg-white/5 px-6 py-2.5 rounded-lg font-medium">Create account</Link>
          </div>
          <p className="text-xs text-gray-500 mt-3">Secure by default: httpOnly cookies, CSRF protection, no localStorage tokens.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4 mt-16">
          {[
            { icon: FileText, title: 'ATS Readiness', desc: 'Category scores, rules failed/passed, strengths & warnings per section.' },
            { icon: Briefcase, title: 'Job Matches', desc: 'Fit score, confidence, matched vs missing skills with evidence snippets.' },
            { icon: Shield, title: 'Safe Rendering', desc: 'No dangerouslySetInnerHTML — all job descriptions are escaped text.' },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border border-white/5 bg-white/[0.02] p-5">
              <f.icon className="text-red-400 mb-3" size={20} />
              <h3 className="font-semibold text-sm mb-1">{f.title}</h3>
              <p className="text-sm text-gray-400">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-xl border border-red-900/30 bg-red-950/10 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Zap className="text-red-400" />
            <div>
              <p className="text-sm font-medium">Already have a resume?</p>
              <p className="text-xs text-gray-400">Upload takes 10 seconds. Results in under a minute.</p>
            </div>
          </div>
          <Link to="/login" className="bg-white text-black hover:bg-gray-100 px-5 py-2 rounded-lg text-sm font-medium shrink-0">Open App</Link>
        </div>
      </section>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-gray-500">
        <Link to="/privacy" className="hover:text-gray-300">Privacy</Link> · <Link to="/terms" className="hover:text-gray-300">Terms</Link> · <span>JobHunter V2</span>
      </footer>
    </div>
  );
}
