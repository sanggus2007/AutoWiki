import sqlite3

EDGE_RULES = """
[관계(Edge) 생성 원칙 — 엄격히 준수]
- **관계는 오직 텍스트에서 명시적으로 서술된 핵심 사실만 추출하세요.** 단순히 같은 분야이거나 시대적으로 비슷하다는 이유로 관계를 만들지 마세요.
- **한 노드 쌍(A→B)에는 가장 중요한 관계 1개만 추출**하세요. 같은 두 노드 사이에 여러 개의 엣지를 만들지 마세요.
- **약하거나 추론적인 관계는 모두 제외**하세요. "~와 관련 있음", "~와 동시대에 존재함", "~의 분야에 속함" 같은 막연한 연결은 금지입니다.
- **전체 edges 수는 nodes 수를 초과하지 않도록** 절제하세요. edges가 nodes보다 많다면 가장 덜 중요한 것들부터 제거하세요.
- 추가해도 될까 망설여진다면, **추가하지 마세요.**
"""

INSERTION_MARKER = "만약 확신이 서지 않더라도, 문서 내에서 가장 핵심적인 주요 개체(Primary Entities)라도 반드시 추출하려고 시도하십시오."

def update(db_path):
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
    if "관계(Edge) 생성 원칙" in content:
        print(f"[{db_path}] Already updated, skipping.")
        conn.close()
        return

    new_content = content.replace(INSERTION_MARKER, INSERTION_MARKER + "\n" + EDGE_RULES)
    cursor.execute('UPDATE system_prompts SET content=? WHERE key="knowledge_extraction"', (new_content,))
    conn.commit()
    conn.close()
    print(f"[{db_path}] Updated successfully.")

if __name__ == "__main__":
    update("autowiki.db")
    update("autowiki_v2.db")
