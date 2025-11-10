// src/pages/Home.tsx
import React, { useState, useEffect } from 'react'; 
import { LogOut, Upload, FileText, Loader2, Briefcase, MapPin, DollarSign, Clock, ExternalLink, Filter } from 'lucide-react';
import { ResumeProvider, useResume } from '../context/ResumeContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

interface Job {
  title: string;
  company: string;
  location: string;
  snippet: string;
  salary: string;
  type: string;
  link: string;
  updated: string;
  matchScore?: number;
  recommendationReasons?: string[];
}

interface ResumeAnalysis {
  score: number;
  status: string;
  statusMessage: string;
  insights: string[];
  recommendations: string[];
  skills: {
    technical: { [key: string]: string[] };
    soft: string[];
  };
  metrics: {
    wordCount: number;
    sectionsFound: number;
    actionVerbs: number;
    quantifiableMetrics: number;
  };
}

const ResumeUploadSection = ({ onAnalysisComplete }: { onAnalysisComplete: (analysis: ResumeAnalysis) => void }) => {
  const { resumeFile, setResumeFile } = useResume();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [latestResume, setLatestResume] = useState<any>(null);
  const [targetLevel, setTargetLevel] = useState<string>('entry'); // New state for experience level

  useEffect(() => {
    fetchLatestResume();
  }, []);

  const fetchLatestResume = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await axios.get<{ success: boolean; resume?: any; message?: string }>(`${API_URL}/latest-resume`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.data.success) {
        setLatestResume(response.data.resume);
        if (response.data.resume.analysisData) {
          onAnalysisComplete(response.data.resume.analysisData);
        }
      }
    } catch (err) {
      console.error('Error fetching latest resume:', err);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setResumeFile(file);
      setError('');
      setUploadStatus('File selected: ' + file.name);
    } else {
      setError('Please select a valid PDF file');
      setResumeFile(null);
      setUploadStatus('');
    }
  };

  const handleProcess = async () => {
    if (!resumeFile) {
      setError('Please select a file first');
      return;
    }

    setIsProcessing(true);
    setError('');
    setUploadStatus('Uploading your resume...');

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please log in to upload a resume');
      setIsProcessing(false);
      return;
    }

    const formData = new FormData();
    formData.append('resume', resumeFile);
    formData.append('targetLevel', targetLevel); // Include target level

    try {
      // Upload resume
      const uploadResponse = await axios.post(`${API_URL}/upload-resume`, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (!(uploadResponse.data as any).success) {
        throw new Error((uploadResponse.data as any).message || 'Upload failed');
      }

      setUploadStatus('Analyzing resume...');

      // Analyze resume with target level
      const analyzeResponse = await axios.post(`${API_URL}/analyze`, 
        { targetLevel }, // Pass target level to analysis
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      if (!(analyzeResponse.data as any).success) {
        throw new Error((analyzeResponse.data as any).message || 'Analysis failed');
      }

      setUploadStatus('Resume analyzed successfully!');
      setLatestResume((analyzeResponse.data as any).resume);
      onAnalysisComplete((analyzeResponse.data as any).analysis);
      setError('');
      
      // Reset file input
      const fileInput = document.getElementById('resume') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      setResumeFile(null);
      
      await fetchLatestResume();
    } catch (err: any) {
      console.error('Error:', err);
      setError(err.response?.data?.message || err.message || 'An error occurred');
      setUploadStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="border-2 border-dashed border-red-900/30 rounded-lg p-10 text-center hover:border-red-500/70 transition-all">
        <input
          type="file"
          id="resume"
          className="hidden"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={isProcessing}
        />
        <label htmlFor="resume" className="cursor-pointer block">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/20 flex items-center justify-center">
            {isProcessing ? (
              <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-red-500" />
            )}
          </div>
          <h3 className="text-xl font-medium mb-2">Upload Your Resume</h3>
          <p className="text-gray-400 mb-2">
            {isProcessing ? uploadStatus : 'Drag & drop your resume here, or click to browse'}
          </p>
          <p className="text-gray-500 text-sm">Supported format: PDF</p>
        </label>

        {/* Experience Level Selector */}
        <div className="mt-6 max-w-md mx-auto">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            What's your experience level?
          </label>
          <select
            value={targetLevel}
            onChange={(e) => setTargetLevel(e.target.value)}
            disabled={isProcessing}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:opacity-50"
          >
            <option value="entry">Entry Level (Student / Fresher / 0-2 years)</option>
            <option value="mid">Mid Level (2-5 years experience)</option>
            <option value="senior">Senior Level (5+ years experience)</option>
          </select>
          <p className="text-xs text-gray-500 mt-2">
            We'll adjust scoring expectations based on your level
          </p>
        </div>

        {resumeFile && !isProcessing && (
          <div className="mt-6">
            <div className="flex items-center justify-center space-x-2 text-red-500 mb-4">
              <FileText className="w-5 h-5" />
              <span>{resumeFile.name}</span>
            </div>
            <button
              onClick={handleProcess}
              disabled={isProcessing}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg transition-colors flex items-center space-x-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Process Resume</span>
            </button>
          </div>
        )}

        {error && <p className="mt-4 text-red-500">{error}</p>}
        {uploadStatus && !error && !isProcessing && (
          <p className="mt-4 text-green-500">{uploadStatus}</p>
        )}

        {latestResume && (
          <div className="mt-6 p-4 bg-red-950/20 rounded-lg text-left">
            <h4 className="font-medium text-red-500 mb-2">Latest Resume</h4>
            <p className="text-gray-300">{latestResume.fileName}</p>
            <p className="text-gray-400 text-sm">
              Uploaded: {new Date(latestResume.uploadDate).toLocaleDateString()}
            </p>
            <p className="text-gray-400 text-sm capitalize">
              Status: {latestResume.status}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const JobRecommendations = ({ analysis }: { analysis: ResumeAnalysis | null }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    location: '',
    keywords: '',
    days_posted: 30,
    min_match_score: 50
  });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (analysis) {
      fetchRecommendations();
    }
  }, [analysis]);

  const fetchRecommendations = async () => {
    if (!analysis) return;

    setIsLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams();
      if (filters.location) params.append('location', filters.location);
      if (filters.keywords) params.append('keywords', filters.keywords);
      params.append('days_posted', filters.days_posted.toString());
      params.append('min_match_score', filters.min_match_score.toString());

      const response = await axios.get<{
        success: boolean;
        recommendations?: Job[];
        message?: string;
      }>(
        `${API_URL}/jobs/recommendations?${params.toString()}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (response.data.success) {
        setJobs(response.data.recommendations || []);
      } else {
        setError(response.data.message || 'Failed to fetch recommendations');
      }
    } catch (err: any) {
      console.error('Error fetching recommendations:', err);
      setError(err.response?.data?.message || 'Failed to fetch job recommendations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const applyFilters = () => {
    fetchRecommendations();
    setShowFilters(false);
  };

  if (!analysis) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Upload and analyze your resume to see job recommendations</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Job Recommendations</h2>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center space-x-2 px-4 py-2 bg-red-900/20 hover:bg-red-900/30 rounded-lg transition-colors"
        >
          <Filter className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {showFilters && (
        <div className="mb-6 p-4 bg-red-950/20 rounded-lg border border-red-900/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Location</label>
              <input
                type="text"
                value={filters.location}
                onChange={(e) => handleFilterChange('location', e.target.value)}
                placeholder="e.g., Remote, New York"
                className="w-full px-4 py-2 bg-dark-800 rounded-lg border border-red-900/30 focus:border-red-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Keywords</label>
              <input
                type="text"
                value={filters.keywords}
                onChange={(e) => handleFilterChange('keywords', e.target.value)}
                placeholder="e.g., React, Python"
                className="w-full px-4 py-2 bg-dark-800 rounded-lg border border-red-900/30 focus:border-red-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Posted within (days)</label>
              <input
                type="number"
                value={filters.days_posted}
                onChange={(e) => handleFilterChange('days_posted', parseInt(e.target.value))}
                min="1"
                max="90"
                className="w-full px-4 py-2 bg-dark-800 rounded-lg border border-red-900/30 focus:border-red-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Min Match Score</label>
              <input
                type="number"
                value={filters.min_match_score}
                onChange={(e) => handleFilterChange('min_match_score', parseFloat(e.target.value))}
                min="0"
                max="100"
                className="w-full px-4 py-2 bg-dark-800 rounded-lg border border-red-900/30 focus:border-red-500 outline-none"
              />
            </div>
          </div>
          <button
            onClick={applyFilters}
            className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg transition-colors"
          >
            Apply Filters
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          <span className="ml-3 text-gray-400">Finding best job matches...</span>
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-red-500">{error}</p>
          <button
            onClick={fetchRecommendations}
            className="mt-4 px-6 py-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400">No job recommendations found. Try adjusting your filters.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job, index) => (
            <div
              key={index}
              className="bg-dark rounded-lg p-6 border border-red-900/30 hover:border-red-500/50 transition-all"
            >
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{job.title}</h3>
                  <p className="text-gray-400">{job.company}</p>
                </div>
                {job.matchScore !== undefined && (
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-500">{job.matchScore}%</div>
                    <div className="text-sm text-gray-400">Match</div>
                    {(job as any).matchLevel && (
                      <div className={`mt-2 px-3 py-1 rounded-full text-xs font-medium ${
                        (job as any).matchLevel === 'excellent' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        (job as any).matchLevel === 'very-good' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        (job as any).matchLevel === 'good' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                        (job as any).matchLevel === 'fair' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                        'bg-red-500/20 text-red-400 border border-red-500/30'
                      }`}>
                        {(job as any).matchLevel.replace('-', ' ').toUpperCase()}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4 mb-3 text-sm text-gray-400">
                <div className="flex items-center">
                  <MapPin className="w-4 h-4 mr-1" />
                  {job.location}
                </div>
                {job.salary && job.salary !== 'Not specified' && (
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 mr-1" />
                    {job.salary}
                  </div>
                )}
                <div className="flex items-center">
                  <Clock className="w-4 h-4 mr-1" />
                  {new Date(job.updated).toLocaleDateString()}
                </div>
                <div className="flex items-center">
                  <Briefcase className="w-4 h-4 mr-1" />
                  {job.type}
                </div>
              </div>

              {/* Job Description */}
              <div className="mb-4 p-4 bg-black/30 rounded-lg border border-red-900/20">
                <p className="text-sm font-medium text-red-400 mb-2">Job Description:</p>
                <p 
                  className="text-gray-300 text-sm whitespace-pre-line"
                  dangerouslySetInnerHTML={{ 
                    __html: job.snippet
                      .replace(/&nbsp;/g, ' ')
                      .replace(/<b>/g, '<strong class="text-red-400">')
                      .replace(/<\/b>/g, '</strong>')
                      .replace(/<br>/g, '\n')
                      .replace(/<br\/>/g, '\n')
                  }}
                />
              </div>

              {/* Match Details */}
              {(job as any).semanticSimilarity !== undefined && (
                <div className="mb-4 flex gap-4 text-xs">
                  <div className="flex-1 bg-black/30 rounded p-2 border border-red-900/20">
                    <div className="text-gray-400 mb-1">AI Similarity</div>
                    <div className="text-red-400 font-bold">{(job as any).semanticSimilarity}%</div>
                  </div>
                  {(job as any).seniorityPenalty > 0 && (
                    <div className="flex-1 bg-black/30 rounded p-2 border border-yellow-900/20">
                      <div className="text-gray-400 mb-1">Level Gap</div>
                      <div className="text-yellow-400 font-bold">-{(job as any).seniorityPenalty}</div>
                    </div>
                  )}
                  {(job as any).jobLevel && (
                    <div className="flex-1 bg-black/30 rounded p-2 border border-red-900/20">
                      <div className="text-gray-400 mb-1">Job Level</div>
                      <div className="text-red-400 font-bold capitalize">{(job as any).jobLevel}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Recommendation Reasons */}
              {job.recommendationReasons && job.recommendationReasons.length > 0 && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-red-400 mb-2">Match Analysis:</p>
                  <ul className="space-y-1">
                    {job.recommendationReasons.map((reason, i) => (
                      <li key={i} className="text-sm text-gray-400 flex items-start">
                        <span className="text-red-500 mr-2">•</span>
                        {reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <a
                href={job.link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
              >
                View Job
                <ExternalLink className="w-4 h-4 ml-2" />
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function Home() {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <ResumeProvider>
      <div className="min-h-screen bg-dark text-white">
        <nav className="fixed w-full z-50 bg-dark shadow-lg border-b border-red-900/30">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <span className="text-xl font-bold">
              Resume<span className="text-red-500">Score</span>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center text-gray-300 hover:text-red-400 transition-colors"
            >
              <LogOut size={20} className="mr-2" />
              Logout
            </button>
          </div>
        </nav>

        <main className="container mx-auto px-4 pt-24 pb-16">
          <section className="py-8">
            <div className="max-w-4xl mx-auto text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="text-red-500">Optimize</span> Your Resume for ATS
              </h1>
              <p className="text-gray-300 text-lg">
                Upload your resume to get instant feedback and personalized job recommendations
              </p>
            </div>

            <ResumeUploadSection onAnalysisComplete={setAnalysis} />
          </section>

          {analysis && (
            <>
              {/* ATS Score Section */}
              <section className="py-8 bg-red-950/20 rounded-lg mb-8 border border-red-900/30">
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="text-center p-8">
                    <div className="w-32 h-32 mx-auto mb-4 relative">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#660000"
                          strokeWidth="8"
                          fill="none"
                        />
                        <circle
                          cx="64"
                          cy="64"
                          r="56"
                          stroke="#ff3333"
                          strokeWidth="8"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 56}`}
                          strokeDashoffset={`${2 * Math.PI * 56 * (1 - analysis.score / 100)}`}
                          className="transition-all duration-1000"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-3xl font-bold text-red-500">{analysis.score}</span>
                      </div>
                    </div>
                    <h2 className="text-2xl font-bold mb-2">ATS Score</h2>
                    <p className="text-gray-400">{analysis.statusMessage}</p>
                  </div>
                  <div className="p-8">
                    <h3 className="text-xl font-bold mb-4">Key Insights</h3>
                    <ul className="space-y-3">
                      {analysis.insights.slice(0, 5).map((insight, i) => (
                        <li key={i} className="flex items-start">
                          <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
                            ✓
                          </span>
                          <span className="text-gray-300">{insight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* Qualities and Drawbacks Section */}
              <section className="py-8 mb-8">
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Strengths */}
                  <div className="bg-green-950/20 rounded-lg p-6 border border-green-900/30">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center mr-3">
                        <span className="text-2xl">✓</span>
                      </div>
                      <h3 className="text-xl font-bold text-green-400">Strengths</h3>
                    </div>
                    <ul className="space-y-3">
                      {analysis.insights
                        .filter(insight => 
                          insight.toLowerCase().includes('good') || 
                          insight.toLowerCase().includes('strong') ||
                          insight.toLowerCase().includes('well') ||
                          insight.toLowerCase().includes('excellent') ||
                          !insight.toLowerCase().includes('missing') &&
                          !insight.toLowerCase().includes('weak') &&
                          !insight.toLowerCase().includes('poor') &&
                          !insight.toLowerCase().includes('add') &&
                          !insight.toLowerCase().includes('improve')
                        )
                        .slice(0, 6)
                        .map((quality, i) => (
                          <li key={i} className="flex items-start text-sm">
                            <span className="text-green-400 mr-2 mt-1">•</span>
                            <span className="text-gray-300">{quality}</span>
                          </li>
                        ))}
                      {analysis.insights.filter(insight => 
                        insight.toLowerCase().includes('good') || 
                        insight.toLowerCase().includes('strong') ||
                        insight.toLowerCase().includes('well') ||
                        insight.toLowerCase().includes('excellent')
                      ).length === 0 && (
                        <li className="text-sm text-gray-400 italic">Analyzing resume strengths...</li>
                      )}
                    </ul>
                  </div>

                  {/* Areas for Improvement */}
                  <div className="bg-yellow-950/20 rounded-lg p-6 border border-yellow-900/30">
                    <div className="flex items-center mb-4">
                      <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center mr-3">
                        <span className="text-2xl">⚠</span>
                      </div>
                      <h3 className="text-xl font-bold text-yellow-400">Areas to Improve</h3>
                    </div>
                    <ul className="space-y-3">
                      {analysis.recommendations.slice(0, 6).map((drawback, i) => (
                        <li key={i} className="flex items-start text-sm">
                          <span className="text-yellow-400 mr-2 mt-1">•</span>
                          <span className="text-gray-300">{drawback}</span>
                        </li>
                      ))}
                      {analysis.recommendations.length === 0 && (
                        <li className="text-sm text-gray-400 italic">No major issues found!</li>
                      )}
                    </ul>
                  </div>
                </div>
              </section>
            </>
          )}

          <section className="py-8">
            <JobRecommendations analysis={analysis} />
          </section>
        </main>
      </div>
    </ResumeProvider>
  );
}

export default Home;