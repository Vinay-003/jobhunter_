import React, { createContext, useContext, useState, ChangeEvent } from 'react';

interface ResumeContextType {
  resumeFile: File | null;
  setResumeFile: React.Dispatch<React.SetStateAction<File | null>>;
}

const ResumeContext = createContext<ResumeContextType | undefined>(undefined);

interface ResumeProviderProps {
  children: React.ReactNode;
}

export const ResumeProvider: React.FC<ResumeProviderProps> = ({ children }) => {
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  return (
    <ResumeContext.Provider value={{ resumeFile, setResumeFile }}>
      {children}
    </ResumeContext.Provider>
  );
};

export const useResume = () => {
  const context = useContext(ResumeContext);
  if (context === undefined) {
    throw new Error('useResume must be used within a ResumeProvider');
  }
  return context;
};

export const ResumeUpload: React.FC = () => {
  const { resumeFile, setResumeFile } = useResume();
  const [error, setError] = useState<string>('');
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    console.log('File selected:', file?.name);
    
    if (file && file.type === 'application/pdf') {
      setResumeFile(file);
      setError('');
      console.log('Valid PDF file selected');
    } else {
      setError('Please select a valid PDF file');
      setResumeFile(null);
      console.log('Invalid file type selected');
    }
  };

  const handleUpload = async () => {
    if (!resumeFile) {
      setError('No file selected');
      return;
    }

    setIsUploading(true);
    setUploadStatus('Uploading...');
    setError('');

    const formData = new FormData();
    formData.append('resume', resumeFile);

    try {
      console.log('Starting file upload...');
      const response = await fetch('/api/upload-resume', {
        method: 'POST',
        body: formData,
        headers: {
          // Don't set Content-Type header - let the browser set it with the boundary
          'Accept': 'application/json',
        },
      });

      console.log('Upload response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Upload failed');
      }

      const result = await response.json();
      console.log('Upload successful:', result);
      
      setUploadStatus('Resume uploaded successfully');
      setResumeFile(null);
      const fileInput = document.getElementById('fileInput') as HTMLInputElement;
      if (fileInput) {
        fileInput.value = '';
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to upload resume: ' + (err instanceof Error ? err.message : 'Unknown error'));
      setUploadStatus('');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="resume-upload-container">
      <div className="file-input-container">
        <input
          id="fileInput"
          type="file"
          accept="application/pdf"
          onChange={handleFileChange}
          disabled={isUploading}
        />
        {resumeFile && (
          <div className="file-info">
            Selected file: {resumeFile.name}
          </div>
        )}
      </div>
      
      {error && <p className="error-message">{error}</p>}
      {uploadStatus && <p className="status-message">{uploadStatus}</p>}
      
      <button 
        onClick={handleUpload} 
        disabled={!resumeFile || isUploading}
        className="upload-button"
      >
        {isUploading ? 'Uploading...' : 'Upload Resume'}
      </button>
    </div>
  );
};