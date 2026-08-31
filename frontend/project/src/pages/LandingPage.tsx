// src/pages/LandingPage.tsx — Editorial / Instrument — Violet/Cyan on Ink
import { Link } from 'react-router-dom';
import { ArrowUpRight, Sparkles, ShieldCheck, Layers, FileSearch, Briefcase, Quote } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#070a12] text-white selection:bg-violet-500/30 overflow-x-hidden">
      {/* subtle grain + grid */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:32px_32px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} />
      </div>

      <header className="relative sticky top-0 z-20 border-b border-white/[0.06] bg-[#070a12]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-[64px] max-w-[1280px] items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 shadow-lg shadow-violet-950/30 text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M7 7h10v10" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </span>
            <span className="text-[18px] font-semibold tracking-[-0.03em]">JobHunter</span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium tracking-[0.14em] text-white/60">V2 • PRIVATE BETA</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="hidden sm:inline-flex h-9 items-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white/80 hover:bg-white/[0.08] hover:text-white transition">Sign in</Link>
            <Link to="/signup" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-black hover:bg-white/90 transition">Create account <ArrowUpRight size={14} /></Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative mx-auto max-w-[1280px] px-6 pt-12 pb-10 sm:pt-16">
        {/* orbs */}
        <div className="pointer-events-none absolute -top-24 right-[-8%] h-[520px] w-[520px] rounded-full bg-violet-600/20 blur-[120px]" />
        <div className="pointer-events-none absolute top-10 left-[-10%] h-[420px] w-[420px] rounded-full bg-cyan-400/10 blur-[100px]" />

        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
              <Sparkles size={12} /> ATS Readiness • Tailored Match • Private by design
            </div>
            <h1 className="mt-5 text-[40px] sm:text-[54px] font-[750] leading-[0.95] tracking-[-0.05em] text-white">
              Your resume,
              <br />
              <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-cyan-300 bg-clip-text text-transparent">measured properly.</span>
            </h1>
            <p className="mt-4 max-w-[560px] text-[15px] leading-6 text-white/60">
              Upload a text-based PDF. Get a <span className="text-white">diagnostic report</span> — not a dashboard dump. Rule-based health (no JD) and a <span className="text-white">separate Tailored Match</span> when you paste a job. No hallucinated bullet points.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/signup" className="inline-flex h-[44px] items-center justify-center rounded-full bg-white px-7 text-sm font-semibold text-black hover:bg-white/90 transition">Start health check →</Link>
              <Link to="/login" className="inline-flex h-[44px] items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-7 text-sm font-medium text-white hover:bg-white/[0.08] transition">Sign in</Link>
            </div>
            <div className="mt-4 flex items-center gap-3 text-xs text-white/40">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.6)]" /> Encrypted storage • Supabase private bucket</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">No localStorage tokens</span>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-6 border-t border-white/[0.06] pt-6">
              {[
                { k: '100', v: 'point diagnostic', sub: '8 categories, 30+ checks' },
                { k: '3.0.0', v: 'scorer version', sub: 'rule-based, explainable' },
                { k: '384d', v: 'anass fine-tune', sub: 'local or SageMaker' },
              ].map(s => (
                <div key={s.k}>
                  <div className="text-[22px] font-semibold tracking-[-0.02em] text-white">{s.k}</div>
                  <div className="text-xs font-medium text-white/70">{s.v}</div>
                  <div className="text-xs text-white/40">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 3D report mock */}
          <div className="relative lg:h-[520px]">
            <div className="absolute inset-0 -z-10 bg-gradient-to-br from-violet-600/20 via-transparent to-cyan-400/20 blur-2xl" />
            <div className="relative mx-auto w-full max-w-[520px] [perspective:1200px]">
              <div className="relative rounded-[24px] border border-white/[0.08] bg-gradient-to-br from-white/[0.07] to-white/[0.02] p-[1px] shadow-2xl shadow-black/50 [transform:rotateY(-8deg)_rotateX(6deg)] hover:[transform:rotateY(-4deg)_rotateX(3deg)] transition-transform duration-700">
                <div className="rounded-[23px] bg-[#0B0E1A] p-6">
                  <div className="flex items-center justify-between">
                    <span className="text-xs tracking-[0.18em] text-white/40">RESUME HEALTH</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-400/20 px-2.5 py-1 text-xs font-medium text-emerald-300">● ATS-safe</span>
                  </div>
                  <div className="mt-4 flex items-end gap-4">
                    <div className="relative grid h-28 w-28 place-items-center">
                      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8"/><circle cx="50" cy="50" r="42" fill="none" stroke="url(#g)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${77 * 2.64} 264`} /></svg>
                      <svg width="0" height="0"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#8b5cf6"/><stop offset="100%" stopColor="#22d3ee"/></linearGradient></defs></svg>
                      <div className="absolute text-center"><div className="text-[28px] font-bold tracking-[-0.03em]">77</div><div className="text-xs text-white/40">/100</div></div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white">Strong — minor tweaks</div>
                      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        {[
                          { l: 'ATS', v: '20/20' },
                          { l: 'Sections', v: '11/15' },
                          { l: 'Impact', v: '12/20' },
                        ].map(c => (
                          <div key={c.l} className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2"><div className="text-white/50">{c.l}</div><div className="font-medium text-white">{c.v}</div></div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 space-y-2">
                    {[
                      'Quantify 2-3 bullets: add metrics (%/time/scale)',
                      'Missing summary — not penalized, but add for hiring managers',
                      '1 work experience — good for entry-level',
                    ].map(t => (
                      <div key={t} className="flex gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs text-white/70"><span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-violet-400" />{t}</div>
                    ))}
                  </div>
                </div>
              </div>
              {/* floating JD card */}
              <div className="absolute -bottom-6 -left-4 hidden sm:flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0B0E1A]/90 px-4 py-3 shadow-xl backdrop-blur-xl">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-400/15 text-cyan-300"><Briefcase size={16} /></span>
                <div><div className="text-xs font-medium text-white">Tailored Match 43/100</div><div className="text-xs text-white/50">Missing: Kubernetes, Redis • 13% coverage</div></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-[1280px] px-6 pb-10">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: FileSearch, title: 'Diagnostic, not a score dump', desc: '8 categories, 30+ checks, priority actions and per-check evidence. Hard refresh still loads from /api/v1/analyses/:id.' },
            { icon: Layers, title: 'Job Matches, separate', desc: 'Master/detail workspace. Ranked roles on the left, breakdown + safe link validation on the right. No ATS/salary in fit.' },
            { icon: ShieldCheck, title: 'Private by design', desc: 'Supabase private bucket + SHA256 deduplication + PII redaction. No localStorage JWT, HttpOnly cookies.' },
          ].map(c => (
            <div key={c.title} className="group relative overflow-hidden rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-6 hover:bg-white/[0.04] transition">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/[0.06] to-transparent opacity-0 group-hover:opacity-100 transition" />
              <c.icon className="text-violet-300" size={20} />
              <h3 className="mt-3 text-sm font-semibold text-white">{c.title}</h3>
              <p className="mt-1.5 text-sm leading-5 text-white/55">{c.desc}</p>
            </div>
          ))}
        </div>

        {/* quote */}
        <div className="mt-10 flex flex-col items-start justify-between gap-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] p-6 md:flex-row md:items-center">
          <div className="flex gap-3">
            <Quote size={18} className="text-white/30" />
            <p className="max-w-[560px] text-sm leading-6 text-white/70">“We don’t claim an ATS ranking. <span className="text-white">Resume Health</span> measures document quality. <span className="text-white">Tailored Match</span> is a separate JD-specific fit. Both are explainable.”</p>
          </div>
          <Link to="/signup" className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black">Create your report <ArrowUpRight size={14} /></Link>
        </div>
      </section>

      <footer className="mx-auto max-w-[1280px] px-6 py-8 flex items-center justify-between border-t border-white/[0.06] text-xs text-white/40">
        <span>© 2026 JobHunter V2 • Privacy • Terms</span>
        <span className="hidden sm:inline">Built for portfolio + interviews • Fast on Render free tier</span>
      </footer>
    </div>
  );
}

function Briefcase(props: { size?: number; className?: string }) {
  return (
    <svg width={props.size ?? 16} height={props.size ?? 16} viewBox="0 0 24 24" fill="none" className={props.className}><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z M3 10a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  );
}
