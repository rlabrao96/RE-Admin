# Improved Charges Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the charges management view into a hierarchical system (Summary by Building/Period -> Detailed Unit List) with safe bulk deletion and recalculation.

**Architecture:**
- **Summary Layer**: New backend endpoint and frontend dashboard grouped by Building + Month.
- **Detail Layer**: Refactor existing charges list to be a drill-down page.
- **Bulk Logic**: Backend-enforced safety checks (no delete if payments exist).

**Tech Stack:** FastAPI, Supabase, Next.js, React.

---

### Task 1: Backend Summary Endpoint

**Files:**
- Modify: `backend/app/routers/charges.py`

**Step 1: Implement summary logic**
Add a new `GET /api/charges/summary` endpoint that groups charges by building and period.

```python
@router.get("/summary")
async def charges_summary(user=Depends(require_admin)):
    # 1. Fetch buildings for this admin
    # 2. Join with charges grouped by building_id and period
    # 3. Calculate total_amount, paid_count, total_count per group
    # Return list of {building_id, building_name, period, total_amount, status_percent}
```

**Step 2: Verify with curl**
Run the backend and check if the summary returns the expected grouped data.

**Step 3: Commit**
```bash
git add backend/app/routers/charges.py
git commit -m "feat: add charges summary endpoint"
```

---

### Task 2: Backend Safe Bulk Deletion

**Files:**
- Modify: `backend/app/routers/charges.py`

**Step 1: Implement bulk delete with safety check**
Update or add `DELETE /api/charges/bulk-delete`.

```python
@router.delete("/bulk-delete")
async def bulk_delete_charges(building_id: str, period: str, user=Depends(require_admin)):
    # 1. Check if any charge in this building+period is 'paid'
    # 2. If yes, raise 400 "Cannot delete period with payments"
    # 3. If no, delete all charges for that building and period
```

**Step 2: Verify with curl**
Attempt to delete a period with mock payment data and ensure it fails.

**Step 3: Commit**
```bash
git commit -m "feat: implement safe bulk delete for charges"
```

---

### Task 3: Frontend Summary Dashboard

**Files:**
- Modify: `frontend/src/app/admin/charges/page.tsx`

**Step 1: Replace flat list with summary table**
Update the main charges page to fetch from `/api/charges/summary`.
- Show columns: Edificio, Período, Monto Total, % Recaudado.
- Add "Filtrar por Edificio" dropdown at the top.

**Step 2: Commit**
```bash
git commit -m "feat: implement grouped charges summary view"
```

---

### Task 4: Frontend Detail Drill-down

**Files:**
- Create: `frontend/src/app/admin/charges/detail/page.tsx`

**Step 1: Implement detail page**
- Extract the unit list logic from the old page.
- Add query param support for `building_id` and `period`.
- Add "<- Volver" button at the top left.

**Step 2: Commit**
```bash
git commit -m "feat: add charges detail drill-down page"
```

---

### Task 5: Bulk Recalculate & Modify Modal

**Files:**
- Modify: `frontend/src/app/admin/charges/page.tsx`
- Add: `backend/app/routers/charges.py` logic for recalculate.

**Step 1: Implement Modify Modal**
- Add a modal to the summary page for "Modificar".
- Inputs for "Total Amount" (Recalculate) or "Due Date/Concept" (Update Info).

**Step 2: Final Verification**
- Browser walkthrough: Filter -> Detail -> Back -> Modify -> Delete.

**Step 3: Commit**
```bash
git commit -m "feat: implement bulk modify for charge groups"
```
