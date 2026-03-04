from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import date


# ── Charge ────────────────────────────────────────────────────────────────────

class ChargeBase(BaseModel):
    unit_id: UUID
    concept: str
    period: str           # 'YYYY-MM'
    amount_clp: int
    due_date: date
    amount_utm: Optional[float] = None


class ChargeCreate(ChargeBase):
    pass


class ChargeResponse(ChargeBase):
    id: UUID
    status: str


# ── Bulk operations ───────────────────────────────────────────────────────────

class BulkChargeRequest(BaseModel):
    building_id: str
    period: str           # 'YYYY-MM'
    base_amount_clp: int  # Base amount to multiply by alicuota
    due_date: date
    concept: Optional[str] = None  # defaults to "Gasto Común {period}"
    utm_clp_value: Optional[int] = None
    preview: bool = False


class BulkModifyRequest(BaseModel):
    building_id: str
    period: str
    new_base_amount: Optional[int] = None
    new_due_date: Optional[date] = None
    new_concept: Optional[str] = None
