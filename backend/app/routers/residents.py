from fastapi import APIRouter, Depends
from app.dependencies.auth import require_admin, get_supabase_client
from supabase import Client

router = APIRouter(prefix="/api/residents", tags=["residents"])


@router.get("/")
async def list_residents(
    building_id: str | None = None,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """List all residents for buildings managed by the admin, with pending charge counts."""
    # Get all buildings to know which ones belong to this admin
    buildings_res = (
        supabase.table("buildings")
        .select("id, name")
        .eq("admin_id", str(user.id))
        .execute()
    )
    managed_buildings = {b["id"]: b["name"] for b in (buildings_res.data or [])}
    if not managed_buildings:
        return []

    # Filter to specific building if requested
    target_buildings = (
        {building_id: managed_buildings[building_id]}
        if building_id and building_id in managed_buildings
        else managed_buildings
    )

    # Get all floors for those buildings
    floors_res = (
        supabase.table("floors")
        .select("id, building_id")
        .in_("building_id", list(target_buildings.keys()))
        .execute()
    )
    floor_map = {f["id"]: f["building_id"] for f in (floors_res.data or [])}

    # Get all units for those floors
    units_res = (
        supabase.table("units")
        .select("id, number, floor_id")
        .in_("floor_id", list(floor_map.keys()))
        .execute()
    )
    unit_map = {u["id"]: {"number": u["number"], "building_id": floor_map.get(u["floor_id"])} for u in (units_res.data or [])}

    if not unit_map:
        return []

    # Get all residents for those units
    residents_res = (
        supabase.table("residents")
        .select("id, unit_id, is_owner, status, user_id, profiles(full_name, email)")
        .in_("unit_id", list(unit_map.keys()))
        .eq("status", "active")
        .execute()
    )

    # Get pending charge counts per unit
    charges_res = (
        supabase.table("charges")
        .select("unit_id")
        .in_("unit_id", list(unit_map.keys()))
        .eq("status", "pending")
        .execute()
    )
    pending_by_unit: dict[str, int] = {}
    for c in (charges_res.data or []):
        uid = c["unit_id"]
        pending_by_unit[uid] = pending_by_unit.get(uid, 0) + 1

    # Build results
    results = []
    for r in (residents_res.data or []):
        unit_info = unit_map.get(r["unit_id"], {})
        building_id_val = unit_info.get("building_id", "")
        profile = r.get("profiles") or {}

        results.append({
            "id": r["id"],
            "user_id": r["user_id"],
            "full_name": profile.get("full_name") or "Sin nombre",
            "email": profile.get("email") or "—",
            "unit_number": unit_info.get("number", "—"),
            "building_id": building_id_val,
            "building_name": target_buildings.get(building_id_val, "—"),
            "is_owner": r["is_owner"],
            "pending_charges": pending_by_unit.get(r["unit_id"], 0),
        })

    results.sort(key=lambda x: (x["building_name"], x["unit_number"]))
    return results
