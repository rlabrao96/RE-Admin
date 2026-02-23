from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, supabase
from app.schemas.building import (
    BuildingCreate,
    BuildingResponse,
    FloorCreate,
    FloorResponse,
    UnitCreate,
    UnitResponse,
)

router = APIRouter(prefix="/api/buildings", tags=["buildings"])


@router.get("/")
async def list_buildings(user=Depends(require_admin)):
    result = (
        supabase.table("buildings")
        .select("*")
        .eq("admin_id", str(user.id))
        .execute()
    )
    return result.data


@router.post("/", status_code=201, response_model=BuildingResponse)
async def create_building(data: BuildingCreate, user=Depends(require_admin)):
    result = (
        supabase.table("buildings")
        .insert({**data.model_dump(), "admin_id": str(user.id)})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create building")
    return result.data[0]


@router.get("/{building_id}")
async def get_building(building_id: str, user=Depends(require_admin)):
    result = (
        supabase.table("buildings")
        .select("*")
        .eq("id", building_id)
        .eq("admin_id", str(user.id))
        .maybeSingle()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Building not found")
    return result.data


@router.put("/{building_id}")
async def update_building(
    building_id: str, data: BuildingCreate, user=Depends(require_admin)
):
    # Verify ownership first
    existing = (
        supabase.table("buildings")
        .select("id")
        .eq("id", building_id)
        .eq("admin_id", str(user.id))
        .maybeSingle()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")
    result = (
        supabase.table("buildings")
        .update(data.model_dump())
        .eq("id", building_id)
        .execute()
    )
    return result.data[0]


@router.delete("/{building_id}", status_code=204)
async def delete_building(building_id: str, user=Depends(require_admin)):
    existing = (
        supabase.table("buildings")
        .select("id")
        .eq("id", building_id)
        .eq("admin_id", str(user.id))
        .maybeSingle()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Building not found")
    supabase.table("buildings").delete().eq("id", building_id).execute()


# ── Floors ────────────────────────────────────────────────────

@router.get("/{building_id}/floors")
async def list_floors(building_id: str, user=Depends(require_admin)):
    result = (
        supabase.table("floors")
        .select("*")
        .eq("building_id", building_id)
        .order("number")
        .execute()
    )
    return result.data


@router.post("/{building_id}/floors", status_code=201, response_model=FloorResponse)
async def create_floor(
    building_id: str, data: FloorCreate, user=Depends(require_admin)
):
    result = (
        supabase.table("floors")
        .insert({"building_id": building_id, "number": data.number})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create floor")
    return result.data[0]


# ── Units ─────────────────────────────────────────────────────

@router.get("/{building_id}/units")
async def list_units_for_building(building_id: str, user=Depends(require_admin)):
    """Returns all units for a building, grouped by floor."""
    floors = (
        supabase.table("floors")
        .select("id, number")
        .eq("building_id", building_id)
        .order("number")
        .execute()
    )
    result = []
    for floor in floors.data or []:
        units = (
            supabase.table("units")
            .select("*, residents(id, user_id, is_owner, status, profiles(full_name))")
            .eq("floor_id", floor["id"])
            .order("number")
            .execute()
        )
        result.append({"floor": floor, "units": units.data or []})
    return result


router_floors = APIRouter(prefix="/api/floors", tags=["floors"])


@router_floors.post("/{floor_id}/units", status_code=201, response_model=UnitResponse)
async def create_unit(
    floor_id: str, data: UnitCreate, user=Depends(require_admin)
):
    result = (
        supabase.table("units")
        .insert({"floor_id": floor_id, **data.model_dump()})
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create unit")
    return result.data[0]


@router_floors.put("/{floor_id}/units/{unit_id}")
async def update_unit(
    floor_id: str, unit_id: str, data: UnitCreate, user=Depends(require_admin)
):
    result = (
        supabase.table("units")
        .update(data.model_dump())
        .eq("id", unit_id)
        .eq("floor_id", floor_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Unit not found")
    return result.data[0]
