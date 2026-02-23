from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, supabase
from app.schemas.payment import ManualPaymentCreate, ReconcileRequest
from datetime import datetime, timezone

router = APIRouter(prefix="/api/payments", tags=["payments"])


@router.get("/")
async def list_payments(
    status: str | None = None,
    reconciliation_status: str | None = None,
    period: str | None = None,
    user=Depends(require_admin),
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
async def record_manual_payment(data: ManualPaymentCreate, user=Depends(require_admin)):
    """Record a manual payment (e.g. bank transfer) directly by the admin."""
    # Get the charge to find the resident
    charge = (
        supabase.table("charges")
        .select("id, unit_id, status")
        .eq("id", str(data.charge_id))
        .maybeSingle()
        .execute()
    )
    if not charge.data:
        raise HTTPException(status_code=404, detail="Charge not found")

    # Find active resident for the unit
    resident = (
        supabase.table("residents")
        .select("id")
        .eq("unit_id", charge.data["unit_id"])
        .eq("status", "active")
        .maybeSingle()
        .execute()
    )
    resident_id = resident.data["id"] if resident.data else None

    # Create payment record
    result = supabase.table("payments").insert({
        "charge_id": str(data.charge_id),
        "resident_id": resident_id,
        "amount_clp": data.amount_clp,
        "payment_method": data.payment_method,
        "status": "completed",
        "reconciliation_status": "reconciled",  # Manual = already reconciled
        "paid_at": datetime.now(timezone.utc).isoformat(),
        "reconciled_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to record payment")

    # Mark charge as paid
    supabase.table("charges").update({"status": "paid"}).eq("id", str(data.charge_id)).execute()

    return result.data[0]


@router.get("/pending-reconciliation")
async def get_pending_reconciliation(user=Depends(require_admin)):
    """Returns payments that need manual reconciliation (status=completed, reconciliation_status=pending)."""
    result = supabase.table("payments").select(
        "*, charges(concept, period, amount_clp, units(number, floors(building_id, buildings(name, admin_id)))), residents(profiles(full_name))"
    ).eq("reconciliation_status", "pending").order("paid_at", desc=True).execute()

    return [
        p for p in result.data
        if p.get("charges", {}).get("units", {}).get("floors", {}).get("buildings", {}).get("admin_id") == str(user.id)
    ]


@router.post("/reconcile")
async def reconcile_payment(data: ReconcileRequest, user=Depends(require_admin)):
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
