import sqlite3
import os

def migrate(db_path):
    if not os.path.exists(db_path):
        print(f"[{db_path}] Not found, skipping.")
        return
    conn = sqlite3.connect(db_path)
    
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    
    if "project_files" not in tables:
        conn.execute("""
            CREATE TABLE project_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename VARCHAR,
                content_text TEXT,
                upload_date DATETIME,
                project_id INTEGER REFERENCES projects(id),
                is_selected INTEGER NOT NULL DEFAULT 0
            )
        """)
        conn.execute("CREATE INDEX ix_project_files_id ON project_files (id)")
        conn.execute("CREATE INDEX ix_project_files_filename ON project_files (filename)")
        conn.commit()
        print(f"[{db_path}] Created project_files table with is_selected.")
    else:
        # Table exists, check for is_selected column
        cols = [r[1] for r in conn.execute("PRAGMA table_info(project_files)").fetchall()]
        if "is_selected" not in cols:
            conn.execute("ALTER TABLE project_files ADD COLUMN is_selected INTEGER NOT NULL DEFAULT 0")
            conn.commit()
            print(f"[{db_path}] Added is_selected column to existing project_files table.")
        else:
            print(f"[{db_path}] Already up to date.")
    
    conn.close()

migrate("autowiki.db")
if os.path.exists("autowiki_v2.db"):
    migrate("autowiki_v2.db")
