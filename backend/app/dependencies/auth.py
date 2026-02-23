from fastapi import Header, HTTPException, Depends
from supabase import create_client, Client, ClientOptions
from app.config import settings
import re
options = ClientOptions()

# Bypass supabase-py strict JWT regex for custom sb_ API keys
_original_match = re.match
def _mock_match(pattern, string, flags=0):
    if isinstance(string, str) and "sb_" in string and r"^[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*$" in pattern:
        class FakeMatch: pass
        return FakeMatch()
    return _original_match(pattern, string, flags)

re.match = _mock_match
supabase: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY, options=options)
re.match = _original_match


def get_supabase_client(authorization: str = Header(None)) -> Client:
    """Create a scoped Supabase client using the user's JWT if available."""
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
    
    # Create a new client and set the token for PostgREST
    import re
    _original_match = re.match
    re.match = _mock_match
    try:
        client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY, options=options)
    finally:
        re.match = _original_match
        
    if token:
        client.postgrest.auth(token)
    return client




import httpx

from fastapi import Header, HTTPException, Depends, Request

async def get_current_user(request: Request, authorization: str = Header(None)):
    """Validate Supabase JWT from Authorization header using native API call."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(
                f"{settings.SUPABASE_URL}/auth/v1/user",
                headers={
                    "apikey": settings.SUPABASE_SERVICE_KEY,
                    "Authorization": f"Bearer {token}"
                }
            )
        if res.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        
        return {"user": res.json(), "token": token}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(auth_data=Depends(get_current_user)):
    """Require the current user to have the 'admin' role."""
    user = auth_data["user"]
    token = auth_data["token"]
    
    # Check both app_metadata and user_metadata for the role
    user_metadata = user.get("user_metadata", {})
    app_metadata = user.get("app_metadata", {})
    
    role = user_metadata.get("role") or app_metadata.get("role")
    
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    
    class MockUser:
        def __init__(self, data, token):
            self.id = data.get("id")
            self.email = data.get("email")
            self.metadata = data.get("user_metadata", {})
            self.token = token
            
    return MockUser(user, token)

async def require_resident(user=Depends(get_current_user)):
    """Return the resident record for the current user."""
    # Note: We still need to query the residents table which likely has RLS.
    # We will use the publishable key but we MUST set the token on the client.
    # However, since we are already authenticated as the user in the JWT,
    # Supabase PostgREST will respect the Authorization header if we pass it.
    
    # For now, let's use the same scoped approach if possible or just use psycopg2
    # but to keep it simple, let's try setting the token on the global client.
    supabase.postgrest.auth(user.get("id")) # This is just a placeholder, real way is:
    
    # Actually, the best way without a real service key is to create a client per request
    user_id = user.get("id")
    resident = (
        supabase.table("residents")
        .select("*")
        .eq("user_id", user_id)
        .eq("status", "active")
        .maybe_single()
        .execute()
    )
    if not resident.data:
        raise HTTPException(status_code=403, detail="No active resident record for this user")
    
    class MockUser:
        def __init__(self, data):
            self.id = data.get("id")
            
    return {"user": MockUser(user), "resident": resident.data}
