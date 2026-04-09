import sqlite3
import os
import re

def update_prompt(db_path):
    if not os.path.exists(db_path):
        print(f"[{db_path}] Not found, skipping.")
        return
    conn = sqlite3.connect(db_path)
    
    cur = conn.cursor()
    cur.execute("SELECT content FROM system_prompts WHERE key='knowledge_extraction'")
    row = cur.fetchone()
    if row:
        content = row[0]
        
        # Replace 1
        old_str1 = "- **Return ONLY the raw JSON object. Do NOT include Markdown code blocks, backticks, or any explanatory text. The response must start with { and end with }.**"
        new_str1 = "- **Return ONLY the raw JSON object. Do NOT include Markdown code blocks, backticks, or any explanatory text. The response must start with { and end with }.**\n- 추출할 문서 중 가장 중심이 되는 단 하나의 핵심 주제를 선정하고, 해당 노드의 `is_root` 값을 `true`로 지정하세요. 그리고 다른 핵심 문서들은 가급적 이 중심 노드와 직접 연결(edge)되도록 설계하세요. (단 1개의 노드만 is_root가 true여야 합니다)"
        if "- 추출할 문서 중 가장 중심이 되는 단 하나의 핵심 주제를 선정하고" not in content:
            content = content.replace(old_str1, new_str1)
            
        # Replace 2 (JSON example)
        old_str2 = """  "nodes": [
    {"id": "artificial-intelligence", "name": "인공지능", "type": "개념", "categories": ["과학", "컴퓨터 과학"]},
    {"id": "alan-turing", "name": "앨런 튜링", "type": "인물", "categories": ["과학자", "인물"]}
  ],"""
        new_str2 = """  "nodes": [
    {"id": "artificial-intelligence", "name": "인공지능", "type": "개념", "categories": ["과학", "컴퓨터 과학"], "is_root": true},
    {"id": "alan-turing", "name": "앨런 튜링", "type": "인물", "categories": ["과학자", "인물"], "is_root": false}
  ],"""
        if '"is_root": true' not in content:
            content = content.replace(old_str2, new_str2)
            
        cur.execute("UPDATE system_prompts SET content = ? WHERE key='knowledge_extraction'", (content,))
        conn.commit()
        print(f"[{db_path}] Updated knowledge_extraction prompt")
    
    conn.close()

update_prompt("autowiki.db")
if os.path.exists("autowiki_v2.db"):
    update_prompt("autowiki_v2.db")
