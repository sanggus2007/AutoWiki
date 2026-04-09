import sqlite3
import os

def migrate(db_path):
    if not os.path.exists(db_path):
        print(f"[{db_path}] Not found, skipping.")
        return
    conn = sqlite3.connect(db_path)
    
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    
    if "entities" in tables:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(entities)").fetchall()]
        if "is_root" not in cols:
            conn.execute("ALTER TABLE entities ADD COLUMN is_root INTEGER NOT NULL DEFAULT 0")
            conn.commit()
            print(f"[{db_path}] Added is_root column to existing entities table.")
        else:
            print(f"[{db_path}] Already up to date.")
    
    conn.close()

migrate("autowiki.db")
if os.path.exists("autowiki_v2.db"):
    migrate("autowiki_v2.db")
