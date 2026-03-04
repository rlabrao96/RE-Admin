"""
Fintoc integration service.
Handles syncing movements from Fintoc API and auto-reconciliation logic.
"""
import httpx
from datetime import datetime
from typing import Any
from app.config import settings


FINTOC_BASE_URL = "https://api.fintoc.com/v1"


def _headers():
    return {"Authorization": settings.FINTOC_SECRET_KEY}


async def get_link_accounts(link_token: str) -> list[dict]:
    """Fetch accounts for a Fintoc link via GET /v1/accounts?link_token=xxx."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{FINTOC_BASE_URL}/accounts",
            headers=_headers(),
            params={"link_token": link_token},
            timeout=30,
        )
        res.raise_for_status()
        return res.json()


async def get_account_balance(link_token: str, account_id: str) -> dict:
    """Fetch a single account's balance from Fintoc API."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{FINTOC_BASE_URL}/accounts/{account_id}",
            headers=_headers(),
            params={"link_token": link_token},
            timeout=30,
        )
        res.raise_for_status()
        return res.json()


async def get_account_movements(link_token: str, account_id: str, since: str | None = None) -> list[dict]:
    """Fetch movements from Fintoc API for a given account."""
    params: dict = {"link_token": link_token, "per_page": 100}
    if since:
        params["since"] = since

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{FINTOC_BASE_URL}/accounts/{account_id}/movements",
            headers=_headers(),
            params=params,
            timeout=30,
        )
        res.raise_for_status()
        return res.json()


async def sync_movements(supabase, building_id: str) -> dict:
    """
    Sync movements from Fintoc for a building's linked bank account.
    Returns counts of synced and auto-matched movements.
    """
    # 1. Get the building's bank account config
    config_res = supabase.table("bank_account_config") \
        .select("*") \
        .eq("building_id", building_id) \
        .maybe_single() \
        .execute()

    config = config_res.data
    if not config or not config.get("fintoc_link_token"):
        return {"synced_count": 0, "auto_matched_count": 0, "message": "No Fintoc account linked for this building."}

    link_token = config["fintoc_link_token"]
    account_id = config.get("fintoc_account_id")

    # Auto-discover account if not yet saved
    if not account_id:
        try:
            accounts = await get_link_accounts(link_token)
            if not accounts:
                return {"synced_count": 0, "auto_matched_count": 0, "message": "No accounts found in Fintoc link."}
            account_id = accounts[0]["id"]
            # Save account_id for future syncs
            supabase.table("bank_account_config") \
                .update({"fintoc_account_id": account_id}) \
                .eq("building_id", building_id) \
                .execute()
        except httpx.HTTPStatusError as e:
            return {"synced_count": 0, "auto_matched_count": 0, "message": f"Fintoc API error fetching accounts: {e.response.status_code}"}

    since = config.get("last_sync_at")
    since_str = since[:10] if since else None  # 'YYYY-MM-DD'

    # 2. Fetch movements from Fintoc
    try:
        raw_movements = await get_account_movements(link_token, account_id, since_str)
    except httpx.HTTPStatusError as e:
        return {"synced_count": 0, "auto_matched_count": 0, "message": f"Fintoc API error: {e.response.status_code}"}

    if not raw_movements:
        return {"synced_count": 0, "auto_matched_count": 0, "message": "No new movements found."}

    # 3. Filter out already-imported movements
    fintoc_ids = [m["id"] for m in raw_movements]
    existing_res = supabase.table("fintoc_movements") \
        .select("fintoc_id") \
        .in_("fintoc_id", fintoc_ids) \
        .execute()
    existing_ids = {r["fintoc_id"] for r in existing_res.data}

    new_movements = [m for m in raw_movements if m["id"] not in existing_ids]
    if not new_movements:
        return {"synced_count": 0, "auto_matched_count": 0, "message": "All movements already synced."}

    # 4. Insert new movements
    rows = []
    for m in new_movements:
        rows.append({
            "building_id": building_id,
            "fintoc_id": m["id"],
            "type": "inflow" if m.get("amount", 0) > 0 else "outflow",
            "amount": abs(m.get("amount", 0)),
            "currency": m.get("currency", "CLP"),
            "description": m.get("description", ""),
            "post_date": m.get("post_date"),
            "transaction_date": m.get("transaction_date"),
            "holder_id": (m.get("sender_account") or {}).get("holder_id") if m.get("amount", 0) > 0
                else (m.get("recipient_account") or {}).get("holder_id"),
            "holder_name": (m.get("sender_account") or {}).get("holder_name") if m.get("amount", 0) > 0
                else (m.get("recipient_account") or {}).get("holder_name"),
            "reference_id": m.get("reference_id"),
            "reconciliation_status": "unmatched",
            "raw_data": m,
        })

    supabase.table("fintoc_movements").insert(rows).execute()

    # 5. Auto-match inflows by RUT → resident → pending charges
    auto_matched: int = 0
    for row in rows:
        if row["type"] == "inflow" and row["holder_id"]:
            matched = await _try_auto_match_inflow(supabase, building_id, row)
            if matched:
                auto_matched = auto_matched + 1

    # 6. Update last_sync_at
    supabase.table("bank_account_config") \
        .update({"last_sync_at": datetime.utcnow().isoformat()}) \
        .eq("building_id", building_id) \
        .execute()

    return {
        "synced_count": len(rows),
        "auto_matched_count": auto_matched,
        "message": f"Synced {len(rows)} movements, auto-matched {auto_matched}.",
    }


async def _try_auto_match_inflow(supabase, building_id: str, movement: dict) -> bool:
    """
    Try to auto-match an inflow movement to a pending charge.
    Match criteria: holder RUT → resident → unit → oldest pending charge with matching amount.
    """
    rut = _normalize_rut(movement["holder_id"])
    if not rut:
        return False

    # Find resident by RUT in this building's units
    # residents.rut → residents.unit_id → units.floor_id → floors.building_id
    residents_res = supabase.table("residents") \
        .select("id, unit_id, rut") \
        .eq("status", "active") \
        .execute()

    # Filter by normalized RUT
    matching_residents = [
        r for r in residents_res.data
        if _normalize_rut(r.get("rut", "")) == rut
    ]

    if not matching_residents:
        return False

    # Get unit IDs for these residents
    unit_ids = [r["unit_id"] for r in matching_residents]

    # Verify units belong to this building (via floors)
    units_res = supabase.table("units") \
        .select("id, floor_id") \
        .in_("id", unit_ids) \
        .execute()

    floor_ids = [u["floor_id"] for u in units_res.data]
    floors_res = supabase.table("floors") \
        .select("id") \
        .in_("id", floor_ids) \
        .eq("building_id", building_id) \
        .execute()

    valid_floor_ids = {f["id"] for f in floors_res.data}
    valid_unit_ids = [u["id"] for u in units_res.data if u["floor_id"] in valid_floor_ids]

    if not valid_unit_ids:
        return False

    # Find oldest pending charge matching the amount for these units
    charges_res = supabase.table("charges") \
        .select("id, amount_clp") \
        .in_("unit_id", valid_unit_ids) \
        .eq("status", "pending") \
        .order("due_date") \
        .execute()

    for charge in charges_res.data:
        if charge["amount_clp"] == movement["amount"]:
            # Match found — link movement to charge
            supabase.table("fintoc_movements") \
                .update({
                    "reconciliation_status": "auto_matched",
                    "matched_charge_id": charge["id"],
                }) \
                .eq("fintoc_id", movement["fintoc_id"]) \
                .execute()
            return True

    return False


def _normalize_rut(rut: str | None) -> str:
    """Strip dots, dashes, and lowercase for comparison. '12.345.678-9' → '123456789'"""
    if not rut:
        return ""
    return rut.replace(".", "").replace("-", "").strip().lower()


def _charge_priority(charge: dict, current_period: str) -> tuple:
    """
    Return a sort key (priority, period) for the payment waterfall.
    Priority order: 1=multas, 2=intereses, 3=GGCC pendientes, 4=GGCC corriente
    Within same priority, oldest period first.
    """
    concept = (charge.get("concept") or "").lower()
    period = charge.get("period", "")
    if "multa" in concept:
        return (1, period)
    if "inter" in concept:
        return (2, period)
    if period < current_period:
        return (3, period)
    return (4, period)


def get_units_with_pending_charges(supabase, building_id: str) -> list[dict]:
    """
    Returns all units in a building that have pending or partial charges,
    with their debt broken down by waterfall priority.
    """
    from datetime import date
    current_period = date.today().strftime("%Y-%m")

    # Fetch all floors for this building
    floors_res = supabase.table("floors") \
        .select("id") \
        .eq("building_id", building_id) \
        .execute()
    floor_ids = [f["id"] for f in floors_res.data]
    if not floor_ids:
        return []

    # Fetch all units on those floors
    units_res = supabase.table("units") \
        .select("id, number, floor_id") \
        .in_("floor_id", floor_ids) \
        .execute()
    if not units_res.data:
        return []

    unit_ids = [u["id"] for u in units_res.data]
    unit_map: dict[str, dict] = {u["id"]: u for u in units_res.data}

    # Fetch all pending/partial charges for those units
    charges_res = supabase.table("charges") \
        .select("id, unit_id, concept, period, amount_clp, paid_amount, status") \
        .in_("unit_id", unit_ids) \
        .in_("status", ["pending", "partial"]) \
        .execute()

    # Group charges by unit
    charges_by_unit: dict[str, list] = {}
    for c in charges_res.data:
        uid = c["unit_id"]
        charges_by_unit.setdefault(uid, []).append(c)

    result = []
    for uid, charges in charges_by_unit.items():
        # Sort by waterfall priority
        sorted_charges = sorted(charges, key=lambda c: _charge_priority(c, current_period))
        debt_items = []
        total_debt = 0
        for c in sorted_charges:
            paid = c.get("paid_amount") or 0
            remaining = c["amount_clp"] - paid
            priority_key = _charge_priority(c, current_period)
            debt_items.append({
                "charge_id": str(c["id"]),
                "concept": c["concept"],
                "period": c["period"],
                "amount_clp": c["amount_clp"],
                "paid_amount": paid,
                "remaining": remaining,
                "priority": priority_key[0],
            })
            total_debt += remaining

        unit = unit_map[uid]
        result.append({
            "unit_id": str(uid),
            "unit_number": unit["number"],
            "floor_number": None,  # could join floor if needed
            "total_debt": total_debt,
            "charges": debt_items,
        })

    # Sort units by unit_number
    result.sort(key=lambda x: x["unit_number"])
    return result


def apply_waterfall_match(supabase, movement_id: str, unit_id: str) -> dict:
    """
    Distribute a bank movement's full amount across a unit's pending charges
    following the legal payment waterfall: multas → intereses → GGCC pendientes → GGCC corriente.
    Each charge is updated in the DB and an allocation record is inserted.
    """
    from datetime import date
    current_period = date.today().strftime("%Y-%m")

    # 1. Fetch movement (amount is immutable — it's what the bank recorded)
    movement_res = supabase.table("fintoc_movements") \
        .select("id, amount, post_date, reconciliation_status") \
        .eq("id", movement_id) \
        .single() \
        .execute()
    movement = movement_res.data
    if not movement:
        raise ValueError(f"Movement {movement_id} not found")
    if movement["reconciliation_status"] != "unmatched":
        raise ValueError(f"Movement {movement_id} is already reconciled")

    # 2. Fetch all pending/partial charges for this unit, sorted by waterfall priority
    charges_res = supabase.table("charges") \
        .select("id, concept, period, amount_clp, paid_amount, status") \
        .eq("unit_id", unit_id) \
        .in_("status", ["pending", "partial"]) \
        .execute()

    sorted_charges = sorted(
        charges_res.data,
        key=lambda c: _charge_priority(c, current_period)
    )

    # 3. Distribute the movement amount through the waterfall
    remaining = movement["amount"]
    allocations = []

    for charge in sorted_charges:
        if remaining <= 0:
            break
        paid_so_far = charge.get("paid_amount") or 0
        charge_remaining = charge["amount_clp"] - paid_so_far
        apply = min(remaining, charge_remaining)
        new_paid = paid_so_far + apply
        new_status = "paid" if new_paid >= charge["amount_clp"] else "partial"

        # Update charge
        supabase.table("charges") \
            .update({"paid_amount": new_paid, "status": new_status}) \
            .eq("id", charge["id"]) \
            .execute()

        # Insert allocation record
        supabase.table("movement_charge_allocations").insert({
            "movement_id": movement_id,
            "charge_id": charge["id"],
            "amount_clp": apply,
        }).execute()

        allocations.append({
            "charge_id": str(charge["id"]),
            "charge_concept": charge["concept"],
            "amount_applied": apply,
            "new_status": new_status,
        })
        remaining -= apply

    # 4. Find active resident for the unit (for payment records)
    resident_res = supabase.table("residents") \
        .select("id") \
        .eq("unit_id", unit_id) \
        .eq("status", "active") \
        .maybe_single() \
        .execute()
    resident_id = resident_res.data["id"] if resident_res.data else None

    # 5. Create a payment record per charge allocation (visible in payments tab)
    for alloc in allocations:
        payment_status = "partial" if alloc["new_status"] == "partial" else "completed"
        supabase.table("payments").insert({
            "charge_id": alloc["charge_id"],
            "resident_id": resident_id,
            "amount_clp": alloc["amount_applied"],
            "payment_method": "bank_transfer",
            "status": payment_status,
            "reconciliation_status": "matched",
            "paid_at": movement["post_date"],
        }).execute()

    # 6. Mark movement as manual_matched
    supabase.table("fintoc_movements") \
        .update({"reconciliation_status": "manual_matched"}) \
        .eq("id", movement_id) \
        .execute()

    return {
        "allocations": allocations,
        "total_applied": movement["amount"] - remaining,
        "movement_status": "manual_matched",
    }
