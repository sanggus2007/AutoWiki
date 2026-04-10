import os
import urllib.parse
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

raw_url = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.zlcfxwzfxlwczlhefeyh:Deniously==491733@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
)

# 특수문자가 포함된 암호를 안전하게 파싱하기 위해 처리 (password에 == 등이 있을 경우 대비)
if "://" in raw_url:
    prefix, rest = raw_url.split("://", 1)
    if ":" in rest and "@" in rest:
        user_pass, host_db = rest.rsplit("@", 1)
        if ":" in user_pass:
            user, password = user_pass.split(":", 1)
            encoded_password = urllib.parse.quote_plus(password)
            raw_url = f"{prefix}://{user}:{encoded_password}@{host_db}"

# 풀러(6543) 사용 시 발생할 수 있는 스테일 커넥션 방지 옵션 추가
engine = create_engine(
    raw_url,
    pool_pre_ping=True,
    pool_recycle=300
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
