import os
import re
import json
import httpx
from tempfile import NamedTemporaryFile
from fastapi import UploadFile, HTTPException
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_githubcopilot_chat import ChatGithubCopilot
from langchain_githubcopilot_chat.auth import load_tokens_from_cache, fetch_copilot_token, save_tokens_to_cache
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

class PlanNode(BaseModel):
    id: str = Field(description="Unique, lowercase short slug identifier for the node (English alphanumeric only)")
    name: str = Field(description="Human-readable display name of the entity, written in Korean")
    type: str = Field(description="Category in Korean (e.g. 개념, 기술, 인물, 프로젝트, 조직)")
    categories: list[str] = Field(description="1-3 hierarchical Korean category names this entity belongs to (e.g. ['인공지능', '자연어처리'])")

class PlanEdge(BaseModel):
    source: str = Field(description="ID of source node")
    target: str = Field(description="ID of target node")
    label: str = Field(description="Short description of the relationship in Korean")

class PlanPatch(BaseModel):
    entity_slug: str = Field(description="Slug of the existing entity to be modified")
    entity_name: str = Field(description="Human-readable name of the entity (Korean)")
    changes: str = Field(description="Description of what changes to make in Korean")

class KnowledgePlan(BaseModel):
    plan_summary: str = Field(description="AI의 작업 계획 설명 (한국어 자연어)")
    patches: list[PlanPatch] = Field(default_factory=list, description="기존 문서 수정 제안 목록")
    nodes: list[PlanNode]
    edges: list[PlanEdge]

# KnowledgeExecution JSON output deprecated for Phase 12 batched multiplexing

def get_llm(model_name: str, api_key: str):
    # If the user explicitly provided an API key in the UI, use it. Otherwise, rely on the global cache.
    tokens = load_tokens_from_cache()
    github_token = api_key if api_key else tokens.get("github_token", "")
    
    if github_token:
        os.environ["GITHUB_TOKEN"] = github_token
    elif not os.environ.get("GITHUB_TOKEN"):
        # Explicitly raise a 401 to trigger the frontend's AuthOverlay instead of failing with 500 Pydantic ValidationError
        raise HTTPException(status_code=401, detail="Token Expired. A GitHub token is required.")
        
    target_model = model_name if model_name else "gpt-4o"
    return ChatGithubCopilot(model=target_model, temperature=0.2)

def invoke_with_auth_fallback(llm, base_prompt):
    try:
        return llm.invoke(base_prompt)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            print("\n[Auth Interceptor] ⚠️ 401 Unauthorized detected! Attempting silent token refresh...")
            tokens = load_tokens_from_cache()
            github_token = tokens.get("github_token") or os.environ.get("GITHUB_TOKEN")
            
            if not github_token:
                raise e
                
            copilot_token, expires_at = fetch_copilot_token(github_token)
            if copilot_token:
                save_tokens_to_cache(github_token, copilot_token, expires_at)
                print("[Auth Interceptor] ✅ Silent refresh successful! Re-invoking LLM...\n")
                target_model = getattr(llm, 'model', 'gpt-4o')
                new_llm = type(llm)(model=target_model, temperature=llm.temperature)
                return new_llm.invoke(base_prompt)
            else:
                print("[Auth Interceptor] ❌ Silent refresh failed. Master token might be expired.")
                raise HTTPException(status_code=401, detail="Copilot Token refresh failed. Master token expired.")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        if "401" in str(e):
            print("\n[Auth Interceptor] ⚠️ 401 String Error detected! Attempting silent token refresh...")
            tokens = load_tokens_from_cache()
            github_token = tokens.get("github_token") or os.environ.get("GITHUB_TOKEN")
            if github_token:
                copilot_token, expires_at = fetch_copilot_token(github_token)
                if copilot_token:
                    save_tokens_to_cache(github_token, copilot_token, expires_at)
                    print("[Auth Interceptor] ✅ Silent refresh successful! Re-invoking LLM...\n")
                    target_model = getattr(llm, 'model', 'gpt-4o')
                    new_llm = type(llm)(model=target_model, temperature=llm.temperature)
                    return new_llm.invoke(base_prompt)
            raise HTTPException(status_code=401, detail="Token Expired. Master token expired or refresh failed.")
        raise HTTPException(status_code=500, detail=str(e))

def plan_knowledge_extraction(text: str, custom_prompt: str, llm, system_prompt: str, existing_entities: list[str] | None = None) -> KnowledgePlan:
    existing_block = "\n".join(f"- {e}" for e in existing_entities) if existing_entities else "(없음)"
    base_prompt = system_prompt.replace("<<<TEXT>>>", text)\
                               .replace("<<<CUSTOM_PROMPT>>>", custom_prompt if custom_prompt else "없음")\
                               .replace("<<<EXISTING_ENTITIES>>>", existing_block)
    
    for attempt in range(3):
        try:
            response = invoke_with_auth_fallback(llm, base_prompt)
            raw_text = response.content if hasattr(response, 'content') else str(response)
            
            print(f"\n[{attempt + 1}] DEBUG RAW AI RESPONSE (Planner):\n{raw_text}\n{'='*50}\n")
            
            # Hotfix: Clean up Markdown wrappers that might break parsing
            clean_text = raw_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            elif clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
                
            clean_text = clean_text.strip()
            parsed_data = json.loads(clean_text)
            return KnowledgePlan(**parsed_data)
        except HTTPException as he:
            raise he
        except Exception as e:
            print(f"[Plan Retry {attempt + 1}] JSON parsing failed: {e}")
            if attempt == 2:
                # Do not fail silently. Throw exception visibly.
                raise HTTPException(status_code=500, detail=f"LLM AI parsing totally failed. Last Error: {e}")

def execute_batch_knowledge_generation(nodes_batch: list[dict], text: str, custom_prompt: str, llm, system_prompt: str) -> str:
    target_nodes_info = ""
    for n in nodes_batch:
        target_nodes_info += f"- 개체명: {n['name']}, 카테고리: {n.get('categories', [])}\n"

    base_prompt = system_prompt.replace("<<<TEXT>>>", text)\
                               .replace("<<<CUSTOM_PROMPT>>>", custom_prompt if custom_prompt else "없음")\
                               .replace("<<<BATCH_SIZE>>>", str(len(nodes_batch)))\
                               .replace("<<<TARGET_NODES_INFO>>>", target_nodes_info)
    
    for attempt in range(3):
        try:
            response = invoke_with_auth_fallback(llm, base_prompt)
            raw_text = response.content if hasattr(response, 'content') else str(response)
            
            print(f"\n[{attempt + 1}] DEBUG RAW AI RESPONSE (Executor):\n{raw_text}\n{'='*50}\n")
            
            clean_text = raw_text.strip()
            if clean_text.startswith("```markdown"):
                clean_text = clean_text[11:]
            elif clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
                
            return clean_text.strip()
        except HTTPException as he:
            raise he
        except Exception as e:
            print(f"[Execution Retry {attempt + 1}] Generation failed: {e}")
            if attempt == 2:
                # Failsafe dummy block
                failsafe = ""
                for n in nodes_batch:
                    failsafe += f"\n=== DOCUMENT_SEPARATOR: {n['name']} ===\n문서 생성에 실패했습니다. 관리자에게 문의하세요.\n"
                return failsafe

def slugify(text: str) -> str:
    slug = text.strip().lower().replace(" ", "-")
    return slug

def _parse_sections(markdown: str) -> dict:
    """기존 마크다운 문서를 H2(##) 섹션 단위로 파싱합니다.
    반환: OrderedDict 형태의 {'__header__': 헤딩 전 내용, '섹션명': 내용, ...}
    """
    import re as _re
    from collections import OrderedDict

    result = OrderedDict()
    # H2 헤딩 기준으로 분리
    parts = _re.split(r'^(##\s+.+)$', markdown, flags=_re.MULTILINE)

    # parts[0] = 헤딩 이전 내용 (인포박스, 목차 등)
    result['__header__'] = parts[0]

    # 이후는 [헤딩, 내용, 헤딩, 내용, ...] 쌍
    for i in range(1, len(parts), 2):
        heading_line = parts[i].strip()           # e.g. "## 개요"
        section_name = _re.sub(r'^##\s+', '', heading_line).strip()
        content = parts[i + 1] if i + 1 < len(parts) else ''
        result[section_name] = content

    return result


def _sections_to_markdown(sections: dict) -> str:
    """섹션 딕셔너리를 마크다운 문자열로 재조합합니다."""
    parts = []
    for key, content in sections.items():
        if key == '__header__':
            parts.append(content)
        else:
            parts.append(f"## {key}\n{content}")
    return ''.join(parts).strip()


def apply_section_patches(existing_summary: str, patch_output: str) -> str:
    """AI가 반환한 PATCH_SECTION 블록들을 기존 문서에 적용합니다.
    
    - 기존에 있는 섹션이면 내용 교체
    - 없는 섹션이면 문서 끝에 추가
    - PATCH_SECTION 구분자가 없으면 patch_output 전체로 폴백
    
    Args:
        existing_summary: 기존 마크다운 문서 전체
        patch_output: AI가 반환한 패치 텍스트 (PATCH_SECTION 구분자 포함)
    
    Returns:
        병합된 최종 마크다운 문서
    """
    import re as _re

    # AI 응답에서 PATCH_SECTION 블록 추출
    raw_patches = _re.split(r'===\s*PATCH_SECTION:\s*(.*?)\s*===', patch_output)

    if len(raw_patches) <= 1:
        # PATCH_SECTION 구분자가 없으면 → 전체 교체 폴백
        print("[apply_section_patches] No PATCH_SECTION markers found. Falling back to full replacement.")
        return patch_output.strip() if patch_output.strip() else existing_summary

    # 기존 문서를 섹션 딕셔너리로 파싱
    sections = _parse_sections(existing_summary or '')

    # raw_patches 구조: [preamble, section_name, content, section_name, content, ...]
    patches_applied = 0
    for i in range(1, len(raw_patches), 2):
        section_name = raw_patches[i].strip()
        section_content = raw_patches[i + 1].strip() if i + 1 < len(raw_patches) else ''

        if section_name in sections:
            # 기존 섹션 교체: 앞뒤 줄바꿈 정규화
            sections[section_name] = '\n' + section_content + '\n\n'
            print(f"[apply_section_patches] ✅ Replaced section: '{section_name}'")
        else:
            # 새 섹션 추가
            sections[section_name] = '\n' + section_content + '\n\n'
            print(f"[apply_section_patches] ➕ Added new section: '{section_name}'")

        patches_applied += 1

    print(f"[apply_section_patches] Applied {patches_applied} section patch(es).")
    return _sections_to_markdown(sections)


def execute_section_patch(existing_summary: str, entity_name: str, entity_type: str,
                          patch_description: str, source_text: str,
                          llm, system_prompt: str) -> str:
    """섹션 단위 Surgical Patch: AI가 변경된 섹션만 반환하고, 해당 섹션만 교체합니다."""
    import re as _re

    # 기존 문서의 섹션 목록을 AI에게 제공 (어떤 섹션이 있는지 맥락 제공)
    existing_sections = _parse_sections(existing_summary or '')
    section_names = [k for k in existing_sections.keys() if k != '__header__']
    sections_list = '\n'.join(f"- {s}" for s in section_names) if section_names else '(섹션 없음)'

    base_prompt = (system_prompt
                   .replace("<<<ENTITY_NAME>>>", entity_name)
                   .replace("<<<ENTITY_TYPE>>>", entity_type)
                   .replace("<<<PATCH_DESCRIPTION>>>", patch_description)
                   .replace("<<<EXISTING_SUMMARY>>>", existing_summary or "")
                   .replace("<<<SECTIONS_LIST>>>", sections_list)
                   .replace("<<<SOURCE_TEXT>>>", (source_text or "")[:4000]))

    for attempt in range(3):
        try:
            response = invoke_with_auth_fallback(llm, base_prompt)
            raw_text = response.content if hasattr(response, 'content') else str(response)

            print(f"\n[Patch {attempt + 1}] DEBUG RAW AI RESPONSE:\n{raw_text}\n{'='*50}\n")

            clean_text = raw_text.strip()
            if clean_text.startswith("```markdown"):
                clean_text = clean_text[11:]
            elif clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            # 섹션 단위 병합 적용
            return apply_section_patches(existing_summary, clean_text)

        except HTTPException as he:
            raise he
        except Exception as e:
            print(f"[Patch Retry {attempt + 1}] Section patch failed: {e}")
            if attempt == 2:
                return existing_summary  # 모든 재시도 실패 시 원본 유지

async def extract_proposals(file: UploadFile, custom_prompt: str, model_name: str, api_key: str, system_prompt: str, existing_entities: list[str] | None = None):
    ext = file.filename.split('.')[-1].lower()
    
    with NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        if 'pdf' in ext:
            loader = PyPDFLoader(tmp_path)
            docs = loader.load()
        elif 'docx' in ext:
            loader = Docx2txtLoader(tmp_path)
            docs = loader.load()
        else:
            loader = TextLoader(tmp_path, encoding="utf-8")
            docs = loader.load()

        full_text = "\n".join([doc.page_content for doc in docs])
        
        text_splitter = RecursiveCharacterTextSplitter(chunk_size=4000, chunk_overlap=200)
        chunks = text_splitter.split_text(full_text)
        target_chunk = chunks[0] if chunks else full_text
        
        print("\n" + "="*50)
        print("DEBUG TARGET CHUNK PREVIEW (First 200 chars):")
        print(target_chunk[:200])
        print("="*50 + "\n")
        
        llm = get_llm(model_name, api_key)
        plan = plan_knowledge_extraction(target_chunk, custom_prompt, llm, system_prompt, existing_entities)
        
        return {
            "filename": file.filename,
            "content_text": target_chunk,
            "plan_summary": plan.plan_summary,
            "patches": [p.dict() for p in plan.patches],
            "nodes": [n.dict() for n in plan.nodes],
            "edges": [e.dict() for e in plan.edges]
        }
    finally:
        os.unlink(tmp_path)

def execute_project_chat(message: str, history: list[dict], project_context: str, llm) -> str:
    """
    프로젝트의 정보를 바탕으로 QA 채팅을 수행합니다.
    """
    messages = []
    
    # Add System Message
    system_prompt = f"""당신은 이 프로젝트의 문서를 잘 알고 있는 친절한 AI 전문가입니다.
사용자가 묻는 질문에 대해 아래에 제공된 [프로젝트 정보]를 바탕으로 정확하게 답변해주세요.
정보에 없는 내용은 추측하지 말고 모른다고 하거나, 주어진 정보 내에서 유추할 수 있는 선까지만 답변하세요.

[프로젝트 정보]
{project_context}
"""
    messages.append(SystemMessage(content=system_prompt))
    
    # Add History
    for msg in history:
        if msg.get("role") == "user":
            messages.append(HumanMessage(content=msg.get("content", "")))
        else:
            messages.append(AIMessage(content=msg.get("content", "")))
    
    # Add Current Message
    messages.append(HumanMessage(content=message))
    
    for attempt in range(3):
        try:
            response = invoke_with_auth_fallback(llm, messages)
            return response.content if hasattr(response, 'content') else str(response)
        except Exception as e:
            print(f"[Chat Retry {attempt + 1}] Chat failed: {e}")
            if attempt == 2:
                raise e

