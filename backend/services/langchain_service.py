import os
import re
import json
import httpx
from tempfile import NamedTemporaryFile
from fastapi import UploadFile, HTTPException
from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_githubcopilot_chat import ChatGithubCopilot
from langchain_githubcopilot_chat.auth import fetch_copilot_token
from pydantic import BaseModel, Field
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from typing import Optional

class PlanNode(BaseModel):
    id: str = Field(description="Unique, lowercase short slug identifier for the node (English alphanumeric only)")
    name: str = Field(description="Human-readable display name of the entity, written in Korean")
    type: str = Field(description="Node type (최우선적으로 '인물', '사물', '개념', '단체', '사건' 중 선택하되 부득이한 경우 자유롭게 생성)")
    categories: list[str] = Field(description="1-3 hierarchical categories. 유사어(단체/조직 등) 중복을 피하고 기존 분류 목록을 적극 재사용")
    is_root: bool = Field(default=False, description="가장 핵심이 되는 메인 주제인지 여부 (단 1개만 true)")

class PlanEdge(BaseModel):
    source: str = Field(description="ID of source node")
    target: str = Field(description="ID of target node")
    label: str = Field(description="Short description of the relationship in Korean")

class PlanPatch(BaseModel):
    entity_slug: str = Field(description="Slug of the existing entity to be modified")
    entity_name: str = Field(description="Human-readable name of the entity (Korean)")
    changes: str = Field(description="Description of what changes to make in Korean")
    new_type: Optional[str] = Field(None, description="Change entity type if needed")
    new_is_root: Optional[bool] = Field(None, description="Change core/root status if needed")

class PlanDelete(BaseModel):
    entity_slug: str = Field(description="Slug of the existing entity to be deleted")
    entity_name: str = Field(description="Human-readable name of the entity")
    reason: str = Field(description="Reason for deletion in Korean")

class PlanEdgePatch(BaseModel):
    edge_id: int = Field(description="기존 관계의 고유 ID")
    new_label: str = Field(description="수정할 관계 요약 (한국어)")

class PlanEdgeDelete(BaseModel):
    edge_id: int = Field(description="삭제할 관계의 고유 ID")
    reason: str = Field(description="삭제 사유 (한국어)")

class KnowledgePlan(BaseModel):
    plan_summary: str = Field(description="AI의 작업 계획 설명 (한국어 자연어)")
    patches: list[PlanPatch] = Field(default_factory=list, description="기존 문서 수정 제안 목록")
    deletions: list[PlanDelete] = Field(default_factory=list, description="삭제가 필요한 기존 문서 목록")
    nodes: list[PlanNode]
    edges: list[PlanEdge]
    edge_patches: list[PlanEdgePatch] = Field(default_factory=list, description="기존 관계 수정 목록")
    edge_deletions: list[PlanEdgeDelete] = Field(default_factory=list, description="기존 관계 삭제 목록")

def invoke_with_auth_fallback(llm, base_prompt, github_token: str = None):
    is_ollama = (llm.__class__.__name__ == 'ChatOllama')
    if is_ollama:
        print("[LLM-Ollama] 🔄 Invoking ChatOllama natively...")
        try:
            return llm.invoke(base_prompt)
        except Exception as e:
            print(f"[LLM-Ollama] ⚠️ Native ChatOllama failed: {e}. Falling back to custom HTTP stream-aggregation...")
            
        from langchain_core.messages import AIMessage
        import urllib.request
        import json
        
        # Format messages
        messages_json = []
        if isinstance(base_prompt, str):
            messages_json.append({"role": "user", "content": base_prompt})
        else:
            for msg in base_prompt:
                role = "user"
                if getattr(msg, 'type', '') == 'system' or getattr(msg, 'name', '') == 'system':
                    role = "system"
                elif getattr(msg, 'type', '') == 'ai' or getattr(msg, 'name', '') == 'assistant':
                    role = "assistant"
                messages_json.append({"role": role, "content": getattr(msg, 'content', str(msg))})
                
        payload = {
            "model": llm.model,
            "messages": messages_json,
            "stream": True,
            "options": {"temperature": getattr(llm, 'temperature', 0.2)}
        }
        
        # The base_url might already have /api/chat or not. Typically it's just the host.
        host = llm.base_url.rstrip('/')
        url = f"{host}/api/chat" if not host.endswith("/api") else f"{host}/chat"
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            method="POST"
        )
        req.add_header("Content-Type", "application/json")
        
        if getattr(llm, 'headers', None) and "Authorization" in llm.headers:
            req.add_header("Authorization", llm.headers["Authorization"])
            
        full_content = ""
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                for line in response:
                    if line:
                        decoded_line = line.decode("utf-8").strip()
                        if not decoded_line:
                            continue
                        try:
                            chunk = json.loads(decoded_line)
                            full_content += chunk.get("message", {}).get("content", "")
                            if chunk.get("done", False):
                                break
                        except json.JSONDecodeError:
                            # If it's not JSON, it could be HTML or standard text. Collect it if it seems helpful, or skip.
                            if "error" in decoded_line.lower() or "exception" in decoded_line.lower():
                                full_content += f"\n[Error Response: {decoded_line[:200]}]"
            return AIMessage(content=full_content)
        except urllib.error.HTTPError as e:
            if e.code == 401:
                raise HTTPException(status_code=401, detail="Ollama API 키 인증에 실패했습니다. 설정 페이지에서 API 키를 확인해 주세요.")
            try:
                error_body = e.read().decode('utf-8')[:120]
            except Exception:
                error_body = "No details"
            raise HTTPException(status_code=502, detail=f"Ollama 서버 오류 (HTTP {e.code}): {error_body}")
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Ollama 서버에 연결할 수 없습니다. (오류: {str(e)[:120]})")

    # Retrieve the PAT stored on the LLM object or in environment
    actual_token = github_token or getattr(llm, '_github_token', None) or os.environ.get("GITHUB_TOKEN")
    
    try:
        return llm.invoke(base_prompt)
    except Exception as e:
        err_str = str(e).lower()
        # 401 Unauthorized, or library's rejected token message
        is_auth_error = any(x in err_str for x in ["401", "unauthorized", "expired", "token rejected", "no exchangeable"])
        
        if is_auth_error:
            print(f"\n[Auth Interceptor] ⚠️ Auth issue detected (likely token expiry).")
            
            if actual_token:
                try:
                    prefix = actual_token[:8] if isinstance(actual_token, str) else "???"
                    print(f"[Auth Interceptor] 🔄 Attempting recovery with stored token (prefix: {prefix}...)...")
                    # fetch_copilot_token now uses 'Bearer' which is required for tid= tokens
                    copilot_token, expires_at = fetch_copilot_token(actual_token)
                    if copilot_token:
                        # We NO LONGER save to disk cache here. 
                        # We just return the new LLM with the new token.
                        
                        print("[Auth Interceptor] ✅ Recovery successful! Retrying operation...\n")
                        target_model = getattr(llm, 'model', 'gpt-4o')
                        temp = getattr(llm, 'temperature', 0.2)
                        
                        new_llm = ChatGithubCopilot(model=target_model, temperature=temp)
                        setattr(new_llm, '_github_token', actual_token)
                        return new_llm.invoke(base_prompt)
                except Exception as refresh_err:
                    print(f"[Auth Interceptor] ❌ Recovery failed: {refresh_err}")
            
            error_msg = "GitHub Copilot 인증에 실패했습니다."
            if actual_token and "tid=" in actual_token:
                error_msg += " OAuth 세션이 만료된 것 같습니다. 설정 페이지에서 'GitHub Copilot 계정 연결하기'를 다시 진행해 주세요."
            elif actual_token:
                error_msg += f" 설정된 토큰이 유효하지 않거나 만료되었습니다. (응답: {err_str[:40]})"
            else:
                error_msg += " 인증 토큰이 제공되지 않았습니다."
                
            raise HTTPException(
                status_code=401, 
                detail=f"{error_msg}"
            )
        raise HTTPException(status_code=500, detail=f"AI 분석 중 오류가 발생했습니다: {str(e)}")

def get_llm(model_name: str, token: str, thinking_level: str = None, reasoning_effort: str = None, ai_provider: str = "github_copilot", ollama_host: str = None):
    """
    Initialize LLM with user-specific provider settings.
    Supports GitHub Copilot and Ollama.
    """
    if ai_provider == "ollama":
        try:
            from langchain_community.chat_models.ollama import ChatOllama
        except ImportError:
            try:
                from langchain_community.chat_models import ChatOllama
            except ImportError:
                try:
                    from langchain_ollama import ChatOllama
                except ImportError:
                    # Bulletproof fallback: define a mock ChatOllama class so the app doesn't crash
                    # on startup and falls back gracefully to standard custom HTTP stream execution.
                    class ChatOllama:
                        def __init__(self, model, base_url, headers=None, temperature=0.2):
                            self.model = model
                            self.base_url = base_url
                            self.headers = headers
                            self.temperature = temperature
        
        host = ollama_host.strip() if ollama_host else "http://localhost:11434"
        if host.endswith("/"):
            host = host[:-1]
            
        print(f"[LLM-Ollama] Initializing ChatOllama with model={model_name}, host={host}")
        
        headers = {}
        if token:
            headers["Authorization"] = f"Bearer {token}"
            
        llm = ChatOllama(
            model=model_name if model_name else "gemini-3-flash-preview",
            base_url=host,
            headers=headers if headers else None,
            temperature=0.2
        )
        return llm

    github_token = token
    if not github_token:
         # System fallback is now disabled to prevent credential confusion in production.
         # Only use environment variable if specifically allowed for system-level background tasks.
         pass
         
    if not github_token:
        print("[LLM-Auth] ❌ GitHub token is completely missing")
        raise HTTPException(status_code=401, detail="GitHub 계정 연동이 필요합니다. 설정 페이지에서 연결해 주세요.")
        
    # 토큰 무결성 체크 (복호화 결과가 유효한지 확인)
    valid_prefix = ("gho_", "ghp_", "ghu_", "github_pat_", "tid_")
    if not github_token.startswith(valid_prefix):
        prefix_peek = github_token[:8] + "..." if len(github_token) > 8 else "???"
        print(f"[LLM-Auth] ❌ Invalid token format detected (prefix: {prefix_peek}). This usually means the encryption key is different from where it was saved.")
        raise HTTPException(
            status_code=401, 
            detail=f"인증 토큰 복호화 결과가 비정상입니다. (감지된 접두사: {prefix_peek}) 설정에서 계정을 다시 연결해 주세요."
        )
    else:
        print(f"[LLM-Auth] ✅ Token decrypted and prefix validated: {github_token[:4]}...")
    # Manually exchange PAT for Copilot token to bypass the library's shared disk cache
    # Tokens starting with 'tid=' are already Copilot tokens and don't need exchange.
    # Note: Device flow tokens might start with various prefixes (gho, ghu, etc)
    if not github_token.startswith("tid="):
        print(f"[LLM-Auth] 🔄 Exchanging GitHub token (prefix: {github_token[:8]}...) for Copilot session...")
        try:
            copilot_token, _ = fetch_copilot_token(github_token)
            if not copilot_token:
                print("[LLM-Auth] ❌ fetch_copilot_token returned None")
                raise HTTPException(status_code=401, detail="Failed to exchange GitHub token for Copilot session. Please re-link your account.")
            active_token = copilot_token
            print("[LLM-Auth] ✅ Token exchange successful")
        except Exception as e:
            print(f"[LLM-Auth] ❌ Token exchange exception: {e}")
            raise HTTPException(status_code=401, detail=f"GitHub Copilot 인증 실패: {str(e)}")
    else:
        active_token = github_token
        print("[LLM-Auth] ⏩ Using existing Copilot session token (tid=)")
 
    target_model = model_name if model_name else "gemini-3-flash"
    
    kwargs = {}
    is_o_series = any(target_model.startswith(x) for x in ["o1", "o3", "o4"])
    if reasoning_effort and is_o_series:
        kwargs["reasoning_effort"] = reasoning_effort
        
    # Pass the 'tid=' token as github_token to ChatGithubCopilot. 
    # This prevents the library from trying to exchange and save to ~/.github-copilot-chat.json
    from pydantic import SecretStr
    llm = ChatGithubCopilot(
        model=target_model, 
        temperature=0.2, 
        github_token=SecretStr(active_token),
        **kwargs
    )
    # Store the original PAT for recovery/fallback
    setattr(llm, '_github_token', github_token) 
    return llm

def plan_knowledge_extraction(text: str, custom_prompt: str, llm, system_prompt: str, existing_entities: list[str] | None = None, all_categories: list[str] | None = None, project_files_text: str | None = None, project_graph: str = "") -> KnowledgePlan:
    existing_block = "\n".join(existing_entities) if existing_entities else "(없음)"
    categories_block = ", ".join(all_categories) if all_categories else "(없음)"
    files_block = project_files_text if project_files_text else "(없음)"
    
    base_prompt = (system_prompt.replace("<<<TEXT>>>", text)
                   .replace("<<<CUSTOM_PROMPT>>>", custom_prompt if custom_prompt else "없음")
                   .replace("<<<EXISTING_ENTITIES>>>", existing_block)
                   .replace("<<<ALL_CATEGORIES>>>", categories_block)
                   .replace("<<<PROJECT_FILES>>>", files_block)
                   .replace("<<<PROJECT_GRAPH>>>", project_graph if project_graph else "(없음)"))

    # [DEBUG] AI에게 전달되는 최종 프롬프트 전문을 파일로 기록합니다.
    try:
        debug_path = os.path.join(os.path.dirname(__file__), "..", "last_prompt_debug.txt")
        with open(debug_path, "w", encoding="utf-8") as f:
            f.write(base_prompt)
        print(f"[Debug] Final prompt saved to: {debug_path}")
    except Exception as log_err:
        print(f"[Debug] Failed to save prompt log: {log_err}")
    
    for attempt in range(3):
        try:
            response = invoke_with_auth_fallback(llm, base_prompt, github_token=getattr(llm, '_github_token', None))
            raw_text = response.content if hasattr(response, 'content') else str(response)
            clean_text = raw_text.strip()
            if clean_text.startswith("`json"):
                clean_text = clean_text[7:]
            elif clean_text.startswith("`"):
                clean_text = clean_text[3:]
            if clean_text.endswith("`"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()
            parsed_data = json.loads(clean_text)
            return KnowledgePlan(**parsed_data)
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            if attempt == 2:
                raise HTTPException(status_code=500, detail=f"LLM AI parsing totally failed: {e}")

def execute_batch_knowledge_generation_stream(nodes_batch: list[dict], text: str, custom_prompt: str, llm, system_prompt: str, project_files_text: str = "", project_graph: str = ""):
    target_nodes_info = ""
    for n in nodes_batch:
        target_nodes_info += f"- 개체명: {n['name']}, 카테고리: {n.get('categories', [])}\n"

    base_prompt = system_prompt.replace("<<<TEXT>>>", text)\
                               .replace("<<<CUSTOM_PROMPT>>>", custom_prompt if custom_prompt else "없음")\
                               .replace("<<<BATCH_SIZE>>>", str(len(nodes_batch)))\
                               .replace("<<<TARGET_NODES_INFO>>>", target_nodes_info)\
                               .replace("<<<PROJECT_FILES>>>", project_files_text if project_files_text else "없음")\
                               .replace("<<<PROJECT_GRAPH>>>", project_graph if project_graph else "(없음)")

    is_ollama = (llm.__class__.__name__ == 'ChatOllama')
    if is_ollama:
        try:
            print("[Ollama-Stream] Native stream execution...")
            for chunk in llm.stream(base_prompt):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                yield content
            return
        except Exception as e:
            print(f"[Ollama-Stream] Native stream failed: {e}. Falling back to custom HTTP stream...")

        import json
        messages_json = [{"role": "user", "content": base_prompt}]
        payload = {
            "model": llm.model,
            "messages": messages_json,
            "stream": True,
            "options": {"temperature": getattr(llm, 'temperature', 0.2)}
        }
        host = llm.base_url.rstrip('/')
        url = f"{host}/api/chat" if not host.endswith("/api") else f"{host}/chat"
        headers = {"Content-Type": "application/json"}
        if getattr(llm, 'headers', None) and "Authorization" in llm.headers:
            headers["Authorization"] = llm.headers["Authorization"]
            
        try:
            with httpx.stream("POST", url, json=payload, headers=headers, timeout=30.0) as r:
                for line in r.iter_lines():
                    if line:
                        chunk = json.loads(line)
                        content = chunk.get("message", {}).get("content", "")
                        if content:
                            yield content
                        if chunk.get("done", False):
                            break
            return
        except Exception as http_err:
            print(f"[Ollama-Stream] HTTP stream fallback failed: {http_err}")
            raise http_err
    else:
        try:
            print("[Copilot-Stream] Stream execution...")
            for chunk in llm.stream(base_prompt):
                content = chunk.content if hasattr(chunk, 'content') else str(chunk)
                yield content
        except Exception as e:
            print(f"[Copilot-Stream] Stream failed: {e}")
            raise e

def execute_batch_knowledge_generation(nodes_batch: list[dict], text: str, custom_prompt: str, llm, system_prompt: str, project_files_text: str = "", project_graph: str = "") -> str:
    target_nodes_info = ""
    for n in nodes_batch:
        target_nodes_info += f"- 개체명: {n['name']}, 카테고리: {n.get('categories', [])}\n"

    base_prompt = system_prompt.replace("<<<TEXT>>>", text)\
                               .replace("<<<CUSTOM_PROMPT>>>", custom_prompt if custom_prompt else "없음")\
                               .replace("<<<BATCH_SIZE>>>", str(len(nodes_batch)))\
                               .replace("<<<TARGET_NODES_INFO>>>", target_nodes_info)\
                               .replace("<<<PROJECT_FILES>>>", project_files_text if project_files_text else "없음")\
                               .replace("<<<PROJECT_GRAPH>>>", project_graph if project_graph else "(없음)")
    
    for attempt in range(3):
        try:
            response = invoke_with_auth_fallback(llm, base_prompt, github_token=getattr(llm, '_github_token', None))
            raw_text = response.content if hasattr(response, 'content') else str(response)
            clean_text = raw_text.strip()
            if clean_text.startswith("`markdown"):
                clean_text = clean_text[11:]
            elif clean_text.startswith("`"):
                clean_text = clean_text[3:]
            if clean_text.endswith("`"):
                clean_text = clean_text[:-3]
            return clean_text.strip()
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            if attempt == 2:
                failsafe = ""
                for n in nodes_batch:
                    failsafe += f"\n=== DOCUMENT_SEPARATOR: {n['name']} ===\n문서 생성에 실패했습니다.\n"
                return failsafe

def slugify(text: str) -> str:
    return text.strip().lower().replace(" ", "-")

def _parse_sections(markdown: str) -> dict:
    import re as _re
    from collections import OrderedDict
    result = OrderedDict()
    parts = _re.split(r'^(##\s+.+)$', markdown, flags=_re.MULTILINE)
    result['__header__'] = parts[0]
    for i in range(1, len(parts), 2):
        heading_line = parts[i].strip()
        section_name = _re.sub(r'^##\s+', '', heading_line).strip()
        content = parts[i + 1] if i + 1 < len(parts) else ''
        result[section_name] = content
    return result

def _sections_to_markdown(sections: dict) -> str:
    parts = []
    for key, content in sections.items():
        if key == '__header__':
            parts.append(content)
        else:
            parts.append(f"## {key}\n{content}")
    return ''.join(parts).strip()

def apply_section_patches(existing_summary: str, patch_output: str) -> str:
    import re as _re
    raw_patches = _re.split(r'===\s*PATCH_SECTION:\s*(.*?)\s*===', patch_output)
    if len(raw_patches) <= 1:
        return patch_output.strip() if patch_output.strip() else existing_summary
    sections = _parse_sections(existing_summary or '')
    for i in range(1, len(raw_patches), 2):
        section_name = raw_patches[i].strip()
        section_content = raw_patches[i + 1].strip() if i + 1 < len(raw_patches) else ''
        sections[section_name] = '\n' + section_content + '\n\n'
    return _sections_to_markdown(sections)

def execute_section_patch(existing_summary: str, entity_name: str, entity_type: str,
                          patch_description: str, source_text: str,
                          llm, system_prompt: str, project_files_text: str = "", project_graph: str = "") -> str:
    existing_sections = _parse_sections(existing_summary or '')
    section_names = [k for k in existing_sections.keys() if k != '__header__']
    sections_list = '\n'.join(f"- {s}" for s in section_names) if section_names else '(섹션 없음)'

    base_prompt = (system_prompt
                   .replace("<<<ENTITY_NAME>>>", entity_name)
                   .replace("<<<ENTITY_TYPE>>>", entity_type)
                   .replace("<<<PATCH_DESCRIPTION>>>", patch_description)
                   .replace("<<<EXISTING_SUMMARY>>>", existing_summary or "")
                   .replace("<<<SECTIONS_LIST>>>", sections_list)
                   .replace("<<<SOURCE_TEXT>>>", (source_text or ""))
                   .replace("<<<PROJECT_FILES>>>", project_files_text if project_files_text else "없음")
                   .replace("<<<PROJECT_GRAPH>>>", project_graph if project_graph else "(없음)"))

    for attempt in range(3):
        try:
            response = invoke_with_auth_fallback(llm, base_prompt, github_token=getattr(llm, '_github_token', None))
            raw_text = response.content if hasattr(response, 'content') else str(response)
            clean_text = raw_text.strip()
            if clean_text.startswith("`markdown"):
                clean_text = clean_text[11:]
            elif clean_text.startswith("`"):
                clean_text = clean_text[3:]
            if clean_text.endswith("`"):
                clean_text = clean_text[:-3]
            return apply_section_patches(existing_summary, clean_text.strip())
        except Exception as e:
            if isinstance(e, HTTPException): raise e
            if attempt == 2:
                return existing_summary

async def extract_text_from_file(file: UploadFile) -> str:
    ext = file.filename.split('.')[-1].lower()
    print(f"[Extract] Processing file: {file.filename}, ext: {ext}, type: {file.content_type}")
    
    tmp_path = None
    try:
        with NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        print(f"[Extract] Temp file created at: {tmp_path} (size: {os.path.getsize(tmp_path)} bytes)")
        
        result_text = ""
        if 'pdf' in ext:
            print("[Extract] Processing PDF file...")
            # 1. Try direct pure-python pypdf.PdfReader extraction
            try:
                print("[Extract] Attempting direct pypdf.PdfReader text extraction...")
                from pypdf import PdfReader
                reader = PdfReader(tmp_path)
                num_pages = len(reader.pages)
                print(f"[Extract] PDF has {num_pages} pages.")
                
                text_parts = []
                for i, page in enumerate(reader.pages):
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(page_text)
                
                extracted_direct = "\n".join(text_parts)
                if extracted_direct.strip():
                    print(f"[Extract] Direct pypdf successful. Extracted {len(extracted_direct)} chars.")
                    result_text = extracted_direct
            except Exception as pypdf_err:
                print(f"[Extract] Direct pypdf failed: {pypdf_err}. Trying PyPDFLoader fallback...")
            
            # 2. Fallback to PyPDFLoader if direct extraction returned empty or failed
            if not result_text.strip():
                try:
                    print("[Extract] Attempting PyPDFLoader fallback...")
                    loader = PyPDFLoader(tmp_path)
                    docs = loader.load()
                    loader_text = "\n".join([doc.page_content for doc in docs if doc.page_content])
                    if loader_text.strip():
                        print(f"[Extract] PyPDFLoader fallback successful. Extracted {len(loader_text)} chars.")
                        result_text = loader_text
                except Exception as langchain_pdf_err:
                    print(f"[Extract] PyPDFLoader fallback failed: {langchain_pdf_err}")
            
            # If both failed or extracted text is empty
            if not result_text.strip():
                raise HTTPException(
                    status_code=400,
                    detail=f"'{file.filename}' 파일에서 텍스트를 추출할 수 없습니다. 스캔된 이미지 형태의 PDF이거나 텍스트 레이어가 없는 파일일 수 있습니다."
                )
        elif 'docx' in ext:
            print("[Extract] Using Docx2txtLoader")
            try:
                loader = Docx2txtLoader(tmp_path)
                docs = loader.load()
                result_text = "\n".join([doc.page_content for doc in docs if doc.page_content])
            except Exception as docx_err:
                print(f"[Extract] Docx2txtLoader failed: {docx_err}")
                import traceback
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"DOCX 파싱 실패: {str(docx_err)}")
        else:
            print(f"[Extract] Using TextLoader for ext: {ext}")
            try:
                loader = TextLoader(tmp_path, encoding="utf-8")
                docs = loader.load()
                result_text = "\n".join([doc.page_content for doc in docs if doc.page_content])
            except Exception as txt_err:
                print(f"[Extract] TextLoader failed: {txt_err}")
                import traceback
                traceback.print_exc()
                raise HTTPException(status_code=500, detail=f"텍스트 파일 파싱 실패: {str(txt_err)}")
        
        result_text = result_text.strip()
        if not result_text:
            raise HTTPException(
                status_code=400,
                detail=f"'{file.filename}' 파일의 내용이 비어 있거나 텍스트를 추출할 수 없습니다."
            )
            
        print(f"[Extract] Extraction successful. Length: {len(result_text)} chars")
        return result_text
        
    except Exception as e:
        print(f"[Extract] CRITICAL ERROR during extraction: {e}")
        import traceback
        traceback.print_exc()
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=f"파일 텍스트 추출 중 예외 발생: {str(e)}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
            print(f"[Extract] Temp file cleaned up: {tmp_path}")

async def extract_proposals(filename: str, full_text: str, custom_prompt: str, model_name: str, api_key: str, system_prompt: str, existing_entities: list[str] | None = None, all_categories: list[str] | None = None, project_files_text: str | None = None, thinking_level: str = None, reasoning_effort: str = None, project_graph: str = "", ai_provider: str = "github_copilot", ollama_host: str = None):
    if not full_text.strip():
        raise HTTPException(status_code=400, detail="텍스트를 추출할 수 없습니다.")
    llm = get_llm(model_name, api_key, thinking_level, reasoning_effort, ai_provider=ai_provider, ollama_host=ollama_host)
    plan = plan_knowledge_extraction(full_text, custom_prompt, llm, system_prompt, existing_entities, all_categories, project_files_text, project_graph=project_graph)
    return {
        "filename": filename,
        "content_text": full_text,
        "plan_summary": plan.plan_summary,
        "patches": [p.model_dump() for p in plan.patches],
        "deletions": [d.model_dump() for d in plan.deletions],
        "nodes": [n.model_dump() for n in plan.nodes],
        "edges": [e.model_dump() for e in plan.edges],
        "edge_patches": [ep.model_dump() for ep in plan.edge_patches],
        "edge_deletions": [ed.model_dump() for ed in plan.edge_deletions]
    }

def execute_project_chat(message: str, history: list[dict], project_context: str, llm, project_files_text: str = "", project_graph_text: str = "") -> str:
    messages = [
        SystemMessage(content=f"당신은 이 프로젝트의 문서를 잘 알고 있는 친절한 AI 전문가입니다.\n\n"
                              f"[지식 구조 가이드라인]\n"
                              f"- '외딴섬(Island)' 혹은 '고립' 노드란, 단순히 연결이 0개인 노드뿐만 아니라, 메인 루트(Root) 노드에서부터 도달할 수 없는 모든 노드와 클러스터를 의미합니다.\n"
                              f"- 사용자가 지식 연결 상태를 물으면, [지식 구조도(관계)] 하단의 '외딴섬 클러스터' 목록을 확인하여 이들이 왜 메인 줄기와 떨어져 있는지 분석하고 연결 방안을 제시하세요.\n\n"
                              f"[프로젝트 문서 정보]\n{project_context}\n\n"
                              f"[지식 구조도(관계)]\n{project_graph_text or '(현재 등록된 관계 없음)'}\n\n"
                              f"[참조 파일]\n{project_files_text or '(없음)'}")
    ]
    for msg in history:
        messages.append(HumanMessage(content=msg["content"]) if msg["role"] == "user" else AIMessage(content=msg["content"]))
    messages.append(HumanMessage(content=message))
    
    for attempt in range(3):
        try:
            return invoke_with_auth_fallback(llm, messages, github_token=getattr(llm, '_github_token', None)).content
        except Exception as e:
            if attempt == 2: raise e
