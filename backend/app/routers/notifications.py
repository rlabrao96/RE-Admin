from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, require_resident, get_supabase_client
from supabase import Client
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


class NotificationCreate(BaseModel):
    building_id: str
    title: str
    body: str
    category: str = "general"  # general | maintenance | financial | emergency
    unit_id: Optional[str] = None  # If None, broadcast to all units in building


@router.get("/")
async def list_notifications(
    building_id: str | None = None, 
    category: str | None = None,
    month: str | None = None, # Format: YYYY-MM
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client)
):
    query = supabase.table("notifications").select(
        "*, buildings(id, name, admin_id)"
    ).order("created_at", desc=True)
    
    if building_id:
        query = query.eq("building_id", building_id)
    if category:
        query = query.eq("category", category)
    if month:
        # Simple string prefix match for YYYY-MM
        query = query.gte("created_at", f"{month}-01T00:00:00")
        query = query.lt("created_at", f"{month}-32T23:59:59") # Rough upper bound
        
    result = query.execute()
    # Filter by admin_id (ownership)
    notifications = [n for n in result.data if n.get("buildings", {}).get("admin_id") == str(user.id)]
    
    if notifications:
        notif_ids = [n["id"] for n in notifications]
        # Get delivery counts
        deliveries = (
            supabase.table("notification_deliveries")
            .select("notification_id, read_at")
            .in_("notification_id", notif_ids)
            .execute()
        )
        
        # Aggregate counts
        stats = {}
        for d in deliveries.data or []:
            nid = d["notification_id"]
            if nid not in stats:
                stats[nid] = {"read": 0, "total": 0}
            stats[nid]["total"] += 1
            if d.get("read_at"):
                stats[nid]["read"] += 1
                
        # Attach to notification objects
        for n in notifications:
            s = stats.get(n["id"], {"read": 0, "total": 0})
            n["read_count"] = s["read"]
            n["total_count"] = s["total"]

    return notifications


@router.post("/", status_code=201)
async def create_notification(
    data: NotificationCreate, 
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client)
):
    """Create a notification. If no unit_id, it broadcasts to all units in the building."""
    # Verify ownership
    building = (
        supabase.table("buildings")
        .select("id")
        .eq("id", data.building_id)
        .eq("admin_id", str(user.id))
        .maybe_single()
        .execute()
    )
    if not building.data:
        raise HTTPException(status_code=404, detail="Building not found")

    # Determine target units
    if data.unit_id:
        unit_ids = [data.unit_id]
    else:
        floors = supabase.table("floors").select("id").eq("building_id", data.building_id).execute()
        floor_ids = [f["id"] for f in floors.data or []]
        units = supabase.table("units").select("id").in_("floor_id", floor_ids).execute()
        unit_ids = [u["id"] for u in units.data or []]

    # Create resident deliveries for each unit's active resident
    notification_record = {
        "building_id": data.building_id,
        "title": data.title,
        "body": data.body,
        "category": data.category,
        "unit_id": data.unit_id,
        "created_by": str(user.id),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = supabase.table("notifications").insert(notification_record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create notification")

    notification_id = result.data[0]["id"]

    # Create delivery records for active residents in target units
    # Calculate the official resident (Tenant takes priority over Owner)
    residents = (
        supabase.table("residents")
        .select("id, user_id, unit_id, is_owner")
        .in_("unit_id", unit_ids)
        .eq("status", "active")
        .execute()
    )
    
    if residents.data:
        official_residents_by_unit = {}
        for r in residents.data:
            uid = r["unit_id"]
            # If unit already has a tenant assigned, skip (tenant takes priority)
            if uid in official_residents_by_unit and not official_residents_by_unit[uid]["is_owner"]:
                continue
            
            # Assign if it's the first resident found OR if the new resident is a tenant
            if uid not in official_residents_by_unit or not r["is_owner"]:
                official_residents_by_unit[uid] = r

        deliveries = [
            {
                "notification_id": notification_id,
                "resident_id": official_res["id"],
                "read_at": None,
            }
            for official_res in official_residents_by_unit.values()
        ]
        supabase.table("notification_deliveries").insert(deliveries).execute()

    return {**result.data[0], "recipients_count": len(official_residents_by_unit) if residents.data else 0}


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: str, 
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client)
):
    supabase.table("notifications").delete().eq("id", notification_id).execute()


@router.patch("/deliveries/{notification_id}/read", status_code=200)
async def mark_as_read(
    notification_id: str,
    auth_data=Depends(require_resident),
    supabase: Client = Depends(get_supabase_client)
):
    """Mark a notification as read for the current resident."""
    resident = auth_data["resident"]
    
    # Use the privileged global client to bypass RLS for this update
    # We still filter by resident_id for security
    from app.dependencies.auth import supabase as privileged_supabase
    
    result = (
        privileged_supabase.table("notification_deliveries")
        .update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("notification_id", notification_id)
        .eq("resident_id", resident["id"])
        .is_("read_at", None)
        .execute()
    )
    
    return {"status": "success", "updated_count": len(result.data)}
