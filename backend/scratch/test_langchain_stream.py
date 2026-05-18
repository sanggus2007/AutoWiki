import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal
from models import schema
from services.security import TokenManager
from langchain_community.chat_models import ChatOllama

def main():
    print("=== AutoWiki LangChain Stream Test ===")
    
    # 1. Fetch credentials
    db = SessionLocal()
    try:
        user = db.query(schema.User).filter(schema.User.ai_provider == 'ollama').first()
        if not user:
            print("Error: No ollama user found.")
            return
            
        host = getattr(user, 'ollama_host', 'https://ollama.com') or 'https://ollama.com'
        key_enc = getattr(user, 'ollama_api_key_enc', None)
        ver = getattr(user, 'encryption_key_version', 1)
        tm = TokenManager()
        decrypted_key = tm.decrypt(key_enc, ver) if key_enc else None
        print(f"Using host: {host}, Key present: {decrypted_key is not None}")
    finally:
        db.close()

    # 2. Read prompt
    prompt_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "../last_prompt_debug.txt"))
    with open(prompt_path, 'r', encoding='utf-8') as f:
        base_prompt = f.read()
    
    print(f"Prompt loaded: {len(base_prompt)} characters.")

    # 3. Setup LangChain
    headers = {}
    if decrypted_key:
        headers["Authorization"] = f"Bearer {decrypted_key}"

    print("Initializing ChatOllama...")
    llm = ChatOllama(
        model="deepseek-v4-flash",
        base_url=host,
        headers=headers,
        temperature=0.2
    )

    print("Executing llm.stream()...")
    try:
        chunks_received = 0
        for chunk in llm.stream(base_prompt):
            if chunk and hasattr(chunk, 'content'):
                print(chunk.content, end="", flush=True)
                chunks_received += 1
        print(f"\n[Done!] Total chunks received: {chunks_received}")
    except Exception as e:
        print(f"\nError during streaming: {e}")

if __name__ == "__main__":
    main()
