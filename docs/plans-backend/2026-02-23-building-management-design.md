# Building Management App — Design Document

**Date:** 2026-02-23  
**Status:** Approved  
**Jurisdiction:** Chile (Ley 19.537 de Copropiedad Inmobiliaria)

---

## Overview

A dual-portal web application for property managers and residents in Chile. Administrators manage one or multiple buildings (units, residents, charges, documents), while residents access a dedicated portal to view charges, pay online, receive notifications, and book common spaces.

---

## Architecture

### Stack
| Layer | Technology |
|---|---|
| Frontend | Next.js (React) — single codebase, two portals |
| Backend | Python + FastAPI — business logic, payment processing, reports |
| Database | Supabase (PostgreSQL) — data, auth, storage, realtime |
| Payments | Transbank Webpay Plus (online) + Fintoc (bank transfer detection) |
| Hosting | Vercel (frontend) + Railway/Render (FastAPI) + Supabase cloud |

### System Diagram

```
┌─────────────────────────────────────────────────┐
│              Next.js Frontend                   │
│  /admin  → Property Manager Dashboard           │
│  /portal → Resident Portal                      │
│  /auth   → Login / Registration                 │
└────────────────────┬────────────────────────────┘
                     │ REST API calls
┌────────────────────▼────────────────────────────┐
│              FastAPI Backend                    │
│  /buildings  → Building & unit management       │
│  /payments   → Invoicing, gastos comunes        │
│  /transbank  → Webpay Plus integration          │
│  /fintoc     → Bank transfer reconciliation     │
│  /notifications → Push/email to residents       │
│  /reports    → Financial reports (PDF)          │
│  /documents  → Upload/manage docs               │
│  /spaces     → Common space bookings            │
└────────────────────┬────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────┐
│              Supabase                           │
│  PostgreSQL DB  → All data                      │
│  Auth           → JWT, roles (admin/resident)   │
│  Storage        → Documents, receipts           │
│  Realtime       → Live notifications            │
└─────────────────────────────────────────────────┘
```

### Roles & Security
- `admin` — property manager, full access to their own buildings only
- `resident` — scoped to their unit only
- **Supabase Row Level Security (RLS)** enforces data isolation at the database level

---

## Data Model

### Core Tables

```sql
-- Users (managed by Supabase Auth)
users
  id uuid PK
  email text
  role  enum('admin', 'resident')
  name  text
  phone text
  rut   text  -- Chilean RUT identifier

-- Buildings
buildings
  id          uuid PK
  name        text
  address     text
  commune     text
  region      text
  rut_edificio text       -- required by Ley 19.537
  admin_id    uuid FK → users

-- Floors
floors
  id          uuid PK
  building_id uuid FK → buildings
  number      int

-- Units (apartments)
units
  id          uuid PK
  floor_id    uuid FK → floors
  number      text
  type        text        -- e.g. "departamento", "local", "bodega"
  surface_m2  numeric
  alicuota    numeric     -- percentage share of common expenses

-- Residents (link between user and unit)
residents
  id          uuid PK
  unit_id     uuid FK → units
  user_id     uuid FK → users
  move_in_date date
  is_owner    boolean
  status      enum('active', 'inactive')

-- Charges (gastos comunes per unit per period)
charges
  id          uuid PK
  unit_id     uuid FK → units
  concept     text        -- e.g. "Gasto Común Enero 2025"
  period      text        -- e.g. "2025-01"
  amount_clp  integer     -- CLP, no decimals
  due_date    date
  status      enum('pending', 'paid', 'overdue')

-- Payments
payments
  id                    uuid PK
  charge_id             uuid FK → charges
  resident_id           uuid FK → residents
  amount_clp            integer
  payment_method        enum('webpay', 'bank_transfer', 'manual')
  status                enum('pending', 'completed', 'failed')
  webpay_token          text    -- Webpay Plus buy order token
  transfer_reference    text    -- bank transfer comprobante number
  reconciliation_status enum('pending', 'matched', 'unmatched')
  fintoc_transaction_id text
  paid_at               timestamptz

-- Bank account configuration per building (for Fintoc)
bank_account_config
  id               uuid PK
  building_id      uuid FK → buildings
  bank_name        text
  account_number   text
  account_owner_rut text
  fintoc_link_token text

-- Notifications
notifications
  id          uuid PK
  building_id uuid FK → buildings
  title       text
  body        text
  created_by  uuid FK → users
  created_at  timestamptz

-- Common Spaces
common_spaces
  id          uuid PK
  building_id uuid FK → buildings
  name        text        -- e.g. "Sala de Eventos", "Gimnasio"
  capacity    int
  rules       text

-- Bookings
bookings
  id          uuid PK
  space_id    uuid FK → common_spaces
  resident_id uuid FK → residents
  date        date
  time_from   time
  time_to     time
  status      enum('pending', 'approved', 'rejected', 'cancelled')

-- Documents
documents
  id          uuid PK
  building_id uuid FK → buildings
  name        text
  type        text        -- e.g. "reglamento", "acta", "circular"
  storage_url text        -- Supabase Storage URL
  uploaded_by uuid FK → users
  uploaded_at timestamptz

-- Expenses (building operational costs)
expenses
  id          uuid PK
  building_id uuid FK → buildings
  concept     text
  amount_clp  integer
  date        date
  category    text        -- e.g. "limpieza", "ascensor", "agua"
  receipt_url text
```

### Chilean Compliance Notes
- All monetary values in **CLP** (integer, no decimals)
- `rut_edificio` mandatory per Ley 19.537 de Copropiedad Inmobiliaria
- Billing periods follow Chilean convention (`YYYY-MM`)
- Reports must show fund balances as required by law (fondo de reserva, fondo operacional)

---

## Payment Flows

### Flow 1: Online Payment (Webpay Plus)
1. Resident clicks "Pagar" on a charge
2. Next.js → FastAPI `/payments/webpay/init` → Transbank API → returns redirect URL
3. Resident completes payment on Transbank page
4. Transbank redirects back → FastAPI `/payments/webpay/confirm` validates token
5. Charge marked as `paid`, resident notified

### Flow 2: Bank Transfer — Manual Reconciliation (Phase 1)
1. Resident transfers to building account and uploads comprobante via portal
2. Admin sees transfer in "Bank Reconciliation" page
3. Admin matches transfer to pending charge → 1-click confirm
4. Charge marked as `paid`, resident notified

### Flow 3: Bank Transfer — Automatic Detection via Fintoc (Phase 2)
1. Building connects bank account via Fintoc widget (one-time setup)
2. Fintoc webhook fires on incoming transfer → FastAPI `/fintoc/webhook`
3. FastAPI auto-matches transfer by amount + resident RUT
4. If confidence high → auto-mark paid; if ambiguous → queue for admin review

---

## UI Layout

### Admin Portal (`/admin`)
| Page | Key Content |
|---|---|
| Dashboard | KPI cards, revenue chart, recent payments, overdue units |
| Buildings | Building list → drill down to floors → units tree |
| Residents | Resident table, status badges, invite by email |
| Gastos Comunes | Bulk charge generation per period, individual charge editor |
| Payments | Full payment log (Webpay + transfer + manual), filter by period |
| Bank Reconciliation | Fintoc incoming transfers matched against pending charges |
| Notifications | Compose & send to building or specific units |
| Common Spaces | Space config, booking calendar, approve/reject |
| Documents | Upload reglamento, actas, circulares per building |
| Reports | Monthly financial PDF, Ley 19.537 compliant |

### Resident Portal (`/portal`)
| Page | Key Content |
|---|---|
| My Home | Unit info, current charges, payment status |
| Payments | Pay via Webpay or upload transfer receipt |
| Notifications | Inbox from building admin |
| Book a Space | Calendar, create booking request |
| Documents | Read-only access to building documents |

### Visual Design
- **Layout**: Fixed left sidebar + main content area
- **Colors**: White cards on light gray background; indigo/blue primary; green = paid; red = overdue
- **Font**: Inter
- **Charts**: Recharts (revenue trends, payment breakdown)
- **Dark mode**: Toggle in sidebar
- **Inspiration**: Deli-Prop (dashboard layout), Netify (property tables), Wander (financials), Acme Corp (property detail)

---

## Feature Priority (MVP → Later)

| Priority | Feature |
|---|---|
| 1 — MVP | Payment tracking & invoicing (gastos comunes) |
| 2 — MVP | Building & unit management |
| 3 — MVP | Webpay Plus online payments |
| 4 — MVP | Notifications (admin → resident) |
| 5 — MVP | Financial reports |
| 6 — Post-MVP | Document management |
| 7 — Post-MVP | Resident management & invitations |
| 8 — Post-MVP | Common space booking |
| 9 — Post-MVP | Maintenance requests |
| Future | Fintoc automatic bank transfer detection |
| Future | AI-assisted onboarding (batch document processing) |

---

## Next Step

Proceed to **writing-plans skill** to create the detailed implementation plan.
