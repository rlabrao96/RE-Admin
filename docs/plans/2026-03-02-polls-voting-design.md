# Polls/Voting Feature Design

## Problem

Building administrators need a way to conduct formal votes among residents (e.g., approve/reject proposals, choose between options). Currently, the communication section only supports one-way notifications. Polls enable two-way engagement and democratic decision-making aligned with Chilean condo law (Ley 21.442).

## Requirements

- **One vote per unit**: Tenant takes priority over owner as the voting representative
- **Vote is final**: Cannot be changed after casting
- **Building-wide**: All units in the building participate
- **Configurable result visibility**: Admin chooses per poll whether results show before deadline
- **Custom options**: Default "Aprobar/Rechazar", but admin can add custom choices
- **Deadline**: Every poll has an expiration date/time
- **Admin progress tracking**: Real-time view of votes cast vs total eligible units

## Architecture

### Navigation

Polls live as a separate route (`/admin/polls`, `/portal/polls`) with a sidebar link under the "Comunicacion" section, alongside Notificaciones and Documentos. This follows the existing pattern where each feature has its own route.

### Database Schema

Three new tables:

**`polls`**: id, building_id (FK→buildings), title, description, show_results_before_deadline (boolean), deadline (timestamptz), created_by (FK→profiles), created_at

**`poll_options`**: id, poll_id (FK→polls, cascade), label, display_order (integer)

**`poll_votes`**: id, poll_id (FK→polls, cascade), option_id (FK→poll_options, cascade), unit_id (FK→units, cascade), resident_id (FK→residents, cascade), voted_at. **UNIQUE(poll_id, unit_id)** enforces one-vote-per-unit at DB level.

RLS policies follow existing patterns: admin full access scoped to their buildings, residents read polls/options for their building, residents insert and read their own votes.

### Backend API

Router at `/api/polls` following `notifications.py` patterns:

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /` | admin | Create poll + options (defaults to Aprobar/Rechazar) |
| `GET /` | admin | List polls with votes_cast/total_eligible |
| `GET /{id}` | admin | Detail with per-option breakdown |
| `DELETE /{id}` | admin | Delete poll |
| `GET /resident/` | resident | List polls with has_voted status |
| `POST /{id}/vote` | resident | Cast vote (validates deadline, tenant priority, uniqueness) |
| `GET /{id}/results` | resident | Results (respects show_results_before_deadline) |

### Frontend

- **Admin list**: Card layout with progress stats, filter by building, status badges
- **Admin create**: Form with building selector, title, description, deadline, results visibility toggle, dynamic options list
- **Admin detail**: Bar chart per option, participation table
- **Portal**: Poll list with vote status, vote interface with confirmation dialog, results view
- **React Query hook**: useAdminPolls, useResidentPolls, useCastVote mutations

## Decisions

- **No separate eligible-units table**: Eligible units computed at query time from floors→units, same as notification broadcast. Avoids staleness.
- **Tenant priority for voting**: Same logic as notification delivery — tenant takes priority over owner when both exist for a unit.
- **UNIQUE constraint + backend check**: Defense in depth — DB constraint prevents duplicates even if backend check is bypassed.
