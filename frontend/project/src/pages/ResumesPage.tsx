import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Trash2 } from 'lucide-react';
import api, { getApiErrorMessage } from '../lib/api';
import { Button, EmptyState, Eyebrow, Modal, ScoreRing, Tag } from '../components/UI';
import { analysisInfo, dateLabel, resumeName, type SavedAnalysis, type SavedResume } from './libraryData';
import './library.css';

export default function ResumesPage() {
  const [resumes, setResumes] = useState<SavedResume[]>([]);
  const [analyses, setAnalyses] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SavedResume | null>(null);
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setHistoryError('');
    try {
      const result = await api.get<{ resumes: SavedResume[] }>('/resumes');
      const items = result.data.resumes ?? [];
      setResumes(items);
      if (items.length) {
        try {
          const history = await api.get<{ analyses: SavedAnalysis[] }>('/analyses');
          setAnalyses(history.data.analyses ?? []);
        } catch (err) {
          setAnalyses([]);
          setHistoryError(getApiErrorMessage(err));
        }
      } else setAnalyses([]);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const remove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setError('');
    try {
      await api.delete(`/resumes/${deleteTarget.id}`);
      setResumes(items => items.filter(item => item.id !== deleteTarget.id));
      setAnalyses(items => items.filter(item => item.resume_id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) { setError(getApiErrorMessage(err)); setDeleteTarget(null); }
    finally { setDeleting(false); }
  };
  const current = resumes.find(item => item.isLatest) ?? resumes[0];
  const currentHistory = current ? analyses.filter(item => item.resume_id === current.id) : [];
  const latestHealth = currentHistory.find(item => !analysisInfo(item, current?.fileName).isMatch);
  const health = latestHealth ? analysisInfo(latestHealth, current?.fileName) : null;
  const passed = health?.view.readiness.rules?.filter(rule => rule.status === 'pass').length;
  const total = health?.view.readiness.rules?.length;

  return <div className="workspace-page resumes-page library-page">
    <Modal open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} title="Delete this resume?" body="The stored PDF and all its analysis history will be permanently removed."><Button variant="secondary" disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancel</Button><button type="button" className="button button--danger" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete resume'}</button></Modal>
    <div className="page-heading page-heading--compact"><div><Eyebrow>Resume library</Eyebrow><h1>Your resume workspace.</h1><p>Saved files and their real analysis history, together in one place.</p></div><Link to="/app/ats" className="button button--primary">Upload new <ArrowRight size={16} /></Link></div>
    {!loading && error && <p role="alert" className="library-inline-error">{error} <button type="button" onClick={() => void load()}>Retry</button></p>}
    {loading ? <div className="library-skeleton" aria-busy="true" aria-label="Loading resumes"><div/><div/><div/></div> : error && !resumes.length ? null : !current ? <EmptyState icon="file" title="Your resume workspace starts here." body="Upload a PDF to keep it ready for Resume Health and role matching." action={<Link to="/app/ats" className="button button--primary">Upload resume</Link>} /> : <>
      <section className="resume-overview-card library-overview"><div className="resume-overview-card__visual" aria-hidden="true"><div className="paper-thumb"><span>CV</span><i/><i/><i/><b>EXPERIENCE</b><i/><i/><b>SKILLS</b><i/></div><div className="paper-shadow"/></div><div className="resume-overview-card__main"><div className="resume-overview-card__top"><div><Tag tone="green">{current.isLatest ? 'Current resume' : 'Most recent resume'}</Tag><h2>{resumeName(current)}</h2><p>Uploaded {dateLabel(current.uploadDate)}{current.pageCount != null ? ` · ${current.pageCount} page${current.pageCount === 1 ? '' : 's'}` : ''}{current.status ? ` · ${current.status}` : ''}</p></div>{health?.score != null && <ScoreRing value={health.score} size={124}/>}</div><div className="resume-overview-card__metrics"><div><small>Latest Resume Health</small><b>{health?.scoreLabel ?? 'Not analyzed'}</b><span>{health?.view.readiness.scoreLabel ?? 'Document quality'}</span></div><div><small>Checks passed</small><b>{total ? `${passed}/${total}` : 'Unavailable'}</b><span>{total ? `${total - (passed ?? 0)} need attention` : 'No checks recorded'}</span></div><div><small>Role analyses</small><b>{currentHistory.filter(item => analysisInfo(item, current.fileName).isMatch).length}</b><span>Separate from Resume Health</span></div></div><div className="resume-overview-card__actions"><Link to={`/app/resumes/${current.id}`} className="button button--secondary">Open resume</Link>{latestHealth && <Link to={`/app/analysis/${latestHealth.id}`} className="inline-link">View latest report <ArrowRight size={14}/></Link>}<button type="button" className="library-delete-link" onClick={() => setDeleteTarget(current)}><Trash2 size={15}/> Delete</button></div></div></section>
      {resumes.length > 1 && <section className="library-other"><div className="resumes-section-head"><div><span>Saved files</span><h2>Other resumes</h2></div></div>{resumes.filter(item => item.id !== current.id).map(item => <div className="library-file-row" key={item.id}><FileText size={20}/><Link to={`/app/resumes/${item.id}`}><b>{resumeName(item)}</b><small>Uploaded {dateLabel(item.uploadDate)}{item.pageCount != null ? ` · ${item.pageCount} pages` : ''}</small></Link><button type="button" aria-label={`Delete ${resumeName(item)}`} onClick={() => setDeleteTarget(item)}><Trash2 size={17}/></button></div>)}</section>}
      <section className="library-history"><div className="resumes-section-head"><div><span>History</span><h2>Analyses for this resume</h2></div><small>Most recent first</small></div>{historyError && <div className="library-inline-error" role="alert">History unavailable: {historyError} <button type="button" onClick={() => void load()}>Retry</button></div>}{!historyError && (currentHistory.length ? <div className="analysis-history">{currentHistory.map(row => { const info = analysisInfo(row, current.fileName); return <Link to={`/app/analysis/${row.id}`} className="history-row" key={row.id}><span className={`history-icon ${info.isMatch ? 'history-icon--blue' : ''}`}><FileText size={18}/></span><div><Tag tone={info.isMatch ? 'blue' : 'amber'}>{info.label}</Tag><b>{info.scoreLabel}</b><small>{dateLabel(row.created_at)} · {info.isMatch ? 'Role-specific evidence' : 'Document-quality analysis'}</small></div><div className="history-row__meta"><ArrowRight size={16}/></div></Link>; })}</div> : <p className="library-muted">No analyses yet. Open this saved file to run its first report.</p>)}</section>
    </>}
  </div>;
}
