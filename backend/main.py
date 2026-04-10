import os
import datetime
import re
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from typing import List, Optional
from database import engine, Base, get_db
from models import schema
from services.langchain_service import extract_proposals, execute_batch_knowledge_generation, execute_section_patch, apply_section_patches, plan_knowledge_extraction, get_llm, slugify, execute_project_chat
from langchain_githubcopilot_chat.auth import (
    CLIENT_ID,
    fetch_copilot_token,
    save_tokens_to_cache,
    load_tokens_from_cache,
)
import langchain_githubcopilot_chat.auth

# Create DB tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="AutoWiki AI Backend")

# Initialize default prompts
@app.on_event("startup")
def init_db():
    from database import SessionLocal
    db = SessionLocal()
    
    DEFAULT_EXTRACTION_PROMPT = """당신은 위키백과 수준의 백과사전을 기획하는 전문 AI 기획자입니다.
제공된 텍스트를 분석하여 어떤 문서(Node)들을 생성해야 할지, 문서들 간의 관계(Edge)는 어떠한지 구조를 기획하세요. (내용 생성은 금지)

[이미 프로젝트에 존재하는 문서들]
(아래 목록에는 각 문서의 타입과 요약 내용이 포함되어 있습니다. 새로운 내용이 기존 문서의 정보와 겹치는지, 또는 기존 문서를 보완해야 할지 판단할 때 참고하세요.)
<<<EXISTING_ENTITIES>>>

[프로젝트 전체 카테고리 목록]
<<<ALL_CATEGORIES>>>

[사용자가 첨부한 참고 파일 목록]
<<<PROJECT_FILES>>>

[기존 지식 그래프 관계도 (참조용)]
<<<PROJECT_GRAPH>>>

사용자의 특별 지시사항: <<<CUSTOM_PROMPT>>>

절대 규칙:
- 모든 필드의 텍스트는 한국어(Korean)로 작성하세요. (단, id는 영어 슬러그)
- type은 가급적 핵심 6대 분류(`개념`, `인물`, `단체`, `장소`, `사건`, `사물`) 내에서 지정하되, 도저히 속하지 않는 특수한 성격의 문서인 경우에만 새로운 명사형으로 자유롭게 만드세요.
- categories는 `[프로젝트 전체 카테고리 목록]`에 있는 기존 분류를 최대한 재사용하여, '조직/기관/기업/단체' 처럼 의미가 비슷한 카테고리가 파편화되어 우후죽순 생기지 않도록 전체적인 분류 체계를 통일성 있게 기획해 적용하세요.
- **edges의 label은 "[출발노드]가 [도착노드]를 [서술어]" 형태로 대상이 명확히 드러나는 완전한 문장으로 작성하세요. (예: "닉퓨리가 어벤져스를 창설함")**
- **Return ONLY the raw JSON object. Do NOT include Markdown code blocks, backticks, or any explanatory text. The response must start with { and end with }.**
- 추출할 문서 중 가장 중심이 되는 단 하나의 핵심 주제를 선정하고, 해당 노드의 `is_root` 값을 `true`로 지정하세요. 그리고 다른 핵심 문서들은 가급적 이 중심 노드와 직접 연결(edge)되도록 설계하세요. (단 1개의 노드만 is_root가 true여야 합니다)
- [중복 생성 방지] 이미 존재하는 문서와 동일하거나 매우 유사한 주제의 문서는 절대로 `nodes`에 새롭게 생성하지 마세요. 대신 **공급된 [이미 프로젝트에 존재하는 문서들]의 요약 내용을 보고,** 기존 문서의 정보를 갱신하거나 덧붙여야 할 경우 해당 내용을 `patches` 배열에 추가하세요.
- [문서 삭제 권한] 만약 새로운 정보로 인해 기존 문서의 내용이 완전히 쓸모 없어지거나, 오개념으로 밝혀져 완전히 제거되어야 할 경우 해당 문서를 `deletions` 배열에 포함하세요. (단절되거나 오래된 내용을 제거할 때도 사용합니다. 단, 일부만 수정할 거라면 patches를 쓰세요) deletions가 없으면 빈 배열([])로 둡니다.
- [엄격한 정보 선별] 제공된 텍스트가 기존 문서들에 이미 충분히 반영되어 있거나, 추가적인 가치가 있는 새로운 정보가 없다면 억지로 추출하지 마세요. 이 경우 nodes와 patches를 빈 배열([])로 반환하는 것이 올바른 대응입니다.
- 단순히 텍스트에 언급되었다고 해서 모두 추출하는 것이 아니라, 위키 문서로서 독자적인 가치를 지닐 만큼의 유의미한 정보가 포함된 경우에만 추출하세요.

[관계(Edge) 생성 원칙 — 엄격히 준수]
- **관계는 오직 텍스트에서 명시적으로 서술된 핵심 사실만 추출하세요.** 단순히 같은 분야이거나 시대적으로 비슷하다는 이유로 관계를 만들지 마세요.
- **한 노드 쌍(A→B)에는 가장 중요한 관계 1개만 추출**하세요. 같은 두 노드 사이에 여러 개의 엣지를 만들지 마세요.
- **약하거나 추론적인 관계는 모두 제외**하세요. "~와 관련 있음", "~와 동시대에 존재함", "~의 분야에 속함" 같은 막연한 연결은 금지입니다.
- **전체 edges 수는 nodes 수를 초과하지 않도록** 절제하세요. edges가 nodes보다 많다면 가장 덜 중요한 것들부터 제거하세요.
- 추가해도 될까 망설여진다면, **절대로 추가하지 마세요.** 양보다 질이 중요합니다.
- 기존 문서의 내용을 단순히 반복하거나 요약하는 수준의 수정사항은 patches에 넣지 마세요.

[Perfect JSON Example]
당신이 출력해야 하는 정확하고 완벽한 포맷은 아래와 같습니다. 아래 예시 구조를 100% 동일하게 따르세요:
{
  "plan_summary": "이 문서에는 인공지능 및 앨런 튜링에 관한 내용이 담겨 있습니다. 기존 '컴퓨터 과학' 문서에 AI 관련 내용을 보강할 필요가 있으며, 새 문서 2건(인공지능, 앨런 튜링)을 추가할 계획입니다.",
  "patches": [
    {"entity_slug": "computer-science", "entity_name": "컴퓨터 과학", "changes": "'인공지능과의 관계' 섹션에 앨런 튜링의 기여와 현대 AI 발전 내용을 추가해야 합니다."}
  ],
  "deletions": [
    {"entity_slug": "obsolete-theory", "entity_name": "폐기된 이론", "reason": "최신 연구결과에 의해 완전히 반박되어 삭제함"}
  ],
  "nodes": [
    {"id": "artificial-intelligence", "name": "인공지능", "type": "개념", "categories": ["과학", "컴퓨터 과학"], "is_root": true},
    {"id": "alan-turing", "name": "앨런 튜링", "type": "인물", "categories": ["과학자", "인물"], "is_root": false}
  ],
  "edges": [
    {"source": "alan-turing", "target": "artificial-intelligence", "label": "앨런 튜링이 인공지능의 기초 형성에 기여함"}
  ]
}

분석할 텍스트:
<<<TEXT>>>"""

    DEFAULT_GENERATION_PROMPT = """당신은 위키백과 수준의 백과사전 문서를 작성하는 전문 AI 에디터입니다.
다음 소스 문서를 기반으로, 아래 명시된 **<<<BATCH_SIZE>>>개의 개체(Node)들**에 대한 각각의 상세한 위키 문서를 한번에 작성하세요.

작성 대상 개체들:
<<<TARGET_NODES_INFO>>>

사용자의 특별 지시사항: <<<CUSTOM_PROMPT>>>
93: 
94: [프로젝트 전체 참고 파일]
95: (작성 시 개체에 대해 더 자세한 정보가 필요하다면 아래 내용을 적극 참고하세요.)
96: <<<PROJECT_FILES>>>

━━━ 절대 규칙 ━━━

1. 각 문서는 반드시 '=== DOCUMENT_SEPARATOR: [개체명] ===' 구분자로 시작하세요.
2. 절대 JSON으로 출력하지 마세요. 오직 마크다운 평문과 구분자만 출력하세요.
3. 모든 텍스트는 반드시 한국어로 작성하세요.
4. 헤딩(##, ###)에는 절대 숫자를 붙이지 마세요 (예: '## 1. 개요' → '## 개요').
5. 목차 내에는 위키링크([[]])를 사용하지 마세요. 위키링크는 본문에만 허용됩니다.
6. 다른 개체를 참조할 때는 [[개체명]] 형식의 위키링크를 사용하세요.
7. 최소 4개 이상의 H2(##) 섹션으로 풍성하게 작성하세요.

━━━ 사용 가능한 서식 ━━━

▶ 인포박스 (문서 상단 메타 정보 테이블)
| 항목 | 내용 |
| :--- | :--- |
| 유형 | 개념 |
| 카테고리 | 과학, 컴퓨터 과학 |

▶ 알림 박스 (참고/팁/주의/경고/중요 상황에 사용)
> [!NOTE]
> 이 개념은 1950년대에 처음 제안되었습니다.

> [!TIP]
> 관련 항목인 [[머신러닝]]도 함께 참고하세요.

> [!WARNING]
> 이 기술은 아직 실험적 단계에 있습니다.

> [!IMPORTANT]
> 이 법칙은 예외 없이 적용됩니다.

> [!CAUTION]
> 잘못 사용하면 심각한 결과를 초래할 수 있습니다.

▶ 인용문 (blockquote — 명언, 증언, 원문 인용 시 사용)
> "인용할 내용을 여기에 씁니다."
> — 출처 또는 화자 이름

▶ 접이식 섹션 (길거나 부가적인 내용을 숨길 때 사용)
{{접기|상세 연표|
- 1943년: 최초 제안
- 1956년: 공식 명명
- 1997년: 딥블루 체스 대회 우승
}}

▶ 데이터 테이블 (비교, 목록형 정보)
| 이름 | 연도 | 설명 |
| --- | --- | --- |
| 항목 A | 2020 | 설명 내용 |
| 항목 B | 2023 | 설명 내용 |

▶ 위키링크 (다른 문서로 연결)
[[앨런 튜링]], [[머신러닝]], [[자연어처리]]

▶ 구분선 (큰 주제 전환 시)
---

▶ 코드 블록 (기술 문서에서 코드, 수식, 명령어 표시)
```python
def example():
    return "hello"
```

━━━ 문서 예시 ━━━

=== DOCUMENT_SEPARATOR: 인공지능 ===

| 항목 | 내용 |
| :--- | :--- |
| 유형 | 개념 |
| 분야 | 컴퓨터 과학, 인지과학 |
| 주요 인물 | [[앨런 튜링]], [[존 매카시]] |

## 목차
1. [개요](#개요)
2. [역사](#역사)
3. [주요 분야](#주요-분야)
4. [응용 사례](#응용-사례)
5. [비판 및 한계](#비판-및-한계)

## 개요
**인공지능**(人工知能, Artificial Intelligence)은 인간의 학습, 추론, 지각, 언어 이해 능력을 컴퓨터로 구현하는 기술이다. [[앨런 튜링]]이 1950년 발표한 논문에서 처음으로 체계적으로 논의되었다.

> [!NOTE]
> '인공지능'이라는 용어는 [[존 매카시]]가 1956년 다트머스 회의에서 공식적으로 명명하였다.

## 역사

### 초창기 (1950~1980년대)
[[앨런 튜링]]은 1950년 "기계가 생각할 수 있는가?"라는 질문을 제기하며 **튜링 테스트**를 제안하였다.

{{접기|주요 연표|
- **1943년**: 맥컬록-피츠 뉴런 모델 제안
- **1956년**: 다트머스 회의 — '인공지능' 명칭 탄생
- **1997년**: IBM 딥블루, 세계 체스 챔피언 가스파로프 격파
- **2012년**: 딥러닝 기반 AlexNet, ImageNet 대회 압도적 우승
- **2022년**: ChatGPT 출시, AI 대중화 시대 개막
}}

## 주요 분야

| 분야 | 설명 | 대표 기술 |
| --- | --- | --- |
| [[머신러닝]] | 데이터로부터 패턴 학습 | 신경망, 결정트리 |
| [[자연어처리]] | 언어 이해 및 생성 | GPT, BERT |
| 컴퓨터 비전 | 이미지·영상 분석 | CNN, YOLO |

## 응용 사례
현재 인공지능은 의료 진단, 자율주행, 금융 분석 등 다양한 산업 분야에 활용되고 있다.

> "인공지능은 인류가 발명한 가장 중요한 기술입니다."
> — 사티아 나델라, Microsoft CEO

## 비판 및 한계

> [!WARNING]
> 인공지능 시스템은 학습 데이터의 편향을 그대로 반영할 수 있어, 공정성 문제가 지속적으로 제기되고 있습니다.

소스 텍스트:
<<<TEXT>>>"""

    DEFAULT_PATCH_PROMPT = """당신은 위키백과 수준의 백과사전 문서를 정밀하게 개선하는 전문 AI 에디터입니다.
아래 기존 문서에서 지시사항에 해당하는 섹션만 선택적으로 수정하고, 변경된 섹션만 반환하세요.

대상 문서: <<<ENTITY_NAME>>> (<<<ENTITY_TYPE>>>)

개선 지시사항:
<<<PATCH_DESCRIPTION>>>

소스 텍스트 (참고):
<<<SOURCE_TEXT>>>

[프로젝트 전체 참고 파일]
(개선 시 보완할 정보가 필요하다면 아래 내용을 참고하세요.)
<<<PROJECT_FILES>>>

[전체 지식 그래프 관계도]
(다른 문서와의 관계를 고려하여 본문을 수정하거나 새 관계에 맞게 내용을 보충하세요.)
<<<PROJECT_GRAPH>>>

━━━ 기존 문서의 섹션 목록 ━━━
<<<SECTIONS_LIST>>>

━━━ 기존 문서 전체 (참고용) ━━━
<<<EXISTING_SUMMARY>>>

━━━ 출력 규칙 (반드시 준수) ━━━
1. 수정이 필요한 섹션만 출력하세요. 변경하지 않는 섹션은 출력하지 마세요.
2. 각 수정 섹션은 반드시 아래 구분자로 시작하세요:
   === PATCH_SECTION: [섹션명] ===
   (섹션명은 기존 문서의 ## 헤딩 이름과 정확히 일치시키세요)
3. 기존에 없는 새 섹션을 추가해야 한다면, 새로운 섹션명을 사용해도 됩니다.
4. 모든 텍스트는 한국어로 작성하세요.
5. 위키링크([[이름]]) 문법을 유지하세요.
6. 설명, 메타정보, 전체 문서 출력 없이 오직 수정된 섹션 블록만 출력하세요.

━━━ 출력 예시 ━━━
=== PATCH_SECTION: 역사 ===
수정된 역사 섹션 내용...

=== PATCH_SECTION: 응용 사례 ===
추가 또는 수정된 응용 사례 내용..."""

    try:
        existing_extraction = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_extraction").first()
        if not existing_extraction:
            db.add(schema.SystemPrompt(
                key="knowledge_extraction",
                name="[1단계] 지식 구조 추출",
                content=DEFAULT_EXTRACTION_PROMPT,
                description="주어진 텍스트로부터 문서와 관계를 JSON 형태로 추출합니다. plan_summary + <<<EXISTING_ENTITIES>>> 플레이스홀더 필수 유지"
            ))
        existing_gen = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_generation").first()
        if not existing_gen:
            db.add(schema.SystemPrompt(
                key="knowledge_generation",
                name="[2단계] 위키백과 마크다운 생성",
                content=DEFAULT_GENERATION_PROMPT,
                description="추출된 지식 플랜을 기반으로 상세한 위키 문서를 작성합니다. (DOCUMENT_SEPARATOR 규칙 필수 유지)"
            ))
        existing_patch = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_patch").first()
        if not existing_patch:
            db.add(schema.SystemPrompt(
                key="knowledge_patch",
                name="[2단계-B] 기존 문서 개선 (섹션 단위 패치)",
                content=DEFAULT_PATCH_PROMPT,
                description="기존 위키 문서에서 변경 섹션만 반환합니다. <<<ENTITY_NAME>>>, <<<ENTITY_TYPE>>>, <<<PATCH_DESCRIPTION>>>, <<<SECTIONS_LIST>>>, <<<EXISTING_SUMMARY>>>, <<<SOURCE_TEXT>>> 플레이스홀더 유지"
            ))
        db.commit()
    finally:
        db.close()


# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://autowikiai.xyz",
        "https://www.autowikiai.xyz",
        "https://autowiki-frontend.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "AutoWiki AI"}

# ──────────────────────────────────────
# Auth Endpoints
# ──────────────────────────────────────

class PollPayload(BaseModel):
    device_code: str

@app.post("/api/auth/device-code")
def request_device_code():
    try:
        res = httpx.post(
            "https://github.com/login/device/code",
            headers={"Accept": "application/json"},
            data={"client_id": CLIENT_ID, "scope": "read:user"},
        )
        res.raise_for_status()
        return res.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db=Depends(get_db)):
    token = credentials.credentials
    user = db.query(schema.User).filter(schema.User.access_token == token).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid auth token. Please login again.")
    return user

@app.post("/api/auth/poll")
def poll_for_token(payload: PollPayload, db=Depends(get_db)):
    try:
        res = httpx.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": CLIENT_ID,
                "device_code": payload.device_code,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            },
        ).json()
        
        if "access_token" in res:
            access_token = res["access_token"]
            from langchain_githubcopilot_chat.auth import COPILOT_DEFAULT_HEADERS
            debug_hdrs = {"Authorization": f"token {access_token}", "Accept": "application/json", **COPILOT_DEFAULT_HEADERS}
            with httpx.Client() as client:
                dbg_res = client.get("https://api.github.com/copilot_internal/v2/token", headers=debug_hdrs)
                if dbg_res.status_code == 200:
                    data = dbg_res.json()
                    copilot_token = data.get("token")
                    expires_at = data.get("expires_at")
                    if copilot_token:
                        save_tokens_to_cache(access_token, copilot_token, expires_at)
                        
                        # Fetch GitHub User info
                        user_res = client.get("https://api.github.com/user", headers={"Authorization": f"Bearer {access_token}"})
                        if user_res.status_code == 200:
                            user_data = user_res.json()
                            github_id = str(user_data.get("id"))
                            username = user_data.get("login")
                            avatar_url = user_data.get("avatar_url")
                            
                            # Create or Update User in DB
                            user = db.query(schema.User).filter(schema.User.github_id == github_id).first()
                            if not user:
                                user = schema.User(github_id=github_id, username=username, avatar_url=avatar_url, access_token=access_token)
                                db.add(user)
                            else:
                                user.username = username
                                user.avatar_url = avatar_url
                                user.access_token = access_token
                            db.commit()
                            db.refresh(user)
                            
                            return {
                                "status": "success", 
                                "message": "Authenticated successfully",
                                "access_token": access_token,
                                "user": {
                                    "id": user.id,
                                    "username": user.username,
                                    "avatar_url": user.avatar_url
                                }
                            }
                        else:
                            raise HTTPException(status_code=401, detail="Failed to fetch GitHub user info")
                
                error_detail = f"Copilot Token API Error: {dbg_res.status_code} - Body: {dbg_res.text}"
                print(f"[AUTH ERROR] {error_detail}")
                raise HTTPException(status_code=401, detail=error_detail)
        elif res.get("error") in ["authorization_pending", "slow_down"]:
            print(f"[AUTH POLL DEBUG] Still pending. GitHub response: {res}")
            return {"status": "pending"}
        else:
            print(f"[AUTH OAUTH ERROR] GitHub responded with: {res}")
            raise HTTPException(status_code=400, detail=f"Auth error: {res.get('error_description', res)}")
    except HTTPException as he:
        raise he
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/auth/status")
def get_auth_status():
    tokens = load_tokens_from_cache()
    if tokens.get("copilot_token") or tokens.get("github_token"):
        return {"status": "active"}
    return {"status": "expired"}


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

def get_project_graph_context(project_id: int, db) -> str:
    """프로젝트의 모든 관계를 텍스트로 요약하여 AI에게 컨텍스트로 제공합니다."""
    # Only collect relationships where both nodes exist
    entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    entity_slugs = {e.slug for e in entities}
    
    relationships = db.query(schema.Relationship).all()
    rel_texts = []
    for r in relationships:
        if r.source_entity_slug in entity_slugs and r.target_entity_slug in entity_slugs:
            rel_texts.append(f"- {r.source_entity_slug} -> {r.target_entity_slug} ({r.context})")
    
    if not rel_texts:
        return "(현재 등록된 관계 없음)"
    return "\n".join(rel_texts)

def get_storage_usage(user_id: int, db) -> int:
    projects = db.query(schema.Project).filter(schema.Project.user_id == user_id).all()
    project_ids = [p.id for p in projects]
    if not project_ids:
        return 0
    docs = db.query(schema.Document.content_text).filter(schema.Document.project_id.in_(project_ids)).all()
    doc_bytes = sum(len(d[0].encode('utf-8')) for d in docs if d[0])
    entities = db.query(schema.Entity.summary).filter(schema.Entity.project_id.in_(project_ids)).all()
    entity_bytes = sum(len(e[0].encode('utf-8')) for e in entities if e[0])
    project_files = db.query(schema.ProjectFile.content_text).filter(schema.ProjectFile.project_id.in_(project_ids)).all()
    file_bytes = sum(len(f[0].encode('utf-8')) for f in project_files if f[0])
    return doc_bytes + entity_bytes + file_bytes

@app.get("/api/users/me")
def get_user_me(user=Depends(get_current_user), db=Depends(get_db)):
    usage = get_storage_usage(user.id, db)
    return {
        "id": user.id,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "storage_used": usage,
        "storage_limit": 10485760
    }

@app.post("/api/projects")
def create_project(name: str = Form(...), description: str = Form(""), user=Depends(get_current_user), db=Depends(get_db)):
    slug = name.strip().lower().replace(" ", "-")
    slug = re.sub(r'[^a-z0-9가-힣\-]', '', slug) or "project"
    slug = f"{user.username}-{slug}"
    existing = db.query(schema.Project).filter(schema.Project.slug == slug).first()
    if existing:
        slug = f"{slug}-1"
    
    project = schema.Project(name=name.strip(), slug=slug, description=description.strip(), user_id=user.id)
    db.add(project)
    db.commit()
    db.refresh(project)
    return {"id": project.id, "name": project.name, "slug": project.slug}

@app.get("/api/projects")
def list_projects(user=Depends(get_current_user), db=Depends(get_db)):
    projects = db.query(schema.Project).filter(schema.Project.user_id == user.id).order_by(schema.Project.created_date.desc()).all()
    result = []
    for p in projects:
        doc_count = db.query(schema.Document).filter(schema.Document.project_id == p.id).count()
        entity_count = db.query(schema.Entity).filter(schema.Entity.project_id == p.id).count()
        result.append({
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "description": p.description,
            "doc_count": doc_count,
            "entity_count": entity_count,
            "created_date": p.created_date.strftime("%Y-%m-%d %H:%M") if p.created_date else ""
        })
    return result

# Text-only analysis (no file required)
class TextAnalysisRequest(BaseModel):
    text: str
    custom_prompt: str = ""
    model_name: str = ""
    api_key: str = ""
    thinking_level: Optional[str] = None
    reasoning_effort: Optional[str] = None

@app.post("/api/projects/{project_id}/analyze-text")
def analyze_text(project_id: int, payload: TextAnalysisRequest, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    prompt_record = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_extraction").first()
    system_prompt = prompt_record.content if prompt_record else ""

    existing = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    # Provide more context to the planner: Name, Type, and a snippet of the current summary
    existing_entities = []
    for e in existing:
        summary_snippet = (e.summary or "").replace("\n", " ")[:1000]
        existing_entities.append(f"- **{e.name}** (slug: {e.slug}, 타입: {e.type}): {summary_snippet}...")

    # Collect all categories for global structure context
    all_cat_records = db.query(schema.Category).all()
    all_categories = [c.name for c in all_cat_records]

    # Collect project graph context
    project_graph = get_project_graph_context(project_id, db)

    # Auto-load selected project reference files
    selected_pf = db.query(schema.ProjectFile).filter(
        schema.ProjectFile.project_id == project_id,
        schema.ProjectFile.is_selected == True
    ).all()
    files_text = [f"[{pf.filename}]\n{pf.content_text}" for pf in selected_pf]
    project_files_text = "\n\n".join(files_text)

    llm = get_llm(payload.model_name, payload.api_key, payload.thinking_level, payload.reasoning_effort)
    plan = plan_knowledge_extraction(
        payload.text, payload.custom_prompt, llm, system_prompt, existing_entities, all_categories, project_files_text, project_graph=project_graph
    )

    # Filter out hallucinations: deletions or patches for non-existent entities
    existing_slugs = {e.slug for e in existing}
    valid_patches = [p.dict() for p in plan.patches if p.entity_slug in existing_slugs]
    valid_deletions = [d.dict() for d in plan.deletions if d.entity_slug in existing_slugs]

    return {
        "proposals": [{
            "filename": "(직접 입력)",
            "content_text": payload.text,
            "plan_summary": plan.plan_summary,
            "patches": valid_patches,
            "deletions": valid_deletions,
            "nodes": [n.dict() for n in plan.nodes],
            "edges": [e.dict() for e in plan.edges]
        }]
    }

@app.get("/api/projects/{project_id}")
def get_project(project_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).order_by(schema.Entity.id.desc()).all()
    entity_list = []
    for e in entities:
        cats = [c.name for c in e.categories]
        entity_list.append({
            "slug": e.slug,
            "name": e.name,
            "type": e.type,
            "categories": cats
        })
    
    return {
        "id": project.id,
        "name": project.name,
        "slug": project.slug,
        "description": project.description,
        "entities": entity_list
    }

class ProjectUpdate(BaseModel):
    name: str
    description: str = ""

@app.patch("/api/projects/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    project.name = payload.name.strip()
    project.description = payload.description.strip()
    db.commit()
    db.refresh(project)
    return {"id": project.id, "name": project.name, "description": project.description}

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Cascade delete relationships for all entities in this project
    entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    for e in entities:
        db.query(schema.Relationship).filter(
            (schema.Relationship.source_entity_slug == e.slug) |
            (schema.Relationship.target_entity_slug == e.slug)
        ).delete(synchronize_session=False)
    
    db.delete(project)
    db.commit()
    return {"status": "deleted", "project_id": project_id}

class ChatRequest(BaseModel):
    message: str
    history: List[dict]
    model_name: str = ""
    api_key: str = ""
    session_id: Optional[int] = None
    thinking_level: Optional[str] = None
    reasoning_effort: Optional[str] = None

@app.post("/api/projects/{project_id}/chat")
def project_chat(project_id: int, payload: ChatRequest, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    session = None
    if payload.session_id:
        session = db.query(schema.ChatSession).filter(schema.ChatSession.id == payload.session_id, schema.ChatSession.project_id == project_id).first()
        if not session:
            raise HTTPException(status_code=404, detail="Chat session not found")
    else:
        title_text = payload.message[:30] + "..." if len(payload.message) > 30 else payload.message
        session = schema.ChatSession(project_id=project_id, title=title_text)
        db.add(session)
        db.commit()
        db.refresh(session)
        if payload.history:
            for h in payload.history:
                db.add(schema.ChatMessage(session_id=session.id, role=h.get("role", "assistant"), content=h.get("content", "")))
            db.commit()

    db.add(schema.ChatMessage(session_id=session.id, role="user", content=payload.message))
    db.commit()

    entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    project_context = ""
    for e in entities:
        categories = ", ".join([c.name for c in e.categories])
        project_context += f"- **{e.name}** ({e.type}, 분류: {categories})\n  {e.summary[:1000]}...\n\n"
        
    if not project_context:
        project_context = "이 프로젝트에는 아직 등록된 문서/데이터가 없습니다."

    selected_pf = db.query(schema.ProjectFile).filter(
        schema.ProjectFile.project_id == project_id,
        schema.ProjectFile.is_selected == True
    ).all()
    files_text = [f"[{pf.filename}]\n{pf.content_text}" for pf in selected_pf]
    project_files_text = "\n\n".join(files_text)

    llm = get_llm(payload.model_name, payload.api_key, payload.thinking_level, payload.reasoning_effort)
    
    reply = execute_project_chat(
        message=payload.message,
        history=payload.history,
        project_context=project_context,
        llm=llm,
        project_files_text=project_files_text
    )
    
    db.add(schema.ChatMessage(session_id=session.id, role="assistant", content=reply))
    session.updated_date = datetime.datetime.utcnow()
    db.commit()
    
    return {"reply": reply, "session_id": session.id}

@app.get("/api/projects/{project_id}/chat-sessions")
def list_chat_sessions(project_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    sessions = db.query(schema.ChatSession).filter(schema.ChatSession.project_id == project_id).order_by(schema.ChatSession.updated_date.desc()).all()
    return [{
        "id": s.id,
        "title": s.title,
        "updated_date": s.updated_date.isoformat()
    } for s in sessions]

@app.get("/api/projects/{project_id}/chat-sessions/{session_id}")
def get_chat_session(project_id: int, session_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    session = db.query(schema.ChatSession).filter(schema.ChatSession.id == session_id, schema.ChatSession.project_id == project_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    messages = db.query(schema.ChatMessage).filter(schema.ChatMessage.session_id == session_id).order_by(schema.ChatMessage.created_date.asc()).all()
    
    return {
        "id": session.id,
        "title": session.title,
        "messages": [{"role": m.role, "content": m.content} for m in messages]
    }

@app.delete("/api/projects/{project_id}/chat-sessions/{session_id}")
def delete_chat_session(project_id: int, session_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    session = db.query(schema.ChatSession).filter(schema.ChatSession.id == session_id, schema.ChatSession.project_id == project_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    db.delete(session)
    db.commit()
    return {"status": "deleted"}

# ──────────────────────────────────────
# Upload (Project-scoped)
# ──────────────────────────────────────

@app.post("/api/projects/{project_id}/upload")
async def upload_files(
    project_id: int,
    files: list[UploadFile] = File(...),
    custom_prompt: str = Form(""),
    model_name: str = Form(""),
    sub_model_name: str = Form(""),
    api_key: str = Form(""),
    thinking_level: str = Form(None),
    reasoning_effort: str = Form(None),
    user=Depends(get_current_user),
    db=Depends(get_db)
):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if get_storage_usage(user.id, db) >= 10485760:
        raise HTTPException(status_code=413, detail="Storage limit (10MB) exceeded.")

    prompt_record = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_extraction").first()
    system_prompt = prompt_record.content if prompt_record else ""

    # Collect existing entity context (Name, Type, Summary) to help planner avoid duplicates and plan patches
    existing = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    existing_entities = []
    for e in existing:
        summary_snippet = (e.summary or "").replace("\n", " ")[:1000]
        existing_entities.append(f"- **{e.name}** (slug: {e.slug}, 타입: {e.type}): {summary_snippet}...")

    # Collect all categories for global structure context
    all_cat_records = db.query(schema.Category).all()
    all_categories = [c.name for c in all_cat_records]

    # Collect project graph context
    project_graph = get_project_graph_context(project_id, db)

    # Auto-load selected project reference files
    selected_pf = db.query(schema.ProjectFile).filter(
        schema.ProjectFile.project_id == project_id,
        schema.ProjectFile.is_selected == True
    ).all()
    files_text = [f"[{pf.filename}]\n{pf.content_text}" for pf in selected_pf]
    project_files_text = "\n\n".join(files_text)

    # Use sub_model for extraction (cheaper), fall back to main model if not set
    extraction_model = sub_model_name if sub_model_name else model_name

    results = []
    from services.langchain_service import extract_text_from_file
    for file in files:
        try:
            full_text = await extract_text_from_file(file)
            if not full_text.strip():
                continue

            # NOTE: ProjectFile is NOT saved here.
            # It is only saved upon commit so that cancelling (going back) does not
            # leave orphaned reference files in the project.
            res = await extract_proposals(file.filename, full_text, custom_prompt, extraction_model, api_key, system_prompt, existing_entities, all_categories, project_files_text, thinking_level, reasoning_effort, project_graph=project_graph)
            
            # Filter out hallucinations: deletions or patches for non-existent entities
            existing_slugs = {e.slug for e in existing}
            res["patches"] = [p for p in res.get("patches", []) if p.get("entity_slug") in existing_slugs]
            res["deletions"] = [d for d in res.get("deletions", []) if d.get("entity_slug") in existing_slugs]
            
            results.append(res)
        except HTTPException:
            raise
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=f"파일 처리 중 오류 발생: {str(e)}")

    return {
        "message": f"Processed {len(files)} files successfully",
        "proposals": results
    }

@app.post("/api/projects/{project_id}/commit")
def commit_changes(project_id: int, payload_data: dict, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if get_storage_usage(user.id, db) >= 10485760:
        raise HTTPException(status_code=413, detail="Storage limit (10MB) exceeded. Cannot commit more data.")

    proposals = payload_data.get("proposals", [])
    custom_prompt = payload_data.get("custom_prompt", "")
    model_name = payload_data.get("model_name", "")
    sub_model_name = payload_data.get("sub_model_name", "")
    api_key = payload_data.get("api_key", "")
    thinking_level = payload_data.get("thinking_level")
    reasoning_effort = payload_data.get("reasoning_effort")
    
    prompt_record = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_generation").first()
    system_prompt = prompt_record.content if prompt_record else ""
    
    # Auto-load selected project reference files
    selected_pf = db.query(schema.ProjectFile).filter(
        schema.ProjectFile.project_id == project_id,
        schema.ProjectFile.is_selected == True
    ).all()
    files_text = [f"[{pf.filename}]\n{pf.content_text}" for pf in selected_pf]
    project_files_text = "\n\n".join(files_text)

    # Collect project graph context
    project_graph = get_project_graph_context(project_id, db)

    # Commit uses main model for generation (heavy writing task)
    llm = get_llm(model_name, api_key, thinking_level, reasoning_effort)
    # payload_data will contain a "proposals" array
    proposals = payload_data.get("proposals", [])
    
    nodes_saved = 0
    edges_saved = 0
    
    for prop in proposals:
        filename = prop.get("filename")
        content_text = prop.get("content_text")
        nodes_data = prop.get("nodes", [])
        edges_data = prop.get("edges", [])

        # Save ProjectFile on commit (only if it came from an actual file, not text input)
        if filename and filename != "(직접 입력)" and content_text:
            existing_pf = db.query(schema.ProjectFile).filter(
                schema.ProjectFile.project_id == project_id,
                schema.ProjectFile.filename == filename
            ).first()
            if not existing_pf:
                pf = schema.ProjectFile(
                    project_id=project_id,
                    filename=filename,
                    content_text=content_text,
                    is_selected=True
                )
                db.add(pf)
                db.commit()

        # Save Document
        db_doc = schema.Document(filename=filename, content_text=content_text, project_id=project_id)
        db.add(db_doc)
        db.commit()
        db.refresh(db_doc)
        
        # Save Nodes
        nodes_to_generate = []
        for n in nodes_data:
            existing = db.query(schema.Entity).filter(schema.Entity.slug == n["id"]).first()
            if not existing:
                nodes_to_generate.append(n)
                
        # Process in batches of 4 to maximize token utilization without hitting output limits
        batch_size = 4
        for i in range(0, len(nodes_to_generate), batch_size):
            batch = nodes_to_generate[i:i+batch_size]
            
            # Execution Phase: Generate the heavy Markdown multiplexed string via LLM
            batch_result_string = execute_batch_knowledge_generation(
                nodes_batch=batch,
                text=content_text,
                custom_prompt=custom_prompt,
                llm=llm,
                system_prompt=system_prompt,
                project_files_text=project_files_text,
                project_graph=project_graph
            )
            
            # Parse the multiplexed string using Regex
            chunks = re.split(r'===\s*DOCUMENT_SEPARATOR:\s*(.*?)\s*===', batch_result_string)
            doc_map = {}
            if len(chunks) > 1:
                # chunks[0] is preamble. Even indexes are content, odd indices are captured names.
                for j in range(1, len(chunks), 2):
                    extracted_name = chunks[j].strip()
                    extracted_content = chunks[j+1].strip() if j+1 < len(chunks) else "내용 없음"
                    doc_map[extracted_name] = extracted_content
            
            # Iterate through the requested batch and map the parsed string chunks safely
            for n in batch:
                generated_summary = doc_map.get(n["name"])
                
                # Fuzzy fallback if naming mismatch occurs
                if not generated_summary:
                    if doc_map:
                        fallback_key = list(doc_map.keys())[0]
                        generated_summary = doc_map.pop(fallback_key)
                    else:
                        generated_summary = "문서 생성에 실패하거나 구분자를 인식하지 못했습니다."
                else:
                    del doc_map[n["name"]]
                    
                db_entity = schema.Entity(
                    slug=n["id"], 
                    name=n["name"], 
                    type=n["type"], 
                    summary=generated_summary,
                    is_root=n.get("is_root", False),
                    document_id=db_doc.id,
                    project_id=project_id
                )
                db.add(db_entity)
                db.commit()
                db.refresh(db_entity)

                # Save categories
                for cat_name in n.get("categories", []):
                    cat_slug = slugify(cat_name)
                    cat = db.query(schema.Category).filter(schema.Category.slug == cat_slug).first()
                    if not cat:
                        cat = schema.Category(slug=cat_slug, name=cat_name)
                        db.add(cat)
                        db.commit()
                        db.refresh(cat)
                    db_entity.categories.append(cat)

                nodes_saved += 1
                
        # Save Edges
        for e in edges_data:
            db_edge = schema.Relationship(
                source_entity_slug=e["source"],
                target_entity_slug=e["target"],
                context=e["label"]
            )
            db.add(db_edge)
            edges_saved += 1
            
    # ── Process approved deletions ──────────────────────────────────────────────
    deletions_processed = 0
    for prop in proposals:
        deletions_data = prop.get("deletions", [])
        for dl in deletions_data:
            entity_slug = dl.get("entity_slug")
            if not entity_slug:
                continue

            # Delete relationships connected to this entity
            db.query(schema.Relationship).filter(
                (schema.Relationship.source_entity_slug == entity_slug) |
                (schema.Relationship.target_entity_slug == entity_slug)
            ).delete(synchronize_session=False)

            # Delete entity
            db.query(schema.Entity).filter(
                schema.Entity.slug == entity_slug,
                schema.Entity.project_id == project_id
            ).delete(synchronize_session=False)
            deletions_processed += 1
            
    # ── Process approved patches (modifications to existing documents) ──────────
    patch_prompt_record = db.query(schema.SystemPrompt).filter(schema.SystemPrompt.key == "knowledge_patch").first()
    patch_system_prompt = patch_prompt_record.content if patch_prompt_record else ""
    patches_saved = 0

    for prop in proposals:
        content_text = prop.get("content_text", "")
        patches_data = prop.get("patches", [])
        for patch in patches_data:
            entity_slug = patch.get("entity_slug")
            patch_desc  = patch.get("changes")
            if not entity_slug or not patch_desc:
                continue
            existing_entity = db.query(schema.Entity).filter(schema.Entity.slug == entity_slug).first()
            if not existing_entity or not existing_entity.summary:
                continue
            updated_summary = execute_section_patch(
                existing_summary=existing_entity.summary,
                entity_name=existing_entity.name,
                entity_type=existing_entity.type,
                patch_description=patch_desc,
                source_text=content_text,
                llm=llm,
                system_prompt=patch_system_prompt,
                project_files_text=project_files_text,
                project_graph=project_graph
            )
            existing_entity.summary = updated_summary
            patches_saved += 1

    db.commit()

    return {
        "status": "success",
        "message": f"Committed {nodes_saved} nodes, {edges_saved} edges, {patches_saved} patches, and {deletions_processed} deletions."
    }

# ──────────────────────────────────────
# Wiki Endpoints
# ──────────────────────────────────────

@app.get("/api/wiki/resolve")
def resolve_wiki_name(name: str, db=Depends(get_db)):
    """Resolve a Korean display name to its correct English slug."""
    # Exact name match first
    entity = db.query(schema.Entity).filter(
        schema.Entity.name == name
    ).first()
    
    # Fuzzy: normalise spaces/hyphens for comparison
    if not entity:
        normalised = name.strip().replace("-", " ").lower()
        all_entities = db.query(schema.Entity).all()
        for e in all_entities:
            if e.name.strip().replace("-", " ").lower() == normalised:
                entity = e
                break
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found by name")
    
    return {"slug": entity.slug, "name": entity.name}

class BulkResolveRequest(BaseModel):
    names: List[str]

@app.post("/api/wiki/bulk-resolve")
def bulk_resolve_wiki_names(payload: BulkResolveRequest, db=Depends(get_db)):
    """
    주어진 이름 목록 중 실제로 존재하는 엔티티만 반환합니다.
    반환 형식: { "name": "slug" } 매핑
    """
    all_entities = db.query(schema.Entity).all()
    name_to_slug: dict[str, str] = {}
    for e in all_entities:
        name_to_slug[e.name.strip()] = e.slug

    result: dict[str, str] = {}
    for raw_name in payload.names:
        name = raw_name.strip()
        if name in name_to_slug:
            result[name] = name_to_slug[name]
            continue
        # Fuzzy: normalise spaces/hyphens
        normalised = name.replace("-", " ").lower()
        for ent_name, slug in name_to_slug.items():
            if ent_name.replace("-", " ").lower() == normalised:
                result[name] = slug
                break

    return result

@app.get("/api/wiki/{slug}")
def get_wiki_page(slug: str, db=Depends(get_db)):
    entity = db.query(schema.Entity).filter(schema.Entity.slug == slug).first()
    
    # Fallback: try to find by name (slug might be Korean-derived)
    if not entity:
        name_from_slug = slug.replace("-", " ")
        entity = db.query(schema.Entity).filter(
            schema.Entity.name == name_from_slug
        ).first()
    
    if not entity:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    
    cats = [{"name": c.name, "slug": c.slug} for c in entity.categories]
    return {
        "slug": entity.slug,
        "title": entity.name,
        "tags": [entity.type],
        "content": entity.summary,
        "categories": cats,
        "project_id": entity.project_id
    }

@app.delete("/api/wiki/{slug}")
def delete_wiki_page(slug: str, db=Depends(get_db)):
    entity = db.query(schema.Entity).filter(schema.Entity.slug == slug).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    
    db.query(schema.Relationship).filter(
        (schema.Relationship.source_entity_slug == slug) |
        (schema.Relationship.target_entity_slug == slug)
    ).delete(synchronize_session=False)
    
    db.delete(entity)
    db.commit()
    return {"status": "deleted", "slug": slug}

@app.get("/api/wikis")
def get_recent_wikis(project_id: int = Query(None), db=Depends(get_db)):
    query = db.query(schema.Entity)
    if project_id:
        query = query.filter(schema.Entity.project_id == project_id)
    entities = query.order_by(schema.Entity.id.desc()).limit(20).all()
    
    result = []
    for e in entities:
        doc = db.query(schema.Document).filter(schema.Document.id == e.document_id).first()
        date_str = doc.upload_date.strftime("%Y-%m-%d %H:%M") if doc else "Unknown"
        result.append({
            "title": e.name,
            "tag": e.type,
            "date": date_str,
            "slug": e.slug
        })
    return result

# ──────────────────────────────────────
# Graph Endpoint
# ──────────────────────────────────────

@app.get("/api/graph")
def get_graph_data(project_id: int = Query(None), db=Depends(get_db)):
    if project_id:
        entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
        entity_slugs = {e.slug for e in entities}
        # Optimize: Only fetch relationships that belong to this project's entities
        relationships = db.query(schema.Relationship).filter(
            schema.Relationship.source_entity_slug.in_(entity_slugs),
            schema.Relationship.target_entity_slug.in_(entity_slugs)
        ).all()
    else:
        entities = db.query(schema.Entity).all()
        relationships = db.query(schema.Relationship).all()
    
    color_map = {
        # ── 표준 6가지 타입 (현행 프롬프트 기준) ──
        "개념": "#a855f7",   # 보라
        "인물": "#3b82f6",   # 파랑
        "단체": "#f59e0b",   # 황금
        "장소": "#10b981",   # 에메랄드
        "사건": "#ec4899",   # 핑크
        "사물": "#06b6d4",   # 시안
        # ── 구형 타입 하위 호환 ──
        "기술": "#06b6d4",
        "프로젝트": "#ec4899",
        "조직": "#f59e0b",
        "이론": "#10b981",
        "방법론": "#8b5cf6",
    }
    
    nodes = []
    for e in entities:
        t = (e.type or "").strip()
        color = color_map.get(t, "#c084fc")
        nodes.append({
            "id": e.slug,
            "name": e.name,
            "type": t,        # 분류 (프론트 색상 매핑에 필요)
            "val": 15,
            "color": color,
            "is_root": e.is_root
        })

    links = []
    for r in relationships:
        links.append({
            "id": r.id,
            "source": r.source_entity_slug,
            "target": r.target_entity_slug,
            "label": r.context
        })
        
    return {"nodes": nodes, "links": links}

# ──────────────────────────────────────
# Graph Edit Endpoints
# ──────────────────────────────────────

class EntityUpdate(BaseModel):
    name: str
    type: str

@app.patch("/api/entities/{slug}")
def update_entity(slug: str, payload: EntityUpdate, db=Depends(get_db)):
    """노드 이름/타입 수정"""
    entity = db.query(schema.Entity).filter(schema.Entity.slug == slug).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    entity.name = payload.name.strip()
    entity.type = payload.type.strip()
    db.commit()
    db.refresh(entity)
    return {"slug": entity.slug, "name": entity.name, "type": entity.type}

class RelationshipCreate(BaseModel):
    source: str
    target: str
    label: str = ""

@app.post("/api/relationships")
def create_relationship(payload: RelationshipCreate, db=Depends(get_db)):
    """엣지(관계) 신규 생성"""
    src = db.query(schema.Entity).filter(schema.Entity.slug == payload.source).first()
    tgt = db.query(schema.Entity).filter(schema.Entity.slug == payload.target).first()
    if not src or not tgt:
        raise HTTPException(status_code=404, detail="Source or target entity not found")
    rel = schema.Relationship(
        source_entity_slug=payload.source,
        target_entity_slug=payload.target,
        context=payload.label
    )
    db.add(rel)
    db.commit()
    db.refresh(rel)
    return {"id": rel.id, "source": rel.source_entity_slug, "target": rel.target_entity_slug, "label": rel.context}

class RelationshipUpdate(BaseModel):
    label: str

@app.patch("/api/relationships/{rel_id}")
def update_relationship(rel_id: int, payload: RelationshipUpdate, db=Depends(get_db)):
    """엣지 레이블 수정"""
    rel = db.query(schema.Relationship).filter(schema.Relationship.id == rel_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    rel.context = payload.label
    db.commit()
    return {"id": rel.id, "source": rel.source_entity_slug, "target": rel.target_entity_slug, "label": rel.context}

@app.delete("/api/relationships/{rel_id}")
def delete_relationship(rel_id: int, db=Depends(get_db)):
    """엣지 삭제"""
    rel = db.query(schema.Relationship).filter(schema.Relationship.id == rel_id).first()
    if not rel:
        raise HTTPException(status_code=404, detail="Relationship not found")
    db.delete(rel)
    db.commit()
    return {"status": "deleted", "id": rel_id}



@app.get("/api/categories")
def list_categories(db=Depends(get_db)):
    categories = db.query(schema.Category).order_by(schema.Category.name).all()
    result = []
    for c in categories:
        result.append({
            "slug": c.slug,
            "name": c.name,
            "entity_count": len(c.entities)
        })
    return result

@app.get("/api/categories/{slug}")
def get_category(slug: str, db=Depends(get_db)):
    category = db.query(schema.Category).filter(schema.Category.slug == slug).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    entities = [{"slug": e.slug, "name": e.name, "type": e.type} for e in category.entities]
    return {
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "entities": entities
    }

# ──────────────────────────────────────
# Project Files Endpoints
# ──────────────────────────────────────

@app.get("/api/projects/{project_id}/files")
def list_project_files(project_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    files = db.query(schema.ProjectFile).filter(schema.ProjectFile.project_id == project_id).order_by(schema.ProjectFile.upload_date.desc()).all()
    return [{"id": f.id, "filename": f.filename, "upload_date": f.upload_date.isoformat() if f.upload_date else None, "size": len(f.content_text.encode('utf-8')), "is_selected": bool(f.is_selected)} for f in files]

from services.langchain_service import extract_text_from_file

@app.post("/api/projects/{project_id}/files")
async def add_project_files(project_id: int, files: list[UploadFile] = File(...), user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if get_storage_usage(user.id, db) >= 10485760:
        raise HTTPException(status_code=413, detail="Storage limit (10MB) exceeded. Cannot upload more files.")

    results = []
    for f in files:
        text = await extract_text_from_file(f)
        if not text.strip():
            continue
        pf = schema.ProjectFile(project_id=project_id, filename=f.filename, content_text=text)
        db.add(pf)
        db.flush()
        results.append({"id": pf.id, "filename": pf.filename})
    
    db.commit()
    return {"status": "success", "files": results}

@app.delete("/api/projects/{project_id}/files/{file_id}")
def delete_project_file(project_id: int, file_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    pf = db.query(schema.ProjectFile).filter(schema.ProjectFile.id == file_id, schema.ProjectFile.project_id == project_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
        
    db.delete(pf)
    db.commit()
    return {"status": "success"}

@app.patch("/api/projects/{project_id}/files/{file_id}/toggle")
def toggle_project_file(project_id: int, file_id: int, payload: dict, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    pf = db.query(schema.ProjectFile).filter(schema.ProjectFile.id == file_id, schema.ProjectFile.project_id == project_id).first()
    if not pf:
        raise HTTPException(status_code=404, detail="File not found")
        
    pf.is_selected = payload.get("is_selected", pf.is_selected)
    db.commit()
    return {"status": "success", "is_selected": bool(pf.is_selected)}

# ──────────────────────────────────────
# Export / Import Endpoints
# ──────────────────────────────────────

import json
import datetime as dt
from fastapi.responses import JSONResponse

@app.get("/api/projects/{project_id}/export")
def export_project(project_id: int, db=Depends(get_db)):
    """프로젝트 전체 데이터를 .autowiki JSON 파일로 다운로드합니다."""
    project = db.query(schema.Project).filter(schema.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Entities in this project
    entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    entity_slugs = {e.slug for e in entities}

    # Categories referenced by entities in this project
    cat_slugs_seen: set[str] = set()
    entities_data = []
    for e in entities:
        cats = [c.slug for c in e.categories]
        cat_slugs_seen.update(cats)
        entities_data.append({
            "slug": e.slug,
            "name": e.name,
            "type": e.type,
            "summary": e.summary,
            "categories": cats,
        })

    # Documents
    documents = db.query(schema.Document).filter(schema.Document.project_id == project_id).all()
    documents_data = [
        {
            "filename": d.filename,
            "content_text": d.content_text,
            "upload_date": d.upload_date.isoformat() if d.upload_date else None,
        }
        for d in documents
    ]

    # Relationships (only those connecting entities within this project)
    all_rels = db.query(schema.Relationship).all()
    relationships_data = [
        {
            "source": r.source_entity_slug,
            "target": r.target_entity_slug,
            "context": r.context,
        }
        for r in all_rels
        if r.source_entity_slug in entity_slugs and r.target_entity_slug in entity_slugs
    ]

    # Categories
    categories_data = []
    for slug in cat_slugs_seen:
        cat = db.query(schema.Category).filter(schema.Category.slug == slug).first()
        if cat:
            categories_data.append({
                "slug": cat.slug,
                "name": cat.name,
                "description": cat.description or "",
            })

    payload = {
        "version": "1.0",
        "exported_at": dt.datetime.utcnow().isoformat(),
        "project": {
            "name": project.name,
            "slug": project.slug,
            "description": project.description or "",
            "created_date": project.created_date.isoformat() if project.created_date else None,
        },
        "documents": documents_data,
        "entities": entities_data,
        "relationships": relationships_data,
        "categories": categories_data,
    }

    return JSONResponse(
        content=payload,
        headers={
            "Content-Disposition": "attachment",
        },
    )


@app.post("/api/import")
async def import_project(
    file: UploadFile = File(...),
    overwrite: bool = Query(False),
    db=Depends(get_db),
):
    """
    .autowiki 파일을 가져와 프로젝트를 복원합니다.
    - overwrite=false (기본): 동일한 slug가 있으면 새 slug로 신규 생성
    - overwrite=true: 동일한 slug 프로젝트가 있으면 기존 데이터를 삭제 후 덮어쓰기
    """
    raw = await file.read()
    try:
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="유효하지 않은 .autowiki 파일입니다.")

    project_data = data.get("project", {})
    documents_data = data.get("documents", [])
    entities_data = data.get("entities", [])
    relationships_data = data.get("relationships", [])
    categories_data = data.get("categories", [])

    base_slug = project_data.get("slug", "imported-project")
    project_name = project_data.get("name", "가져온 프로젝트")

    existing_project = db.query(schema.Project).filter(schema.Project.slug == base_slug).first()

    if overwrite and existing_project:
        # ── Overwrite mode: delete existing project data ──────────────────────
        old_entities = db.query(schema.Entity).filter(schema.Entity.project_id == existing_project.id).all()
        old_slugs = {e.slug for e in old_entities}

        # Delete relationships tied to old entities
        for e_slug in old_slugs:
            db.query(schema.Relationship).filter(
                (schema.Relationship.source_entity_slug == e_slug) |
                (schema.Relationship.target_entity_slug == e_slug)
            ).delete(synchronize_session=False)

        # Delete entities & documents (cascade handles entity-category links)
        db.query(schema.Entity).filter(schema.Entity.project_id == existing_project.id).delete(synchronize_session=False)
        db.query(schema.Document).filter(schema.Document.project_id == existing_project.id).delete(synchronize_session=False)

        # Update project meta
        existing_project.name = project_name
        existing_project.description = project_data.get("description", "")
        db.commit()
        project = existing_project
    else:
        # ── New-project mode: ensure unique slug ──────────────────────────────
        final_slug = base_slug
        if existing_project:
            counter = 1
            while db.query(schema.Project).filter(schema.Project.slug == f"{base_slug}-import-{counter}").first():
                counter += 1
            final_slug = f"{base_slug}-import-{counter}"

        project = schema.Project(
            name=project_name,
            slug=final_slug,
            description=project_data.get("description", ""),
        )
        db.add(project)
        db.commit()
        db.refresh(project)

    # ── Restore Categories ────────────────────────────────────────────────────
    cat_map: dict[str, schema.Category] = {}  # original_slug → Category ORM object
    for c in categories_data:
        cat_slug = c["slug"]
        cat = db.query(schema.Category).filter(schema.Category.slug == cat_slug).first()
        if not cat:
            cat = schema.Category(slug=cat_slug, name=c["name"], description=c.get("description", ""))
            db.add(cat)
            db.commit()
            db.refresh(cat)
        cat_map[cat_slug] = cat

    # ── Restore Documents ─────────────────────────────────────────────────────
    for d in documents_data:
        db_doc = schema.Document(
            filename=d.get("filename", "imported"),
            content_text=d.get("content_text", ""),
            project_id=project.id,
        )
        db.add(db_doc)
    db.commit()

    # ── Restore Entities ──────────────────────────────────────────────────────
    slug_remap: dict[str, str] = {}  # original_slug → final_slug (for relationship remapping)
    for e in entities_data:
        orig_slug = e["slug"]
        final_entity_slug = orig_slug

        # If not overwrite mode, avoid slug collision with other projects
        if not overwrite:
            existing_ent = db.query(schema.Entity).filter(schema.Entity.slug == orig_slug).first()
            if existing_ent:
                final_entity_slug = f"{orig_slug}-{project.id}"

        db_entity = schema.Entity(
            slug=final_entity_slug,
            name=e["name"],
            type=e.get("type", ""),
            summary=e.get("summary", ""),
            project_id=project.id,
        )
        db.add(db_entity)
        db.commit()
        db.refresh(db_entity)

        slug_remap[orig_slug] = final_entity_slug

        # Attach categories
        for cat_slug in e.get("categories", []):
            cat = cat_map.get(cat_slug)
            if cat:
                db_entity.categories.append(cat)

    db.commit()

    # ── Restore Relationships ─────────────────────────────────────────────────
    for r in relationships_data:
        src = slug_remap.get(r["source"], r["source"])
        tgt = slug_remap.get(r["target"], r["target"])
        db_rel = schema.Relationship(
            source_entity_slug=src,
            target_entity_slug=tgt,
            context=r.get("context", ""),
        )
        db.add(db_rel)
    db.commit()

    return {
        "status": "success",
        "project_id": project.id,
        "project_name": project.name,
        "project_slug": project.slug,
        "entities_imported": len(entities_data),
        "relationships_imported": len(relationships_data),
        "overwritten": overwrite and existing_project is not None,
    }
