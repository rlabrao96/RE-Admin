from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.dependencies.auth import require_resident, get_supabase_client
from supabase import Client
from app.config import settings
from datetime import datetime, timezone
import httpx
import hashlib
import hmac

router = APIRouter(prefix="/api/payments/webpay", tags=["webpay"])

WEBPAY_API_URL = "https://webpay3g.transbank.cl/rswebpaytransaction/api/webpay/v1.2"
WEBPAY_INTEGRATION_URL = "https://webpay3gint.transbank.cl/rswebpaytransaction/api/webpay/v1.2"


def get_headers():
    return {
        "Tbk-Api-Key-Id": settings.TRANSBANK_COMMERCE_CODE,
        "Tbk-Api-Key-Secret": settings.TRANSBANK_API_KEY,
        "Content-Type": "application/json",
    }


def get_base_url():
    return WEBPAY_INTEGRATION_URL if settings.ENVIRONMENT == "development" else WEBPAY_API_URL


class WebpayInitRequest(BaseModel):
    charge_ids: list[str]
    amount_clp: int
    return_url: str


class WebpayConfirmRequest(BaseModel):
    token_ws: str


@router.post("/init")
async def init_transaction(
    data: WebpayInitRequest, 
    user=Depends(require_resident),
    supabase: Client = Depends(get_supabase_client),
):
    """Initiate a Webpay Plus transaction for a pending charge."""
    # Verify charge belongs to this resident's unit
    resident_data = user  # require_resident returns the resident record
    charge = (
        supabase.table("charges")
        .select("id, unit_id, amount_clp, status")
        .eq("id", data.charge_id)
        .eq("unit_id", resident_data["unit_id"])
        .maybe_single()
        .execute()
    )
    if not charge.data:
        raise HTTPException(status_code=404, detail="Cobro no encontrado")
    if charge.data["status"] == "paid":
        raise HTTPException(status_code=400, detail="Este cobro ya fue pagado")

    # Create a buy order reference
    buy_order = f"EDIF-{data.charge_ids[0][:8].upper()}"
    session_id = f"RES-{resident_data['id'][:8].upper()}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{get_base_url()}/transactions",
            json={
                "buy_order": buy_order,
                "session_id": session_id,
                "amount": data.amount_clp,
                "return_url": data.return_url,
            },
            headers=get_headers(),
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Error Transbank: {resp.text}")

    resp_data = resp.json()

    # Store pending payment records for each charge
    for c_id in data.charge_ids:
        supabase.table("payments").insert({
            "charge_id": c_id,
            "resident_id": resident_data["id"],
            "amount_clp": 0, # We'll fill this better or keep it simple
            "payment_method": "webpay",
            "status": "pending",
            "reconciliation_status": "pending",
            "external_ref": resp_data.get("token"),
        }).execute()

    return {"url": resp_data.get("url"), "token": resp_data.get("token")}


@router.post("/confirm")
async def confirm_transaction(
    data: WebpayConfirmRequest, 
    user=Depends(require_resident),
    supabase: Client = Depends(get_supabase_client),
):
    """Confirm a Webpay Plus transaction after redirect back from bank."""
    async with httpx.AsyncClient() as client:
        resp = await client.put(
            f"{get_base_url()}/transactions/{data.token_ws}",
            headers=get_headers(),
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Error confirmando Transbank: {resp.text}")

    result = resp.json()

    # response_code == 0 means approved
    if result.get("response_code") != 0:
        # Update payment as failed
        supabase.table("payments").update({
            "status": "failed",
        }).eq("external_ref", data.token_ws).execute()
        raise HTTPException(status_code=402, detail="Pago rechazado por Transbank")

    # Update payment as completed + reconciled (Transbank guarantees funds)
    supabase.table("payments").update({
        "status": "completed",
        "reconciliation_status": "reconciled",
        "paid_at": datetime.now(timezone.utc).isoformat(),
        "reconciled_at": datetime.now(timezone.utc).isoformat(),
    }).eq("external_ref", data.token_ws).execute()

    # Find all charges from the payment records and mark as paid
    payments = (
        supabase.table("payments")
        .select("charge_id")
        .eq("external_ref", data.token_ws)
        .execute()
    )
    for p in payments.data:
        supabase.table("charges").update({"status": "paid"}).eq("id", p["charge_id"]).execute()

    return {"status": "approved", "authorization_code": result.get("authorization_code")}
