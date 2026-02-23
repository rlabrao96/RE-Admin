from pydantic import BaseModel
from uuid import UUID
from typing import Optional


class BuildingCreate(BaseModel):
    name: str
    address: str
    commune: str
    region: str
    rut_edificio: str


class BuildingResponse(BaseModel):
    id: UUID
    name: str
    address: str
    commune: str
    region: str
    rut_edificio: str
    admin_id: UUID


class FloorCreate(BaseModel):
    number: int


class FloorResponse(BaseModel):
    id: UUID
    building_id: UUID
    number: int


class UnitCreate(BaseModel):
    number: str
    type: str = "departamento"
    surface_m2: Optional[float] = None
    alicuota: float


class UnitResponse(BaseModel):
    id: UUID
    floor_id: UUID
    number: str
    type: str
    surface_m2: Optional[float]
    alicuota: float
