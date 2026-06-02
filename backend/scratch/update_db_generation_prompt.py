import sqlite3
import os
import re

def extract_prompt_from_main():
    main_path = os.path.join(os.path.dirname(__file__), "..", "main.py")
    with open(main_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    # Locate DEFAULT_GENERATION_PROMPT
    match = re.search(r'DEFAULT_GENERATION_PROMPT\s*=\s*"""(.*?)"""', content, re.DOTALL)
    if not match:
        raise ValueError("Could not find DEFAULT_GENERATION_PROMPT in main.py")
    return match.group(1)

def update_db(db_path, prompt_content):
    if not os.path.exists(db_path):
        print(f"File not found: {db_path}")
        return
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Check if table system_prompts exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='system_prompts'")
    if not cursor.fetchone():
        print(f"Table system_prompts does not exist in {db_path}")
        conn.close()
        return
        
    cursor.execute("SELECT content FROM system_prompts WHERE key='knowledge_generation'")
    row = cursor.fetchone()
    if not row:
        print(f"Key 'knowledge_generation' not found in system_prompts inside {db_path}")
    else:
        cursor.execute("UPDATE system_prompts SET content=? WHERE key='knowledge_generation'", (prompt_content,))
        conn.commit()
        print(f"Successfully updated system_prompts content for 'knowledge_generation' in {db_path}")
        
    conn.close()

if __name__ == "__main__":
    prompt_content = extract_prompt_from_main()
    update_db("autowiki.db", prompt_content)
    update_db("autowiki_v2.db", prompt_content)
