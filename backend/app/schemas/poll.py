from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class PollOptionCreate(BaseModel):
    label: str


class PollCreate(BaseModel):
    building_id: str
    title: str
    description: str
    deadline: datetime
    show_results_before_deadline: bool = False
    options: Optional[list[PollOptionCreate]] = None  # None = use defaults ("Aprobar" / "Rechazar")


class VoteCast(BaseModel):
    option_id: str
