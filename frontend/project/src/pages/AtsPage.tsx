import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api, { getApiErrorMessage } from '../lib/api';
import { Button, Eyebrow, SelectMenu, Tag } from '../components/UI';
import { ArrowRight, Briefcase, Check, ChevronDown, FileText, LockKeyhole, ShieldCheck, Target, Upload } from 'lucide-react';
import './analysis.css';

type Mode = 'resume' | 'match';
type TargetLevel = 'entry' | 'mid' | 'senior';
const levelOptions = [{ value: 'entry', label: 'Entry / early career' }, { value: 'mid', label: 'Mid-level' }, { value: 'senior', label: 'Senior' }];
const checks = ['ATS structure', 'Core completeness', 'Impact evidence', 'Experience / projects', 'Skills evidence', 'Bullet writing', 'Concision', 'Consistency'];
const maxFileSize = 5 * 1024 * 1024;

export default function AtsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const existingResumeId = searchParams.get('resumeId');
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>('resume');
  const [file, setFile] = useState<File | null>(null);
  const [existing, setExisting] = useState<{ id: string; fileName?: string } | null>(null);
  const [targetLevel, setTargetLevel] = useState<TargetLevel>('entry');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'upload' | 'analyze'>('upload');
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!existingResumeId) { setExisting(null); return; }
    let cancelled = false;
    api.get(`/resumes/${existingResumeId}`).then((res) => {
      if (cancelled) return;
      const r = (res.data as { resume?: { id?: string; fileName?: string } })?.resume;
      if (r) { setExisting({ id: String(r.id ?? existingResumeId), fileName: r.fileName }); setError(''); }
      else setError('That resume no longer exists — upload a PDF instead.');
    }).catch((err) => {
      if (!cancelled) setError((err as { status?: number })?.status === 404 ? 'That resume no longer exists — upload a PDF instead.' : getApiErrorMessage(err));
    });
    return () => { cancelled = true; };
  }, [existingResumeId]);

  const chooseFile = (next: File | null) => {
    if (!next) { setFile(null); return; }
    if (!next.name.toLowerCase().endsWith('.pdf') && next.type !== 'application/pdf') { setError('Choose a PDF resume. Other file types are not supported.'); return; }
    if (next.size > maxFileSize) { setError('That PDF is larger than 5 MB. Choose a smaller file.'); return; }
    setError(''); setFile(next); setExisting(null);
    if (existingResumeId) navigate('/app/ats', { replace: true });
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); setDragging(false); if (!loading) chooseFile(event.dataTransfer.files?.[0] ?? null); };

  const analyze = async () => {
    if (!existing && !file) { setError('Choose a PDF resume first.'); return; }
    if (mode === 'match' && jobDescription.trim().length < 20) { setError('Paste at least 20 characters from the job description you want to match against.'); return; }
    setLoading(true); setError(''); setPhase(existing ? 'analyze' : 'upload');
    try {
      let resumeId: string;
      let fileName: string;
      if (existing) { resumeId = existing.id; fileName = existing.fileName || 'resume.pdf'; }
      else {
        const form = new FormData(); form.append('resume', file!); form.append('targetLevel', targetLevel);
        const upload = await api.post('/resumes', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        const uploaded = upload.data as { resume?: { id?: string }; id?: string };
        resumeId = uploaded?.resume?.id ?? uploaded?.id ?? '';
        if (!resumeId) throw new Error('Upload succeeded but no resume id was returned.');
        fileName = file!.name;
        setExisting({ id: resumeId, fileName });
      }
      setPhase('analyze');
      const response = mode === 'resume'
        ? await api.post('/analyses/readiness', { resumeId, targetLevel }, { timeout: 120000 })
        : await api.post('/analyses/jd-match', { resumeId, jobDescription, targetLevel }, { timeout: 260000 });
      const data = response.data as { analysisId?: string; [key: string]: unknown };
      if (!data?.analysisId) throw new Error('Analysis completed but no report id was returned.');
      navigate(`/app/analysis/${data.analysisId}`, { state: { initialAnalysis: data, fileName, mode, createdAt: new Date().toISOString() } });
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setLoading(false); }
  };

  const selectedName = file?.name ?? existing?.fileName;
  return <div className="workspace-page ats-page">
    <div className="page-heading"><div><Eyebrow>Resume intelligence</Eyebrow><h1>Make the next edit count.</h1><p>Start with document quality. Switch to Tailored Match only when comparing against one specific role.</p></div><div className="header-note"><ShieldCheck size={20}/><span><b>Explainable by design</b><small>Health and role fit stay separate.</small></span></div></div>
    <div className="mode-switch" role="group" aria-label="Analysis mode">
      <button type="button" className={mode === 'resume' ? 'active' : ''} aria-pressed={mode === 'resume'} disabled={loading} onClick={() => { setMode('resume'); setError(''); setShowDetails(false); }}><span className="mode-switch__icon"><Target size={20}/></span><span><b>Resume Health</b><small>No job description needed</small></span></button>
      <button type="button" className={mode === 'match' ? 'active mode-switch__match' : ''} aria-pressed={mode === 'match'} disabled={loading} onClick={() => { setMode('match'); setError(''); setShowDetails(false); }}><span className="mode-switch__icon"><Briefcase size={20}/></span><span><b>Tailored Match</b><small>Compare against one role</small></span></button>
    </div>
    <div className="ats-grid"><section className="ats-workcard">
      <div className="ats-workcard__head"><div><span className="step-pill">01</span><div><h2>{mode === 'resume' ? 'Choose your resume' : 'Resume + job description'}</h2><p>{mode === 'resume' ? 'Upload a text-based PDF or use a saved resume.' : 'Use the same resume, then paste the role you actually care about.'}</p></div></div><Tag tone={mode === 'resume' ? 'amber' : 'blue'}>{mode === 'resume' ? '100-point diagnostic' : 'Role-specific'}</Tag></div>
      <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden disabled={loading} onChange={(e: ChangeEvent<HTMLInputElement>) => { chooseFile(e.target.files?.[0] ?? null); e.target.value = ''; }}/>
      <div className={`dropzone ${selectedName ? 'dropzone--selected' : ''} ${dragging ? 'analysis-dropzone--dragging' : ''}`} onDragOver={e => { e.preventDefault(); if (!loading) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <span className="dropzone__icon">{selectedName ? <FileText size={22}/> : <Upload size={22}/>}</span><span className="dropzone__content"><b>{selectedName || 'Drop your resume here'}</b><small>{existing ? 'Saved PDF · no re-upload needed' : file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · PDF ready` : 'PDF only · up to 5 MB · text PDFs work best'}</small></span><button type="button" className="dropzone__change analysis-dropzone-action" disabled={loading} onClick={() => fileRef.current?.click()}>{selectedName ? 'Change file' : 'Browse'}</button>
      </div>
      {mode === 'match' && <div className="jd-field"><div className="jd-field__label"><label htmlFor="job-description">Job description</label><small>{jobDescription.length.toLocaleString()} characters</small></div><textarea id="job-description" value={jobDescription} maxLength={20000} disabled={loading} onChange={e => setJobDescription(e.target.value)} placeholder="Paste the full job description here. Required skills, responsibilities and seniority signals will be evaluated separately from Resume Health."/><div className="jd-field__foot"><span><ShieldCheck size={14}/> Only professional evidence is used for matching.</span></div></div>}
      {!loading && <div className="analysis-source-actions"><Link to="/app/resumes" className="inline-link">Choose a saved resume</Link>{selectedName && <button type="button" className="inline-link inline-link--button" onClick={() => { setFile(null); setExisting(null); setError(''); if (existingResumeId) navigate('/app/ats', { replace: true }); }}>Remove selected resume</button>}</div>}
      <div className="ats-controls"><div><span className="analysis-field-label">Career level</span><SelectMenu value={targetLevel} disabled={loading} onChange={value => setTargetLevel(value as TargetLevel)} label="Career level" options={levelOptions}/><small>Used only to adapt reasonable depth expectations.</small></div><div className="ats-controls__summary"><span className={selectedName ? 'ready' : ''}><Check size={14}/> PDF {selectedName ? 'ready' : 'needed'}</span><span><LockKeyhole size={14}/> Private storage</span>{mode === 'match' && <span className={jobDescription.trim().length >= 20 ? 'ready' : ''}><Check size={14}/> JD {jobDescription.trim().length >= 20 ? 'ready' : 'needed'}</span>}</div></div>
      {error && <p className="analysis-form-error" role="alert">{error}</p>}
      <div className="ats-submit"><div><p>{mode === 'resume' ? 'No AI similarity score.' : 'Resume Health remains unchanged.'}</p><small>{mode === 'resume' ? 'Every point maps to a visible document-quality check.' : 'This creates a separate role-fit analysis.'}</small></div><Button disabled={loading} onClick={analyze}>{loading ? 'Analyzing…' : mode === 'resume' ? 'Build my report' : 'Analyze + match'} {!loading && <ArrowRight size={16}/>}</Button></div>
      {loading && <div className="analysis-progress" role="status" aria-live="polite"><div className="analysis-progress__top"><span className="spinner"/><div><b>{phase === 'upload' ? 'Uploading your resume' : mode === 'resume' ? 'Building your Resume Health report' : 'Matching your evidence to the role'}</b><small>Keep this tab open while we finish the analysis.</small></div></div><div className="analysis-stages"><span className={phase === 'analyze' ? 'done' : 'active'}>{phase === 'analyze' ? <Check size={14}/> : <i/>} Resume uploaded</span><span className={phase === 'analyze' ? 'active' : ''}><i/> Reading structure</span><span><i/> Evaluating evidence</span><span><i/> Building recommendations</span></div></div>}
    </section><aside className="ats-aside"><div className="rubric-card"><div className="rubric-card__head"><span className="rubric-card__icon"><Target size={20}/></span><div><b>{mode === 'resume' ? 'What Resume Health checks' : 'What Tailored Match checks'}</b><small>{mode === 'resume' ? '8 independent document signals' : 'Role evidence only'}</small></div></div>{mode === 'resume' ? <div className="check-grid">{checks.map((check, i) => <div key={check}><span>{String(i + 1).padStart(2, '0')}</span>{check}</div>)}</div> : <div className="match-checks">{['Required skills coverage', 'Responsibility alignment', 'Seniority alignment', 'Semantic evidence', 'Missing skills'].map(check => <div key={check}><Check size={16}/>{check}</div>)}</div>}<button type="button" className={`details-link ${showDetails ? 'details-link--open' : ''}`} aria-expanded={showDetails} onClick={() => setShowDetails(v => !v)}>How {mode === 'resume' ? 'scoring' : 'matching'} works <ChevronDown size={14}/></button>{showDetails && <div className="ats-method-note"><p>{mode === 'resume' ? 'Resume Health uses independent document-quality groups. Visible points map to real checks returned by the analysis. Job relevance is excluded.' : 'Tailored Match compares one supplied job description against required skills, responsibilities, seniority and available semantic evidence. It never changes your Resume Health score.'}</p></div>}</div><div className={`signal-reminder ${mode === 'match' ? 'signal-reminder--blue' : ''}`}><div><span>{mode === 'resume' ? '01' : '02'}</span><small>signal</small></div><p><b>{mode === 'resume' ? 'Document quality' : 'Role fit'}</b>{mode === 'resume' ? 'Your score does not guess job relevance.' : 'Your Health score does not change when the JD changes.'}</p></div></aside></div>
  </div>;
}
