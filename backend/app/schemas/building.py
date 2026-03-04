from pydantic import BaseModel
from uuid import UUID
from typing import Optional


# ── Building ──────────────────────────────────────────────────────────────────

class BuildingBase(BaseModel):
    name: str
    address: str
    commune: str
    region: str
    rut_edificio: str


class BuildingCreate(BuildingBase):
    interest_rate_percent: Optional[float] = 0.0
    grace_period_days: Optional[int] = 10
    late_payment_fine_utm: Optional[float] = 1.0
    due_day: Optional[int] = 10


class BuildingResponse(BuildingBase):
    id: UUID
    admin_id: UUID
    interest_rate_percent: float
    grace_period_days: int
    late_payment_fine_utm: float
    due_day: int


# ── Floor ─────────────────────────────────────────────────────────────────────

class FloorBase(BaseModel):
    number: int


class FloorCreate(FloorBase):
    pass


class FloorResponse(FloorBase):
    id: UUID
    building_id: UUID


# ── Unit ──────────────────────────────────────────────────────────────────────

class UnitBase(BaseModel):
    number: str
    type: str = "departamento"
    surface_m2: Optional[float] = None
    alicuota: float


class UnitCreate(UnitBase):
    pass


class UnitResponse(UnitBase):
    id: UUID
    floor_id: UUID


# ── Residents (used in unit update endpoint) ──────────────────────────────────

class ResidentUpdateData(BaseModel):
    name: Optional[str] = None
    lastname: Optional[str] = None
    email: Optional[str] = None
    rut: Optional[str] = None


class UnitResidentsUpdate(BaseModel):
    owner: Optional[ResidentUpdateData] = None
    tenant: Optional[ResidentUpdateData] = None
