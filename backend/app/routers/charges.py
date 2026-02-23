from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, get_supabase_client
from supabase import Client
from app.schemas.charge import ChargeCreate, ChargeResponse, BulkChargeRequest, BulkModifyRequest
from datetime import datetime

router = APIRouter(prefix="/api/charges", tags=["charges"])


@router.get("/")
async def list_charges(
    building_id: str | None = None,
    period: str | None = None,
    status: str | None = None,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """List all charges for buildings managed by the admin."""
    query = supabase.table("charges").select(
        "*, units(number, floor_id, floors(building_id, buildings(name, admin_id)), residents(is_owner, profiles(full_name, email)))"
    )
    if period:
        query = query.eq("period", period)
    if status:
        query = query.eq("status", status)
    result = query.execute()
    # Filter to admin's buildings
    return [
        c for c in result.data
        if c.get("units", {}).get("floors", {}).get("buildings", {}).get("admin_id") == str(user.id)
    ]


@router.get("/summary")
async def get_charges_summary(
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Get a summary of charges grouped by building and period for the admin.
    Calculates total amount, paid count, total count and percentage paid.
    """
    # Fetch charges with nested building information using Supabase
    # Join path: charges -> units -> floors -> buildings
    result = supabase.table("charges").select(
        "amount_clp, period, status, units(floors(building_id, buildings(id, name, admin_id)))"
    ).execute()
    
    if not result.data:
        return []

    summary_map: dict[tuple[str, str], dict] = {}
    for c in result.data:
        # Extract building data from the nested join result
        units = c.get("units") or {}
        floors = units.get("floors") or {}
        building = floors.get("buildings") or {}
        
        # Security: ensure only buildings managed by this admin are included
        if building.get("admin_id") != str(user.id):
            continue
            
        b_id = building.get("id")
        b_name = building.get("name")
        period = c.get("period")
        
        if not b_id or not period:
            continue
            
        key = (str(b_id), str(period))
        if key not in summary_map:
            summary_map[key] = {
                "building_id": b_id,
                "building_name": b_name,
                "period": period,
                "total_amount": 0,
                "paid_count": 0,
                "total_count": 0
            }
        
        summary_map[key]["total_amount"] += int(c.get("amount_clp") or 0)
        summary_map[key]["total_count"] += 1
        if c.get("status") == "paid":
            summary_map[key]["paid_count"] += 1
            
    # Calculate percentages and prepare the final list
    final_summary = []
    for item in summary_map.values():
        total = int(item["total_count"])
        paid = int(item["paid_count"])
        # Percent paid rounded to 2 decimal places
        item["percent_paid"] = round(float(paid / total * 100), 2) if total > 0 else 0.0
        final_summary.append(item)
        
    # Sort by period (descending) and building name (ascending)
    final_summary.sort(key=lambda x: (x["period"], x["building_name"]), reverse=True)
    
    return final_summary


@router.post("/", status_code=201, response_model=ChargeResponse)
async def create_charge(
    data: ChargeCreate,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    result = supabase.table("charges").insert(data.model_dump(mode="json")).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create charge")
    return result.data[0]


@router.post("/generate", status_code=201)
async def bulk_generate_charges(
    data: BulkChargeRequest,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """Generate one charge per unit (weighted by alicuota) for a given period."""
    # Verify admin owns this building
    building_response = (
        supabase.table("buildings")
        .select("id, name")
        .eq("id", data.building_id)
        .eq("admin_id", str(user.id))
        .maybe_single()
        .execute()
    )
    
    if not building_response or building_response.data is None:
        raise HTTPException(status_code=404, detail="Building not found or not managed by user")

    building_data = building_response.data

    # Get all units with their alicuota values
    floors = supabase.table("floors").select("id").eq("building_id", data.building_id).execute()
    floor_ids = [f["id"] for f in floors.data or []]
    if not floor_ids:
        raise HTTPException(status_code=400, detail="Building has no floors")

    units = (
        supabase.table("units")
        .select("id, number, alicuota")
        .in_("floor_id", floor_ids)
        .execute()
    )
    if not units.data:
        raise HTTPException(status_code=400, detail="Building has no units")

    # Check if charges already exist for this period
    existing = (
        supabase.table("charges")
        .select("id")
        .eq("period", data.period)
        .in_("unit_id", [u["id"] for u in units.data])
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409,
            detail=f"Charges already exist for period {data.period}. Delete them first."
        )

    # Build concept
    period_label = data.period
    try:
        dt = datetime.strptime(data.period, "%Y-%m")
        months_es = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
                     "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
        period_label = f"{months_es[dt.month]} {dt.year}"
    except ValueError:
        pass

    concept = data.concept or f"Gasto Común {period_label}"

    # Generate charges: base_amount * (alicuota / 100) per unit
    charges_to_create = [
        {
            "unit_id": unit["id"],
            "concept": concept,
            "period": data.period,
            "amount_clp": max(1, round(data.base_amount_clp * unit["alicuota"] / 100)),
            "due_date": str(data.due_date),
            "status": "pending",
        }
        for unit in units.data
    ]

    result = supabase.table("charges").insert(charges_to_create).execute()

    # Fetch enriched data for the summary
    enriched_result = (
        supabase.table("charges")
        .select("id, amount_clp, period, concept, due_date, status, unit:units(number, alicuota, resident:residents(is_owner, user:profiles(full_name, email)))")
        .in_("id", [c["id"] for c in result.data])
        .execute()
    )
    
    return {
        "created": len(result.data),
        "period": data.period,
        "total_amount_clp": sum(c["amount_clp"] for c in charges_to_create),
        "charges": enriched_result.data,
    }


@router.post("/notify-residents")
async def notify_residents(
    charge_ids: list[str],
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """Simulate sending emails for the given charges."""
    import time
    for cid in charge_ids:
        # Mock logic: just log it
        print(f"MOCK EMAIL SENT for charge {cid}: 'Debes X por el concepto Y...'")
        time.sleep(0.1) # Simulate network delay
    return {"status": "ok", "sent_count": len(charge_ids)}


@router.put("/{charge_id}")
async def update_charge_status(
    charge_id: str,
    status: str,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    valid_statuses = ["pending", "paid", "overdue"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {valid_statuses}")
    result = (
        supabase.table("charges")
        .update({"status": status})
        .eq("id", charge_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Charge not found")
    return result.data[0]


@router.delete("/bulk-delete", status_code=204)
async def bulk_delete_charges(
    building_id: str,
    period: str,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """Delete all charges for a building and period, only if no payments are made."""
    # 1. Verification: check if any units in this building have 'paid' charges for this period
    # Filter by building via units relationship
    check = (
        supabase.table("charges")
        .select("id, status")
        .eq("period", period)
        .eq("status", "paid")
        .execute()
    )
    
    # We need to filter the 'check' results by building_id locally because Supabase 
    # doesn't easily support deep filtering on deletes/joins in one shot without RPC
    # However, we can get the unit_ids for the building first.
    floors = supabase.table("floors").select("id").eq("building_id", building_id).execute()
    floor_ids = [f["id"] for f in floors.data or []]
    
    if not floor_ids:
        # Nothing to delete or building doesn't exist
        return

    units = supabase.table("units").select("id").in_("floor_id", floor_ids).execute()
    unit_ids = [u["id"] for u in units.data or []]
    
    if not unit_ids:
        return

    # Now verify if any of THESE unit_ids have a paid charge for this period
    paid_check = (
        supabase.table("charges")
        .select("id")
        .eq("period", period)
        .eq("status", "paid")
        .in_("unit_id", unit_ids)
        .execute()
    )
    
    if paid_check.data:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete charges for this period because some units have already paid."
        )

    # 2. perform the deletion
    supabase.table("charges").delete().eq("period", period).in_("unit_id", unit_ids).execute()
    return


@router.post("/bulk-modify")
async def bulk_modify_charges(
    data: BulkModifyRequest,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """Modify charges for a building and period (e.g. recalculate or update metadata)."""
    # 1. Verification: Identify target units and check for any payments
    floors = supabase.table("floors").select("id").eq("building_id", data.building_id).execute()
    floor_ids = [f["id"] for f in floors.data or []]
    if not floor_ids:
        raise HTTPException(status_code=404, detail="Building not found or has no floors")

    units_res = supabase.table("units").select("id, number, alicuota").in_("floor_id", floor_ids).execute()
    unit_ids = [u["id"] for u in units_res.data or []]
    if not unit_ids:
        raise HTTPException(status_code=400, detail="Building has no units")

    # Check for any paid charges in this group
    paid_check = (
        supabase.table("charges")
        .select("id")
        .eq("period", data.period)
        .eq("status", "paid")
        .in_("unit_id", unit_ids)
        .execute()
    )
    if paid_check.data:
        raise HTTPException(
            status_code=400,
            detail="Cannot modify charges for this period because some units have already paid."
        )

    # 2. Perform updates
    updates = {}
    if data.new_due_date:
        updates["due_date"] = str(data.new_due_date)
    if data.new_concept:
        updates["concept"] = data.new_concept

    # If we ONLY update metadata:
    if updates and not data.new_base_amount:
        supabase.table("charges").update(updates).eq("period", data.period).in_("unit_id", unit_ids).execute()

    # If we RECALCULATE:
    if data.new_base_amount:
        for unit in units_res.data:
            new_amount = max(1, round(data.new_base_amount * unit["alicuota"] / 100))
            current_updates = {**updates, "amount_clp": new_amount}
            supabase.table("charges")\
                .update(current_updates)\
                .eq("period", data.period)\
                .eq("unit_id", unit["id"])\
                .execute()
    
    return {"status": "ok", "modified_count": len(unit_ids)}
