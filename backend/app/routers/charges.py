from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, supabase
from app.schemas.charge import ChargeCreate, ChargeResponse, BulkChargeRequest
from datetime import datetime

router = APIRouter(prefix="/api/charges", tags=["charges"])


@router.get("/")
async def list_charges(
    building_id: str | None = None,
    period: str | None = None,
    status: str | None = None,
    user=Depends(require_admin),
):
    """List all charges for buildings managed by the admin."""
    query = supabase.table("charges").select(
        "*, units(number, floor_id, floors(building_id, buildings(name, admin_id)))"
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


@router.post("/", status_code=201, response_model=ChargeResponse)
async def create_charge(data: ChargeCreate, user=Depends(require_admin)):
    result = supabase.table("charges").insert(data.model_dump(mode="json")).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create charge")
    return result.data[0]


@router.post("/generate", status_code=201)
async def bulk_generate_charges(data: BulkChargeRequest, user=Depends(require_admin)):
    """Generate one charge per unit (weighted by alicuota) for a given period."""
    # Verify admin owns this building
    building = (
        supabase.table("buildings")
        .select("id, name")
        .eq("id", data.building_id)
        .eq("admin_id", str(user.id))
        .maybeSingle()
        .execute()
    )
    if not building.data:
        raise HTTPException(status_code=404, detail="Building not found")

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
    return {
        "created": len(result.data),
        "period": data.period,
        "total_amount_clp": sum(c["amount_clp"] for c in charges_to_create),
        "charges": result.data,
    }


@router.put("/{charge_id}")
async def update_charge_status(charge_id: str, status: str, user=Depends(require_admin)):
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


@router.delete("/{charge_id}", status_code=204)
async def delete_charge(charge_id: str, user=Depends(require_admin)):
    supabase.table("charges").delete().eq("id", charge_id).execute()
