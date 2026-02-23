from pydantic import BaseModel
from uuid import UUID
from typing import Optional
from datetime import datetime


class PaymentResponse(BaseModel):
    id: UUID
    charge_id: UUID
    resident_id: UUID
    amount_clp: int
    payment_method: str
    status: str
    reconciliation_status: str
    external_ref: Optional[str]
    paid_at: Optional[datetime]
    reconciled_at: Optional[datetime]


class ManualPaymentCreate(BaseModel):
    charge_id: UUID
    amount_clp: int
    payment_method: str = "transferencia"
    notes: Optional[str] = None


class ReconcileRequest(BaseModel):
    payment_id: UUID
    external_ref: Optional[str] = None
    notes: Optional[str] = None
