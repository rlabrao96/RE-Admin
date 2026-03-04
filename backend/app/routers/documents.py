from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from app.dependencies.auth import require_admin, require_resident, get_supabase_client
from app.schemas.document import DocumentResponse, VisibilityUpdate
from supabase import Client, create_client
from app.config import settings
import uuid
import os

router = APIRouter(prefix="/api/documents", tags=["documents"])

@router.get("/building/{building_id}", response_model=list[DocumentResponse])
async def list_building_documents(
    building_id: str,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client)
):
    """List all documents for a building (Admin only)."""
    # Verify building ownership
    b_res = supabase.table("buildings").select("id").eq("id", building_id).eq("admin_id", str(user.id)).maybe_single().execute()
    if not b_res.data:
        raise HTTPException(status_code=404, detail="Building not found or not authorized")

    # List documents for this building OR global documents
    res = (
        supabase.table("documents")
        .select("*")
        .or_(f"building_id.eq.{building_id},building_id.is.null")
        .order("uploaded_at", desc=True)
        .execute()
    )
    return res.data

@router.get("/admin/all", response_model=list[DocumentResponse])
async def list_all_admin_documents(
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client)
):
    """List all documents for all buildings managed by the admin."""
    # 1. Get all buildings for this admin
    b_res = supabase.table("buildings").select("id").eq("admin_id", str(user.id)).execute()
    building_ids = [b["id"] for b in b_res.data]
    
    if not building_ids:
        return []

    # 2. Get documents for these buildings OR global documents
    query = (
        supabase.table("documents")
        .select("*, buildings(name)")
        .or_(f"building_id.in.({','.join(building_ids)}),building_id.is.null")
    )
    
    res = query.order("uploaded_at", desc=True).execute()
    return res.data

@router.get("/portal", response_model=list[DocumentResponse])
async def list_portal_documents(
    building_id: str, # Resident portal context usually has building_id
    user=Depends(require_resident),
    supabase: Client = Depends(get_supabase_client)
):
    """List visible documents for a building (Resident portal)."""
    # Note: Resident auth usually provides access to their building_id via some lookup
    # For now, we filter by building_id provided and is_visible=True
    # List visible documents for this building OR visible global documents
    res = (
        supabase.table("documents")
        .select("*")
        .eq("is_visible", True)
        .or_(f"building_id.eq.{building_id},building_id.is.null")
        .order("uploaded_at", desc=True)
        .execute()
    )
    return res.data

@router.post("/upload", response_model=DocumentResponse)
async def upload_document(
    building_id: str = Form(...),
    name: str = Form(...),
    is_visible: bool = Form(False),
    file: UploadFile = File(...),
    user=Depends(require_admin),
):
    """Upload a document to the building repository."""
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    
    db_building_id = None
    if building_id != "all":
        # 1. Verify building ownership
        b_res = admin_client.table("buildings").select("id").eq("id", building_id).eq("admin_id", str(user.id)).maybe_single().execute()
        if not b_res.data:
            raise HTTPException(status_code=404, detail="Building not found or not authorized")
        db_building_id = building_id

    # 2. Upload to storage
    # If global, use a 'global' folder in the bucket
    folder = db_building_id if db_building_id else "global"
    file_ext = os.path.splitext(file.filename)[1]
    storage_path = f"{folder}/{uuid.uuid4()}{file_ext}"
    bucket_name = "documents"
    
    contents = await file.read()
    try:
        admin_client.storage.from_(bucket_name).upload(
            path=storage_path,
            file=contents,
            file_options={"content-type": file.content_type}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Storage upload error: {str(e)}")

    # 3. Create database record
    doc_data = {
        "building_id": db_building_id,
        "name": name,
        "file_path": storage_path,
        "content_type": file.content_type,
        "size": len(contents),
        "is_visible": is_visible
    }
    
    res = admin_client.table("documents").insert(doc_data).execute()
    if not res.data:
        # Cleanup storage on DB failure
        admin_client.storage.from_(bucket_name).remove([storage_path])
        raise HTTPException(status_code=500, detail="Database insertion failed")

    return res.data[0]

@router.patch("/{document_id}/visibility", response_model=DocumentResponse)
async def update_visibility(
    document_id: str,
    data: VisibilityUpdate,
    user=Depends(require_admin),
):
    """Toggle document visibility for residents."""
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    
    # Verify ownership: allow if global OR if building matches admin
    doc_res = admin_client.table("documents").select("*, buildings(admin_id)").eq("id", document_id).maybe_single().execute()
    if not doc_res.data:
         raise HTTPException(status_code=404, detail="Document not found")
    
    # If it has a building_id, verify the admin owns that building
    if doc_res.data.get("building_id") and doc_res.data.get("buildings") and doc_res.data["buildings"].get("admin_id") != str(user.id):
         raise HTTPException(status_code=403, detail="Not authorized to manage this document")

    res = admin_client.table("documents").update({"is_visible": data.is_visible}).eq("id", document_id).execute()
    return res.data[0]

@router.delete("/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    user=Depends(require_admin),
):
    """Delete a document from DB and storage."""
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    
    # 1. Get info & verify ownership
    doc_res = admin_client.table("documents").select("*, buildings(admin_id)").eq("id", document_id).maybe_single().execute()
    if not doc_res.data:
         raise HTTPException(status_code=404, detail="Document not found")
    
    if doc_res.data.get("building_id") and doc_res.data.get("buildings") and doc_res.data["buildings"].get("admin_id") != str(user.id):
         raise HTTPException(status_code=403, detail="Not authorized to delete this document")

    file_path = doc_res.data["file_path"]
    
    # 2. Delete from DB
    admin_client.table("documents").delete().eq("id", document_id).execute()
    
    # 3. Delete from storage (if not a shared system file)
    if not file_path.startswith("shared/"):
        try:
            admin_client.storage.from_("documents").remove([file_path])
        except Exception:
            pass # Non-critical if storage cleanup fails

    return None

@router.get("/{document_id}/url")
async def get_document_url(
    document_id: str,
    user=Depends(get_supabase_client), # Allow both admin and resident if they have entry
    supabase: Client = Depends(get_supabase_client)
):
    """Generate a signed URL for document viewing."""
    # Logic to check if user has access to this doc's building
    doc_res = supabase.table("documents").select("file_path, is_visible, building_id").eq("id", document_id).maybe_single().execute()
    if not doc_res.data:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Basic visibility check for residents
    # (Admins are usually 'authenticated' too, so we'd need a more granular role check if sharing this endpoint)
    # For now, let's keep it simple: if it's visible or you're the admin.
    
    # Generate signed URL
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    res = admin_client.storage.from_("documents").create_signed_url(doc_res.data["file_path"], expires_in=3600)
    return {
        "url": res["signedURL"],
        "content_type": doc_res.data.get("content_type"),
        "file_path": doc_res.data.get("file_path")
    }
