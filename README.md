# AutoWiki

AutoWiki는 문서나 텍스트를 입력받아 **지식 그래프와 위키 문서**를 자동으로 생성·관리하는 풀스택 애플리케이션입니다.

## 아키텍처 개요

이 프로젝트는 크게 **Next.js 프론트엔드**와 **FastAPI 백엔드**로 구성됩니다.

```text
사용자
  ↓
Next.js 프론트엔드
  - 대시보드/프로젝트/업로드/그래프/위키 화면
  - 인증 상태 저장(Zustand)
  - 백엔드 API 호출(apiFetch)
  ↓
FastAPI 백엔드
  - 인증/세션 관리
  - 프로젝트/파일/문서/채팅 API
  - LangChain 기반 AI 분석 및 문서 생성
  ↓
SQLAlchemy + DB
  - users, projects, entities, relationships, categories
  - documents, project_files, chat_sessions, chat_messages
```

## 디렉터리 구조

```text
backend/
  main.py                    # FastAPI 엔트리포인트 및 주요 API
  database.py                # SQLAlchemy 엔진/세션 설정
  models/schema.py           # 핵심 데이터 모델
  services/
    langchain_service.py     # AI 분석, 문서 생성, 채팅 처리
    security.py              # 토큰/쿠키 보안 처리
    session.py               # 세션 관련 로직
    auth_utils.py            # 비밀번호 해시/검증

frontend/
  src/app/                   # Next.js App Router 페이지
  src/components/            # 대시보드, 업로드, 그래프, 위키 UI
  src/lib/api.ts             # 공통 API 호출 래퍼
  src/lib/store.ts           # 인증 상태 저장소(Zustand)
```

## 백엔드 구조

### 1. API 계층
- `backend/main.py`
  - FastAPI 앱 생성
  - 시작 시 기본 프롬프트 및 DB 상태 초기화
  - 인증, 프로젝트, 파일 업로드, AI 분석, 위키 조회, 채팅 관련 API 제공

대표 역할:
- 사용자 인증 및 세션 유지
- 프로젝트 CRUD
- 업로드 파일 저장
- AI 분석 요청 수신
- 최종 문서/엔티티/관계 저장

### 2. 서비스 계층
- `backend/services/langchain_service.py`
  - LangChain + GitHub Copilot 기반 LLM 호출
  - 텍스트/파일에서 분석용 텍스트 추출
  - 지식 추출 계획 수립
  - 문서 배치 생성
  - 기존 문서 섹션 패치
  - 프로젝트 채팅 처리

핵심 파이프라인:
1. 입력 텍스트/파일 수집
2. AI가 생성할 문서와 관계를 계획
3. 계획 결과를 검토용 제안서로 반환
4. 확정 시 문서/관계/카테고리를 DB에 반영

### 3. 데이터 계층
- `backend/database.py`
  - DB 연결, 세션 팩토리, `Base` 정의
- `backend/models/schema.py`
  - `User`, `Session`
  - `Project`, `ProjectFile`, `Document`
  - `Entity`, `Relationship`, `Category`
  - `ChatSession`, `ChatMessage`
  - `SystemPrompt`

즉, 백엔드는 **API → 서비스 → DB 모델** 구조로 동작합니다.

## 프론트엔드 구조

### 1. 페이지 계층
- `frontend/src/app/page.tsx`
  - 루트 접속 시 대시보드로 이동
- `frontend/src/app/dashboard/...`
  - 프로젝트 목록/상세
  - 업로드 및 텍스트 분석
  - 전체 그래프
  - 위키 문서/카테고리 페이지
  - 설정 페이지

### 2. 컴포넌트 계층
- `frontend/src/components/Shell.tsx`
  - 전체 대시보드 레이아웃과 사이드바
- `UploadUI`, `TextInputUI`, `ReviewUI`
  - 분석 입력 및 검토 화면
- `KnowledgeGraph`, `WikiViewer`
  - 그래프 시각화와 문서 렌더링
- `ProjectChatPanel`
  - 프로젝트 단위 AI 채팅

### 3. 공통 상태/통신 계층
- `frontend/src/lib/api.ts`
  - API 기본 URL 처리
  - 쿠키 + Bearer 세션 전송
  - 401 응답 시 로그아웃 처리
- `frontend/src/lib/store.ts`
  - 사용자 인증 상태 저장

즉, 프론트엔드는 **페이지 → 컴포넌트 → API/상태 저장소** 구조입니다.

## 주요 동작 흐름

1. 사용자가 로그인한다.
2. 프로젝트를 생성한다.
3. 파일 업로드 또는 텍스트 입력으로 분석을 요청한다.
4. 백엔드가 LLM으로 문서 후보와 관계를 추출한다.
5. 프론트엔드에서 제안 결과를 검토한다.
6. 확정하면 엔티티/관계/문서가 프로젝트에 저장된다.
7. 저장된 결과를 그래프, 위키 문서, 채팅 UI에서 활용한다.

## 이 프로젝트의 핵심 특징

- **지식 그래프 기반 위키 생성**
- **AI 제안 검토 후 반영하는 반자동 워크플로우**
- **프로젝트 단위 문서/파일/채팅 관리**
- **프론트엔드와 백엔드가 명확히 분리된 구조**

## 실행 방법

### 프론트엔드
```bash
cd frontend
npm install
npm run dev
```

### 백엔드
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Windows 일괄 실행
```bat
run.bat
```

기본 개발 포트:
- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`
