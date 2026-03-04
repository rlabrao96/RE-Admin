from fastapi import APIRouter, Depends, HTTPException
from app.dependencies.auth import require_admin, require_resident, get_supabase_client
from app.schemas.poll import PollCreate, PollOptionCreate, VoteCast
from supabase import Client
from datetime import datetime, timezone

router = APIRouter(prefix="/api/polls", tags=["polls"])


def _get_building_unit_ids(supabase: Client, building_id: str) -> list[str]:
    """Get all unit IDs for a building (floors → units)."""
    floors = supabase.table("floors").select("id").eq("building_id", building_id).execute()
    floor_ids = [f["id"] for f in floors.data or []]
    if not floor_ids:
        return []
    units = supabase.table("units").select("id").in_("floor_id", floor_ids).execute()
    return [u["id"] for u in units.data or []]


# ── Admin Endpoints ──────────────────────────────────────────


@router.post("/", status_code=201)
async def create_poll(
    data: PollCreate,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    # Verify building ownership
    building = (
        supabase.table("buildings")
        .select("id")
        .eq("id", data.building_id)
        .eq("admin_id", str(user.id))
        .maybe_single()
        .execute()
    )
    if not building.data:
        raise HTTPException(status_code=404, detail="Edificio no encontrado")

    # Insert poll
    poll_record = {
        "building_id": data.building_id,
        "title": data.title,
        "description": data.description,
        "deadline": data.deadline.isoformat(),
        "show_results_before_deadline": data.show_results_before_deadline,
        "created_by": str(user.id),
    }
    result = supabase.table("polls").insert(poll_record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al crear la votación")

    poll_id = result.data[0]["id"]

    # Insert options (default if none provided)
    options = data.options or [
        PollOptionCreate(label="Aprobar"),
        PollOptionCreate(label="Rechazar"),
    ]
    option_records = [
        {"poll_id": poll_id, "label": opt.label, "display_order": i}
        for i, opt in enumerate(options)
    ]
    supabase.table("poll_options").insert(option_records).execute()

    # Count eligible units
    unit_ids = _get_building_unit_ids(supabase, data.building_id)

    return {**result.data[0], "options": option_records, "total_eligible": len(unit_ids)}


@router.get("/")
async def list_polls(
    building_id: str | None = None,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    query = (
        supabase.table("polls")
        .select("*, buildings(id, name, admin_id)")
        .order("created_at", desc=True)
    )
    if building_id:
        query = query.eq("building_id", building_id)

    result = query.execute()
    # Filter by admin ownership
    polls = [
        p
        for p in result.data
        if p.get("buildings", {}).get("admin_id") == str(user.id)
    ]

    # Attach vote progress to each poll
    for p in polls:
        unit_ids = _get_building_unit_ids(supabase, p["building_id"])
        p["total_eligible"] = len(unit_ids)

        votes = (
            supabase.table("poll_votes")
            .select("id")
            .eq("poll_id", p["id"])
            .execute()
        )
        p["votes_cast"] = len(votes.data or [])

    return polls


@router.get("/{poll_id}")
async def get_poll_detail(
    poll_id: str,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    # Fetch poll with building info
    poll = (
        supabase.table("polls")
        .select("*, buildings(id, name, admin_id)")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
    if not poll.data:
        raise HTTPException(status_code=404, detail="Votación no encontrada")
    if poll.data.get("buildings", {}).get("admin_id") != str(user.id):
        raise HTTPException(status_code=403, detail="No autorizado")

    # Fetch options with vote counts
    options = (
        supabase.table("poll_options")
        .select("*")
        .eq("poll_id", poll_id)
        .order("display_order")
        .execute()
    )

    votes = (
        supabase.table("poll_votes")
        .select("*, residents(first_name, last_name, unit_id), units:unit_id(number, floors(number))")
        .eq("poll_id", poll_id)
        .execute()
    )

    # Count votes per option
    vote_counts = {}
    for v in votes.data or []:
        oid = v["option_id"]
        vote_counts[oid] = vote_counts.get(oid, 0) + 1

    options_with_counts = []
    for opt in options.data or []:
        options_with_counts.append({
            **opt,
            "vote_count": vote_counts.get(opt["id"], 0),
        })

    # Get all units and determine which voted
    unit_ids = _get_building_unit_ids(supabase, poll.data["building_id"])
    all_units = (
        supabase.table("units")
        .select("id, number, floors(number)")
        .in_("id", unit_ids)
        .execute()
    ) if unit_ids else type("", (), {"data": []})()

    voted_unit_ids = {v["unit_id"] for v in votes.data or []}
    units_status = []
    for u in all_units.data or []:
        units_status.append({
            "unit_id": u["id"],
            "unit_number": u["number"],
            "floor_number": u.get("floors", {}).get("number"),
            "has_voted": u["id"] in voted_unit_ids,
        })
    units_status.sort(key=lambda x: (x.get("floor_number", 0), x.get("unit_number", "")))

    return {
        **poll.data,
        "options": options_with_counts,
        "votes": votes.data or [],
        "total_eligible": len(unit_ids),
        "votes_cast": len(votes.data or []),
        "units_status": units_status,
    }


@router.delete("/{poll_id}", status_code=204)
async def delete_poll(
    poll_id: str,
    user=Depends(require_admin),
    supabase: Client = Depends(get_supabase_client),
):
    # Verify ownership
    poll = (
        supabase.table("polls")
        .select("building_id, buildings(admin_id)")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
    if not poll.data or poll.data.get("buildings", {}).get("admin_id") != str(user.id):
        raise HTTPException(status_code=404, detail="Votación no encontrada")

    supabase.table("polls").delete().eq("id", poll_id).execute()


# ── Resident Endpoints ───────────────────────────────────────


@router.get("/resident/")
async def list_polls_resident(
    auth_data=Depends(require_resident),
    supabase: Client = Depends(get_supabase_client),
):
    resident = auth_data["resident"]
    unit_id = resident["unit_id"]

    # Get the building for this resident's unit
    unit = (
        supabase.table("units")
        .select("id, floor_id, floors(building_id)")
        .eq("id", unit_id)
        .maybe_single()
        .execute()
    )
    if not unit.data:
        raise HTTPException(status_code=404, detail="Unidad no encontrada")

    building_id = unit.data["floors"]["building_id"]

    # Fetch all polls for this building
    polls = (
        supabase.table("polls")
        .select("*, poll_options(*)")
        .eq("building_id", building_id)
        .order("created_at", desc=True)
        .execute()
    )

    # Check which polls this unit has voted on
    if polls.data:
        poll_ids = [p["id"] for p in polls.data]
        votes = (
            supabase.table("poll_votes")
            .select("poll_id, option_id")
            .eq("unit_id", unit_id)
            .in_("poll_id", poll_ids)
            .execute()
        )
        voted_map = {v["poll_id"]: v["option_id"] for v in votes.data or []}
    else:
        voted_map = {}

    result = []
    for p in polls.data or []:
        now = datetime.now(timezone.utc)
        deadline = datetime.fromisoformat(p["deadline"].replace("Z", "+00:00"))
        is_expired = deadline < now
        has_voted = p["id"] in voted_map
        voted_option_id = voted_map.get(p["id"])

        poll_data = {
            **p,
            "is_expired": is_expired,
            "has_voted": has_voted,
            "voted_option_id": voted_option_id,
        }

        # Include results if allowed
        if is_expired or p.get("show_results_before_deadline"):
            vote_counts = (
                supabase.table("poll_votes")
                .select("option_id")
                .eq("poll_id", p["id"])
                .execute()
            )
            counts = {}
            for v in vote_counts.data or []:
                counts[v["option_id"]] = counts.get(v["option_id"], 0) + 1

            total_votes = sum(counts.values())
            for opt in poll_data.get("poll_options", []):
                opt["vote_count"] = counts.get(opt["id"], 0)
            poll_data["total_votes"] = total_votes

        result.append(poll_data)

    return result


@router.post("/{poll_id}/vote", status_code=201)
async def cast_vote(
    poll_id: str,
    data: VoteCast,
    auth_data=Depends(require_resident),
    supabase: Client = Depends(get_supabase_client),
):
    resident = auth_data["resident"]
    unit_id = resident["unit_id"]

    # Fetch poll, verify deadline
    poll = (
        supabase.table("polls")
        .select("*")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
    if not poll.data:
        raise HTTPException(status_code=404, detail="Votación no encontrada")

    deadline = datetime.fromisoformat(poll.data["deadline"].replace("Z", "+00:00"))
    if deadline < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="La votación ya ha finalizado")

    # Verify option belongs to this poll
    option = (
        supabase.table("poll_options")
        .select("id")
        .eq("id", data.option_id)
        .eq("poll_id", poll_id)
        .maybe_single()
        .execute()
    )
    if not option.data:
        raise HTTPException(status_code=400, detail="Opción no válida para esta votación")

    # Verify this resident is the official voter for the unit (tenant priority)
    all_unit_residents = (
        supabase.table("residents")
        .select("id, is_owner")
        .eq("unit_id", unit_id)
        .eq("status", "active")
        .execute()
    )
    official_resident_id = None
    for r in all_unit_residents.data or []:
        if official_resident_id is None or not r["is_owner"]:
            official_resident_id = r["id"]
            if not r["is_owner"]:
                break  # tenant found, takes priority

    if official_resident_id != resident["id"]:
        raise HTTPException(
            status_code=403,
            detail="Solo el representante activo de la unidad puede votar",
        )

    # Check for existing vote (defense in depth; UNIQUE constraint also protects)
    existing = (
        supabase.table("poll_votes")
        .select("id")
        .eq("poll_id", poll_id)
        .eq("unit_id", unit_id)
        .maybe_single()
        .execute()
    )
    if existing.data:
        raise HTTPException(
            status_code=409, detail="Esta unidad ya ha votado en esta votación"
        )

    # Insert vote using privileged client to bypass RLS
    from app.dependencies.auth import supabase as privileged_supabase

    vote_record = {
        "poll_id": poll_id,
        "option_id": data.option_id,
        "unit_id": unit_id,
        "resident_id": resident["id"],
    }
    result = privileged_supabase.table("poll_votes").insert(vote_record).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al registrar el voto")

    return result.data[0]


@router.get("/{poll_id}/results")
async def get_poll_results(
    poll_id: str,
    auth_data=Depends(require_resident),
    supabase: Client = Depends(get_supabase_client),
):
    resident = auth_data["resident"]

    # Fetch poll
    poll = (
        supabase.table("polls")
        .select("*")
        .eq("id", poll_id)
        .maybe_single()
        .execute()
    )
    if not poll.data:
        raise HTTPException(status_code=404, detail="Votación no encontrada")

    # Check if results are visible
    deadline = datetime.fromisoformat(poll.data["deadline"].replace("Z", "+00:00"))
    is_expired = deadline < datetime.now(timezone.utc)

    if not is_expired and not poll.data.get("show_results_before_deadline"):
        raise HTTPException(
            status_code=403,
            detail="Los resultados no están disponibles hasta que finalice la votación",
        )

    # Fetch options and votes
    options = (
        supabase.table("poll_options")
        .select("*")
        .eq("poll_id", poll_id)
        .order("display_order")
        .execute()
    )

    votes = (
        supabase.table("poll_votes")
        .select("option_id")
        .eq("poll_id", poll_id)
        .execute()
    )

    vote_counts = {}
    for v in votes.data or []:
        vote_counts[v["option_id"]] = vote_counts.get(v["option_id"], 0) + 1

    total_votes = sum(vote_counts.values())
    options_with_results = []
    for opt in options.data or []:
        count = vote_counts.get(opt["id"], 0)
        options_with_results.append({
            **opt,
            "vote_count": count,
            "percentage": round((count / total_votes * 100), 1) if total_votes > 0 else 0,
        })

    return {
        **poll.data,
        "is_expired": is_expired,
        "options": options_with_results,
        "total_votes": total_votes,
    }
