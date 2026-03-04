from fastapi import APIRouter, Depends
from typing import List
from uuid import UUID
from datetime import date

from app.schemas.expenses import ExpenseResponse, ExpenseUpdate, ExpenseCopyRequest
from app.dependencies.auth import require_admin, get_supabase_client

router = APIRouter(prefix="/expenses", tags=["Expenses"])

@router.get("/{building_id}", response_model=List[ExpenseResponse])
async def get_expenses_by_period(building_id: UUID, period: str | None = None, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    query = supabase.table("expenses").select("*").eq("building_id", str(building_id))
    if period:
        query = query.eq("period", period)
    res = query.execute()
    return res.data

@router.post("/bulk/{building_id}", response_model=List[ExpenseResponse])
async def bulk_upsert_expenses(building_id: UUID, period: str, expenses: List[ExpenseUpdate], admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
    keep_ids = [str(x.id) for x in expenses if x.id]
    if keep_ids:
        supabase.table("expenses").delete().eq("building_id", str(building_id)).eq("period", period).not_.in_("id", keep_ids).execute()
    else:
        supabase.table("expenses").delete().eq("building_id", str(building_id)).eq("period", period).execute()
        
    upsert_data = []
    for exp in expenses:
        data = exp.model_dump(mode="json", exclude_none=True)
        data["building_id"] = str(building_id)
        upsert_data.append(data)
        
    if upsert_data:
        res = supabase.table("expenses").upsert(upsert_data).execute()
        return res.data
    return []

@router.post("/copy", response_model=List[ExpenseResponse])
async def copy_expenses(req: ExpenseCopyRequest, admin=Depends(require_admin), supabase=Depends(get_supabase_client)):
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
