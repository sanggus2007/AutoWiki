import sqlite3

conn = sqlite3.connect("autowiki.db")
tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("Tables:", tables)
if any("project_files" in t[0] for t in tables):
    cols = conn.execute("PRAGMA table_info(project_files)").fetchall()
    print("project_files columns:", [c[1] for c in cols])
conn.close()
