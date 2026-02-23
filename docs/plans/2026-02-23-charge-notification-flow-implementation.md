# Charge Summary & Notification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Provide a summary view after charge generation where administrators can review and send mock email notifications to residents.

**Architecture:** 
1. Enrich the backend generation response with resident details.
2. Implement a mock "Notify" endpoint.
3. Update the frontend to toggle into a summary view and handle the notification action.

**Tech Stack:** Next.js (frontend), FastAPI (backend), Supabase (database).

---

### Task 1: Enrich Backend Generation Response

**Files:**
- Modify: `backend/app/routers/charges.py:109-115`

**Step 1: Update generate endpoint to return full details**
Modify the return value of `bulk_generate_charges` to fetch and return the joined details (Unit Number, Resident Name, Email, Alicuota).

```python
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
```

**Step 2: Verify with curl**
Run a test generation via curl and verify the JSON has nested `unit` and `resident` objects.

### Task 2: Implement Mock Notification Endpoint

**Files:**
- Modify: `backend/app/routers/charges.py` (Append new endpoint)

**Step 1: Add the notify endpoint**
```python
@router.post("/notify-residents")
async def notify_residents(charge_ids: list[str], user=Depends(require_admin)):
    """Simulate sending emails for the given charges."""
    import time
    for cid in charge_ids:
        # Mock logic: just log it
        print(f"MOCK EMAIL SENT for charge {cid}: 'Debes X por el concepto Y...'")
        time.sleep(0.1) # Simulate network delay
    return {"status": "ok", "sent_count": len(charge_ids)}
```

### Task 3: Frontend Summary Table UI

**Files:**
- Modify: `frontend/src/app/admin/charges/generate/page.tsx`

**Step 1: Add Summary View State**
Add a `showSummary` boolean state and store the full `charges` list from the response.

**Step 2: Implement the Summary Table Component**
Create a new component or section that renders when `showSummary` is true.
Columns: `Unidad`, `Residente`, `Email`, `Alícuota`, `Monto`.

**Step 3: Implement "Notificar" Action**
Connect the "Notificar a los Residentes" button to the new `/api/charges/notify-residents` endpoint. Add a "success" state for each row after notification.

### Task 4: Final Verification

**Step 1: Full Flow Test**
1. Login. 2. Generate charges. 3. Verify table appears. 4. Verify % column. 5. Click Notify. 6. Check backend logs for mock emails.
