import sqlite3
import os

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
        old_str = "- type과 categories는 한국어 명사형으로 작성하세요."
        new_str = "- type은 가급적 핵심 6대 분류(`개념`, `인물`, `단체`, `장소`, `사건`, `사물`) 내에서 지정하되, 도저히 속하지 않는 특수한 성격의 문서인 경우에만 새로운 명사형으로 자유롭게 만드세요.\n- categories는 `[프로젝트 전체 카테고리 목록]`에 있는 기존 분류를 최대한 재사용하여, '조직/기관/기업/단체' 처럼 의미가 비슷한 카테고리가 파편화되어 우후죽순 생기지 않도록 전체적인 분류 체계를 통일성 있게 기획해 적용하세요."
        
        if old_str in content:
            content = content.replace(old_str, new_str)
            cur.execute("UPDATE system_prompts SET content = ? WHERE key='knowledge_extraction'", (content,))
            conn.commit()
            print(f"[{db_path}] Updated taxonomy prompt.")
        else:
            print(f"[{db_path}] String not found. Maybe already updated.")
    
    conn.close()

update_prompt("autowiki.db")
if os.path.exists("autowiki_v2.db"):
    update_prompt("autowiki_v2.db")
