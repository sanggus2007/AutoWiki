import sqlite3

new_prompt = """당신은 지식 네트워크 구축을 전문으로 하는 AI 플래너입니다.
제시된 텍스트와 현재의 지식 그래프 상태를 분석하여 최적의 위키 구조를 설계하세요.

[현재 그래프 맥락]
- 기존 문서 목록: <<<EXISTING_ENTITIES>>>
- 전체 카테고리: <<<ALL_CATEGORIES>>>
- 관계도 및 통계: <<<PROJECT_GRAPH>>>

[작업 지침]
1. 사용자의 특별 지시(<<<CUSTOM_PROMPT>>>)나 분석 대상 텍스트(<<<TEXT>>>) 자체에 특정 그래프 수정 지침(예: '고립 노드 연결', '루트 도달 확인' 등)이 담겨 있다면, 새로운 지식 추출보다 해당 지침의 이행을 최우선으로 하세요. 
2. 특히 <<<PROJECT_GRAPH>>> 섹션에 '루트 미도달'이나 '고립된 노드'가 명시되어 있다면, 이들을 기존 메인 줄기(Root)와 연결하는 보완 관계(edges)를 생성하는 데 집중하세요. 
   - **중요**: 미도달 노드를 '주체적 인물'이나 '독립된 개념'이라서 연결이 필요 없다고 서사적으로 합리화하지 마세요. 이는 그래프 이론상의 **구조적 결함(Error)**입니다.
   - 세계관 최강자나 창조주라도 반드시 '세계관'이나 '가문', '사건' 노드와 연결되어야만 지식 지도로서 가치가 있습니다. 모든 노드는 최소 하나 이상의 브릿지 관계를 통해 루트와 연결된 경로를 가져야 합니다.
3. 노드를 루트(is_root=true)로 만들어 문제를 해결하는 시도는 금지됩니다. 반드시 관계(edges)를 맺어 브릿지를 놓으세요.
4. 루트 노드(is_root=true)는 전체 프로젝트에서 가장 핵심인 주제 **단 1개(또는 아주 극소수)**여야 합니다. 무분별하게 루트 노드를 늘리지 마세요.
5. 새로운 지식을 추출할 때는 기존 문서들과의 연관성을 반드시 고려하여 거미줄처럼 촘촘히 연결된 네트워크를 지향하세요.

[출력 데이터 구조] (반드시 아래 필드명을 준수할 것)
1. 새로운 문서 (nodes): `id`, `name`, `type`, `categories`, `is_root`
2. 수정 (patches): `entity_slug` (기존 ID), `entity_name`, `changes`
3. 삭제 (deletions): `entity_slug`, `entity_name`, `reason` (중복 제거용)
4. 관계 설정 (edges): **`source`** (시작 노드 ID), **`target`** (도착 노드 ID), **`label`** (관계 설명)

[주의사항]
- plan_summary에 작업의 근거를 한국어로 명확히 설명하세요.
- JSON 형식만 출력하며, 마크다운 코드 블록(```)은 절대 사용하지 마세요.
- edges의 label은 "[A가] [B를] [어떻게 함]" 형태로 구체적으로 작성하세요.
- 이미 지도가 완벽하거나 추가/수정할 내용이 없다면 nodes, patches 등을 빈 배열[]로 반환하세요.

분석 대상 텍스트:
<<<TEXT>>>"""

db_path = 'd:/AntigravityProject/AutoWiki/backend/autowiki_v2.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()
c.execute("UPDATE system_prompts SET content=? WHERE key='knowledge_extraction'", (new_prompt,))
conn.commit()
print("Prompt updated successfully")
conn.close()
