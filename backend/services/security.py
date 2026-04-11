import os
import datetime
from cryptography.fernet import Fernet
from typing import Optional, List
import secrets

class TokenManager:
    """Handles multi-key encryption and decryption for sensitive tokens."""
    
    def __init__(self):
        self.keys = {}
        self.current_version = int(os.getenv("CURRENT_KEY_VERSION", "1"))
        
        # Load all available keys from env
        # Expecting env vars like ENCRYPTION_KEY_V1, ENCRYPTION_KEY_V2...
        for i in range(1, self.current_version + 1):
            key = os.getenv(f"ENCRYPTION_KEY_V{i}")
            if key:
                self.keys[i] = Fernet(key.encode())
            elif i == 1 and not key:
                # Fallback for local development if no key is set
                # IN PRODUCTION, THIS SHOULD BE STRICTER
                fallback_key = b"Uy0fQP2kNnqwVbo2BkV6dNehYvALRJlUNyyqiLEVzA0="
                self.keys[1] = Fernet(fallback_key)

    def encrypt(self, plain_text: str, version: Optional[int] = None) -> str:
        if not plain_text:
            return None
        v = version or self.current_version
        if v not in self.keys:
            raise ValueError(f"Encryption key version {v} not found in environment.")
        return self.keys[v].encrypt(plain_text.encode()).decode()

    def decrypt(self, encrypted_text: str, version: int) -> str:
        if not encrypted_text:
            return None
        if version not in self.keys:
            raise ValueError(f"Decryption key version {version} not found in environment.")
        return self.keys[version].decrypt(encrypted_text.encode()).decode()

token_manager = TokenManager()

def generate_session_id() -> str:
    return secrets.token_urlsafe(32)

def is_cookie_secure(frontend_url: str) -> bool:
    """Determine if cookies should be 'Secure' based on the frontend URL."""
    if not frontend_url:
        return False
    return frontend_url.startswith("https://")

def get_samesite_policy(frontend_url: str, backend_host: str) -> str:
    """Determine SameSite policy. If cross-domain, return 'none'."""
    # Simplified logic: if both are localhost, use 'lax' or 'strict'
    # If production with different domains, use 'none' (requires Secure=True)
    if "localhost" in frontend_url and "localhost" in backend_host:
        return "lax"
    
    # Check if domains match (very basic check)
    from urllib.parse import urlparse
    f_domain = urlparse(frontend_url).netloc
    b_domain = backend_host
    
    if f_domain == b_domain:
        return "lax"
    return "none"
