import asyncio
import os
import sys
import httpx
from pypdf import PdfReader

# Add parent dir to path so we can import services
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from langchain_community.document_loaders import PyPDFLoader

async def main():
    pdf_url = "https://pdfobject.com/pdf/sample.pdf"
    print(f"Downloading sample PDF from: {pdf_url}...")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(pdf_url)
        response.raise_for_status()
        pdf_content = response.content
        
    temp_filename = "temp_sample.pdf"
    with open(temp_filename, "wb") as f:
        f.write(pdf_content)
        
    print(f"Downloaded and saved to {temp_filename}.")
    
    # 1. Test PyPDFLoader
    print("\n--- Testing LangChain PyPDFLoader ---")
    try:
        loader = PyPDFLoader(temp_filename)
        docs = loader.load()
        loader_text = "\n".join([doc.page_content for doc in docs if doc.page_content])
        print(f"PyPDFLoader Extracted length: {len(loader_text)} characters")
        print("First 200 chars:")
        print(repr(loader_text[:200]))
    except Exception as e:
        print(f"PyPDFLoader failed: {e}")
        loader_text = ""
        
    # 2. Test direct PdfReader
    print("\n--- Testing Direct pypdf.PdfReader ---")
    try:
        reader = PdfReader(temp_filename)
        reader_text_parts = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                reader_text_parts.append(page_text)
        reader_text = "\n".join(reader_text_parts)
        print(f"Direct pypdf.PdfReader Extracted length: {len(reader_text)} characters")
        print("First 200 chars:")
        print(repr(reader_text[:200]))
    except Exception as e:
        print(f"Direct pypdf.PdfReader failed: {e}")
        reader_text = ""
        
    # Clean up
    if os.path.exists(temp_filename):
        os.unlink(temp_filename)
        
if __name__ == "__main__":
    asyncio.run(main())
