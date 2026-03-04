from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import List, Optional
from uuid import UUID
from datetime import datetime, date
import calendar
import httpx

from app.schemas.fintoc import (
    BankAccountConfigCreate,
    BankAccountConfigResponse,
    FintocMovementResponse,
    ManualMatchRequest,
    IgnoreMovementRequest,
    SyncResponse,
    CheckoutRequest,
    CheckoutResponse,
    LinkIntentResponse,
    ExchangeTokenRequest,
    UnitWithPendingCharges,
    WaterfallMatchRequest,
    WaterfallMatchResponse,
    MatchAsExpenseRequest,
    MatchAsOtherRequest,
)
from app.dependencies.auth import require_admin, get_current_user, get_supabase_client
from app.services import fintoc_service
from app.config import settings

router = APIRouter(prefix="/fintoc", tags=["Fintoc"])

FINTOC_API_V1 = "https://api.fintoc.com/v1"
FINTOC_API_V2 = "https://api.fintoc.com/v2"


def _fintoc_headers():
    return {"Authorization": settings.FINTOC_SECRET_KEY, "Content-Type": "application/json"}


# ── Bank Account Config ──────────────────────────────────────────────────────

@router.get("/config/{building_id}", response_model=BankAccountConfigResponse | None)
async def get_bank_config(building_id: UUID, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    res = supabase.table("bank_account_config") \
        .select("*") \
        .eq("building_id", str(building_id)) \
        .maybe_single() \
        .execute()
    return res.data


@router.get("/accounts/{building_id}")
async def list_link_accounts(building_id: UUID, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    """List bank accounts available in the building's Fintoc link."""
    config_res = supabase.table("bank_account_config") \
        .select("fintoc_link_token") \
        .eq("building_id", str(building_id)) \
        .maybe_single() \
        .execute()

    config = config_res.data
    if not config or not config.get("fintoc_link_token"):
        raise HTTPException(status_code=404, detail="No Fintoc link found for this building")

    accounts = await fintoc_service.get_link_accounts(config["fintoc_link_token"])
    return accounts


@router.put("/config/{building_id}", response_model=BankAccountConfigResponse)
async def upsert_bank_config(building_id: UUID, payload: BankAccountConfigCreate, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    data = payload.model_dump(mode="json", exclude_none=True)
    data["building_id"] = str(building_id)
    res = supabase.table("bank_account_config").upsert(data, on_conflict="building_id").execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save bank config")
    return res.data[0]


# ── Sync & Movements ─────────────────────────────────────────────────────────

@router.post("/sync/{building_id}", response_model=SyncResponse)
async def sync_movements(building_id: UUID, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    result = await fintoc_service.sync_movements(supabase, str(building_id))
    return result


@router.get("/movements/{building_id}", response_model=List[FintocMovementResponse])
async def list_movements(
    building_id: UUID,
    status: Optional[str] = None,
    month: Optional[str] = Query(None, description="Filter by month in YYYY-MM format"),
    admin=Depends(require_admin),
    supabase=Depends(get_supabase_client),
):
    query = supabase.table("fintoc_movements") \
        .select("*") \
        .eq("building_id", str(building_id)) \
        .order("post_date", desc=True)

    if status:
        query = query.eq("reconciliation_status", status)

    if month:
        try:
            year, mon = map(int, month.split("-"))
            last_day = calendar.monthrange(year, mon)[1]
            query = query.gte("post_date", f"{month}-01").lte("post_date", f"{month}-{last_day:02d}")
        except (ValueError, AttributeError):
            pass

    res = query.execute()
    return res.data


# ── Manual Matching ──────────────────────────────────────────────────────────

@router.post("/match")
async def manual_match(payload: ManualMatchRequest, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    update: dict = {"reconciliation_status": "manual_matched"}
    if payload.charge_id:
        update["matched_charge_id"] = str(payload.charge_id)
    if payload.expense_id:
        update["matched_expense_id"] = str(payload.expense_id)

    if not payload.charge_id and not payload.expense_id:
        raise HTTPException(status_code=400, detail="Must provide charge_id or expense_id")

    supabase.table("fintoc_movements") \
        .update(update) \
        .eq("id", str(payload.movement_id)) \
        .execute()

    return {"status": "ok"}


@router.post("/ignore")
async def ignore_movement(payload: IgnoreMovementRequest, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    supabase.table("fintoc_movements") \
        .update({"reconciliation_status": "ignored"}) \
        .eq("id", str(payload.movement_id)) \
        .execute()

    return {"status": "ok"}


@router.post("/unmatch/{movement_id}")
async def unmatch_movement(movement_id: UUID, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    supabase.table("fintoc_movements") \
        .update({
            "reconciliation_status": "unmatched",
            "matched_charge_id": None,
            "matched_expense_id": None,
        }) \
        .eq("id", str(movement_id)) \
        .execute()

    return {"status": "ok"}


# ── Conciliation Mode ─────────────────────────────────────────────────────────

@router.get("/balance/{building_id}")
async def get_account_balance(
    building_id: UUID,
    admin=Depends(require_admin),
    supabase=Depends(get_supabase_client),
):
    """Return the current account balance from Fintoc for the linked bank account."""
    config_res = supabase.table("bank_account_config") \
        .select("fintoc_link_token, fintoc_account_id") \
        .eq("building_id", str(building_id)) \
        .maybe_single() \
        .execute()
    config = config_res.data
    if not config or not config.get("fintoc_link_token") or not config.get("fintoc_account_id"):
        raise HTTPException(status_code=404, detail="No linked account found for this building")
    try:
        account = await fintoc_service.get_account_balance(
            config["fintoc_link_token"],
            config["fintoc_account_id"],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Fintoc error: {str(e)}")
    balance = account.get("balance", {})
    return {
        "available": balance.get("available"),
        "current": balance.get("current"),
        "currency": account.get("currency", "CLP"),
        "account_name": account.get("official_name") or account.get("name"),
        "holder_name": account.get("holder_name"),
        "refreshed_at": account.get("refreshed_at"),
    }


@router.get("/units-with-charges/{building_id}", response_model=List[UnitWithPendingCharges])
async def get_units_with_pending_charges(
    building_id: UUID,
    admin=Depends(require_admin),
    supabase=Depends(get_supabase_client),
):
    """Return all units in a building that have pending/partial charges, with debt breakdown."""
    result = fintoc_service.get_units_with_pending_charges(supabase, str(building_id))
    return result


@router.post("/match/waterfall", response_model=WaterfallMatchResponse)
async def waterfall_match(
    payload: WaterfallMatchRequest,
    admin=Depends(require_admin),
    supabase=Depends(get_supabase_client),
):
    """
    Apply a bank movement's full amount to a unit's debt using the legal payment waterfall:
    multas → intereses → GGCC pendientes → GGCC corriente.
    Only for bank transfer reconciliation — Fintoc Checkout always pays in full.
    """
    try:
        result = fintoc_service.apply_waterfall_match(supabase, str(payload.movement_id), str(payload.unit_id))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return result


@router.post("/match/expense")
async def match_as_expense(
    payload: MatchAsExpenseRequest,
    admin=Depends(require_admin),
    supabase=Depends(get_supabase_client),
):
    """
    Classify an outflow movement as a building expense.
    Creates an expense record and links the movement to it.
    """
    # Fetch movement to get amount and post_date
    movement_res = supabase.table("fintoc_movements") \
        .select("id, amount, post_date, reconciliation_status") \
        .eq("id", str(payload.movement_id)) \
        .single() \
        .execute()

    movement = movement_res.data
    if not movement:
        raise HTTPException(status_code=404, detail="Movement not found")
    if movement["reconciliation_status"] != "unmatched":
        raise HTTPException(status_code=400, detail="Movement is already reconciled")

    # Create expense record
    expense_res = supabase.table("expenses").insert({
        "building_id": str(payload.building_id),
        "concept": payload.concept,
        "category": payload.category,
        "amount_clp": movement["amount"],
        "expense_date": movement["post_date"],
        "period": payload.period,
    }).execute()

    if not expense_res.data:
        raise HTTPException(status_code=500, detail="Failed to create expense record")

    expense_id = expense_res.data[0]["id"]

    # Link movement to expense
    supabase.table("fintoc_movements").update({
        "reconciliation_status": "manual_matched",
        "matched_expense_id": expense_id,
    }).eq("id", str(payload.movement_id)).execute()

    return {"status": "ok", "expense_id": expense_id}


@router.post("/match/other")
async def match_as_other(
    payload: MatchAsOtherRequest,
    admin=Depends(require_admin),
    supabase=Depends(get_supabase_client),
):
    """
    Mark an income movement as reconciled with a free-text label (non-unit income).
    No charge or expense is linked.
    """
    movement_res = supabase.table("fintoc_movements") \
        .select("id, reconciliation_status, description") \
        .eq("id", str(payload.movement_id)) \
        .single() \
        .execute()

    movement = movement_res.data
    if not movement:
        raise HTTPException(status_code=404, detail="Movement not found")
    if movement["reconciliation_status"] != "unmatched":
        raise HTTPException(status_code=400, detail="Movement is already reconciled")

    # Append label to description for traceability
    existing_desc = movement.get("description") or ""
    new_desc = f"{existing_desc} [Otro: {payload.label}]".strip() if existing_desc else f"[Otro: {payload.label}]"

    supabase.table("fintoc_movements").update({
        "reconciliation_status": "manual_matched",
        "description": new_desc,
    }).eq("id", str(payload.movement_id)).execute()

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════════════════════
# Part A: Checkout Session (Resident Payment Initiation)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/checkout", response_model=CheckoutResponse)
async def create_checkout(payload: CheckoutRequest, auth=Depends(get_current_user), supabase=Depends(get_supabase_client)):
    """Create a Fintoc Checkout Session for resident payment."""
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{FINTOC_API_V2}/checkout_sessions",
            headers=_fintoc_headers(),
            json={
                "amount": payload.amount,
                "currency": "clp",
                "customer_email": auth["user"].get("email", ""),
                "success_url": payload.success_url,
                "cancel_url": payload.cancel_url,
                "metadata": {
                    "charge_ids": ",".join(payload.charge_ids),
                    "building_id": payload.building_id,
                },
            },
            timeout=30,
        )

    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Fintoc API error: {res.status_code} - {res.text}")

    data = res.json()
    session_id = data.get("id", "")
    redirect_url = data.get("redirect_url", "")

    # Store in DB for webhook reconciliation
    supabase.table("fintoc_checkout_sessions").insert({
        "fintoc_session_id": session_id,
        "building_id": payload.building_id,
        "charge_ids": payload.charge_ids,
        "amount": payload.amount,
        "status": "pending",
    }).execute()

    return CheckoutResponse(redirect_url=redirect_url, session_id=session_id)


@router.post("/webhook")
async def fintoc_webhook(request: Request):
    """
    Receive Fintoc webhook events.
    No auth — Fintoc calls this directly. Validate via event structure.
    """
    from app.dependencies.auth import supabase as service_supabase

    body = await request.json()
    event_type = body.get("type", "")
    event_data = body.get("data", {})

    if event_type == "checkout_session.finished":
        session_id = event_data.get("id", "")
        payment_status = (
            event_data.get("payment_resource", {})
            .get("payment_intent", {})
            .get("status", "")
        )
        payment_intent_id = (
            event_data.get("payment_resource", {})
            .get("payment_intent", {})
            .get("id", "")
        )

        # Look up our checkout session
        cs_res = service_supabase.table("fintoc_checkout_sessions") \
            .select("*") \
            .eq("fintoc_session_id", session_id) \
            .maybe_single() \
            .execute()

        cs = cs_res.data
        if not cs:
            return {"status": "ignored", "reason": "unknown session"}

        if payment_status == "succeeded":
            # Mark session as finished
            service_supabase.table("fintoc_checkout_sessions") \
                .update({"status": "finished", "payment_intent_id": payment_intent_id}) \
                .eq("fintoc_session_id", session_id) \
                .execute()

            # Mark all charges as paid + create payment records
            charge_ids = cs.get("charge_ids", [])
            now = datetime.utcnow().isoformat()

            for charge_id in charge_ids:
                # Get charge details
                charge_res = service_supabase.table("charges") \
                    .select("*") \
                    .eq("id", charge_id) \
                    .maybe_single() \
                    .execute()

                charge = charge_res.data
                if not charge or charge.get("status") == "paid":
                    continue

                # Mark charge as paid
                service_supabase.table("charges") \
                    .update({"status": "paid"}) \
                    .eq("id", charge_id) \
                    .execute()

                # Create payment record
                service_supabase.table("payments").insert({
                    "charge_id": charge_id,
                    "amount_clp": charge.get("amount_clp", 0),
                    "payment_method": "bank_transfer",
                    "status": "completed",
                    "reconciliation_status": "matched",
                    "fintoc_transaction_id": payment_intent_id,
                    "paid_at": now,
                }).execute()

        else:
            # Payment failed or requires action
            service_supabase.table("fintoc_checkout_sessions") \
                .update({"status": "failed", "payment_intent_id": payment_intent_id}) \
                .eq("fintoc_session_id", session_id) \
                .execute()

    return {"status": "ok"}


# ── Link Token Webhook (receives link_token from Fintoc after widget connect) ─

@router.post("/webhook/link-token/{building_id}")
async def receive_link_token(building_id: UUID, request: Request, supabase=Depends(get_supabase_client)):
    """Webhook called by Fintoc after widget connect — receives the link_token."""
    body = await request.json()
    link_token = body.get("data", {}).get("link_token", "")

    if not link_token:
        raise HTTPException(status_code=400, detail="No link_token in webhook payload")

    # Save link_token to bank_account_config
    config_data = {
        "building_id": str(building_id),
        "fintoc_link_token": link_token,
        "fintoc_account_id": None,
        "last_sync_at": None,
    }

    supabase.table("bank_account_config") \
        .upsert(config_data, on_conflict="building_id") \
        .execute()

    return {"status": "ok"}


# ══════════════════════════════════════════════════════════════════════════════
# Part B: Link Intent (Admin Account Linking via Widget)
# ══════════════════════════════════════════════════════════════════════════════

@router.post("/link-intent/{building_id}", response_model=LinkIntentResponse)
async def create_link_intent(building_id: UUID, admin=Depends(require_admin)):
    """Create a Fintoc Link Intent — returns widget_token for the frontend widget."""
    webhook_url = f"{settings.BACKEND_PUBLIC_URL}/api/fintoc/webhook/link-token/{building_id}"
    async with httpx.AsyncClient() as client:
        res = await client.post(
            f"{FINTOC_API_V1}/link_intents",
            headers=_fintoc_headers(),
            json={
                "product": "movements",
                "country": "cl",
                "holder_type": "business",
                "webhook_url": webhook_url,
            },
            timeout=30,
        )

    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Fintoc API error: {res.status_code} - {res.text}")

    data = res.json()
    widget_token = data.get("widget_token", "")

    return LinkIntentResponse(widget_token=widget_token)


@router.post("/exchange/{building_id}", response_model=BankAccountConfigResponse)
async def exchange_token(building_id: UUID, payload: ExchangeTokenRequest, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    """Exchange the widget's exchange_token for a permanent link_token and save it."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"{FINTOC_API_V1}/links/exchange",
            headers=_fintoc_headers(),
            params={"exchange_token": payload.exchange_token},
            timeout=30,
        )

    if res.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Fintoc exchange error: {res.status_code} - {res.text}")

    data = res.json()
    link_token = data.get("link_token", "")
    bank_name = data.get("institution", {}).get("name", "")
    holder_name = data.get("holder_name", "")
    holder_id = data.get("holder_id", "")

    # Save link_token and basic info — account selection happens separately
    config_data = {
        "building_id": str(building_id),
        "fintoc_link_token": link_token,
        "bank_name": bank_name,
        "account_owner_name": holder_name,
        "account_owner_rut": holder_id,
        "fintoc_account_id": None,
        "last_sync_at": None,
    }

    result = supabase.table("bank_account_config") \
        .upsert(config_data, on_conflict="building_id") \
        .execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save bank config after exchange")

    return result.data[0]
