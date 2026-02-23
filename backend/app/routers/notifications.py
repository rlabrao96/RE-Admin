from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, supabase
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
async def list_notifications(building_id: str | None = None, user=Depends(require_admin)):
    query = supabase.table("notifications").select(
        "*, buildings(name, admin_id)"
    ).order("created_at", desc=True)
    if building_id:
        query = query.eq("building_id", building_id)
    result = query.execute()
    return [n for n in result.data if n.get("buildings", {}).get("admin_id") == str(user.id)]


@router.post("/", status_code=201)
async def create_notification(data: NotificationCreate, user=Depends(require_admin)):
    """Create a notification. If no unit_id, it broadcasts to all units in the building."""
    # Verify ownership
    building = (
        supabase.table("buildings")
        .select("id")
        .eq("id", data.building_id)
        .eq("admin_id", str(user.id))
        .maybeSingle()
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
    residents = (
        supabase.table("residents")
        .select("id, user_id")
        .in_("unit_id", unit_ids)
        .eq("status", "active")
        .execute()
    )
    if residents.data:
        deliveries = [
            {
                "notification_id": notification_id,
                "resident_id": r["id"],
                "read_at": None,
            }
            for r in residents.data
        ]
        supabase.table("notification_deliveries").insert(deliveries).execute()

    return {**result.data[0], "recipients_count": len(residents.data or [])}


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(notification_id: str, user=Depends(require_admin)):
    supabase.table("notifications").delete().eq("id", notification_id).execute()
