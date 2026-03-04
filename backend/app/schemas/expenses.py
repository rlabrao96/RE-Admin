from pydantic import BaseModel, ConfigDict
from typing import Optional
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


class ExpenseUpdate(ExpenseBase):
    id: Optional[UUID] = None


class ExpenseResponse(ExpenseBase):
    id: UUID
    building_id: UUID

    model_config = ConfigDict(from_attributes=True)


class ExpenseCopyRequest(BaseModel):
    building_id: UUID
    from_period: str
    to_period: str
