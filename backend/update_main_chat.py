import re

with open('main.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Add Optional to typing import
text = re.sub(r'from typing import (.+)', r'from typing import \1, Optional', text, count=1)

# Add datetime import
if 'import datetime' not in text:
    text = text.replace('import os\n', 'import os\nimport datetime\n')

chat_request = """class ChatRequest(BaseModel):
    message: str
    history: List[dict]
    model_name: str = ""
    api_key: str = ""
    session_id: Optional[int] = None"""

text = re.sub(r'class ChatRequest\(BaseModel\):.*?api_key: str = \"\"', chat_request, text, flags=re.DOTALL)

old_chat_endpoint = """@app.post("/api/projects/{project_id}/chat")
def project_chat(project_id: int, payload: ChatRequest, user=Depends(get_current_user), db=Depends(get_db)):
    project = db.query(schema.Project).filter(schema.Project.id == project_id, schema.Project.user_id == user.id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
        
    entities = db.query(schema.Entity).filter(schema.Entity.project_id == project_id).all()
    project_context = ""
    for e in entities:
        categories = ", ".join([c.name for c in e.categories])
        project_context += f"- **{e.name}** ({e.type}, 분류: {categories})\\n  {e.summary[:300]}...\\n\\n"
        
    if not project_context:
        project_context = "이 프로젝트에는 아직 등록된 문서/데이터가 없습니다."

    # Auto-load selected project reference files
    selected_pf = db.query(schema.ProjectFile).filter(
        schema.ProjectFile.project_id == project_id,
        schema.ProjectFile.is_selected == True
    ).all()
    files_text = [f"[{pf.filename}]\\n{pf.content_text}" for pf in selected_pf]
    project_files_text = "\\n\\n".join(files_text)

    llm = get_llm(payload.model_name, payload.api_key)
    
    reply = execute_project_chat(
        message=payload.message,
        history=payload.history,
        project_context=project_context,
        llm=llm,
        project_files_text=project_files_text
    )
    
    return {"reply": reply}"""

new_chat_endpoint = """@app.post("/api/projects/{project_id}/chat")
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
        project_context += f"- **{e.name}** ({e.type}, 분류: {categories})\\n  {e.summary[:300]}...\\n\\n"
        
    if not project_context:
        project_context = "이 프로젝트에는 아직 등록된 문서/데이터가 없습니다."

    selected_pf = db.query(schema.ProjectFile).filter(
        schema.ProjectFile.project_id == project_id,
        schema.ProjectFile.is_selected == True
    ).all()
    files_text = [f"[{pf.filename}]\\n{pf.content_text}" for pf in selected_pf]
    project_files_text = "\\n\\n".join(files_text)

    llm = get_llm(payload.model_name, payload.api_key)
    
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
    return {"status": "deleted"}"""

text = text.replace(old_chat_endpoint, new_chat_endpoint)

with open('main.py', 'w', encoding='utf-8') as f:
    f.write(text)

print("Done")
