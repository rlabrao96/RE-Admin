# Expenses Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace manual total cost input with an itemized, editable expenses table that pre-fills the charge generation step.

**Architecture:** 
1. Modify the Supabase `expenses` table to include `period` and remove strict category constraints.
2. Build FastAPI endpoints (schemas, routes) to handle bulk reads, updates, and copying of previous month's expenses.
3. Build Next.js React components for the `/admin/expenses` drill-down UI (Building -> Period -> Editable Table), and modify `/admin/charges/generate` to consume expense totals.

**Tech Stack:** Supabase (PostgreSQL), FastAPI (Python), Next.js (React/TypeScript), Tailwind CSS.

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/20260224000001_update_expenses_table.sql`

**Step 1: Write migration**
```sql
-- Alter existing expenses table to add period and remove strict category checks
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS period text;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_category_check;
```

**Step 2: Run migration**
Run: `supabase db push` (or manual snippet application if in sandbox)

**Step 3: Commit**
```bash
git add supabase/migrations/20260224000001_update_expenses_table.sql
git commit -m "feat(db): add period to expenses and loosen category constraint"
```

---

### Task 2: Backend Schemas

**Files:**
- Create: `backend/app/schemas/expenses.py`

**Step 1: Write schemas**
```python
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
from uuid import UUID

class ExpenseBase(BaseModel):
    concept: str
    amount_clp: int
    expense_date: date
    category: str
    period: str

class ExpenseCreate(ExpenseBase):
    building_id: UUID

class ExpenseUpdate(BaseModel):
    id: Optional[UUID] = None
    concept: str
    amount_clp: int
    expense_date: date
    category: str
    period: str

class ExpenseResponse(ExpenseBase):
    id: UUID
    building_id: UUID

    class Config:
        from_attributes = True

class ExpenseCopyRequest(BaseModel):
    building_id: UUID
    from_period: str
    to_period: str
```

**Step 2: Commit**
```bash
git add backend/app/schemas/expenses.py
git commit -m "feat(api): add pydantic schemas for expenses"
```

---

### Task 3: Backend Routes - GET and POST (Bulk)

**Files:**
- Create: `backend/app/routers/expenses.py`
- Modify: `backend/app/main.py`

**Step 1: Write basic routes in `routers/expenses.py`**
```python
from fastapi import APIRouter, Depends, HTTPException
from typing import List
from uuid import UUID
from datetime import date

from app.schemas.expenses import ExpenseResponse, ExpenseUpdate, ExpenseCopyRequest
from app.dependencies.auth import get_current_user_require_admin
from app.dependencies.supabase import get_supabase

router = APIRouter(prefix="/expenses", tags=["Expenses"])

@router.get("/{building_id}", response_model=List[ExpenseResponse])
async def get_expenses_by_period(building_id: UUID, period: str, admin=Depends(get_current_user_require_admin), supabase=Depends(get_supabase)):
    res = supabase.table("expenses").select("*").eq("building_id", str(building_id)).eq("period", period).execute()
    return res.data

@router.post("/bulk/{building_id}", response_model=List[ExpenseResponse])
async def bulk_upsert_expenses(building_id: UUID, period: str, expenses: List[ExpenseUpdate], admin=Depends(get_current_user_require_admin), supabase=Depends(get_supabase)):
    # Delete existing that are not in the payload
    keep_ids = [str(x.id) for x in expenses if x.id]
    if keep_ids:
        supabase.table("expenses").delete().eq("building_id", str(building_id)).eq("period", period).not_("id", "in", f"({','.join(keep_ids)})").execute()
    else:
        supabase.table("expenses").delete().eq("building_id", str(building_id)).eq("period", period).execute()
        
    upsert_data = []
    for exp in expenses:
        data = exp.model_dump(exclude_none=True)
        data["building_id"] = str(building_id)
        upsert_data.append(data)
        
    if upsert_data:
        res = supabase.table("expenses").upsert(upsert_data).execute()
        return res.data
    return []

@router.post("/copy", response_model=List[ExpenseResponse])
async def copy_expenses(req: ExpenseCopyRequest, admin=Depends(get_current_user_require_admin), supabase=Depends(get_supabase)):
    # strictly copy from previous month
    past = supabase.table("expenses").select("*").eq("building_id", str(req.building_id)).eq("period", req.from_period).execute()
    
    new_data = []
    for p in past.data:
        new_data.append({
            "building_id": str(req.building_id),
            "concept": p["concept"],
            "amount_clp": p["amount_clp"],
            "category": p["category"],
            "period": req.to_period,
            "expense_date": date.today().isoformat()
        })
        
    if new_data:
        res = supabase.table("expenses").insert(new_data).execute()
        return res.data
    return []
```

**Step 2: Register router in `main.py`**
```python
from app.routers import expenses
# add near other includes:
app.include_router(expenses.router, prefix="/api")
```

**Step 3: Commit**
```bash
git add backend/app/routers/expenses.py backend/app/main.py
git commit -m "feat(api): implement expenses endpoints for retrieving, bulk testing, and copying"
```

---

### Task 4: Frontend API layer

**Files:**
- Modify/Create: `frontend/src/lib/api-types.ts` (if it exists) or directly in page.

(Assuming direct fetch calls in the components, we will build out the API wrapper in a single utility file or direct in the component). Add generic types for Expense.

**Step 1: Write `frontend/src/lib/expenses-api.ts`**
```typescript
export interface Expense {
    id?: string;
    concept: string;
    amount_clp: number;
    expense_date: string;
    category: string;
    period: string;
}

export const getExpenses = async (token: string, buildingId: string, period: string) => {
    const res = await fetch(`http://localhost:8000/api/expenses/${buildingId}?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
};

export const saveExpenses = async (token: string, buildingId: string, period: string, expenses: Expense[]) => {
    const res = await fetch(`http://localhost:8000/api/expenses/bulk/${buildingId}?period=${period}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(expenses)
    });
    return res.json();
};

export const copyExpenses = async (token: string, buildingId: string, fromPeriod: string, toPeriod: string) => {
    const res = await fetch(`http://localhost:8000/api/expenses/copy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ building_id: buildingId, from_period: fromPeriod, to_period: toPeriod })
    });
    return res.json();
};
```

**Step 2: Commit**
```bash
git add frontend/src/lib/expenses-api.ts
git commit -m "feat(frontend): add api utility for expenses feature"
```

---

### Task 5: Frontend `/admin/expenses` UI

**Files:**
- Create: `frontend/src/app/admin/expenses/page.tsx`
- Modify: `frontend/src/components/admin/Sidebar.tsx`

**Step 1: Write basic UI for building/period selection, and editable table.**
Implement the logic to:
1. Select Building.
2. Select Period.
3. Show empty state with "New Month" (pre-populates 8 rows) and "Copy Previous" buttons.
4. Render raw `<input>` fields bounded to state array for editing concepts/amounts.
5. "Save" button invokes `saveExpenses`.

**Step 2: Add to Sidebar**
Add "Gastos (Expenses)" link pointing to `/admin/expenses`.

**Step 3: Commit**
```bash
git add frontend/src/app/admin/expenses/page.tsx frontend/src/components/admin/Sidebar.tsx
git commit -m "feat(frontend): build admin expenses drill-down table ui"
```

---

### Task 6: Integrate with Generate Charges UI

**Files:**
- Modify: `frontend/src/app/admin/charges/generate/page.tsx`

**Step 1: Auto-fetch totals**
In the generate charges component, when a Building and Period are selected, trigger a `getExpenses` fetch.
Sum the returned `amount_clp`.
Set the `totalAmount` state to that sum computationally, updating the UI. Provide an info badge indicating "Calculado desde Gastos" vs "Modificado manualmente" if they type over it.

**Step 2: Commit**
```bash
git add frontend/src/app/admin/charges/generate/page.tsx
git commit -m "feat(frontend): link itemized expenses sum to generate charges total field"
```
