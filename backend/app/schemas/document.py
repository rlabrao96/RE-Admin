from pydantic import BaseModel, ConfigDict
from datetime import datetime
from uuid import UUID
from typing import Any

class DocumentBase(BaseModel):
    name: str
    is_visible: bool = False

class DocumentCreate(DocumentBase):
    building_id: UUID | None = None

class DocumentResponse(DocumentBase):
    id: UUID
    created_at: datetime | None = None
    uploaded_at: datetime | None = None
    building_id: UUID | None = None
    file_path: str
    content_type: str | None
    size: int | None
    buildings: Any | None = None

    model_config = ConfigDict(from_attributes=True)

class VisibilityUpdate(BaseModel):
    is_visible: bool
