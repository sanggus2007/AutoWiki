import sqlite3

def update_prompt(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('SELECT content FROM system_prompts WHERE key="knowledge_extraction"')
    row = cursor.fetchone()
    if not row:
        print(f"[{db_path}] knowledge_extraction not found!")
        conn.close()
        return

    content = row[0]

    # Avoid double-insertion
    if "<<<PROJECT_FILES>>>" in content:
        print(f"[{db_path}] Already updated, skipping.")
        conn.close()
        return

    replacement = """[이미 프로젝트에 존재하는 문서들]
<<<EXISTING_ENTITIES>>>

[프로젝트 전체 카테고리 목록]
<<<ALL_CATEGORIES>>>

[사용자가 첨부한 참고 파일 목록]
<<<PROJECT_FILES>>>"""

    # We replace the target line.
    target_to_replace = """[이미 프로젝트에 존재하는 문서들]
<<<EXISTING_ENTITIES>>>"""

    if target_to_replace in content:
        new_content = content.replace(target_to_replace, replacement)
        cursor.execute('UPDATE system_prompts SET content=? WHERE key="knowledge_extraction"', (new_content,))
        conn.commit()
        print(f"[{db_path}] Updated successfully.")
    else:
        print(f"[{db_path}] Could not find target replacement block.")
        
    conn.close()

if __name__ == "__main__":
    update_prompt("autowiki.db")
    import os
    if os.path.exists("autowiki_v2.db"):
        update_prompt("autowiki_v2.db")
