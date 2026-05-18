import sys
import os

# Adjust path to import backend services
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv()

from database import SessionLocal
from models import schema
from services.security import TokenManager
import urllib.request
import json

def main():
    print("=== AutoWiki Ollama Postgres Diagnostic Check ===")
    
    # 1. Fetch from Postgres
    db = SessionLocal()
    try:
        users = db.query(schema.User).all()
        print(f"Total users found: {len(users)}")
        
        decrypted_key = None
        host = "https://ollama.com"
        
        for user in users:
            key_enc = getattr(user, 'ollama_api_key_enc', None)
            provider = getattr(user, 'ai_provider', 'github_copilot') or 'github_copilot'
            u_host = getattr(user, 'ollama_host', 'https://ollama.com') or 'https://ollama.com'
            
            print(f" - User: {user.username}, Provider: {provider}, Host: {u_host}, Key Encrypted: {key_enc is not None}")
            
            if key_enc:
                ver = getattr(user, 'encryption_key_version', 1)
                tm = TokenManager()
                decrypted_key = tm.decrypt(key_enc, ver)
                host = u_host
                print(f"   Decrypted key prefix: {decrypted_key[:12]}...")
                
        if not decrypted_key:
            print("Error: No user has a decrypted Ollama key.")
            
    except Exception as db_err:
        print(f"Database error: {db_err}")
        return
    finally:
        db.close()
        
    # 2. Test Connection to /api/tags
    url = f"{host.rstrip('/')}/api/tags"
    print(f"\nTesting connection to: {url}")
    
    headers = {"Content-Type": "application/json"}
    if decrypted_key:
        headers["Authorization"] = f"Bearer {decrypted_key}"
        
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            body = response.read().decode("utf-8")
            data = json.loads(body)
            models = [m.get("name") for m in data.get("models", [])]
            print("Successfully retrieved models:")
            for m in models:
                print(f" - {m}")
    except Exception as e:
        print(f"Error testing /api/tags: {e}")
        return

    # 3. Test chat generation with 'gemma3:4b' and 'deepseek-v4-flash'
    for test_model in ["gemma3:4b", "deepseek-v4-flash"]:
        chat_url = f"{host.rstrip('/')}/api/chat"
        print(f"\nTesting chat completion with model '{test_model}' at: {chat_url}")
        
        payload = {
            "model": test_model,
            "messages": [{"role": "user", "content": "Hello, write a 1-sentence greeting."}],
            "stream": True
        }
        
        req_chat = urllib.request.Request(
            chat_url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        try:
            print(f"Sending streaming chat request for {test_model}...")
            with urllib.request.urlopen(req_chat, timeout=20) as response:
                print(f"Response code: {response.status}")
                print("Streaming chunks:")
                for line in response:
                    if line:
                        chunk = json.loads(line.decode("utf-8"))
                        content = chunk.get("message", {}).get("content", "")
                        print(content, end="", flush=True)
                        if chunk.get("done", False):
                            print("\n[Done!]")
                            break
        except Exception as e:
            print(f"\nError testing {test_model}: {e}")

if __name__ == "__main__":
    main()
