import os
import re

MAIN_FILE = r'd:\AntigravityProject\AutoWiki\backend\main.py'
SERVICE_FILE = r'd:\AntigravityProject\AutoWiki\backend\services\langchain_service.py'

with open(MAIN_FILE, 'r', encoding='utf-8') as f:
    main_code = f.read()

# 1. Update main.py: Insert app startup script
startup_code = '''
# Initialize default prompts
@app.on_event("startup")
def init_db():
    from database import SessionLocal
    db = SessionLocal()
    
    DEFAULT_EXTRACTION_PROMPT = """당신은 위키백과 수준의 백과사전을 기획하는 전문 AI 기획자입니다.
제공된 텍스트를 분석하여 어떤 문서(Node)들을 생성해야 할지, 문서들 간의 관계(Edge)는 어떠한지 구조만 기획하세요. (내용 생성은 금지)

사용자의 특별 지시사항: <<<CUSTOM_PROMPT>>>

절대 규칙:
- 모든 필드의 텍스트는 한국어(Korean)로 작성하세요. (단, id는 영어 슬러그)
- type과 categories는 한국어 명사형으로 작성하세요.
- **Return ONLY the raw JSON object. Do NOT include Markdown code blocks, backticks, or any explanatory text. The response must start with { and end with }.**
- 만약 확신이 서지 않더라도, 문서 내에서 가장 핵심적인 주요 개체(Primary Entities)라도 반드시 추출하려고 시도하십시오.

[Perfect JSON Example]
당신이 출력해야 하는 정확하고 완벽한 포맷은 아래와 같습니다. 아래 예시 구조를 100% 동일하게 따르세요:
{
  "nodes": [
    {"id": "artificial-intelligence", "name": "인공지능", "type": "개념", "categories": ["과학", "컴퓨터 과학"]},
    {"id": "alan-turing", "name": "앨런 튜링", "type": "인물", "categories": ["과학자", "인물"]}
  ],
  "edges": [
    {"source": "alan-turing", "target": "artificial-intelligence", "label": "의 기초 형성에 기여함"}
  ]
}

분석할 텍스트:
<<<TEXT>>>"""

    DEFAULT_GENERATION_PROMPT = """당신은 위키백과 수준의 백과사전 문서를 작성하는 전문 AI 에디터입니다.
다음 소스 문서를 기반으로, 아래 명시된 **<<<BATCH_SIZE>>>개의 개체(Node)들**에 대한 각각의 상세한 위키 문서를 한번에 작성하세요.

작성 대상 개체들:
<<<TARGET_NODES_INFO>>>

사용자의 특별 지시사항: <<<CUSTOM_PROMPT>>>

절대 규칙:
1. 각 문서(summary)는 **반드시** 아래 [Perfect Wiki Markdown Example] 구조를 따르는 마크다운이어야 합니다.
2. (주의: 목차의 앵커 링크는 명칭이 정확히 일치해야 합니다. 예: [일반 현황](#일반-현황))
3. **목차 내부에는 절대로 위키링크 문법([[ ]])을 사용하지 마세요.** 위키링크는 본문에만 허용됩니다.
4. H2(##), H3(###)를 활용한 상세 본문 섹션 최소 3개. **본문의 헤딩에는 절대로 숫자를 붙이지 마세요** (예: '## 1. 개요' 대신 '## 개요'로만 작성).
5. 다른 추출된 개체를 참조할 때는 일반 평문 내에서 [[노드이름]] 형식으로 작성
6. **모든 텍스트는 반드시 한국어(Korean)로 작성하세요.**
7. **필수 딜리미터**: 문서와 문서 사이는 반드시 `\\n=== DOCUMENT_SEPARATOR: [개체명] ===\\n` 형식의 구분자로 완벽하게 나누어야 합니다. 절대 JSON으로 출력하지 마세요! 오직 마크다운 평문과 구분자만 출력하세요.

[Perfect Wiki Markdown Example]
아래는 단일 문서 마크다운 형태입니다. 
당신은 이와 같은 문서를 여러 개 출력해야 하며, 새로운 문서가 시작될 때마다 반드시 === DOCUMENT_SEPARATOR: 개체명 === 을 명시하세요.

=== DOCUMENT_SEPARATOR: 인공지능 ===

| 항목 | 내용 |
| :--- | :--- |
| 유형 | 개념 |
| 카테고리 | 과학, 컴퓨터 과학 |

## 목차
1. [개요](#개요)
2. [상세 설명](#상세-설명)
3. [관련 동향](#관련-동향)

## 개요
이 모델은 언어 처리의 핵심으로 활용되는 [[대규모-언어-모델]]에 관한 부분입니다. 아주 상세한 개념 설명을 산문으로 작성합니다.

## 상세 설명
여기에 추가 설명을 적습니다. 숫자가 없는 H2 문법으로 구성된 점에 주목하세요.

## 관련 동향
항상 본문 내부에서만 꺾쇠괄호 위키링크([[다른항목]])를 사용하십시오.

소스 텍스트:
<<<TEXT>>>"""

    try:
        if not db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_extraction").first():
            db.add(schema.SystemPrompt(
                key="knowledge_extraction",
                name="[1단계] 지식 구조 추출",
                content=DEFAULT_EXTRACTION_PROMPT,
                description="주어진 텍스트로부터 문서와 관계를 JSON 형태로 추출합니다. (JSON 형식 및 마크다운 관련 규칙 필수 유지)"
            ))
        if not db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_generation").first():
            db.add(schema.SystemPrompt(
                key="knowledge_generation",
                name="[2단계] 위키백과 마크다운 생성",
                content=DEFAULT_GENERATION_PROMPT,
                description="추출된 지식 플랜을 기반으로 상세한 위키 문서를 작성합니다. (DOCUMENT_SEPARATOR 규칙 필수 유지)"
            ))
        db.commit()
    finally:
        db.close()
'''
main_code = main_code.replace('app = FastAPI(title="AutoWiki AI Backend")', 'app = FastAPI(title="AutoWiki AI Backend")\n' + startup_code)

# 2. Add Prompt Endpoints to main.py
prompt_endpoints = '''
# ──────────────────────────────────────
# Prompt Endpoints
# ──────────────────────────────────────

class PromptUpdate(BaseModel):
    content: str

@app.get("/api/prompts")
def list_prompts(db=Depends(get_db)):
    prompts = db.query(schema.SystemPrompt).order_by(schema.SystemPrompt.id).all()
    return [{"key": p.key, "name": p.name, "content": p.content, "description": p.description} for p in prompts]

@app.put("/api/prompts/{key}")
def update_prompt(key: str, payload: PromptUpdate, db=Depends(get_db)):
    prompt = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == key).first()
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    prompt.content = payload.content
    db.commit()
    return {"status": "success"}

# ──────────────────────────────────────
# Project Endpoints
# ──────────────────────────────────────
'''
main_code = main_code.replace('''# ──────────────────────────────────────
# Project Endpoints
# ──────────────────────────────────────''', prompt_endpoints)

# 3. Update main.upload_files to pass system_prompt
upload_files_search = '''@app.post("/api/projects/{project_id}/upload")
async def upload_files(
    project_id: int,
    files: list[UploadFile] = File(...),
    custom_prompt: str = Form(""),
    model_name: str = Form(""),
    api_key: str = Form(""),
    db=Depends(get_db)
):
    project = db.query(schema.Project).filter(schema.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    results = []
    for file in files:
        res = await extract_proposals(file, custom_prompt, model_name, api_key)
        results.append(res)'''

upload_files_replace = '''@app.post("/api/projects/{project_id}/upload")
async def upload_files(
    project_id: int,
    files: list[UploadFile] = File(...),
    custom_prompt: str = Form(""),
    model_name: str = Form(""),
    api_key: str = Form(""),
    db=Depends(get_db)
):
    project = db.query(schema.Project).filter(schema.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    prompt_record = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_extraction").first()
    system_prompt = prompt_record.content if prompt_record else ""

    results = []
    for file in files:
        res = await extract_proposals(file, custom_prompt, model_name, api_key, system_prompt)
        results.append(res)'''
main_code = main_code.replace(upload_files_search, upload_files_replace)

# 4. Update main.commit_changes to pass system_prompt
commit_changes_search = '''@app.post("/api/projects/{project_id}/commit")
def commit_changes(project_id: int, payload_data: dict, db=Depends(get_db)):
    proposals = payload_data.get("proposals", [])
    custom_prompt = payload_data.get("custom_prompt", "")
    model_name = payload_data.get("model_name", "")
    api_key = payload_data.get("api_key", "")
    
    llm = get_llm(model_name, api_key)'''

commit_changes_replace = '''@app.post("/api/projects/{project_id}/commit")
def commit_changes(project_id: int, payload_data: dict, db=Depends(get_db)):
    proposals = payload_data.get("proposals", [])
    custom_prompt = payload_data.get("custom_prompt", "")
    model_name = payload_data.get("model_name", "")
    api_key = payload_data.get("api_key", "")
    
    prompt_record = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_generation").first()
    system_prompt = prompt_record.content if prompt_record else ""
    
    llm = get_llm(model_name, api_key)'''
main_code = main_code.replace(commit_changes_search, commit_changes_replace)

exec_batch_search = '''            # Execution Phase: Generate the heavy Markdown multiplexed string via LLM
            batch_result_string = execute_batch_knowledge_generation(
                nodes_batch=batch,
                text=content_text,
                custom_prompt=custom_prompt,
                llm=llm
            )'''
exec_batch_replace = '''            # Execution Phase: Generate the heavy Markdown multiplexed string via LLM
            batch_result_string = execute_batch_knowledge_generation(
                nodes_batch=batch,
                text=content_text,
                custom_prompt=custom_prompt,
                llm=llm,
                system_prompt=system_prompt
            )'''
main_code = main_code.replace(exec_batch_search, exec_batch_replace)

with open(MAIN_FILE, 'w', encoding='utf-8') as f:
    f.write(main_code)
print("Updated main.py")


# Update langchain_service.py
with open(SERVICE_FILE, 'r', encoding='utf-8') as f:
    service_code = f.read()

extractor_search = '''def plan_knowledge_extraction(text: str, custom_prompt: str, llm) -> KnowledgePlan:
    base_prompt = f"""당신은 위키백과 수준의 백과사전을 기획하는 전문 AI 기획자입니다.
제공된 텍스트를 분석하여 어떤 문서(Node)들을 생성해야 할지, 문서들 간의 관계(Edge)는 어떠한지 구조만 기획하세요. (내용 생성은 금지)

사용자의 특별 지시사항: {custom_prompt if custom_prompt else "없음"}

절대 규칙:
- 모든 필드의 텍스트는 한국어(Korean)로 작성하세요. (단, id는 영어 슬러그)
- type과 categories는 한국어 명사형으로 작성하세요.
- **Return ONLY the raw JSON object. Do NOT include Markdown code blocks, backticks, or any explanatory text. The response must start with {{ and end with }}.**
- 만약 확신이 서지 않더라도, 문서 내에서 가장 핵심적인 주요 개체(Primary Entities)라도 반드시 추출하려고 시도하십시오.

[Perfect JSON Example]
당신이 출력해야 하는 정확하고 완벽한 포맷은 아래와 같습니다. 아래 예시 구조를 100% 동일하게 따르세요:
{{
  "nodes": [
    {{"id": "artificial-intelligence", "name": "인공지능", "type": "개념", "categories": ["과학", "컴퓨터 과학"]}},
    {{"id": "alan-turing", "name": "앨런 튜링", "type": "인물", "categories": ["과학자", "인물"]}}
  ],
  "edges": [
    {{"source": "alan-turing", "target": "artificial-intelligence", "label": "의 기초 형성에 기여함"}}
  ]
}}

분석할 텍스트:
{text}"""'''

extractor_replace = '''def plan_knowledge_extraction(text: str, custom_prompt: str, llm, system_prompt: str) -> KnowledgePlan:
    base_prompt = system_prompt.replace("<<<TEXT>>>", text).replace("<<<CUSTOM_PROMPT>>>", custom_prompt if custom_prompt else "없음")'''
service_code = service_code.replace(extractor_search, extractor_replace)

gen_search = '''def execute_batch_knowledge_generation(nodes_batch: list[dict], text: str, custom_prompt: str, llm) -> str:
    target_nodes_info = ""
    for n in nodes_batch:
        target_nodes_info += f"- 개체명: {n['name']}, 카테고리: {n.get('categories', [])}\\n"

    base_prompt = f"""당신은 위키백과 수준의 백과사전 문서를 작성하는 전문 AI 에디터입니다.
다음 소스 문서를 기반으로, 아래 명시된 **{len(nodes_batch)}개의 개체(Node)들**에 대한 각각의 상세한 위키 문서를 한번에 작성하세요.

작성 대상 개체들:
{target_nodes_info}

사용자의 특별 지시사항: {custom_prompt if custom_prompt else "없음"}

절대 규칙:
1. 각 문서(summary)는 **반드시** 아래 [Perfect Wiki Markdown Example] 구조를 따르는 마크다운이어야 합니다.
2. (주의: 목차의 앵커 링크는 명칭이 정확히 일치해야 합니다. 예: [일반 현황](#일반-현황))
3. **목차 내부에는 절대로 위키링크 문법([[ ]])을 사용하지 마세요.** 위키링크는 본문에만 허용됩니다.
4. H2(##), H3(###)를 활용한 상세 본문 섹션 최소 3개. **본문의 헤딩에는 절대로 숫자를 붙이지 마세요** (예: '## 1. 개요' 대신 '## 개요'로만 작성).
5. 다른 추출된 개체를 참조할 때는 일반 평문 내에서 [[노드이름]] 형식으로 작성
6. **모든 텍스트는 반드시 한국어(Korean)로 작성하세요.**
7. **필수 딜리미터**: 문서와 문서 사이는 반드시 `\\n=== DOCUMENT_SEPARATOR: [개체명] ===\\n` 형식의 구분자로 완벽하게 나누어야 합니다. 절대 JSON으로 출력하지 마세요! 오직 마크다운 평문과 구분자만 출력하세요.

[Perfect Wiki Markdown Example]
아래는 단일 문서 마크다운 형태입니다. 
당신은 이와 같은 문서를 여러 개 출력해야 하며, 새로운 문서가 시작될 때마다 반드시 === DOCUMENT_SEPARATOR: 개체명 === 을 명시하세요.

=== DOCUMENT_SEPARATOR: 인공지능 ===

| 항목 | 내용 |
| :--- | :--- |
| 유형 | 개념 |
| 카테고리 | 과학, 컴퓨터 과학 |

## 목차
1. [개요](#개요)
2. [상세 설명](#상세-설명)
3. [관련 동향](#관련-동향)

## 개요
이 모델은 언어 처리의 핵심으로 활용되는 [[대규모-언어-모델]]에 관한 부분입니다. 아주 상세한 개념 설명을 산문으로 작성합니다.

## 상세 설명
여기에 추가 설명을 적습니다. 숫자가 없는 H2 문법으로 구성된 점에 주목하세요.

## 관련 동향
항상 본문 내부에서만 꺾쇠괄호 위키링크([[다른항목]])를 사용하십시오.

소스 텍스트:
{text}
"""'''

gen_replace = '''def execute_batch_knowledge_generation(nodes_batch: list[dict], text: str, custom_prompt: str, llm, system_prompt: str) -> str:
    target_nodes_info = ""
    for n in nodes_batch:
        target_nodes_info += f"- 개체명: {n['name']}, 카테고리: {n.get('categories', [])}\\n"

    base_prompt = system_prompt.replace("<<<TEXT>>>", text)\\
                               .replace("<<<CUSTOM_PROMPT>>>", custom_prompt if custom_prompt else "없음")\\
                               .replace("<<<BATCH_SIZE>>>", str(len(nodes_batch)))\\
                               .replace("<<<TARGET_NODES_INFO>>>", target_nodes_info)'''
service_code = service_code.replace(gen_search, gen_replace)

def_extract_proposals_search = '''async def extract_proposals(file: UploadFile, custom_prompt: str, model_name: str, api_key: str):'''
def_extract_proposals_replace = '''async def extract_proposals(file: UploadFile, custom_prompt: str, model_name: str, api_key: str, system_prompt: str):'''
service_code = service_code.replace(def_extract_proposals_search, def_extract_proposals_replace)

call_plan_req_search = '''        llm = get_llm(model_name, api_key)
        plan = plan_knowledge_extraction(target_chunk, custom_prompt, llm)'''
call_plan_req_replace = '''        llm = get_llm(model_name, api_key)
        plan = plan_knowledge_extraction(target_chunk, custom_prompt, llm, system_prompt)'''
service_code = service_code.replace(call_plan_req_search, call_plan_req_replace)

with open(SERVICE_FILE, 'w', encoding='utf-8') as f:
    f.write(service_code)
print("Updated langchain_service.py")
