import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

SQLALCHEMY_DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.zlcfxwzfxlwczlhefeyh:Deniously==491733@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres"
)

# PostgreSQL에 맞게 check_same_thread 속성 제거
engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
