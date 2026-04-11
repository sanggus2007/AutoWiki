import sqlite3
import os

db_path = 'd:/AntigravityProject/AutoWiki/backend/autowiki_v2.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("SELECT content FROM system_prompts WHERE key='knowledge_extraction'")
row = c.fetchone()
if row:
    print(row[0])
else:
    print("Prompt not found")
conn.close()
