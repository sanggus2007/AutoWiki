import asyncio
import os
import sys
import httpx

# Add parent dir to path so we can import services
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.langchain_service import extract_text_from_file

# Create a mock FastAPI UploadFile-like class for testing
class MockUploadFile:
    def __init__(self, filename, content):
        self.filename = filename
        self._content = content
        self.content_type = "application/pdf"
    
    async def read(self):
        return self._content

async def main():
    pdf_url = "https://pdfobject.com/pdf/sample.pdf"
    print(f"Downloading sample PDF from: {pdf_url}...")
    
    async with httpx.AsyncClient() as client:
        response = await client.get(pdf_url)
        response.raise_for_status()
        pdf_content = response.content
        
    print(f"Downloaded {len(pdf_content)} bytes.")
    
    mock_file = MockUploadFile("sample.pdf", pdf_content)
    
    print("Testing extract_text_from_file...")
    try:
        text = await extract_text_from_file(mock_file)
        print("Success! Extracted text:")
        print("=" * 40)
        print(text[:1000].encode('ascii', errors='ignore').decode('ascii'))
        print("=" * 40)
        print(f"Total extracted length: {len(text)} characters.")
    except Exception as e:
        print("Extraction failed!")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
