# pdf_text_extract.py
# Extracts text from PDF files

import fitz  # PyMuPDF for PDF text extraction
import os  # For file path validation
import sys
import json

def extract_pdf_text(pdf_path):
    """Extract all text from the PDF at the given path.
    
    Args:
        pdf_path (str): Path to the PDF file
        
    Returns:
        str: Extracted text from the PDF, or None if error
    """
    try:
        if not os.path.exists(pdf_path):
            error_msg = f"PDF not found at: {pdf_path}"
            print(f"ERROR: {error_msg}", file=sys.stderr)
            return None
            
        doc = fitz.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        
        if not text.strip():
            print("WARNING: No text extracted from PDF", file=sys.stderr)
            return None
            
        return text
    except Exception as e:
        error_msg = f"PDF extraction error: {str(e)}"
        print(f"ERROR: {error_msg}", file=sys.stderr)
        return None

if __name__ == "__main__":
    # CLI usage: python pdf_text_extract.py <pdf_path>
    if len(sys.argv) < 2:
        print("Usage: python pdf_text_extract.py <pdf_path>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    text = extract_pdf_text(pdf_path)
    
    if text:
        # Output as JSON for easier parsing
        result = {"success": True, "text": text, "length": len(text)}
        print(json.dumps(result))
    else:
        result = {"success": False, "error": "Failed to extract text"}
        print(json.dumps(result))
        sys.exit(1)