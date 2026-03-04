from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date, datetime
from uuid import UUID


# ── Bank Account Config ──────────────────────────────────────────────────────

class BankAccountConfigCreate(BaseModel):
    building_id: Optional[UUID] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_owner_rut: Optional[str] = None
    account_owner_name: Optional[str] = None
    fintoc_link_token: Optional[str] = None
    fintoc_account_id: Optional[str] = None


class BankAccountConfigResponse(BaseModel):
    id: UUID
    building_id: UUID
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    account_owner_rut: Optional[str] = None
    account_owner_name: Optional[str] = None
    fintoc_link_token: Optional[str] = None
    fintoc_account_id: Optional[str] = None
    last_sync_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ── Fintoc Movement ──────────────────────────────────────────────────────────

class FintocMovementResponse(BaseModel):
    id: UUID
    building_id: UUID
    fintoc_id: str
    type: str              # 'inflow' | 'outflow'
    amount: int
    currency: str
    description: Optional[str] = None
    post_date: date
    transaction_date: Optional[date] = None
    holder_id: Optional[str] = None
    holder_name: Optional[str] = None
    reference_id: Optional[str] = None
    reconciliation_status: str
    matched_charge_id: Optional[UUID] = None
    matched_expense_id: Optional[UUID] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ManualMatchRequest(BaseModel):
    movement_id: UUID
    charge_id: Optional[UUID] = None
    expense_id: Optional[UUID] = None


class IgnoreMovementRequest(BaseModel):
    movement_id: UUID


class SyncResponse(BaseModel):
    synced_count: int
    auto_matched_count: int
    message: str


# ── Checkout Session (Payment Initiation) ────────────────────────────────────

class CheckoutRequest(BaseModel):
    charge_ids: list[str]
    amount: int
    building_id: str
    success_url: str
    cancel_url: str


class CheckoutResponse(BaseModel):
    redirect_url: str
    session_id: str


# ── Link Intent (Account Linking Widget) ─────────────────────────────────────

class LinkIntentResponse(BaseModel):
    widget_token: str


class ExchangeTokenRequest(BaseModel):
    exchange_token: str


# ── Conciliation Mode ─────────────────────────────────────────────────────────

class UnitDebtItem(BaseModel):
    charge_id: str
    concept: str
    period: str
    amount_clp: int
    paid_amount: int
    remaining: int
    priority: int  # 1=multa, 2=interes, 3=ggcc_pendiente, 4=ggcc_corriente


class UnitWithPendingCharges(BaseModel):
    unit_id: str
    unit_number: str
    floor_number: Optional[str] = None
    total_debt: int
    charges: list[UnitDebtItem]


class WaterfallMatchRequest(BaseModel):
    movement_id: UUID
    unit_id: UUID


class WaterfallAllocation(BaseModel):
    charge_id: str
    charge_concept: str
    amount_applied: int
    new_status: str


class WaterfallMatchResponse(BaseModel):
    allocations: list[WaterfallAllocation]
    total_applied: int
    movement_status: str


class MatchAsExpenseRequest(BaseModel):
    movement_id: UUID
    category: str
    concept: str
    building_id: UUID
    period: str  # YYYY-MM


class MatchAsOtherRequest(BaseModel):
    movement_id: UUID
    label: str  # free-text description for non-unit income
