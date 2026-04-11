import os
import datetime
import re
from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import httpx
from typing import List, Optional
from database import engine, Base, get_db
from models import schema
from services.langchain_service import extract_proposals, execute_batch_knowledge_generation, execute_section_patch, apply_section_patches, plan_knowledge_extraction, get_llm, slugify, execute_project_chat, extract_text_from_file
from services.security import token_manager, is_cookie_secure, get_samesite_policy
from services import session as session_service
from services.auth_utils import hash_password, verify_password
from langchain_githubcopilot_chat.auth import (
    CLIENT_ID,
    fetch_copilot_token,
)
import langchain_githubcopilot_chat.auth
import config

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
<<<EXISTING_ENTITIES>>>

[프로젝트 전체 카테고리 목록]
<<<ALL_CATEGORIES>>>

[사용자가 첨부한 참고 파일 목록]
<<<PROJECT_FILES>>>

[기존 지식 그래프 관계도]
<<<PROJECT_GRAPH>>>

사용자의 특별 지시사항: <<<CUSTOM_PROMPT>>>

━━━ 필독: 문서 처리 및 JSON 스키마 규칙 ━━━
모든 개체는 아래 3가지 작업 중 **단 하나에만** 할당되어야 하며, 필드명을 엄격히 준수해야 합니다.

1. **신규 생성 (nodes)**: 기존에 존재하지 않는 새로운 문서를 만들 때 사용하세요.
   - 필드명: `id` (영어 슬러그), `name` (한글명), `type`, `categories`, `is_root`
2. **수정 (patches)**: 기존 문서를 보완/수정할 때 사용하세요.
   - 필드명: **`entity_slug`** (기존 문서 ID), **`entity_name`** (기존 한글명), `changes`
3. **삭제 (deletions)**: 기존 문서를 폐기/병합할 때 사용하세요.
   - 필드명: **`entity_slug`** (기존 문서 ID), **`entity_name`** (기존 한글명), `reason`
   - **절대 규칙**: **삭제(deletions) 목록에 넣은 문서를 다시 생성(nodes) 목록에 올리는 모순된 행위는 절대 금지합니다.** 삭제할 거라면 생성하지 말고, 이름만 바꾸고 싶다면 `patches`를 쓰세요.

━━━ 절대 규칙 ━━━
- **반드시 `plan_summary` 필드를 포함**하여 전체 작업 계획을 한국어 한 문장으로 요약하세요.
- 모든 필드의 텍스트는 한국어(Korean)로 작성하세요. (단, id/entity_slug는 영어 슬러그)
- **JSON 응답은 반드시 { 로 시작하고 } 로 끝나야 하며, 마크다운 코드 블록(```)이나 설명을 일절 포함하지 마세요.**
- `edges`의 label은 "[A시작노드]가 [B도착노드]를 [서술어]" 형태로 작성하세요.
- 전체 edges 수는 nodes 수를 초과하지 않도록 절제하세요.
- 제공된 텍스트가 기존 문서들에 이미 충분히 반영되어 있거나, 추가적인 가치가 있는 새로운 정보가 없다면 억지로 추출하지 마세요. 이 경우 nodes와 patches를 빈 배열([])로 반환하는 것이 올바른 대응입니다.
- 단순히 텍스트에 언급되었다고 해서 모두 추출하는 것이 아니라, 위키 문서로서 독자적인 가치를 지닐 만큼의 유의미한 정보가 포함된 경우에만 추출하세요.

[Perfect JSON Example - 이 구조를 100% 따르세요]
{
  "plan_summary": "인공지능 및 앨런 튜링에 관한 새 문서를 생성하고, 중복된 기존 '알바스 코퍼레이션' 문서를 삭제할 계획입니다.",
  "patches": [
    {"entity_slug": "origin-wiki", "entity_name": "기존 문서", "changes": "최신 연구 내용을 역사 섹션에 보강함"}
  ],
  "deletions": [
    {"entity_slug": "old-duplicate-doc", "entity_name": "중복된 문서", "reason": "신규 생성할 '신규 문서'와 주제가 완전히 겹치므로 삭제함"}
  ],
  "nodes": [
    {"id": "new-ai-doc", "name": "신규 인공지능 문서", "type": "개념", "categories": ["과학"], "is_root": true}
  ],
  "edges": [
    {"source": "new-ai-doc", "target": "origin-wiki", "label": "신규 인공지능 문서가 기존 문서를 참조함"}
  ]
}

분석할 텍스트:
<<<TEXT>>>"""

    DEFAULT_GENERATION_PROMPT = """당신은 위키백과 수준의 백과사전 문서를 작성하는 전문 AI 에디터입니다.
다음 소스 문서를 기반으로, 아래 명시된 **<<<BATCH_SIZE>>>개의 개체(Node)들**에 대한 각각의 상세한 위키 문서를 한번에 작성하세요.

작성 대상 개체들:
<<<TARGET_NODES_INFO>>>

사용자의 특별 지시사항: <<<CUSTOM_PROMPT>>>

[프로젝트 전체 참고 파일]
<<<PROJECT_FILES>>>

[전체 지식 그래프 관계도]
<<<PROJECT_GRAPH>>>

━━━ 절대 규칙 ━━━

1. 각 문서는 반드시 '=== DOCUMENT_SEPARATOR: [개체명] ===' 구분자로 시작하세요.
2. 절대 JSON으로 출력하지 마세요. 오직 마크다운 평문과 구분자만 출력하세요.
3. 모든 텍스트는 반드시 한국어로 작성하세요.
4. 헤딩(##, ###)에는 절대 숫자를 붙이지 마세요 (예: '## 1. 개요' → '## 개요').
5. 목차 내에는 위키링크([[]])를 사용하지 마세요. 위키링크는 본문에만 허용됩니다.
6. 다른 개체를 참조할 때는 [[개체명]] 형식의 위키링크를 사용하세요.
7. 최소 4개 이상의 H2(##) 섹션으로 풍성하게 작성하세요.
8. 코드 블록(```)은 프로그래밍, 컴퓨터 과학 등 IT/기술 관련 문서에만 사용하세요. 일반 인물, 자작 캐릭터, 세계관 설정 문서에는 절대 코드 블록을 포함하지 마세요.


━━━ 사용 가능한 서식 ━━━

▶ 인포박스 (문서 상단 메타 정보 테이블)
| 항목 | 내용 |
| :--- | :--- |
| 유형 | 개념 |
| 카테고리 | 과학, 컴퓨터 과학 |

▶ 목차 (문서 상단 구조 안내)
1. [개요](#개요)
2. [역사](#역사)

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
<<<PROJECT_FILES>>>

[기존 지식 그래프 관계도]
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
    allow_origins=config.ALLOWED_ORIGINS,

    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["Authorization", "X-CSRF-Token", "Content-Type"],
)

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response, JSONResponse

class CSRFMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            # 1. Origin/Referer Check
            origin = request.headers.get("origin")
            referer = request.headers.get("referer")
            
            allowed_origins = config.ALLOWED_ORIGINS

            
            if origin and origin not in allowed_origins:
                return JSONResponse(status_code=403, content={"detail": "CSRF: Invalid Origin"})
            
            # 2. Custom Header Check (X-CSRF-Token)
            # Standard SPA protection: If the header is present, it's not a generic form submit
            if not request.headers.get("x-csrf-token"):
                # We skip this for auth endpoints like login/register if they don't have it yet,
                # but for logged-in requests it should be mandatory.
                # In this implementation, we'll enforce it for all state-changing API calls.
                if not request.url.path.startswith("/api/auth/"):
                     return JSONResponse(status_code=403, content={"detail": "CSRF: Missing X-CSRF-Token header"})

        response = await call_next(request)
        return response

app.add_middleware(CSRFMiddleware)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "AutoWiki AI"}

# ──────────────────────────────────────
# Auth Endpoints
# ──────────────────────────────────────

import secrets
import hashlib

def generate_session_token() -> str:
    return secrets.token_hex(32)

from fastapi import Request

def set_auth_cookie(response: Response, session_id: str):
    frontend_url = config.FRONTEND_URL

    backend_host = "localhost:8000" # Should be dynamic in prod
    
    secure = is_cookie_secure(frontend_url)
    samesite = get_samesite_policy(frontend_url, backend_host)
    
    response.set_cookie(
        key="session_id",
        value=session_id,
        httponly=True,
        secure=secure,
        samesite=samesite,
        max_age=30 * 24 * 60 * 60, # 30 days
        path="/"
    )

# ── Local Auth ──────────────────────────────────────────────────────────────

class LocalRegisterPayload(BaseModel):
    email: str
    password: str
    username: str

class LocalLoginPayload(BaseModel):
    email: str
    password: str

@app.post("/api/auth/local/register")
def local_register(payload: LocalRegisterPayload, request: Request, db=Depends(get_db)):
    existing = db.query(schema.User).filter(schema.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="이미 사용 중인 이메일입니다.")
    if len(payload.password) < 6:
        raise HTTPException(status_code=400, detail="비밀번호는 6자 이상이어야 합니다.")
    
    user = schema.User(
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
        auth_provider="local",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    session = session_service.create_user_session(
        db, user.id, 
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None
    )
    
    response = JSONResponse(content={
        "status": "success",
        "user": {"id": user.id, "username": user.username, "avatar_url": user.avatar_url}
    })
    set_auth_cookie(response, session.id)
    return response

@app.post("/api/auth/local/login")
def local_login(payload: LocalLoginPayload, request: Request, db=Depends(get_db)):
    user = db.query(schema.User).filter(schema.User.email == payload.email).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
    
    session = session_service.create_user_session(
        db, user.id, 
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None
    )
    
    response = JSONResponse(content={
        "status": "success",
        "user": {"id": user.id, "username": user.username, "avatar_url": user.avatar_url}
    })
    set_auth_cookie(response, session.id)
    return response

# ── Google Auth ─────────────────────────────────────────────────────────────

@app.get("/api/auth/google")
def google_login_redirect():
    if not config.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=500, detail="Google OAuth가 설정되지 않았습니다.")
    params = {
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": config.GOOGLE_REDIRECT_URI,

        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
    }
    from urllib.parse import urlencode
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url)

@app.get("/api/auth/google/callback")
def google_callback(code: str, db=Depends(get_db)):
    token_res = httpx.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": config.GOOGLE_CLIENT_ID,
        "client_secret": config.GOOGLE_CLIENT_SECRET,
        "redirect_uri": config.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    }).json()

    
    if "error" in token_res:
        raise HTTPException(status_code=400, detail=token_res.get("error_description", "Google 인증 실패"))
    
    id_token_str = token_res.get("id_token", "")
    
    # Decode JWT payload
    import base64, json as _json
    try:
        payload_b64 = id_token_str.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        user_info = _json.loads(base64.urlsafe_b64decode(payload_b64))
    except Exception:
        raise HTTPException(status_code=400, detail="Google 토큰 파싱 실패")
    
    google_id = user_info.get("sub")
    email = user_info.get("email")
    username = user_info.get("name") or email.split("@")[0]
    avatar_url = user_info.get("picture")
    
    user = db.query(schema.User).filter(schema.User.google_id == google_id).first()
    if not user and email:
        user = db.query(schema.User).filter(schema.User.email == email).first()
        
    if not user:
        user = schema.User(
            google_id=google_id, 
            email=email, 
            username=username, 
            avatar_url=avatar_url, 
            auth_provider="google"
        )
        db.add(user)
    else:
        user.google_id = google_id
        user.avatar_url = avatar_url
        
    token = generate_session_token()
    user.access_token = token
    db.commit()
    db.refresh(user)
    
    session = session_service.create_user_session(
        db, user.id, 
        user_agent="Google-OAuth-Callback" # Simplified
    )
    
    frontend_url = config.FRONTEND_URL

    # Instead of token in URL, we will redirect and rely on the cookie
    # But for now, to avoid breaking frontend immediately during migration, 
    # we might still need a way to let the frontend know login finished.
    # However, the requirement is to REMOVE tokens from browser.
    
    response = RedirectResponse(f"{frontend_url}/login?auth=success")
    set_auth_cookie(response, session.id)
    return response



# ── GitHub Device Flow ───────────────────────────────────────────────────────

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

def get_current_user(request: Request, db=Depends(get_db)):
    session_id = request.cookies.get("session_id")
    if not session_id:
        # Fallback to Authorization header for migration/cross-compat temporarily? 
        # No, the goal is to remove it. 
        raise HTTPException(status_code=401, detail="Authentication required. No session found.")
    
    session = session_service.get_session(db, session_id)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    
    user = db.query(schema.User).filter(schema.User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    
    # Attach session to request state if needed
    request.state.session_id = session_id
    return user

def get_optional_user(request: Request, db=Depends(get_db)):
    session_id = request.cookies.get("session_id")
    if not session_id:
        return None
    session = session_service.get_session(db, session_id)
    if not session:
        return None
    return db.query(schema.User).filter(schema.User.id == session.user_id).first()

@app.post("/api/auth/poll")
def poll_for_token(payload: PollPayload, request: Request, db=Depends(get_db), current_user=Depends(get_optional_user)):
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
            github_access_token = res["access_token"]
            github_refresh_token = res.get("refresh_token") # Might be present if scope 'offline_access' or similar (not currently in scope)
            
            # Exchange the standard access token for a Copilot internal token
            copilot_token, expires_at = fetch_copilot_token(github_access_token)
            
            if copilot_token:
                # We NO LONGER save to standard file cache here (shared cache).
                # Instead, we save to the current user's DB record.
                
                with httpx.Client() as client:
                    # Fetch GitHub User info
                    user_res = client.get("https://api.github.com/user", headers={"Authorization": f"Bearer {github_access_token}"})
                    if user_res.status_code == 200:
                        user_data = user_res.json()
                        github_id = str(user_data.get("id"))
                        username = user_data.get("login")
                        avatar_url = user_data.get("avatar_url")
                        
                        target_user = None
                        is_linking_only = False
                        
                        # Check if another user already owns this GitHub ID
                        existing_github_user = db.query(schema.User).filter(schema.User.github_id == github_id).first()
                        
                        if current_user:
                            # User is ALREADY logged in: Link this GitHub account to the current user
                            if existing_github_user and existing_github_user.id != current_user.id:
                                # Conflict: move the ID to the current user
                                existing_github_user.github_id = None
                                existing_github_user.github_token_enc = None
                                db.commit()
                            
                            target_user = current_user
                            is_linking_only = True
                        else:
                            # Login flow (not logged in yet)
                            target_user = existing_github_user
                        
                        if not target_user:
                            # Create new user for fresh GitHub login
                            target_user = schema.User(
                                github_id=github_id, 
                                username=username, 
                                avatar_url=avatar_url, 
                                auth_provider="github"
                            )
                            db.add(target_user)
                            db.commit()
                            db.refresh(target_user)
                        else:
                            # Update existing user (link or sync)
                            target_user.github_id = github_id
                            if not target_user.avatar_url:
                                target_user.avatar_url = avatar_url
                            if not is_linking_only:
                                target_user.auth_provider = "github"
                        
                        # ENCRYPT AND SAVE TOKENS
                        target_user.github_token_enc = token_manager.encrypt(github_access_token, target_user.encryption_key_version)
                        if github_refresh_token:
                            target_user.github_refresh_token_enc = token_manager.encrypt(github_refresh_token, target_user.encryption_key_version)
                        
                        db.commit()
                        db.refresh(target_user)
                        
                        # Always create/rotate session on login or poll success
                        session = session_service.create_user_session(
                            db, target_user.id,
                            user_agent=request.headers.get("user-agent"),
                            ip_address=request.client.host if request.client else None
                        )
                        
                        response = JSONResponse(content={
                            "status": "success", 
                            "message": "Authenticated successfully",
                            "user": {
                                "id": target_user.id,
                                "username": target_user.username,
                                "avatar_url": target_user.avatar_url
                            }
                        })
                        set_auth_cookie(response, session.id)
                        return response
            
            error_detail = "Copilot 토큰 획득에 실패했습니다. 유료 구독 상태를 확인해 주세요."
            print(f"[AUTH ERROR] {error_detail}")
            raise HTTPException(status_code=401, detail=error_detail)
        
        elif res.get("error") == "slow_down":
            return {"status": "slow_down"}
        elif res.get("error") == "authorization_pending":
            return {"status": "pending"}
        elif res.get("error") == "expired_token":
             raise HTTPException(status_code=400, detail="인증 코드가 만료되었습니다. 다시 시도해 주세요.")
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
def get_auth_status(user=Depends(get_optional_user), db=Depends(get_db)):
    if not user or not user.github_token_enc:
        return {"status": "expired"}
    
    # In a real app, we might check if the token is valid by making a tiny API call
    return {"status": "active"}

@app.post("/api/auth/logout")
def logout(request: Request, db=Depends(get_db)):
    session_id = request.cookies.get("session_id")
    if session_id:
        session_service.delete_session(db, session_id)
    
    response = JSONResponse(content={"status": "success", "message": "Logged out"})
    response.delete_cookie(key="session_id", path="/")
    return response

@app.post("/api/auth/github/disconnect")
def disconnect_github(user=Depends(get_current_user), db=Depends(get_db)):
    """Remove GitHub tokens from the current user account."""
    user.github_id = None
    user.github_token_enc = None
    user.github_refresh_token_enc = None
    db.commit()
    return {"status": "success", "message": "GitHub account disconnected"}


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
    """프로젝트의 모든 관계를 분석하여 고립, 빈약, 루트 미도달 노드를 식별합니다."""
    entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    entity_slugs = {e.slug for e in entities}
    root_slugs = {e.slug for e in entities if e.is_root}
    
    relationships = db.query(schema.Relationship).all()
    rel_texts = []
    
    # 그래프 인접 리스트 구축
    adj = {slug: [] for slug in entity_slugs}
    connection_counts = {slug: 0 for slug in entity_slugs}
    
    for r in relationships:
        if r.source_entity_slug in entity_slugs and r.target_entity_slug in entity_slugs:
            rel_texts.append(f"- [ID: {r.id}] {r.source_entity_slug} -> {r.target_entity_slug} ({r.context})")
            adj[r.source_entity_slug].append(r.target_entity_slug)
            adj[r.target_entity_slug].append(r.source_entity_slug) # 무방향성 도달 체크
            connection_counts[r.source_entity_slug] += 1
            connection_counts[r.target_entity_slug] += 1
    
    # 루트 노드로부터의 도달 가능성 체크 (BFS)
    reachable = set()
    queue = list(root_slugs)
    reachable.update(root_slugs)
    
    idx = 0
    while idx < len(queue):
        curr = queue[idx]
        idx += 1
        for neighbor in adj.get(curr, []):
            if neighbor not in reachable:
                reachable.add(neighbor)
                queue.append(neighbor)
    
    # 분류
    isolated = [s for s, count in connection_counts.items() if count == 0]
    weak = [s for s, count in connection_counts.items() if count == 1]
    unreachable_from_root = [s for s in entity_slugs if s not in reachable and s not in isolated]
    
    context_parts = []
    if rel_texts:
        context_parts.append("[현재 프로젝트의 관계도]\n" + "\n".join(rel_texts))
    else:
        context_parts.append("[현재 프로젝트의 관계도]\n(현재 등록된 관계 없음)")
        
    if isolated:
        context_parts.append("\n[❌ 고립된 노드 (연결 0개)]\n- " + ", ".join(isolated))
    if weak:
        context_parts.append("\n[⚠️ 빈약한 노드 (연결 1개뿐)]\n- " + ", ".join(weak))
        context_parts.append("(위 노드들은 맥락이 부족하므로 다른 지식들과 더 풍부하게 연결해 주세요.)")
    if unreachable_from_root and root_slugs:
        context_parts.append(f"\n[🚫 루트 미도달 노드 (메인 주제 '{', '.join(root_slugs)}'와 단절됨)]\n- " + ", ".join(unreachable_from_root))
        context_parts.append("(위 지식들은 프로젝트의 핵심 줄기에서 벗어나 있습니다. 전체적인 통일성을 위해 적절한 브릿지 관계를 만들어 주세요.)")
        
    return "\n".join(context_parts)

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
        "auth_provider": user.auth_provider,
        "is_github_linked": user.github_token_enc is not None,
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

@app.get("/api/search")
def global_search(q: str = Query(...), user=Depends(get_current_user), db=Depends(get_db)):
    if not q.strip():
        return []
    
    # 1. Search Projects
    projects = db.query(schema.Project).filter(
        schema.Project.user_id == user.id,
        schema.Project.name.ilike(f"%{q}%")
    ).limit(5).all()
    
    # 2. Search Entities (JOIN with Projects to ensure user ownership)
    entities = db.query(schema.Entity).join(
        schema.Project, schema.Entity.project_id == schema.Project.id
    ).filter(
        schema.Project.user_id == user.id,
        schema.Entity.name.ilike(f"%{q}%")
    ).limit(10).all()
    
    results = []
    # Add Projects to results
    for p in projects:
        results.append({
            "type": "project", 
            "name": p.name, 
            "id": p.id, 
            "slug": p.slug,
            "url": f"/dashboard/project/{p.id}"
        })
    
    # Add Entities to results
    for e in entities:
        results.append({
            "type": "entity", 
            "name": e.name, 
            "slug": e.slug, 
            "project_id": e.project_id,
            "url": f"/dashboard/wiki/{e.slug}"
        })
        
    return results

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

    # Decrypt GitHub token if not provided in payload
    gh_token = payload.api_key
    if not gh_token and user.github_token_enc:
        gh_token = token_manager.decrypt(user.github_token_enc, user.encryption_key_version)

    llm = get_llm(payload.model_name, gh_token, payload.thinking_level, payload.reasoning_effort)
    plan = plan_knowledge_extraction(
        payload.text, payload.custom_prompt, llm, system_prompt, existing_entities, all_categories, project_files_text, project_graph=project_graph
    )

    # Filter out hallucinations: deletions or patches for non-existent entities
    existing_slugs = {e.slug for e in existing}
    valid_patches = [p.model_dump() for p in plan.patches if p.entity_slug in existing_slugs]
    valid_deletions = [d.model_dump() for d in plan.deletions if d.entity_slug in existing_slugs]

    return {
        "proposals": [{
            "filename": "(직접 입력)",
            "content_text": payload.text,
            "plan_summary": plan.plan_summary,
            "patches": valid_patches,
            "deletions": valid_deletions,
            "nodes": [n.model_dump() for n in plan.nodes],
            "edges": [e.model_dump() for e in plan.edges]
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

    # Added: Provide the entire graph structure (relationships) to the chat AI
    project_graph_text = get_project_graph_context(project_id, db)

    selected_pf = db.query(schema.ProjectFile).filter(
        schema.ProjectFile.project_id == project_id,
        schema.ProjectFile.is_selected == True
    ).all()
    files_text = [f"[{pf.filename}]\n{pf.content_text}" for pf in selected_pf]
    project_files_text = "\n\n".join(files_text)

    # Decrypt GitHub token if not provided in payload
    gh_token = payload.api_key
    if not gh_token and user.github_token_enc:
        gh_token = token_manager.decrypt(user.github_token_enc, user.encryption_key_version)

    llm = get_llm(payload.model_name, gh_token, payload.thinking_level, payload.reasoning_effort)
    
    reply = execute_project_chat(
        message=payload.message,
        history=payload.history,
        project_context=project_context,
        llm=llm,
        project_files_text=project_files_text,
        project_graph_text=project_graph_text  # Pass the graph text
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
    gh_token = api_key
    if not gh_token and user.github_token_enc:
        gh_token = token_manager.decrypt(user.github_token_enc, user.encryption_key_version)

    llm = get_llm(model_name, gh_token, thinking_level, reasoning_effort)
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
            existing = db.query(schema.Entity).filter(
                schema.Entity.slug == n["id"],
                schema.Entity.project_id == project_id
            ).first()
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

    # ── Process approved edge modifications (patches and deletions) ──────────
    edges_modified = 0
    edges_deleted = 0
    for prop in proposals:
        # Edge Deletions
        edge_deletions_data = prop.get("edge_deletions", [])
        for ed in edge_deletions_data:
            edge_id = ed.get("edge_id")
            if edge_id:
                db.query(schema.Relationship).filter(schema.Relationship.id == edge_id).delete(synchronize_session=False)
                edges_deleted += 1
        
        # Edge Patches
        edge_patches_data = prop.get("edge_patches", [])
        for ep in edge_patches_data:
            edge_id = ep.get("edge_id")
            new_label = ep.get("new_label")
            if edge_id and new_label:
                rel = db.query(schema.Relationship).filter(schema.Relationship.id == edge_id).first()
                if rel:
                    rel.context = new_label
                    edges_modified += 1

    db.commit()

    return {
        "status": "success",
        "message": f"Committed {nodes_saved} nodes, {edges_saved} edges (new), {patches_saved} patches, {deletions_processed} deletions, {edges_modified} edge updates, and {edges_deleted} edge deletions."
    }

# ──────────────────────────────────────
# Wiki Endpoints
# ──────────────────────────────────────

@app.get("/api/wiki/resolve")
def resolve_wiki_name(name: str, project_id: Optional[int] = Query(None), db=Depends(get_db)):
    """Resolve a Korean display name to its correct English slug."""
    # Exact name match first
    query = db.query(schema.Entity).filter(schema.Entity.name == name)
    if project_id:
        query = query.filter(schema.Entity.project_id == project_id)
    entity = query.first()
    
    # Fuzzy: normalise spaces/hyphens for comparison
    if not entity:
        normalised = name.strip().replace("-", " ").lower()
        query = db.query(schema.Entity)
        if project_id:
            query = query.filter(schema.Entity.project_id == project_id)
        all_entities = query.all()
        for e in all_entities:
            if e.name.strip().replace("-", " ").lower() == normalised:
                entity = e
                break
    
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found by name")
    
    return {"slug": entity.slug, "name": entity.name}

class BulkResolveRequest(BaseModel):
    names: List[str]
    project_id: Optional[int] = None

@app.post("/api/wiki/bulk-resolve")
def bulk_resolve_wiki_names(payload: BulkResolveRequest, db=Depends(get_db)):
    """
    주어진 이름 목록 중 실제로 존재하는 엔티티만 반환합니다.
    반환 형식: { "name": "slug" } 매핑
    """
    query = db.query(schema.Entity)
    if payload.project_id:
        query = query.filter(schema.Entity.project_id == payload.project_id)
    all_entities = query.all()
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
def get_wiki_page(slug: str, project_id: Optional[int] = Query(None), db=Depends(get_db)):
    query = db.query(schema.Entity).filter(schema.Entity.slug == slug)
    if project_id:
        query = query.filter(schema.Entity.project_id == project_id)
    entity = query.first()
    
    # Fallback: try to find by name (slug might be Korean-derived)
    if not entity:
        name_from_slug = slug.replace("-", " ")
        query = db.query(schema.Entity).filter(schema.Entity.name == name_from_slug)
        if project_id:
            query = query.filter(schema.Entity.project_id == project_id)
        entity = query.first()
    
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
def delete_wiki_page(slug: str, project_id: Optional[int] = Query(None), db=Depends(get_db)):
    query = db.query(schema.Entity).filter(schema.Entity.slug == slug)
    if project_id:
        query = query.filter(schema.Entity.project_id == project_id)
    entity = query.first()
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

@app.post("/api/projects/{project_id}/files")
async def add_project_files(project_id: int, files: list[UploadFile] = File(...), user=Depends(get_current_user), db=Depends(get_db)):
    print(f"[UploadRoute] Received {len(files)} files for project {project_id}")
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        print(f"[UploadRoute] Project {project_id} not found or unauthorized")
        raise HTTPException(status_code=404, detail="Project not found")

    if get_storage_usage(user.id, db) >= 10485760:
        print(f"[UploadRoute] Storage limit exceeded for user {user.id}")
        raise HTTPException(status_code=413, detail="Storage limit (10MB) exceeded. Cannot upload more files.")

    results = []
    for f in files:
        print(f"[UploadRoute] Processing file: {f.filename}")
        try:
            text = await extract_text_from_file(f)
            if not text.strip():
                print(f"[UploadRoute] File {f.filename} produced empty text. Skipping.")
                continue
            
            print(f"[UploadRoute] Saving {f.filename} to database (text length: {len(text)})")
            pf = schema.ProjectFile(project_id=project_id, filename=f.filename, content_text=text)
            db.add(pf)
            db.flush()
            results.append({"id": pf.id, "filename": pf.filename})
            print(f"[UploadRoute] Successfully saved {f.filename} (ID: {pf.id})")
        except Exception as e:
            print(f"[UploadRoute] Error processing {f.filename}: {e}")
            import traceback
            traceback.print_exc()
            if isinstance(e, HTTPException): raise e
            raise HTTPException(status_code=500, detail=f"파일 처리 중 오류: {str(e)}")
    
    print(f"[UploadRoute] All files processed. Committing {len(results)} items.")
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
def export_project(project_id: int, include_files: bool = Query(True), db=Depends(get_db)):
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
        "project_files": [], # Placeholder
        "documents": documents_data,
        "entities": entities_data,
        "relationships": relationships_data,
        "categories": categories_data,
    }

    if include_files:
        pfiles = db.query(schema.ProjectFile).filter(schema.ProjectFile.project_id == project_id).all()
        payload["project_files"] = [
            {
                "filename": pf.filename,
                "content_text": pf.content_text,
                "is_selected": pf.is_selected,
                "upload_date": pf.upload_date.isoformat() if pf.upload_date else None
            }
            for pf in pfiles
        ]

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
    user=Depends(get_current_user),
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
    project_files_data = data.get("project_files", [])

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
        db.query(schema.ProjectFile).filter(schema.ProjectFile.project_id == existing_project.id).delete(synchronize_session=False)

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
            user_id=user.id,
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

    # ── Restore Project Files ─────────────────────────────────────────────────
    for pf in project_files_data:
        db_pf = schema.ProjectFile(
            filename=pf.get("filename", "imported_file"),
            content_text=pf.get("content_text", ""),
            is_selected=pf.get("is_selected", True),
            project_id=project.id
        )
        db.add(db_pf)
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
        "files_imported": len(project_files_data),
        "overwritten": overwrite and existing_project is not None,
    }
