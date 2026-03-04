from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, get_supabase_client
from supabase import Client
from app.schemas.payment import ManualPaymentCreate, ReconcileRequest
from datetime import datetime, timezone

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("/")
async def list_payments(
    status: str | None = None,
    reconciliation_status: str | None = None,
    period: str | None = None,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """List all payments for the admin's buildings with optional filters."""
    query = supabase.table("payments").select(
        "*, charges(concept, period, units(number, floors(building_id, buildings(name, admin_id))))"
    )
    if status:
        query = query.eq("status", status)
    if reconciliation_status:
        query = query.eq("reconciliation_status", reconciliation_status)
    result = query.order("paid_at", desc=True).execute()

    # Filter to admin's buildings
    filtered = [
        p for p in result.data
        if p.get("charges", {}).get("units", {}).get("floors", {}).get("buildings", {}).get("admin_id") == str(user.id)
    ]

    # If period requested, filter by charge period
    if period:
        filtered = [p for p in filtered if p.get("charges", {}).get("period") == period]

    return filtered


@router.post("/manual", status_code=201)
async def record_manual_payment(
    data: ManualPaymentCreate, 
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """Record a manual payment (e.g. bank transfer) directly by the admin."""
    # Find active resident (using the first charge to identify the unit)
    first_charge = (
        supabase.table("charges")
        .select("unit_id")
        .eq("id", str(data.charge_ids[0]))
        .maybe_single()
        .execute()
    )
    if not first_charge.data:
        raise HTTPException(status_code=404, detail="Charge not found")

    resident = (
        supabase.table("residents")
        .select("id")
        .eq("unit_id", first_charge.data["unit_id"])
        .eq("status", "active")
        .maybe_single()
        .execute()
    )
    resident_id = resident.data["id"] if resident.data else None

    results = []
    # Create a payment record per charge
    for c_id in data.charge_ids:
        # Get individual charge amount if amount_clp wasn't split
        # For simplicity, we assume the total amount matches the sum of charges
        charge_info = supabase.table("charges").select("amount_clp").eq("id", str(c_id)).maybe_single().execute()
        
        result = supabase.table("payments").insert({
            "charge_id": str(c_id),
            "resident_id": resident_id,
            "amount_clp": charge_info.data["amount_clp"] if charge_info.data else 0,
            "payment_method": data.payment_method,
            "status": "completed",
            "reconciliation_status": "reconciled",
            "paid_at": datetime.now(timezone.utc).isoformat(),
            "reconciled_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        
        if result.data:
            supabase.table("charges").update({"status": "paid"}).eq("id", str(c_id)).execute()
            results.append(result.data[0])

    if not results:
        raise HTTPException(status_code=500, detail="Failed to record payments")

    return results[0]  # Return the first one for compatibility


@router.get("/pending-reconciliation")
async def get_pending_reconciliation(
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """Returns payments that need manual reconciliation (status=completed, reconciliation_status=pending)."""
    result = supabase.table("payments").select(
        "*, charges(concept, period, amount_clp, units(number, floors(building_id, buildings(name, admin_id)))), residents(profiles(full_name))"
    ).eq("reconciliation_status", "pending").order("paid_at", desc=True).execute()

    return [
        p for p in result.data
        if p.get("charges", {}).get("units", {}).get("floors", {}).get("buildings", {}).get("admin_id") == str(user.id)
    ]


@router.post("/reconcile")
async def reconcile_payment(
    data: ReconcileRequest, 
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    """Mark a pending payment as reconciled."""
    result = supabase.table("payments").update({
        "reconciliation_status": "reconciled",
        "reconciled_at": datetime.now(timezone.utc).isoformat(),
        **({"external_ref": data.external_ref} if data.external_ref else {}),
    }).eq("id", str(data.payment_id)).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Also mark the linked charge as paid
    payment = result.data[0]
    if payment.get("charge_id"):
        supabase.table("charges").update({"status": "paid"}).eq("id", payment["charge_id"]).execute()

    return result.data[0]
