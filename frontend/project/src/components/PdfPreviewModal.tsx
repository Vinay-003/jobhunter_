import React, { useEffect } from 'react';
import { X, Download, FileText, ExternalLink } from 'lucide-react';

export interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  downloadUrl?: string;
  title?: string;
}

export const PdfPreviewModal: React.FC<PdfPreviewModalProps> = ({
  isOpen,
  onClose,
  pdfUrl,
  downloadUrl,
  title = 'Tailored Resume Preview',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const downloadHref = downloadUrl || pdfUrl;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl h-[88vh] rounded-2xl border border-stone-200 bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-stone-50/90">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-amber-100 text-amber-700">
              <FileText size={18} />
            </span>
            <div>
              <h2 id="pdf-modal-title" className="text-sm font-semibold text-stone-900">
                {title}
              </h2>
              <p className="text-xs text-stone-600">
                Job-isolated ATS-compliant PDF with accepted tailored edits
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={downloadHref}
              download="tailored_resume.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-950 bg-amber-400 hover:bg-amber-300 transition-colors shadow-xs"
            >
              <Download size={14} />
              <span>Download PDF</span>
            </a>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 hover:text-stone-900 hover:bg-stone-200 transition-colors"
              title="Open raw PDF in new tab"
            >
              <ExternalLink size={14} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200 transition-colors"
              aria-label="Close PDF preview"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PDF Frame */}
        <div className="relative flex-1 w-full bg-stone-100">
          <iframe
            src={pdfUrl}
            title={title}
            className="w-full h-full border-none"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-stone-200 bg-stone-50 text-xs text-stone-600">
          <span>Single-column, text-extractable ATS standard formatting</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 rounded bg-stone-200 hover:bg-stone-300 text-stone-700 font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default PdfPreviewModal;

