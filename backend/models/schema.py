from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Table, Boolean
from sqlalchemy.orm import relationship
from database import Base
import datetime

# Many-to-many association table: Entity <-> Category
entity_category = Table(
    "entity_category",
    Base.metadata,
    Column("entity_id", Integer, ForeignKey("entities.id"), primary_key=True),
    Column("category_id", Integer, ForeignKey("categories.id"), primary_key=True),
)

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, index=True) # Session Token (UUID)
    user_id = Column(Integer, ForeignKey("users.id"))
    expires_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    user_agent = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    last_activity = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="sessions")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # 공통
    username = Column(String)
    avatar_url = Column(String, nullable=True)
    access_token = Column(String, nullable=True)  # [LEGACY] AutoWiki session token - to be deleted
    created_date = Column(DateTime, default=datetime.datetime.utcnow)
    auth_provider = Column(String, default="github")  # 'github' | 'google' | 'local'
    # GitHub
    github_id = Column(String, unique=True, index=True, nullable=True)
    github_token_enc = Column(Text, nullable=True)
    github_refresh_token_enc = Column(Text, nullable=True)
    encryption_key_version = Column(Integer, default=1)
    # Google
    google_id = Column(String, unique=True, index=True, nullable=True)
    # Local
    email = Column(String, unique=True, index=True, nullable=True)
    password_hash = Column(String, nullable=True)

    # AI Settings
    ai_provider = Column(String, default="github_copilot")
    ollama_api_key_enc = Column(Text, nullable=True)
    ollama_host = Column(String, default="https://ollama.com")
    tokens = Column(Integer, default=100)
    last_token_reset_at = Column(DateTime, default=datetime.datetime.utcnow)
    infinite_tokens = Column(Boolean, default=False)

    projects = relationship("Project", back_populates="user", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String, index=True)
    slug = Column(String, unique=True, index=True)
    description = Column(Text, default="")
    created_date = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="projects")
    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    entities = relationship("Entity", back_populates="project", cascade="all, delete-orphan")
    files = relationship("ProjectFile", back_populates="project", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="project", cascade="all, delete-orphan")

class ProjectFile(Base):
    __tablename__ = "project_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    content_text = Column(Text)
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)
    project_id = Column(Integer, ForeignKey("projects.id"))
    is_selected = Column(Boolean, default=True)

    project = relationship("Project", back_populates="files")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String, index=True)
    content_text = Column(Text)
    upload_date = Column(DateTime, default=datetime.datetime.utcnow)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)

    project = relationship("Project", back_populates="documents")
    entities = relationship("Entity", back_populates="document")

class Entity(Base):
    __tablename__ = "entities"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, index=True)
    name = Column(String, index=True)
    type = Column(String)
    summary = Column(Text)
    is_root = Column(Boolean, default=False)
    document_id = Column(Integer, ForeignKey("documents.id"))
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)

    document = relationship("Document", back_populates="entities")
    project = relationship("Project", back_populates="entities")
    categories = relationship("Category", secondary=entity_category, back_populates="entities")

class Relationship(Base):
    __tablename__ = "relationships"

    id = Column(Integer, primary_key=True, index=True)
    source_entity_slug = Column(String, index=True)
    target_entity_slug = Column(String, index=True)
    context = Column(Text)

class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String, unique=True, index=True)
    name = Column(String, index=True)
    description = Column(Text, default="")

    entities = relationship("Entity", secondary=entity_category, back_populates="categories")

class SystemPrompt(Base):
    __tablename__ = "system_prompts"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    name = Column(String)
    content = Column(Text)
    description = Column(Text, default="")

class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    title = Column(String, default="New Chat")
    created_date = Column(DateTime, default=datetime.datetime.utcnow)
    updated_date = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("Project", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    role = Column(String)  # 'user' or 'assistant'
    content = Column(Text)
    created_date = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("ChatSession", back_populates="messages")
