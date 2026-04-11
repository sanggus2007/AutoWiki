import sqlite3
import os

DB_PATH = "d:/AntigravityProject/AutoWiki/backend/autowiki.db"

def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Error: DB not found at {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("Starting Security Migration (Step 1: Schema Updates)...")

    # 1. Create sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        expires_at DATETIME,
        created_at DATETIME,
        user_agent TEXT,
        ip_address TEXT,
        last_activity DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id)
    )
    """)
    print("Checked/Created 'sessions' table.")

    # 2. Update users table with new columns
    # We check if columns exist first to allow idempotency
    cursor.execute("PRAGMA table_info(users)")
    columns = [col[1] for col in cursor.fetchall()]

    new_columns = [
        ("github_token_enc", "TEXT"),
        ("github_refresh_token_enc", "TEXT"),
        ("encryption_key_version", "INTEGER DEFAULT 1")
    ]

    for col_name, col_type in new_columns:
        if col_name not in columns:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}")
            print(f"Added column '{col_name}' to 'users' table.")
        else:
            print(f"Column '{col_name}' already exists in 'users' table.")

    conn.commit()
    conn.close()
    print("Migration Step 1 completed successfully.")

if __name__ == "__main__":
    migrate()
