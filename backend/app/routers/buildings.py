from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from app.dependencies.auth import require_admin, get_supabase_client, supabase
from app.schemas.building import (
    BuildingCreate,
    BuildingResponse,
    FloorCreate,
    FloorResponse,
    UnitCreate,
    UnitResponse,
)
import io
import uuid
import openpyxl
from supabase import Client, create_client
from app.config import settings

router = APIRouter(prefix="/api/buildings", tags=["buildings"])


@router.get("/")
async def list_buildings(user=Depends(require_admin)):
    # We need to use the user's token to satisfy RLS since we don't have a service_role key
    # Token should be in user.token (I will update require_admin to include it)
    token = getattr(user, "token", None)
    if token:
        supabase.postgrest.auth(token)
        
    result = (
        supabase.table("buildings")
        .select("*")
        .eq("admin_id", str(user.id))
        .execute()
    )
    return result.data


@router.post("/", status_code=201, response_model=BuildingResponse)
async def create_building(data: BuildingCreate, user=Depends(require_admin)):
    result = (
        supabase.table("buildings")
        .insert({**data.model_dump(), "admin_id": str(user.id)})
        .execute()
    )
    data = getattr(result, "data", None)
    if not data:
        raise HTTPException(status_code=500, detail="Failed to create building")
    return result.data[0]


# ─── Excel Template Download ────────────────────────────────────────────────

@router.get("/template")
async def download_template(user=Depends(require_admin)):
    """Return a pre-filled Excel template for bulk unit import."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Unidades"

    headers = [
        "N° Departamento", "Piso", "Metraje (m²)",
        "Nombre Propietario", "Apellido Propietario", "RUT Propietario", "Correo Propietario",
        "Nombre Arrendatario", "Apellido Arrendatario", "RUT Arrendatario", "Correo Arrendatario",
    ]
    ws.append(headers)

    from openpyxl.styles import Font, PatternFill, Alignment
    header_fill = PatternFill(start_color="4F46E5", end_color="4F46E5", fill_type="solid")
    for col_idx, cell in enumerate(ws[1], 1):
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")
        ws.column_dimensions[cell.column_letter].width = 22

    ws.append(["101", "1", "65.5", "Juan", "Perez", "12345678-9", "juan@edificio.cl",
               "Maria", "Garcia", "98765432-1", "maria@correo.cl"])

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=plantilla_unidades.xlsx"},
    )


@router.get("/{building_id}")
async def get_building(building_id: str, user=Depends(require_admin)):
    result = (
        supabase.table("buildings")
        .select("*")
        .eq("id", building_id)
        .eq("admin_id", str(user.id))
        .maybe_single()
        .execute()
    )
    data = getattr(result, "data", None)
    if not data:
        raise HTTPException(status_code=404, detail="Building not found")
    return result.data


@router.put("/{building_id}")
async def update_building(
    building_id: str, data: BuildingCreate, user=Depends(require_admin)
):
    # Verify ownership first
    existing = (
        supabase.table("buildings")
        .select("id")
        .eq("id", building_id)
        .eq("admin_id", str(user.id))
        .maybe_single()
        .execute()
    )
    data = getattr(existing, "data", None)
    if not data:
        raise HTTPException(status_code=404, detail="Building not found")
    result = (
        supabase.table("buildings")
        .update(data.model_dump())
        .eq("id", building_id)
        .execute()
    )
    return result.data[0]


@router.delete("/{building_id}", status_code=204)
async def delete_building(building_id: str, user=Depends(require_admin)):
    existing = (
        supabase.table("buildings")
        .select("id")
        .eq("id", building_id)
        .eq("admin_id", str(user.id))
        .maybe_single()
        .execute()
    )
    if not existing or not getattr(existing, "data", None):
        raise HTTPException(status_code=404, detail="Building not found")
    supabase.table("buildings").delete().eq("id", building_id).execute()

# ── Floors ────────────────────────────────────────────────────

@router.get("/{building_id}/floors")
async def list_floors(building_id: str, user=Depends(require_admin)):
    result = (
        supabase.table("floors")
        .select("*")
        .eq("building_id", building_id)
        .order("number")
        .execute()
    )
    return result.data


@router.post("/{building_id}/floors", status_code=201, response_model=FloorResponse)
async def create_floor(
    building_id: str, data: FloorCreate, user=Depends(require_admin)
):
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    result = (
        admin_client.table("floors")
        .insert({"building_id": building_id, "number": data.number})
        .execute()
    )
    fl_data = getattr(result, "data", None)
    if not fl_data:
        raise HTTPException(status_code=500, detail="Failed to create floor")
    return fl_data[0]


# ── Units ─────────────────────────────────────────────────────

@router.get("/{building_id}/units")
async def list_units_for_building(building_id: str, user=Depends(require_admin)):
    """Returns all units for a building, grouped by floor."""
    floors = (
        supabase.table("floors")
        .select("id, number")
        .eq("building_id", building_id)
        .order("number")
        .execute()
    )
    result = []
    flor_list = getattr(floors, "data", None) or []
    for floor in flor_list:
        units = (
            supabase.table("units")
            .select("*, residents(id, user_id, is_owner, status, profiles(full_name))")
            .eq("floor_id", floor["id"])
            .order("number")
            .execute()
        )
        units_list = getattr(units, "data", None) or []
        result.append({"floor": floor, "units": units_list})
    return result


router_floors = APIRouter(prefix="/api/floors", tags=["floors"])


@router_floors.post("/{floor_id}/units", status_code=201, response_model=UnitResponse)
async def create_unit(
    floor_id: str, data: UnitCreate, user=Depends(require_admin)
):
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    result = (
        admin_client.table("units")
        .insert({"floor_id": floor_id, **data.model_dump()})
        .execute()
    )
    ur_data = getattr(result, "data", None)
    if not ur_data:
        raise HTTPException(status_code=500, detail="Failed to create unit")
    return ur_data[0]


@router_floors.put("/{floor_id}/units/{unit_id}")
async def update_unit(
    floor_id: str, unit_id: str, data: UnitCreate, user=Depends(require_admin)
):
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    result = (
        admin_client.table("units")
        .update(data.model_dump())
        .eq("id", unit_id)
        .eq("floor_id", floor_id)
        .execute()
    )
    ud_data = getattr(result, "data", None)
    if not ud_data:
        raise HTTPException(status_code=404, detail="Unit not found")
    return ud_data[0]


# ─── Excel Parse (preview only ─ no DB writes yet) ─────────────────────────

@router.post("/{building_id}/parse-units")
async def parse_units(
    building_id: str,
    file: UploadFile = File(...),
    user=Depends(require_admin),
    supabase_client: Client = Depends(get_supabase_client),
):
    """Parse uploaded Excel and return rows for preview. No DB writes."""
    # Security: ensure building belongs to this admin
    b_res = supabase_client.table("buildings").select("id, name, address, commune, rut_edificio").eq("id", building_id).eq("admin_id", str(user.id)).maybe_single().execute()
    b_data = getattr(b_res, "data", None)
    if not b_data:
        raise HTTPException(status_code=404, detail="Building not found")

    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    ws = wb.active

    def safe_int(v):
        try: return int(v) if v is not None else None
        except (ValueError, TypeError): return None

    def safe_float(v):
        try: return float(v) if v is not None else None
        except (ValueError, TypeError): return None

    rows = []
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        if not any(v for v in row):
            continue  # skip blank rows
        rows.append({
            "unit_number": str(row[0]).strip() if row[0] else None,
            "floor": safe_int(row[1]),
            "surface_m2": safe_float(row[2]),
            "owner_name": str(row[3]).strip() if row[3] else None,
            "owner_lastname": str(row[4]).strip() if row[4] else None,
            "owner_rut": str(row[5]).strip() if row[5] else None,
            "owner_email": str(row[6]).strip() if row[6] else None,
            "tenant_name": str(row[7]).strip() if row[7] else None,
            "tenant_lastname": str(row[8]).strip() if row[8] else None,
            "tenant_rut": str(row[9]).strip() if row[9] else None,
            "tenant_email": str(row[10]).strip() if row[10] else None,
        })

    # Calculate alícuotas
    total_m2 = sum(r["surface_m2"] or 0 for r in rows)
    for r in rows:
        if r["surface_m2"] and total_m2 > 0:
            r["alicuota"] = round(r["surface_m2"] / total_m2 * 100, 4)
        else:
            r["alicuota"] = None

    return {"building": b_data, "rows": rows, "total_m2": total_m2}


# ─── Excel Import (DB writes + invitations) ──────────────────────────────────

@router.post("/{building_id}/import-units")
async def import_units(
    building_id: str,
    file: UploadFile = File(...),
    user=Depends(require_admin),
    supabase_client: Client = Depends(get_supabase_client),
):
    """Parse Excel, create floors/units/residents atomically, send invitations."""
    # Isolated admin client strictly built with the service_role key to bypass RLS
    admin_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    
    # Verify building ownership
    b_res = admin_client.table("buildings").select("id, name").eq("id", building_id).eq("admin_id", str(user.id)).maybe_single().execute()
    b_data = getattr(b_res, "data", None)
    if not b_data:
        raise HTTPException(status_code=404, detail="Building not found")

    building_name = b_data["name"]

    contents = await file.read()
    wb = openpyxl.load_workbook(io.BytesIO(contents), data_only=True)
    ws = wb.active

    def safe_int(v):
        try: return int(v) if v is not None else None
        except (ValueError, TypeError): return None

    def safe_float(v):
        try: return float(v) if v is not None else None
        except (ValueError, TypeError): return None

    rows = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not any(v for v in row):
            continue
        rows.append({
            "unit_number": str(row[0]).strip() if row[0] else None,
            "floor": safe_int(row[1]),
            "surface_m2": safe_float(row[2]),
            "owner_name": str(row[3]).strip() if row[3] else None,
            "owner_lastname": str(row[4]).strip() if row[4] else None,
            "owner_rut": str(row[5]).strip() if row[5] else None,
            "owner_email": str(row[6]).strip() if row[6] else None,
            "tenant_name": str(row[7]).strip() if row[7] else None,
            "tenant_lastname": str(row[8]).strip() if row[8] else None,
            "tenant_rut": str(row[9]).strip() if row[9] else None,
            "tenant_email": str(row[10]).strip() if row[10] else None,
        })

    total_m2 = sum(float(r["surface_m2"] or 0) for r in rows)

    # Create floors (unique floor numbers)
    floor_numbers = sorted(set(r["floor"] for r in rows if r["floor"] is not None))
    floor_id_map: dict[int, str] = {}
    
    import_errors = []
    invited_emails = []
    created_units = []

    for fn in floor_numbers:
        try:
            existing = admin_client.table("floors").select("id").eq("building_id", building_id).eq("number", fn).maybe_single().execute()
            ex_data = getattr(existing, "data", None)
            if ex_data:
                floor_id_map[fn] = ex_data["id"]
            else:
                new_floor = admin_client.table("floors").insert({"building_id": building_id, "number": fn}).execute()
                nf_data = getattr(new_floor, "data", None)
                if nf_data:
                    floor_id_map[fn] = nf_data[0]["id"]
                else:
                    import_errors.append(f"No data returned when creating floor {fn}")
        except Exception as e:
            import_errors.append(f"Error creating floor {fn}: {str(e)}")

    created_units = []

    for idx, r in enumerate(rows):
        if not r["unit_number"] or r["floor"] is None:
            continue
            
        floor_id = floor_id_map.get(r["floor"])
        if not floor_id:
            import_errors.append(f"Row {idx+2}: Could not find/create floor {r['floor']}")
            continue

        alicuota = round(float(r["surface_m2"]) / total_m2 * 100, 4) if r["surface_m2"] and total_m2 > 0 else 0.0

        # Create unit
        try:
            unit_res = admin_client.table("units").insert({
                "floor_id": floor_id,
                "number": r["unit_number"],
                "type": "departamento",
                "surface_m2": r["surface_m2"],
                "alicuota": alicuota,
            }).execute()
            ur_data = getattr(unit_res, "data", None)
            if ur_data:
                unit_id = ur_data[0]["id"]
                created_units.append(unit_id)
                
                # Owner
                if r["owner_email"]:
                    _create_resident(
                        admin_client, unit_id, building_name, 
                        r["owner_email"], r["owner_name"], r["owner_lastname"], r["owner_rut"], 
                        True, invited_emails
                    )
                
                # Tenant
                if r["tenant_email"]:
                    _create_resident(
                        admin_client, unit_id, building_name, 
                        r["tenant_email"], r["tenant_name"], r["tenant_lastname"], r["tenant_rut"], 
                        False, invited_emails
                    )
            else:
                import_errors.append(f"Row {idx+2}: No data returned when creating unit {r['unit_number']}")
                
        except Exception as e:
            import_errors.append(f"Row {idx+2}: Error creating unit {r['unit_number']}: {str(e)}")

    if not created_units and import_errors:
        raise HTTPException(status_code=400, detail=f"Falló la importación: {import_errors[0]}")

    return {
        "status": "ok",
        "units_created": len(created_units),
        "invitations_sent": len(invited_emails),
        "invited_emails": invited_emails,
        "errors": import_errors
    }


def _create_resident(supabase_client, unit_id, building_name, email, first_name, last_name, rut, is_owner, invited_emails):
    """Find or invite a user, then create a resident record for a unit.

    Always uses the global service-key supabase client for auth.admin operations.
    Falls back silently on any error so one bad row doesn't abort the whole import.
    """
    try:
        full_name = f"{first_name or ''} {last_name or ''}".strip() or email

        # Check if user already exists via profiles table (has email column)
        existing_profile = supabase_client.table("profiles").select("id").eq("email", email).maybe_single().execute()

        ep_data = getattr(existing_profile, "data", None)
        if ep_data:
            user_id = ep_data["id"]
        else:
            # Invite via service-key client (not the scoped user client)
            try:
                new_user = supabase_client.auth.admin.invite_user_by_email(
                    email,
                    options={"data": {"role": "resident", "full_name": full_name}},
                )
                user_id = new_user.user.id
                # Upsert profile so subsequent rows for the same email find them
                supabase_client.table("profiles").upsert({
                    "id": str(user_id),
                    "email": email,
                    "role": "resident",
                    "full_name": full_name,
                }).execute()
                invited_emails.append(email)
            except Exception:
                return  # Skip this person — invite failed (e.g. email bounce)

        # Create resident record (guard against duplicates)
        existing_resident = (
            supabase_client.table("residents")
            .select("id")
            .eq("unit_id", unit_id)
            .eq("user_id", str(user_id))
            .maybe_single()
            .execute()
        )
        er_data = getattr(existing_resident, "data", None)
        if not er_data:
            supabase_client.table("residents").insert({
                "id": str(uuid.uuid4()),
                "unit_id": unit_id,
                "user_id": str(user_id),
                "is_owner": is_owner,
                "status": "active",
            }).execute()

    except Exception:
        pass  # Never let a single resident error kill the whole import
