from fastapi import Header, HTTPException, Depends
from supabase import create_client, Client
from app.config import settings

supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


async def get_current_user(authorization: str = Header(None)):
    """Validate Supabase JWT from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1]
    try:
        user_response = supabase.auth.get_user(token)
        if not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user_response.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def require_admin(user=Depends(get_current_user)):
    """Require the current user to have the 'admin' role."""
    profile = (
        supabase.table("profiles")
        .select("role")
        .eq("id", str(user.id))
        .single()
        .execute()
    )
    if not profile.data or profile.data.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


async def require_resident(user=Depends(get_current_user)):
    """Return the resident record for the current user."""
    resident = (
        supabase.table("residents")
        .select("*")
        .eq("user_id", str(user.id))
        .eq("status", "active")
        .maybeSingle()
        .execute()
    )
    if not resident.data:
        raise HTTPException(status_code=403, detail="No active resident record for this user")
    return {"user": user, "resident": resident.data}
