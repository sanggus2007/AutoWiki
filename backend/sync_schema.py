import os
from sqlalchemy import create_engine, inspect, text
from database import engine, Base
from models import schema

def sync():
    print("Checking database schema...")
    inspector = inspect(engine)
    
    # 1. Create missing tables (including 'sessions' etc.)
    print("Creating any missing tables...")
    Base.metadata.create_all(bind=engine)
    
    # 2. Add missing columns to existing tables
    # PostgreSQL requires separate ALTER TABLE statements or a combined one
    with engine.connect() as conn:
        with conn.begin():
            # Check 'users' table
            user_cols = [c["name"] for c in inspector.get_columns("users")]
            
            # github_token_enc
            if "github_token_enc" not in user_cols:
                print("Adding 'github_token_enc' to 'users' table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN github_token_enc TEXT"))
            
            # github_refresh_token_enc
            if "github_refresh_token_enc" not in user_cols:
                print("Adding 'github_refresh_token_enc' to 'users' table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN github_refresh_token_enc TEXT"))
            
            # encryption_key_version
            if "encryption_key_version" not in user_cols:
                print("Adding 'encryption_key_version' to 'users' table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN encryption_key_version INTEGER DEFAULT 1"))

            # tokens
            if "tokens" not in user_cols:
                print("Adding 'tokens' to 'users' table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN tokens INTEGER DEFAULT 100"))

            # last_token_reset_at
            if "last_token_reset_at" not in user_cols:
                print("Adding 'last_token_reset_at' to 'users' table...")
                conn.execute(text("ALTER TABLE users ADD COLUMN last_token_reset_at TIMESTAMP"))

            # Check 'project_files' table
            pf_cols = [c["name"] for c in inspector.get_columns("project_files")]
            if "is_selected" not in pf_cols:
                print("Adding 'is_selected' to 'project_files' table...")
                conn.execute(text("ALTER TABLE project_files ADD COLUMN is_selected BOOLEAN DEFAULT TRUE"))

    print("\nSchema synchronization finished successfully!")

if __name__ == "__main__":
    sync()
