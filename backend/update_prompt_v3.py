import sqlite3
import os

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

    # Check if already updated
    if "[중복 생성 방지]" in content:
        print(f"[{db_path}] Already updated.")
        conn.close()
        return

    # Target replacements
    target_to_replace = """- 이미 존재하는 문서는 nodes에 포함하지 마세요. 새롭게 추가될 문서만 포함합니다.
- 이미 존재하는 문서 중에서 새 텍스트에 의해 보완/수정이 필요한 것이 있다면 patches 배열에 포함하세요. patches가 없으면 빈 배열([])로 두세요."""

    replacement = """- [중복 생성 방지] 이미 존재하는 문서와 동일하거나 매우 유사한 주제의 문서는 절대로 `nodes`에 새롭게 생성하지 마세요. 대신 기존 문서의 정보를 갱신하거나 덧붙여야 할 경우 해당 내용을 `patches` 배열에 추가하세요.
- [문서 삭제 권한] 만약 새로운 정보로 인해 기존 문서의 내용이 완전히 쓸모 없어지거나, 오개념으로 밝혀져 완전히 제거되어야 할 경우 해당 문서를 `deletions` 배열에 포함하세요. (단절되거나 오래된 내용을 제거할 때도 사용합니다. 단, 일부만 수정할 거라면 patches를 쓰세요) deletions가 없으면 빈 배열([])로 둡니다."""

    json_example_target = """"patches": [
    {"entity_slug": "computer-science", "entity_name": "컴퓨터 과학", "changes": "'인공지능과의 관계' 섹션에 앨런 튜링의 기여와 현대 AI 발전 내용을 추가해야 합니다."}
  ],"""

    json_example_replacement = """"patches": [
    {"entity_slug": "computer-science", "entity_name": "컴퓨터 과학", "changes": "'인공지능과의 관계' 섹션에 앨런 튜링의 기여와 현대 AI 발전 내용을 추가해야 합니다."}
  ],
  "deletions": [
    {"entity_slug": "obsolete-theory", "entity_name": "폐기된 이론", "reason": "최신 연구결과에 의해 완전히 반박되어 삭제함"}
  ],"""

    if target_to_replace in content:
        content = content.replace(target_to_replace, replacement)
    
    if json_example_target in content:
        content = content.replace(json_example_target, json_example_replacement)

    cursor.execute('UPDATE system_prompts SET content=? WHERE key="knowledge_extraction"', (content,))
    conn.commit()
    print(f"[{db_path}] Updated successfully.")
        
    conn.close()

if __name__ == "__main__":
    if os.path.exists("autowiki.db"):
        update_prompt("autowiki.db")
    if os.path.exists("autowiki_v2.db"):
        update_prompt("autowiki_v2.db")
    print("Done")
