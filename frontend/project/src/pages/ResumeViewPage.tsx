import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Download, FileText, Trash2 } from 'lucide-react';
import api, { getApiErrorMessage } from '../lib/api';
import { Button, EmptyState, Eyebrow, Modal, ScoreRing, Tag } from '../components/UI';
import { analysisInfo, apiStatus, dateLabel, resumeName, type SavedAnalysis, type SavedResume } from './libraryData';
import './library.css';

export default function ResumeViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [resume, setResume] = useState<SavedResume | null>(null);
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [actionError, setActionError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    if (!id) { setMissing(true); setLoading(false); return; }
    setLoading(true); setMissing(false); setError(''); setHistoryError('');
    try {
      const response = await api.get<{ resume: SavedResume }>(`/resumes/${id}`);
      if (!response.data.resume) { setMissing(true); return; }
      setResume(response.data.resume);
      try {
        const result = await api.get<{ analyses: SavedAnalysis[] }>('/analyses', { params: { resumeId: id } });
        setHistory(result.data.analyses ?? []);
      } catch (err) { setHistoryError(getApiErrorMessage(err)); setHistory([]); }
    } catch (err) {
      if (apiStatus(err) === 404) setMissing(true);
      else setError(getApiErrorMessage(err));
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  const latestHealth = history.find(row => !analysisInfo(row, resume?.fileName).isMatch);
  const health = latestHealth ? analysisInfo(latestHealth, resume?.fileName) : null;
  const rules = health?.view.readiness.rules;
  const passed = rules?.filter(rule => rule.status === 'pass').length;
  const download = async () => {
    if (!id || downloading) return;
    setActionError(''); setDownloading(true);
    try {
      const response = await api.get<Blob>(`/resumes/${id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = resume?.fileName || 'resume.pdf';
      document.body.append(anchor);
      anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setActionError(apiStatus(err) === 404 ? 'The stored PDF is unavailable. Upload a new copy to download or analyze it.' : getApiErrorMessage(err)); }
    finally { setDownloading(false); }
  };
  const remove = async () => {
    if (!id || deleting) return;
    setDeleting(true); setActionError('');
    try {
      await api.delete(`/resumes/${id}`);
      navigate('/app/resumes', { replace: true });
    } catch (err) {
      setActionError(getApiErrorMessage(err));
      setConfirmDelete(false);
    } finally { setDeleting(false); }
  };

  if (loading) return <div className="workspace-page library-page library-skeleton" aria-busy="true" aria-label="Loading resume"><div/><div/><div/></div>;
  if (missing || error || !resume) return <div className="workspace-page library-page"><Link to="/app/resumes" className="back-link"><ArrowLeft size={16}/> All resumes</Link><EmptyState icon="file" title={missing ? 'Resume not found' : 'Couldn’t load this resume'} body={missing ? 'This resume may have been deleted or is no longer available.' : error || 'Please try again.'} action={missing ? <Link className="button button--secondary" to="/app/resumes">Back to library</Link> : <Button onClick={() => void load()}>Try again</Button>} /></div>;
  return <div className="workspace-page resume-detail-page library-page">
    <Modal open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} title="Delete this resume?" body="This permanently removes the stored PDF and its analysis history. This cannot be undone."><Button variant="secondary" disabled={deleting} onClick={() => setConfirmDelete(false)}>Cancel</Button><button type="button" className="button button--danger" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Deleting…' : 'Delete resume'}</button></Modal>
    <div className="report-toolbar"><Link to="/app/resumes" className="back-link"><ArrowLeft size={16}/> All resumes</Link><div className="report-toolbar__actions"><button type="button" onClick={() => void download()} disabled={downloading}><Download size={16}/>{downloading ? 'Preparing…' : 'Download PDF'}</button><button type="button" className="danger-action" onClick={() => setConfirmDelete(true)}><Trash2 size={16}/> Delete</button></div></div>
    {actionError && <p className="library-inline-error" role="alert">{actionError}</p>}
    <section className="resume-detail-hero"><div className="resume-detail-hero__icon"><FileText size={28}/></div><div className="resume-detail-hero__copy"><Eyebrow>Saved resume</Eyebrow><h1>{resumeName(resume)}</h1><p>Uploaded {dateLabel(resume.uploadDate)}{resume.pageCount != null ? ` · ${resume.pageCount} page${resume.pageCount === 1 ? '' : 's'}` : ''}</p><div>{resume.status && <Tag tone="green">{resume.status}</Tag>}</div></div><div className="resume-detail-hero__actions"><Link to={`/app/ats?resumeId=${encodeURIComponent(resume.id)}`} className="button button--primary">Run new analysis</Link></div></section>
    <div className="resume-detail-grid"><section className="latest-analysis"><div className="latest-analysis__head"><div><small>Latest Resume Health</small><h2>{health?.view.readiness.scoreLabel ?? (health ? 'Report available' : 'Not analyzed yet')}</h2><p>{health?.view.readiness.scoreMessage ?? (health ? 'Your latest document-quality report is ready.' : 'Analyze this stored resume without uploading it again.')}</p></div>{health?.score != null && <ScoreRing value={health.score} size={140}/>}</div><div className="latest-analysis__stats"><span><b>{health?.scoreLabel ?? 'Unavailable'}</b><small>Resume Health score</small></span><span><b>{rules?.length ? passed : 'Unavailable'}</b><small>passed checks</small></span><span><b>{rules?.length ? rules.length - (passed ?? 0) : 'Unavailable'}</b><small>need attention</small></span></div>{latestHealth ? <Link to={`/app/analysis/${latestHealth.id}`} className="button button--secondary latest-analysis__button">Open full report <ArrowRight size={15}/></Link> : <Link to={`/app/ats?resumeId=${encodeURIComponent(resume.id)}`} className="button button--secondary latest-analysis__button">Analyze this resume <ArrowRight size={15}/></Link>}</section><section className="resume-file-info"><small>File information</small><div><span>Filename</span><b>{resumeName(resume)}</b></div><div><span>Page count</span><b>{resume.pageCount ?? 'Unavailable'}</b></div><div><span>Status</span><b>{resume.status ?? 'Unavailable'}</b></div><div><span>Uploaded</span><b>{dateLabel(resume.uploadDate)}</b></div><div><span>Last analyzed</span><b>{history[0] ? dateLabel(history[0].created_at) : 'Not yet'}</b></div></section></div>
    <section className="library-history"><div className="resumes-section-head"><div><span>History</span><h2>Analysis history</h2></div><small>Most recent first</small></div>{historyError ? <div className="library-inline-error" role="alert">History unavailable: {historyError} <button type="button" onClick={() => void load()}>Retry</button></div> : history.length ? <div className="analysis-history">{history.map(row => { const info = analysisInfo(row, resume.fileName); return <Link key={row.id} to={`/app/analysis/${row.id}`} className="history-row"><span className={`history-icon ${info.isMatch ? 'history-icon--blue' : ''}`}><FileText size={18}/></span><div><Tag tone={info.isMatch ? 'blue' : 'amber'}>{info.label}</Tag><b>{info.scoreLabel}</b><small>{dateLabel(row.created_at)}</small></div><div className="history-row__meta"><ArrowRight size={16}/></div></Link>; })}</div> : <p className="library-muted">No analyses for this resume yet.</p>}</section>
    <section className="resume-actions-panel"><div><span className="resume-actions-panel__icon"><FileText size={19}/></span><div><small>Continue with this resume</small><h3>Find roles that match your evidence.</h3><p>Role relevance is separate from Resume Health.</p></div></div><Link to="/app/jobs" className="button button--secondary">Open Job Matches <ArrowRight size={15}/></Link></section>
  </div>;
}
