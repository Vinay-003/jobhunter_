// src/pages/LandingPage.tsx — Warm Ink Editorial — Amber on Charcoal, not purple
import { Link } from 'react-router-dom';
import { ArrowUpRight, Sparkles, ShieldCheck, Layers, FileSearch, Quote } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0C0A09] text-stone-100 selection:bg-amber-400/30 overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(231,229,228,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(231,229,228,0.06)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        <div className="absolute -top-32 right-[-10%] h-[640px] w-[640px] rounded-full bg-amber-500/12 blur-[120px]" />
        <div className="absolute top-[18%] -left-[8%] h-[480px] w-[480px] rounded-full bg-orange-500/08 blur-[110px]" />
      </div>

      <header className="relative sticky top-0 z-20 border-b border-stone-800/60 bg-[#0C0A09]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[64px] max-w-[1280px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-stone-900 shadow-lg shadow-amber-900/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M7 7h10v10" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className="text-[18px] font-semibold tracking-[-0.025em]" style={{ fontFamily: 'Fraunces, serif' }}>JobHunter</span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-stone-700 bg-stone-900 px-2.5 py-0.5 text-[10px] font-medium tracking-[0.14em] text-stone-400">V2 • PRIVATE</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:inline-flex h-9 items-center rounded-full border border-stone-800 bg-stone-900 px-4 text-sm font-medium text-stone-300 hover:bg-stone-800 hover:text-stone-100 transition">Sign in</Link>
            <Link to="/signup" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-amber-400 px-5 text-sm font-semibold text-stone-900 hover:bg-amber-300 transition">Create account <ArrowUpRight size={14} /></Link>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-[1280px] px-6 pt-12 pb-10 sm:pt-16">
        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
              <Sparkles size={12} /> No JD needed • Then tailored to any role
            </div>
            <h1 className="mt-5 text-[42px] sm:text-[56px] font-bold leading-[0.92] tracking-[-0.04em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>
              Your resume,
              <br />
              <span className="text-amber-400">diagnosed</span> — not guessed.
            </h1>
            <p className="mt-4 max-w-[560px] text-[15px] leading-6 text-stone-400">
              Drop a text PDF. Get a <span className="text-stone-100">100-point report</span> that shows exactly what to fix. Add a JD later for a <span className="text-stone-100">separate</span> fit score — never mixed, never hallucinated.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/signup" className="inline-flex h-[44px] items-center justify-center rounded-full bg-amber-400 px-7 text-sm font-semibold text-stone-900 hover:bg-amber-300 transition">Start health check →</Link>
              <Link to="/login" className="inline-flex h-[44px] items-center justify-center rounded-full border border-stone-800 bg-stone-900 px-7 text-sm font-medium text-stone-300 hover:bg-stone-800 hover:text-stone-100 transition">Sign in</Link>
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-stone-500">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Private bucket • PII redacted • HttpOnly</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">Rule-based 3.0.0 • 8 checks</span>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-6 border-t border-stone-800 pt-6">
              {[
                { k: '100', v: 'point report', sub: '8 groups, not a vibe' },
                { k: '3.0.0', v: 'rule-based', sub: 'no embeddings' },
                { k: '384d', v: 'anass', sub: 'mock/local/SageMaker' },
              ].map(s => (
                <div key={s.k}>
                  <div className="text-[22px] font-semibold tracking-[-0.02em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>{s.k}</div>
                  <div className="text-xs font-medium text-stone-300">{s.v}</div>
                  <div className="text-xs text-stone-500">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative lg:h-[520px]">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-amber-500/15 via-transparent to-stone-700/10 blur-2xl" />
            <div className="relative mx-auto w-full max-w-[520px] [perspective:1200px]">
              <div className="relative rounded-[24px] border border-stone-800 bg-stone-900 p-[1px] shadow-2xl shadow-black/50 [transform:rotateY(-6deg)_rotateX(4deg)] hover:[transform:rotateY(-3deg)_rotateX(2deg)] transition-transform duration-700">
                <div className="rounded-[23px] bg-[#141210] p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs tracking-[0.16em] text-stone-500">RESUME HEALTH — V3</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-400">● 92% ats parse</span>
                  </div>
                  <div className="mt-4 flex items-end gap-4">
                    <div className="relative grid h-28 w-28 place-items-center">
                      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(231,229,228,0.1)" strokeWidth="8"/><circle cx="50" cy="50" r="42" fill="none" stroke="#FACC15" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${78 * 2.64} 264`} /></svg>
                      <div className="absolute text-center"><div className="text-[28px] font-bold tracking-[-0.03em] text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>78</div><div className="text-xs text-stone-500">/100</div></div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-stone-100">Good — needs proof</div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        {[
                          { l: 'Parse', v: '20/20' },
                          { l: 'Impact', v: '8/20' },
                          { l: 'Skills', v: '9/10' },
                        ].map(c => (
                          <div key={c.l} className="rounded-xl bg-stone-800 border border-stone-700 px-3 py-2"><div className="text-stone-500">{c.l}</div><div className="font-medium text-stone-100">{c.v}</div></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {[
                      'Only 1 of 24 bullets has a number',
                      'Add summary — 0 → recruiters skim top 6s',
                      'Leadership is strong, add 1 more work proof',
                    ].map(t => (
                      <div key={t} className="flex gap-2 rounded-xl border border-stone-800 bg-stone-900 px-3 py-2.5 text-xs text-stone-400"><span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />{t}</div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="absolute -bottom-6 -left-4 hidden sm:flex items-center gap-3 rounded-2xl border border-stone-800 bg-[#141210] px-4 py-3 shadow-xl">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-400 text-stone-900"><Briefcase size={16} /></span>
                <div><div className="text-xs font-medium text-stone-100">Tailored Match 43/100</div><div className="text-xs text-stone-500">Missing: K8s, Redis • 13% coverage</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-6 pb-10">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: FileSearch, title: 'Report, not a number', desc: 'Score + label + 20/24 checks, metrics, priority actions, expandable evidence. Hard refresh still loads from /analyses/:id.' },
            { icon: Layers, title: 'Jobs are separate', desc: 'Master/detail with resume + role + location filter. No ATS/salary in fit — relevance only.' },
            { icon: ShieldCheck, title: 'Private', desc: 'Supabase private bucket, SHA256 cache, PII stripped before any embedding.' },
          ].map(c => (
            <div key={c.title} className="group relative overflow-hidden rounded-[20px] border border-stone-800 bg-stone-900/60 p-6 hover:bg-stone-900 transition">
              <c.icon className="text-amber-300" size={20} />
              <h3 className="mt-3 text-sm font-semibold text-stone-100" style={{ fontFamily: 'Fraunces, serif' }}>{c.title}</h3>
              <p className="mt-1.5 text-sm leading-5 text-stone-400">{c.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-6 rounded-[20px] border border-stone-800 bg-stone-900/60 p-6 md:flex-row md:items-center">
          <div className="flex gap-3">
            <Quote size={18} className="text-stone-600" />
            <p className="max-w-[560px] text-sm leading-6 text-stone-400">Resume Health is <span className="text-stone-100">document quality</span>. Tailored Match is <span className="text-stone-100">fit for one JD</span>. We never mix them — that’s what makes the score explainable.</p>
          </div>
          <Link to="/signup" className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-5 py-2.5 text-sm font-semibold text-stone-900 hover:bg-amber-300">Create your report <ArrowUpRight size={14} /></Link>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-6 py-8 flex items-center justify-between border-t border-stone-800 text-xs text-stone-500">
        <span>© 2026 JobHunter V2 • Privacy • Terms</span>
        <span className="hidden sm:inline">Warm ink • Amber • Fraunces • No purple slop</span>
      </footer>
    </div>
  );
}

function Briefcase(props: { size?: number; className?: string }) {
  return (
    <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" className={props.className}><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z M3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}
