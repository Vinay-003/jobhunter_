import pdf_text_extract

def run_text_to_model():
    """Placeholder that chains extracted text to a model step."""
    # Extract text for user 4 (adjust as needed)
    text = pdf_text_extract.extract_pdf_text(
        pdf_text_extract.get_file_path(user_id=4) or ""
    )
    if not text:
        print("No text to send to model")
        return
    # Integrate with your LLM/model here
    print("[Model] Received text with length:", len(text))

if __name__ == "__main__":
    run_text_to_model()