from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, get_supabase_client
from supabase import Client
from app.schemas.charge import ChargeCreate, ChargeResponse, BulkChargeRequest, BulkModifyRequest
from datetime import datetime
from uuid import UUID
import httpx


router = APIRouter(prefix="/api/charges", tags=["charges"])


async def get_utm_clp():
    """Fetch the latest UTM value from mindicador.cl"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get("https://mindicador.cl/api/utm", timeout=5.0)
            response.raise_for_status()
            data = response.json()
            # The API returns a series of values, most recent first
            if data.get("serie") and len(data["serie"]) > 0:
                return data["serie"][0]["valor"]
        except Exception as e:
            print(f"Error fetching UTM: {e}")
    return None


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
        "*, units!inner(number, floor_id, floors!inner(building_id, buildings!inner(name, admin_id)), residents(is_owner, profiles(full_name, email)))"
    )
    if period:
        query = query.eq("period", period)
    if status:
        query = query.eq("status", status)
    if building_id:
        query = query.eq("units.floors.building_id", building_id)
        
    result = query.execute()
    
    # Filter to admin's buildings (as fallback)
    valid_charges = []
    for c in result.data:
        b_admin = c.get("units", {}).get("floors", {}).get("buildings", {}).get("admin_id")
        if b_admin == str(user.id):
            valid_charges.append(c)
            
    # Sort by unit number alphabetically
    valid_charges.sort(key=lambda x: str(x.get("units", {}).get("number", "")))
    
    return valid_charges


@router.get("/summary")
async def get_charges_summary(
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """
    Get a summary of charges grouped by building and period for the admin.
    Calculates total amount, paid count, total count and percentage paid.
    """
    # 1. Get all buildings for this admin 
    buildings_res = supabase.table("buildings").select("id, name, admin_id").eq("admin_id", str(user.id)).execute()
    building_ids = [b["id"] for b in buildings_res.data or []]
    
    # Pre-fetch total units for each building
    unit_counts = {}
    if building_ids:
        units_res = supabase.table("units").select("id, floors(building_id)").execute()
        for u in units_res.data or []:
            b_id = u.get("floors", {}).get("building_id") if u.get("floors") else None
            if b_id in building_ids:
                unit_counts[b_id] = unit_counts.get(b_id, 0) + 1

        # 2. Fetch charges
    result = supabase.table("charges").select(
        "amount_clp, period, status, unit_id, paid_at, units(floors(building_id, buildings(id, name, admin_id)))"
    ).execute()
    
    if not result.data:
        return []

    # Find the latest period for each building to determine what's "Archived"
    latest_periods = {}
    for c in result.data:
        b_id = c.get("units", {}).get("floors", {}).get("building_id")
        per = c.get("period")
        if b_id and per:
            if b_id not in latest_periods or per > latest_periods[b_id]:
                latest_periods[b_id] = per

    summary_map: dict[tuple[str, str], dict] = {}
    for c in result.data:
        units = c.get("units") or {}
        floors = units.get("floors") or {}
        building = floors.get("buildings") or {}
        
        if building.get("admin_id") != str(user.id):
            continue
            
        b_id = building.get("id")
        b_name = building.get("name")
        period = c.get("period")
        unit_id = c.get("unit_id")
        
        if not b_id or not period or not unit_id:
            continue
            
        key = (str(b_id), str(period))
        if key not in summary_map:
            summary_map[key] = {
                "building_id": b_id,
                "building_name": b_name,
                "period": period,
                "total_amount": 0,
                "paid_amount": 0,
                "paid_units": set(),
                "all_units_with_charges": set()
            }
        
        amount = int(c.get("amount_clp") or 0)
        summary_map[key]["total_amount"] += amount
        summary_map[key]["all_units_with_charges"].add(unit_id)
        
        # Frozen history logic: 
        # 1. If it's the latest month, it's dynamic (any 'paid' status counts).
        # 2. If it's older, it's frozen based on paid_at.
        status = c.get("status")
        paid_at_str = c.get("paid_at")
        is_paid_on_time = False
        
        is_latest = (latest_periods.get(b_id) == period)

        if status == "paid":
            if is_latest:
                is_paid_on_time = True
            elif not paid_at_str:
                is_paid_on_time = True # Legacy
            else:
                try:
                    paid_dt = datetime.fromisoformat(paid_at_str.replace('Z', '+00:00'))
                    if paid_dt.strftime("%Y-%m") <= str(period):
                        is_paid_on_time = True
                except (ValueError, TypeError):
                    is_paid_on_time = True
        
        if is_paid_on_time:
            summary_map[key]["paid_units"].add(unit_id)
            summary_map[key]["paid_amount"] += amount
            
    # 3. Incorporate past pending debt into the summary totals
    # For each (building, period) entry in summary_map, we need to add 
    # all charges that are 'pending' AND have a period < current_period.
    
    # We fetch ALL charges for buildings managed by this admin
    all_past_res = supabase.table("charges").select("amount_clp, period, status, paid_at, units(floors(building_id))").execute()
    all_past = all_past_res.data or []

    final_summary = []
    for item in summary_map.values():
        b_id = item["building_id"]
        current_period = item["period"]
        total_building_units = unit_counts.get(b_id, 0)
        paid_units_count = len(item.pop("paid_units"))
        units_with_charges_count = len(item.pop("all_units_with_charges"))
        
        # Add past pending amounts for the units in this building
        past_debt = 0
        past_paid_debt = 0
        for p in all_past:
            p_b_id = (p.get("units") or {}).get("floors", {}).get("building_id")
            if str(p_b_id) == str(b_id) and p["period"] < current_period:
                is_pending_in_current_period = False
                is_paid_in_current_period = False
                
                if p["status"] == "pending":
                    is_pending_in_current_period = True
                elif p["status"] == "paid" and p.get("paid_at"):
                    paid_month = p["paid_at"][:7]
                    if paid_month >= current_period:
                        # It was pending when this period started
                        is_pending_in_current_period = True
                        
                        # BUT, was it paid during this exact period?
                        if paid_month == current_period:
                            is_paid_in_current_period = True
                
                # If it was pending when the period started, it contributes to the total debt pile for that month
                if is_pending_in_current_period:
                    past_debt += int(p.get("amount_clp") or 0)
                    
                # If it was actually paid during this month, it contributes to the total paid pile for that month
                if is_paid_in_current_period:
                    past_paid_debt += int(p.get("amount_clp") or 0)
        
        item["total_amount"] = int(item["total_amount"]) + int(past_debt)
        item["paid_amount"] = int(item["paid_amount"]) + int(past_paid_debt)
        
        # Denominator should be total units in building, 
        # but at least as many as there are units with charges.
        total_count = max(total_building_units, units_with_charges_count)
        
        item["total_count"] = total_count
        item["paid_count"] = paid_units_count
        raw_percent = float(paid_units_count / total_count * 100) if total_count > 0 else 0.0
        item["percent_paid"] = float(int(raw_percent * 100) / 100.0)
        final_summary.append(item)
        
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
        .select("id, name, interest_rate_percent, late_payment_fine_utm")
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
    all_created_ids = []

    # Generate charges: base_amount * (alicuota / 100) per unit
    charges_to_create = [
        {
            "unit_id": unit["id"],
            "concept": concept,
            "period": data.period,
            "amount_clp": max(1, round(data.base_amount_clp * unit["alicuota"] / 100)),
            "due_date": str(data.due_date),
            "status": "pending",
            "created_at": f"{data.period}-01T12:00:00Z",
        }
        for unit in units.data
    ]

    if not data.preview:
        result = supabase.table("charges").insert(charges_to_create).execute()
        all_created_ids = [c["id"] for c in result.data]
    else:
        # For preview, we don't have IDs yet, but we'll return the data
        all_created_ids = []


    # ---------------------------------------------------------
    # AUTOMATIC INTEREST COMPUTATION (LEY 21.442)
    # ---------------------------------------------------------
    monthly_interest_rate = building_data.get("interest_rate_percent") or 0.0
    late_payment_fine_utm = building_data.get("late_payment_fine_utm") or 0.0
    interest_charges_to_create = []
    
    # 1. Shared data for calculations
    try:
        target_date = datetime.strptime(data.period, "%Y-%m").date()
    except Exception:
        target_date = datetime.now().date()

    utm_val = data.utm_clp_value or building_data.get("utm_clp_value")
    if not utm_val and (monthly_interest_rate > 0 or late_payment_fine_utm > 0):
        utm_val = await get_utm_clp()

    # 2. Interest Computation
    if monthly_interest_rate > 0:
        past_unpaid_res = (
            supabase.table("charges")
            .select("unit_id, amount_clp, amount_utm, due_date, concept")
            .in_("unit_id", [u["id"] for u in units.data])
            .eq("status", "pending")
            .lt("period", data.period)
            .execute()
        )
        past_unpaid = past_unpaid_res.data or []
        
        # We group pending amounts by unit to calculate the new increment
        unit_bases = {} # {uid: {"gc": 0, "fine_utm": 0}}
        for c in past_unpaid:
            try:
                due_dt = datetime.strptime(c["due_date"], "%Y-%m-%d").date()
                if target_date > due_dt:
                    uid = c["unit_id"]
                    if uid not in unit_bases:
                        unit_bases[uid] = {"gc": 0, "fine_utm": 0}
                    
                    concept_low = (c.get("concept") or "").lower()
                    # If it's a fine (UTM based), we add to fine_utm
                    if "multa" in concept_low or "individual" in concept_low:
                        unit_bases[uid]["fine_utm"] += float(c.get("amount_utm") or 0)
                    # If it's NOT interest and NOT a fine, it's part of the GC base (or other base CLP)
                    elif "interés" not in concept_low and "interes" not in concept_low:
                        unit_bases[uid]["gc"] += c["amount_clp"]
            except Exception:
                pass
                
        for uid, base in unit_bases.items():
            # Formula: (Pending GC + Pending Fines * Current UTM) * Monthly Rate
            clp_base = base["gc"] + (base["fine_utm"] * utm_val)
            if clp_base > 0:
                interest_increment = max(1, round(clp_base * (monthly_interest_rate / 100)))
                interest_charges_to_create.append({
                    "unit_id": uid,
                    "concept": "Interés por Mora (Incremento Mensual)",
                    "period": data.period,
                    "amount_clp": interest_increment,
                    "due_date": str(data.due_date),
                    "status": "pending",
                    "created_at": f"{data.period}-01T12:00:00Z",
                })
                
        if interest_charges_to_create and not data.preview:
            interest_result = supabase.table("charges").insert(interest_charges_to_create).execute()
            if interest_result.data:
                all_created_ids.extend([c["id"] for c in interest_result.data])
    # ---------------------------------------------------------
    
    # ---------------------------------------------------------
    # AUTOMATIC LATE PAYMENT FINE (UTM)
    # ---------------------------------------------------------
    if late_payment_fine_utm > 0:
        # Re-use target_date logic if defined (overdue_sums keys are our targets)
        # uid in overdue_sums means they have at least one overdue charge
        
        if utm_val:
            fine_amount_clp = round(late_payment_fine_utm * utm_val)
            fine_charges_to_create = []
            
            # overdue_sums was calculated in the interest section
            # If interest_rate was 0, we need to calculate overdue_units here
            overdue_units = set()
            if monthly_interest_rate <= 0: # If interest wasn't calculated, unit_bases might be empty
                past_unpaid_res = (
                    supabase.table("charges")
                    .select("unit_id, due_date") # Only need unit_id and due_date to check for overdue
                    .in_("unit_id", [u["id"] for u in units.data])
                    .eq("status", "pending")
                    .lt("period", data.period)
                    .execute()
                )
                past_unpaid = past_unpaid_res.data or []
                
                # target_date was already defined above
                for c in past_unpaid:
                    try:
                        due_dt = datetime.strptime(c["due_date"], "%Y-%m-%d").date()
                        if target_date > due_dt:
                            overdue_units.add(c["unit_id"])
                    except Exception:
                        pass
            else:
                overdue_units = set(unit_bases.keys()) # Use units that had overdue amounts for interest

            for uid in overdue_units:
                fine_charges_to_create.append({
                    "unit_id": uid,
                    "concept": "Multa por Atraso (Automática)",
                    "period": data.period,
                    "amount_clp": fine_amount_clp,
                    "due_date": str(data.due_date),
                    "status": "pending",
                    "created_at": f"{data.period}-01T12:00:00Z",
                    "amount_utm": late_payment_fine_utm,
                })
            
            if fine_charges_to_create and not data.preview:
                fine_result = supabase.table("charges").insert(fine_charges_to_create).execute()
                if fine_result.data:
                    all_created_ids.extend([c["id"] for c in fine_result.data])
    # ---------------------------------------------------------

    # If PREVIEW, construct enriched objects manually
    if data.preview:
        # To construct enriched objects, we need unit details with profiles
        units_enriched = (
            supabase.table("units")
            .select("id, number, alicuota, resident:residents(is_owner, user:profiles(full_name, email))")
            .in_("id", [u["id"] for u in units.data])
            .execute()
        )
        units_enriched_map = {u["id"]: u for u in units_enriched.data}
        
        enriched_new_data = []
        for c in (charges_to_create + interest_charges_to_create + fine_charges_to_create):
            uid = c["unit_id"]
            enriched_new_data.append({
                **c,
                "id": str(UUID(int=0)), # Fake UUID for preview
                "unit": units_enriched_map.get(uid)
            })
    else:
        # Fetch enriched data for the ACTUAL NEW charges
        res = (
            supabase.table("charges")
            .select("id, unit_id, amount_clp, amount_utm, period, concept, due_date, status, unit:units(number, alicuota, resident:residents(is_owner, user:profiles(full_name, email)))")
            .in_("id", all_created_ids)
            .execute()
        )
        enriched_new_data = res.data or []
    
    # Fetch enriched data for the PAST unpaid charges to show accumulation
    # Note: We already have unit_ids from `units.data`
    enriched_past = (
        supabase.table("charges")
        .select("id, unit_id, amount_clp, amount_utm, period, concept, due_date, status, unit:units(number, alicuota, resident:residents(is_owner, user:profiles(full_name, email)))")
        .in_("unit_id", [u["id"] for u in units.data])
        .eq("status", "pending")
        .lt("period", data.period)
        .execute()
    )
    
    all_charges_for_preview = enriched_new_data + (enriched_past.data or [])
    
    return {
        "created": len(all_created_ids),
        "period": data.period,
        "total_amount_clp": sum(c["amount_clp"] for c in all_charges_for_preview),
        "charges": all_charges_for_preview,
        "is_preview": data.preview
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
    context_period: str | None = None,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    valid_statuses = ["pending", "paid", "overdue"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {valid_statuses}")
    
    update_data: dict = {"status": status}
    if status == "paid":
        if context_period:
            # Record the payment within the context's period to support simulated time/frozen history
            update_data["paid_at"] = f"{context_period}-09T12:00:00Z"
        else:
            update_data["paid_at"] = datetime.now().isoformat()
    elif status == "pending":
        update_data["paid_at"] = None

    result = (
        supabase.table("charges")
        .update(update_data)
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
