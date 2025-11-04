import React, { useState, useEffect } from 'react'; 
import { LogOut, Upload, FileText, Loader2 } from 'lucide-react';
import { ResumeProvider, useResume } from '../context/ResumeContext';
import { useNavigate } from 'react-router-dom';

const ResumeUploadSection = () => {
  const { resumeFile, setResumeFile } = useResume();
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [error, setError] = useState('');
  const [latestResume, setLatestResume] = useState<any>(null);

  useEffect(() => {
    fetchLatestResume();
  }, []);

  const fetchLatestResume = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch('http://localhost:3001/api/latest-resume', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setLatestResume(data.resume);
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
    setUploadStatus('Processing your resume...');

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Please log in to upload a resume');
      setIsProcessing(false);
      return;
    }

    const formData = new FormData();
    formData.append('resume', resumeFile);

    try {
      const response = await fetch('http://localhost:3001/api/upload-resume', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      // Try to parse response even if not OK to get error message
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('Failed to parse server response');
      }

      if (!response.ok) {
        throw new Error(result.message || `Upload failed with status ${response.status}`);
      }

      setUploadStatus('Resume processed successfully!');
      setLatestResume(result.resume);
      setError('');
      
      // Reset file input
      const fileInput = document.getElementById('resume') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
      setResumeFile(null);
      
      // Refresh latest resume display
      await fetchLatestResume();
    } catch (err) {
      console.error('Upload error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError('Failed to process resume: ' + errorMessage);
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
        <label
          htmlFor="resume"
          className="cursor-pointer block"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-900/20 flex items-center justify-center">
            {isProcessing ? (
              <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
            ) : (
              <Upload className="w-8 h-8 text-red-500" />
            )}
          </div>
          <h3 className="text-xl font-medium mb-2">Upload Your Resume</h3>
          <p className="text-gray-400 mb-2">
            {isProcessing ? 'Processing your resume...' : 'Drag & drop your resume here, or click to browse'}
          </p>
          <p className="text-gray-500 text-sm">
            Supported format: PDF
          </p>
        </label>

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
              {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 text-red-500">{error}</p>
        )}
        {uploadStatus && !error && (
          <p className="mt-4 text-green-500">{uploadStatus}</p>
        )}

        {latestResume && (
          <div className="mt-6 p-4 bg-red-950/20 rounded-lg">
            <h4 className="font-medium text-red-500 mb-2">Latest Resume</h4>
            <p className="text-gray-300">{latestResume.fileName}</p>
            <p className="text-gray-400 text-sm">
              Uploaded: {new Date(latestResume.uploadDate).toLocaleDateString()}
            </p>
            <p className="text-gray-400 text-sm">
              Status: {latestResume.status}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

function Home() {
  const navigate = useNavigate();
  const handleLogout = () => {
    localStorage.removeItem('token');
    console.log('User logged out');
    navigate('/login');
  };

  return (
    <ResumeProvider>
      <div className="min-h-screen bg-dark text-white">
        {/* Navbar */}
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

        {/* Main Content */}
        <main className="container mx-auto px-4 pt-20">
          {/* Hero Section with Upload */}
          <section className="py-16">
            <div className="max-w-4xl mx-auto text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="text-red-500">Optimize</span> Your Resume for ATS
              </h1>
              <p className="text-gray-300 text-lg">
                Upload your resume to get instant feedback and recommendations
              </p>
            </div>

            {/* Upload Area */}
            <ResumeUploadSection />
          </section>

          {/* Score Section */}
          <section className="py-16 bg-red-950/20 rounded-lg mb-16 border border-red-900/30">
            <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="text-center p-8">
                <div className="w-32 h-32 mx-auto mb-4 relative">
                  <div className="absolute inset-0 rounded-full border-4 border-red-900/30"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-red-500 border-t-transparent transform rotate-45"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-3xl font-bold text-red-500">85</span>
                  </div>
                </div>
                <h2 className="text-2xl font-bold mb-2">ATS Score</h2>
                <p className="text-gray-400">Your resume is well-optimized</p>
              </div>
              <div className="p-8">
                <h3 className="text-xl font-bold mb-4">Key Insights</h3>
                <ul className="space-y-4">
                  <li className="flex items-start">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mr-3 mt-1">✓</span>
                    <div>
                      <h4 className="font-medium">Keyword Optimization</h4>
                      <p className="text-gray-400">Good use of industry-relevant keywords</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <span className="w-6 h-6 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center mr-3 mt-1">✓</span>
                    <div>
                      <h4 className="font-medium">Format Compatibility</h4>
                      <p className="text-gray-400">Clean, ATS-friendly formatting</p>
                    </div>
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Recommendations Section */}
          <section className="py-16">
            <h2 className="text-2xl font-bold mb-8 text-center">Recommendations</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Courses */}
              <div className="bg-dark rounded-lg p-6 border border-red-900/30">
                <h3 className="text-xl font-bold mb-4">Recommended Courses</h3>
                <div className="space-y-4">
                  <div className="bg-red-950/20 p-4 rounded-lg hover:bg-red-900/30 transition-colors">
                    <h4 className="font-medium">Resume Writing Masterclass</h4>
                    <p className="text-gray-400 text-sm">YouTube • 2.5 hours</p>
                  </div>
                  <div className="bg-red-950/20 p-4 rounded-lg hover:bg-red-900/30 transition-colors">
                    <h4 className="font-medium">ATS Optimization Course</h4>
                    <p className="text-gray-400 text-sm">Coursera • 4 weeks</p>
                  </div>
                </div>
              </div>

              {/* Jobs */}
              <div className="bg-dark rounded-lg p-6 border border-red-900/30">
                <h3 className="text-xl font-bold mb-4">Job Matches</h3>
                <div className="space-y-4">
                  <div className="bg-red-950/20 p-4 rounded-lg hover:bg-red-900/30 transition-colors">
                    <h4 className="font-medium">Senior Developer</h4>
                    <p className="text-gray-400 text-sm">LinkedIn • Posted 2d ago</p>
                  </div>
                  <div className="bg-red-950/20 p-4 rounded-lg hover:bg-red-900/30 transition-colors">
                    <h4 className="font-medium">Tech Lead</h4>
                    <p className="text-gray-400 text-sm">Indeed • Posted 1d ago</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </ResumeProvider>
  );
}

export default Home;