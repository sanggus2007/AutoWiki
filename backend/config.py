import os
from typing import List
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

def get_env_list(key: str, default: List[str] = None) -> List[str]:
    """환경 변수에서 쉼표로 구분된 문자열을 읽어 리스트로 반환합니다."""
    val = os.getenv(key)
    if not val:
        return default or []
    return [item.strip() for item in val.split(",") if item.strip()]

# ──────────────────────────────────────
# Database Settings
# ──────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    # 사용자에게 안내하기 위한 에러 메시지
    error_msg = (
        "\n[ERROR] DATABASE_URL 환경 변수가 설정되지 않았습니다.\n"
        "Supabase 프로젝트 설정에서 접속 URL을 가져와서 환경 변수에 설정해 주세요.\n"
    )
    # 서버 실행을 위해 즉시 에러 발생
    raise RuntimeError(error_msg)

# ──────────────────────────────────────
# Security & Auth Settings
# ──────────────────────────────────────
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# CORS / CSRF Allowed Origins
# 환경 변수에 쉼표로 구분하여 입력 (예: "https://a.com, https://b.com")
# 기본값은 로컬 및 기존 도메인들
DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://autowikiai.xyz",
    "https://www.autowikiai.xyz",
    "https://autowiki-frontend.vercel.app"
]
ALLOWED_ORIGINS = get_env_list("ALLOWED_ORIGINS", DEFAULT_ORIGINS)

# Google OAuth
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "")

if not GOOGLE_REDIRECT_URI and "http" in FRONTEND_URL:
    # FRONTEND_URL을 기반으로 추측 (운영 환경 편의성)
    GOOGLE_REDIRECT_URI = f"{FRONTEND_URL.rstrip('/')}/api/auth/google/callback"

# ──────────────────────────────────────
# Server Settings
# ──────────────────────────────────────
IS_PROD = os.getenv("NODE_ENV") == "production" or "autowikiai.xyz" in FRONTEND_URL
