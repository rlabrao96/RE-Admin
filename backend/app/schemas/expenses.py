from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from uuid import UUID

class ExpenseBase(BaseModel):
    concept: str
    amount_clp: int
    expense_date: date
    category: str
    period: str

class ExpenseCreate(ExpenseBase):
    building_id: UUID

class ExpenseUpdate(BaseModel):
    id: Optional[UUID] = None
    concept: str
    amount_clp: int
    expense_date: date
    category: str
    period: str

class ExpenseResponse(ExpenseBase):
    id: UUID
    building_id: UUID

    class Config:
        from_attributes = True

class ExpenseCopyRequest(BaseModel):
    building_id: UUID
    from_period: str
    to_period: str
