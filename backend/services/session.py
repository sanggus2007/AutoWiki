from sqlalchemy.orm import Session as DBSession
from models import schema
import datetime
from typing import Optional
from .security import generate_session_id

SESSION_EXPIRY_DAYS = 30

def create_user_session(db: DBSession, user_id: int, user_agent: Optional[str] = None, ip_address: Optional[str] = None) -> schema.Session:
    # Rotate sessions: optionally delete old sessions for this user/agent to prevent fixation
    # For now, we'll just create a new one. 
    # In a more robust system, we might invalidate other sessions here.
    
    session_id = generate_session_id()
    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=SESSION_EXPIRY_DAYS)
    
    db_session = schema.Session(
        id=session_id,
        user_id=user_id,
        expires_at=expires_at,
        user_agent=user_agent,
        ip_address=ip_address
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

def get_session(db: DBSession, session_id: str) -> Optional[schema.Session]:
    session = db.query(schema.Session).filter(schema.Session.id == session_id).first()
    if not session:
        return None
    
    # Check expiry
    if session.expires_at < datetime.datetime.utcnow():
        db.delete(session)
        db.commit()
        return None
        
    # Update last activity without blocking/waiting for commit every single time
    # (Optional: Only update if last_activity was > 5 mins ago to save IO)
    now = datetime.datetime.utcnow()
    if not session.last_activity or (now - session.last_activity).total_seconds() > 300:
        session.last_activity = now
        db.commit() # Only commit occasionally
    
    return session

def delete_session(db: DBSession, session_id: str):
    session = db.query(schema.Session).filter(schema.Session.id == session_id).first()
    if session:
        db.delete(session)
        db.commit()
