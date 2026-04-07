from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Table
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

class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    slug = Column(String, unique=True, index=True)
    description = Column(Text, default="")
    created_date = Column(DateTime, default=datetime.datetime.utcnow)

    documents = relationship("Document", back_populates="project", cascade="all, delete-orphan")
    entities = relationship("Entity", back_populates="project", cascade="all, delete-orphan")

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
    slug = Column(String, unique=True, index=True)
    name = Column(String, index=True)
    type = Column(String)
    summary = Column(Text)
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
