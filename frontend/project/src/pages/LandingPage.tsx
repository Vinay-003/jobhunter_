import { useEffect, useMemo, useRef, type RefObject, type PointerEvent as ReactPointerEvent } from 'react';
import Icon from '../components/Icon';
import { Button, Eyebrow, Logo, ScoreRing, Tag, ThemeToggle } from '../components/UI';
import { Link, useNavigate } from 'react-router-dom';
import DragReturn from '../components/DragReturn';

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (from: number, to: number, value: number) => {
  if (from === to) return value >= to ? 1 : 0;
  const t = clamp((value - from) / (to - from));
  return t * t * (3 - 2 * t);
};

function Header() {
  return (
    <header className="marketing-nav wrap">
      <Logo />
      <nav><a href="#product">Product</a><a href="#how">How it works</a><a href="#privacy">Privacy</a></nav>
      <div className="marketing-nav__actions"><ThemeToggle compact/><Link to="/login" className="nav-login">Sign in</Link><Link to="/signup" className="button button--small button--primary">Analyze my resume <Icon name="arrow" size={14}/></Link></div>
    </header>
  );
}

function useHeroScroll(heroRef: RefObject<HTMLElement>) {
  useEffect(() => {
    let frame = 0;
    let top = 0;
    let height = 1;
    const measure = () => {
      const node = heroRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      top = rect.top + window.scrollY;
      height = Math.max(1, rect.height);
    };
    const update = () => {
      frame = 0;
      const node = heroRef.current;
      if (!node) return;
      const desktop = window.matchMedia('(min-width: 901px)').matches;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const progress = reduced ? 0 : clamp((window.scrollY - top) / Math.min(height * (desktop ? .72 : .82), desktop ? 560 : 430));
      const copyY = desktop ? -34 : -16;
      const visualY = desktop ? -18 : -28;
      const copyFade = desktop ? .52 : .18;
      const visualFade = desktop ? .28 : .2;
      const visualScale = desktop ? .025 : .035;
      node.style.setProperty('--hero-scroll', progress.toFixed(4));
      node.style.setProperty('--hero-copy-y', `${(copyY * progress).toFixed(2)}px`);
      node.style.setProperty('--hero-copy-opacity', (1 - progress * copyFade).toFixed(4));
      node.style.setProperty('--hero-visual-y', `${(visualY * progress).toFixed(2)}px`);
      node.style.setProperty('--hero-visual-scale', (1 - progress * visualScale).toFixed(4));
      node.style.setProperty('--hero-visual-opacity', (1 - progress * visualFade).toFixed(4));
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onResize = () => { measure(); schedule(); };
    const onStoryAnchor = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href="#product"],a[href="#how"],a[href="#sample"]');
      if (!anchor || !window.matchMedia('(min-width: 901px) and (min-height: 700px)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const id = anchor.getAttribute('href')?.slice(1);
      const points = { product: .06, how: .47, sample: .86 };
      if (!id || !(id in points)) return;
      const story = document.querySelector<HTMLElement>('.landing-story');
      if (!story) return;
      const rect = story.getBoundingClientRect();
      const storyTop = rect.top + window.scrollY;
      const storyTravel = Math.max(1, story.offsetHeight - window.innerHeight);
      event.preventDefault();
      window.scrollTo({ top: storyTop + storyTravel * points[id as keyof typeof points], behavior: 'smooth' });
    };
    measure(); update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('click', onStoryAnchor);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('click', onStoryAnchor);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [heroRef]);
}

function useReveal(rootRef: RefObject<HTMLDivElement>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll('.landing-reveal')];
    if (!('IntersectionObserver' in window)) {
      nodes.forEach(node => node.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: .16, rootMargin: '0px 0px -8% 0px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [rootRef]);
}

function HeroVisual() {
  const stageRef = useRef<HTMLDivElement>(null);
  const reset = () => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty('--tilt-x','0deg');
    stage.style.setProperty('--tilt-y','0deg');
    stage.style.setProperty('--shift-x','0px');
    stage.style.setProperty('--shift-y','0px');
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    const stage = stageRef.current;
    if (!stage) return;
    const r = event.currentTarget.getBoundingClientRect();
    const px = Math.max(-.5, Math.min(.5, (event.clientX-r.left)/r.width-.5));
    const py = Math.max(-.5, Math.min(.5, (event.clientY-r.top)/r.height-.5));
    stage.style.setProperty('--tilt-x',`${px*28}deg`);
    stage.style.setProperty('--tilt-y',`${py*-21}deg`);
    stage.style.setProperty('--shift-x',`${px*64}px`);
    stage.style.setProperty('--shift-y',`${py*46}px`);
  };
  return (
    <div className="hero-visual" role="img" aria-label="Illustrative interactive JobHunter report preview" onPointerMove={move} onPointerLeave={reset}>
      <div className="hero-stage" ref={stageRef}><span className="hero-example-label">ILLUSTRATIVE EXAMPLE · NOT YOUR DATA</span>
        <div className="hero-orbit hero-orbit--one"/><div className="hero-orbit hero-orbit--two"/>
        <DragReturn className="hero-drag hero-drag--resume" mode="absolute" label="Resume preview">
          <div className="resume-sheet depth-card">
            <div className="resume-sheet__top"><span className="mini-avatar">VS</span><div><b>Sample Candidate</b><small>Software Engineer</small></div><Tag tone="green">Parsed</Tag></div>
            <div className="resume-line resume-line--long"/><div className="resume-line resume-line--medium"/>
            <h4>Experience</h4>
            <div className="resume-bullet"><i/>Built Ad Factory across 5 formats and 3 language modes.</div>
            <div className="resume-bullet"><i/>Integrated Meta, GA4, Shopify and Shiprocket.</div>
            <h4>Projects</h4>
            <div className="resume-bullet"><i/>Built JobHunter ATS + job recommendation system.</div>
          </div>
        </DragReturn>
        <DragReturn className="hero-drag hero-drag--score" mode="absolute" label="Resume Health score">
          <div className="score-float depth-card"><ScoreRing value={78} size={126}/><div><b>Good foundation</b><small>Needs stronger impact evidence</small></div></div>
        </DragReturn>
        <DragReturn className="hero-drag hero-drag--insight" mode="absolute" label="Top recommendation">
          <div className="insight-float depth-card"><span className="insight-float__icon"><Icon name="spark"/></span><div><small>Top opportunity</small><b>Add measurable outcomes</b><p>High impact · Experience</p></div></div>
        </DragReturn>
        <DragReturn className="hero-drag hero-drag--match" mode="absolute" label="Tailored Match score">
          <div className="match-float depth-card"><div className="match-float__score">86<span>%</span></div><div><small>Role match</small><b>Sample role</b><p>Strong backend evidence</p></div></div>
        </DragReturn>
      </div>
      <div className="hero-drag-hint"><span className="hero-drag-hint__dot"/><span className="hero-drag-hint__desktop">Grab any panel and move it</span><span className="hero-drag-hint__touch">Tap once, then tap + hold to move</span></div>
    </div>
  );
}

function LandingStory() {
  const storyRef = useRef<HTMLDivElement>(null);
  const firstScene = useRef<HTMLDivElement>(null);
  const secondScene = useRef<HTMLDivElement>(null);
  const thirdScene = useRef<HTMLDivElement>(null);
  const sceneRefs = useMemo(() => [firstScene, secondScene, thirdScene], []);

  useEffect(() => {
    let frame = 0;
    let storyTop = 0;
    let storyTravel = 1;

    const measure = () => {
      const story = storyRef.current;
      if (!story) return;
      const rect = story.getBoundingClientRect();
      storyTop = rect.top + window.scrollY;
      storyTravel = Math.max(1, story.offsetHeight - window.innerHeight);
    };

    const apply = (node: HTMLElement | null, opacity: number, y: number, scale: number, enter: number, exit: number, x = 0) => {
      if (!node) return;
      node.style.setProperty('--scene-opacity', opacity.toFixed(4));
      node.style.setProperty('--scene-y', `${y.toFixed(2)}px`);
      node.style.setProperty('--scene-x', `${x.toFixed(2)}px`);
      node.style.setProperty('--scene-scale', scale.toFixed(4));
      node.style.setProperty('--scene-enter', enter.toFixed(4));
      node.style.setProperty('--scene-exit', exit.toFixed(4));
      node.style.pointerEvents = opacity > .55 ? 'auto' : 'none';
    };

    const update = () => {
      frame = 0;
      const story = storyRef.current;
      if (!story) return;
      const desktop = window.matchMedia('(min-width: 901px)').matches;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || desktop && window.innerHeight < 700) {
        story.classList.remove('mobile-story-motion');
        sceneRefs.forEach(ref => {
          const node = ref.current;
          if (!node) return;
          node.removeAttribute('style');
          node.classList.remove('mobile-story-visible');
          delete node.dataset.mobileRevealed;
        });
        return;
      }

      if (!desktop) {
        story.classList.add('mobile-story-motion');
        const vh = Math.max(1, window.innerHeight);
        sceneRefs.forEach((ref) => {
          const node = ref.current;
          if (!node) return;
          node.style.pointerEvents = 'auto';
          const rect = node.getBoundingClientRect();
          const enter = clamp((vh * .94 - rect.top) / (vh * .46));
          const exit = clamp((vh * .26 - rect.bottom) / (vh * .30));
          const opacity = clamp(enter * (1 - exit * .62));
          const y = 48 * (1 - enter) - 26 * exit;
          const scale = .972 + .028 * enter - .012 * exit;
          const blur = 3.2 * (1 - enter) + 1.4 * exit;
          node.style.setProperty('--mobile-scene-opacity', opacity.toFixed(4));
          node.style.setProperty('--mobile-scene-y', `${y.toFixed(2)}px`);
          node.style.setProperty('--mobile-scene-scale', scale.toFixed(4));
          node.style.setProperty('--mobile-scene-blur', `${blur.toFixed(2)}px`);
          if (enter > .1 || node.dataset.mobileRevealed === 'true') {
            node.dataset.mobileRevealed = 'true';
            node.classList.add('mobile-story-visible');
          }
        });
        return;
      }

      story.classList.remove('mobile-story-motion');
      sceneRefs.forEach(ref => {
        const node = ref.current;
        if (!node) return;
        node.classList.remove('mobile-story-visible');
        delete node.dataset.mobileRevealed;
      });

      const p = clamp((window.scrollY - storyTop) / storyTravel);

      const s0Out = smooth(.27, .40, p);
      apply(sceneRefs[0].current, 1 - s0Out, -54 * s0Out, 1 - .025 * s0Out, 1, s0Out, -18 * s0Out);

      const s1In = smooth(.22, .35, p);
      const s1Out = smooth(.60, .73, p);
      const s1Opacity = s1In * (1 - s1Out);
      apply(sceneRefs[1].current, s1Opacity, 58 * (1 - s1In) - 48 * s1Out, .965 + .035 * s1In - .02 * s1Out, s1In, s1Out, 18 * (1 - s1In));

      const s2In = smooth(.56, .70, p);
      apply(sceneRefs[2].current, s2In, 62 * (1 - s2In), .965 + .035 * s2In, s2In, 0, -18 * (1 - s2In));

      story.style.setProperty('--story-progress', p.toFixed(4));
    };

    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    const onResize = () => { measure(); schedule(); };
    measure(); update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [sceneRefs]);

  return (
    <div className="landing-story" ref={storyRef}>
      <div className="landing-story__sticky">
        <section className="story-scene story-scene--signals" id="product" ref={sceneRefs[0]}>
          <div className="signal-section wrap">
            <div className="signal-copy"><Eyebrow tone="blue">One resume · two signals</Eyebrow><h2>Answer the right question<br/>at the right time.</h2><p>Document quality and job fit are different problems. JobHunter keeps them separate so every result remains useful and explainable.</p></div>
            <div className="signal-grid">
              <article className="signal-card signal-card--amber"><div className="signal-card__icon"><Icon name="target"/></div><span>Resume Health</span><h3>“Is my resume strong?”</h3><p>ATS structure, impact, completeness, skills evidence, writing, concision and consistency.</p><div className="mini-bars"><i style={{width:'100%'}}/><i style={{width:'42%'}}/><i style={{width:'88%'}}/><i style={{width:'76%'}}/></div><footer><b>78 / 100</b><small>No job description required</small></footer></article>
              <div className="signal-connector"><span>≠</span><small>never mixed</small></div>
              <article className="signal-card signal-card--blue"><div className="signal-card__icon"><Icon name="briefcase"/></div><span>Tailored Match</span><h3>“Do I fit this role?”</h3><p>Required skills, responsibilities, seniority and semantic evidence for one specific job description.</p><div className="skill-pills"><Tag tone="blue">TypeScript ✓</Tag><Tag tone="blue">Node.js ✓</Tag><Tag>Redis missing</Tag></div><footer><b>86% match</b><small>Role-specific evidence</small></footer></article>
            </div>
          </div>
        </section>

        <section className="story-scene story-scene--process" id="how" ref={sceneRefs[1]}>
          <div className="process-section wrap">
            <div><div className="center-heading"><Eyebrow>How it works</Eyebrow><h2>From PDF to a better application.</h2><p>No mystery score. Each stage produces something you can inspect.</p></div>
              <div className="process-grid">{[
                ['01','Upload','Your text-based PDF stays private.'],['02','Diagnose','Eight clear scoring groups evaluate document quality.'],['03','Prioritize','See the few changes that matter most first.'],['04','Match','Compare separately against jobs worth applying to.']
              ].map(([n,t,b],i)=><div className="process-step" key={n}><span>{n}</span><div className="process-step__line"/><div className="process-step__orb"><Icon name={i===0?'upload':i===1?'target':i===2?'spark':'briefcase'}/></div><h3>{t}</h3><p>{b}</p></div>)}</div>
            </div>
          </div>
        </section>

        <section className="story-scene story-scene--sample" id="sample" ref={sceneRefs[2]}>
          <div className="sample-section wrap">
            <div className="sample-copy"><Eyebrow>Report, not a vibe</Eyebrow><h2>Know what to fix before you apply.</h2><p>Your report leads with the score, then the top actions, then evidence. Detailed scoring rules stay available without drowning the main experience.</p><ul><li><Icon name="check"/> Three priority actions before eight categories</li><li><Icon name="check"/> Evidence tied back to resume content</li><li><Icon name="check"/> Progressive disclosure instead of card overload</li></ul><Link to="/signup" className="inline-link">Create your own report <Icon name="arrow" size={15}/></Link></div>
            <DragReturn className="sample-report-drag" label="Sample Resume Health report">
              <div className="sample-report">
                <div className="sample-report__head"><div><small>ILLUSTRATIVE RESUME HEALTH</small><h3>Good foundation</h3><p>Strong structure. Improve measurable impact.</p></div><ScoreRing value={78} size={140}/></div>
                <div className="sample-priority"><span>01</span><div><small>HIGH IMPACT</small><b>Add measurable outcomes</b><p>Only a small share of experience bullets prove scale or results.</p></div><Tag tone="amber">Fix first</Tag></div>
                <div className="sample-bars"><div><span>ATS structure</span><i><b style={{width:'100%'}}/></i><em>20/20</em></div><div><span>Impact</span><i><b style={{width:'40%'}}/></i><em>8/20</em></div><div><span>Completeness</span><i><b style={{width:'93%'}}/></i><em>14/15</em></div></div>
              </div>
              <div className="drag-caption"><span/> Drag the report · release to reset</div>
            </DragReturn>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const pageRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  useHeroScroll(heroRef);
  useReveal(pageRef);

  return (
    <div className="marketing-page" ref={pageRef}>
      <div className="noise"/><Header />
      <section className="hero wrap" ref={heroRef}>
        <div className="hero-copy reveal">
          <Eyebrow>Explainable resume intelligence</Eyebrow>
          <h1>Your resume isn’t a number.<br/><span>See what’s holding it back.</span></h1>
          <p>Upload once. Get a transparent 100-point Resume Health diagnostic. Then independently compare your evidence against roles you actually want.</p>
          <div className="hero-actions"><Button icon="arrow" onClick={() => navigate('/signup')}>Analyze my resume</Button><a href="#sample" className="button button--ghost">See sample report</a></div>
          <div className="trust-row"><span><Icon name="lock" size={14}/> Private storage</span><span><Icon name="shield" size={14}/> Explainable scoring</span><span><Icon name="spark" size={14}/> No guessed ATS fit</span></div>
        </div>
        <HeroVisual />
      </section>

      <LandingStory />

      <section id="privacy" className="privacy-band landing-reveal"><div className="wrap privacy-band__inner"><div><Eyebrow>Private by default</Eyebrow><h2>Your career data should not feel public.</h2></div><div className="privacy-points"><article><Icon name="lock"/><h3>Private storage</h3><p>Resume files live in private storage, not public URLs.</p></article><article><Icon name="shield"/><h3>PII-aware processing</h3><p>Sensitive identity fields stay out of semantic job matching.</p></article><article><Icon name="target"/><h3>Explainable score</h3><p>Generic Resume Health remains deterministic and inspectable.</p></article></div></div></section>

      <section className="final-cta wrap landing-reveal"><div className="final-cta__glow"/><Eyebrow>Ready when you are</Eyebrow><h2>Your next application should<br/>start with evidence.</h2><p>Build your Resume Health report, fix the highest-impact gaps, then match with intention.</p><Button icon="arrow" onClick={() => navigate('/signup')}>Create my report</Button></section>
      <footer className="marketing-footer wrap landing-reveal"><Logo/><p>Explainable resume intelligence for focused job search.</p><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><Link to="/login">Sign in</Link></div><small>© 2026 JobHunter</small></footer>
    </div>
  );
}
