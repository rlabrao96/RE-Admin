# Building Management App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. For tasks marked **[PARALLEL]**, use `superpowers:dispatching-parallel-agents`.

**Goal:** Build a dual-portal (admin + resident) web application for building management in Chile, with Transbank Webpay Plus online payments and Fintoc bank transfer detection.

**Architecture:** Next.js frontend + FastAPI backend + Supabase (PostgreSQL + Auth + Storage). Two roles: `admin` (property manager) and `resident` (scoped to their unit).

**Tech Stack:** Next.js 14, FastAPI, Python 3.11, Supabase, Transbank SDK (Python), Fintoc SDK, Recharts, Tailwind CSS (admin only), Inter font, pytest, Jest + React Testing Library

---

## Task 1: Project Scaffolding

**Goal:** Set up monorepo structure, dev tooling, and environment config.

**Files:**
- Create: `frontend/` (Next.js app)
- Create: `backend/` (FastAPI app)
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Bootstrap Next.js frontend**

```bash
npx create-next-app@latest frontend \
  --typescript --eslint --app --src-dir \
  --import-alias "@/*" --no-tailwind
cd frontend && npm install @supabase/supabase-js @supabase/ssr
```

**Step 2: Bootstrap FastAPI backend**

```bash
mkdir backend && cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install fastapi uvicorn[standard] supabase python-dotenv pydantic pytest httpx pytest-asyncio
pip freeze > requirements.txt
```

**Step 3: Create backend entry point**

```
backend/
  app/
    main.py          ← FastAPI app instance
    config.py        ← Settings from env vars
    routers/         ← Route modules (empty for now)
  tests/
    conftest.py      ← pytest fixtures
  requirements.txt
```

`backend/app/main.py`:
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings

app = FastAPI(title="EdificioApp API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"status": "ok"}
```

`backend/app/config.py`:
```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    FRONTEND_URL: str = "http://localhost:3000"
    TRANSBANK_COMMERCE_CODE: str = ""
    TRANSBANK_API_KEY: str = ""
    FINTOC_SECRET_KEY: str = ""

    class Config:
        env_file = ".env"

settings = Settings()
```

**Step 4: Write health check test**

```python
# backend/tests/test_health.py
from httpx import AsyncClient
import pytest
from app.main import app

@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

**Step 5: Run test to verify it passes**
```bash
cd backend && source .venv/bin/activate
pytest tests/test_health.py -v
```
Expected: PASS

**Step 6: Create docker-compose.yml**

```yaml
# docker-compose.yml
version: "3.9"
services:
  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: backend/.env
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    env_file: frontend/.env.local
    command: npm run dev
    volumes:
      - ./frontend:/app
```

**Step 7: Create .env.example**
```bash
# .env.example (root)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
FRONTEND_URL=http://localhost:3000
```

**Step 8: Commit**
```bash
git add . && git commit -m "feat: project scaffolding — Next.js + FastAPI + docker-compose"
```

---

## Task 2: Supabase Schema & RLS

**Goal:** Create all database tables and Row Level Security policies.

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `supabase/migrations/002_rls_policies.sql`
- Create: `supabase/seed.sql`

**Step 1: Write the full schema migration**

```sql
-- supabase/migrations/001_initial_schema.sql

-- Users profile table (extends Supabase auth.users)
create table public.profiles (
  id uuid references auth.users(id) primary key,
  email text not null,
  full_name text,
  phone text,
  rut text unique,
  role text not null check (role in ('admin', 'resident')),
  created_at timestamptz default now()
);

-- Buildings
create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  commune text not null,
  region text not null,
  rut_edificio text not null,
  admin_id uuid references public.profiles(id) not null,
  created_at timestamptz default now()
);

-- Floors
create table public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade,
  number integer not null,
  unique(building_id, number)
);

-- Units
create table public.units (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid references public.floors(id) on delete cascade,
  number text not null,
  type text default 'departamento',
  surface_m2 numeric,
  alicuota numeric not null default 0
);

-- Residents
create table public.residents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete cascade,
  user_id uuid references public.profiles(id),
  move_in_date date,
  is_owner boolean default false,
  status text default 'active' check (status in ('active', 'inactive')),
  unique(unit_id, user_id)
);

-- Charges (gastos comunes)
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete cascade,
  concept text not null,
  period text not null, -- 'YYYY-MM'
  amount_clp integer not null,
  due_date date not null,
  status text default 'pending' check (status in ('pending', 'paid', 'overdue')),
  created_at timestamptz default now()
);

-- Payments
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid references public.charges(id),
  resident_id uuid references public.residents(id),
  amount_clp integer not null,
  payment_method text check (payment_method in ('webpay', 'bank_transfer', 'manual')),
  status text default 'pending' check (status in ('pending', 'completed', 'failed')),
  webpay_token text,
  transfer_reference text,
  reconciliation_status text default 'pending' check (reconciliation_status in ('pending', 'matched', 'unmatched')),
  fintoc_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- Bank account config (per building for Fintoc)
create table public.bank_account_config (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade unique,
  bank_name text,
  account_number text,
  account_owner_rut text,
  fintoc_link_token text
);

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade,
  title text not null,
  body text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Notification reads (to track which residents have seen a notification)
create table public.notification_reads (
  notification_id uuid references public.notifications(id) on delete cascade,
  resident_id uuid references public.residents(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (notification_id, resident_id)
);

-- Common spaces
create table public.common_spaces (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade,
  name text not null,
  capacity integer,
  rules text
);

-- Bookings
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.common_spaces(id) on delete cascade,
  resident_id uuid references public.residents(id),
  booking_date date not null,
  time_from time not null,
  time_to time not null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  created_at timestamptz default now()
);

-- Documents
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade,
  name text not null,
  type text not null, -- 'reglamento', 'acta', 'circular', 'otro'
  storage_url text not null,
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz default now()
);

-- Expenses (building operational costs)
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade,
  concept text not null,
  amount_clp integer not null,
  expense_date date not null,
  category text not null,
  receipt_url text,
  created_at timestamptz default now()
);
```

**Step 2: Write RLS policies**

```sql
-- supabase/migrations/002_rls_policies.sql

-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.units enable row level security;
alter table public.residents enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.notifications enable row level security;
alter table public.common_spaces enable row level security;
alter table public.bookings enable row level security;
alter table public.documents enable row level security;
alter table public.expenses enable row level security;

-- profiles: users can read their own; admins can read all from their buildings
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

-- buildings: admins see only their own buildings
create policy "Admins see own buildings" on public.buildings
  for all using (admin_id = auth.uid());

-- residents: resident sees only their own record; admin sees all in their building
create policy "Resident sees own record" on public.residents
  for select using (user_id = auth.uid());

create policy "Admin sees residents in their buildings" on public.residents
  for select using (
    exists (
      select 1 from public.units u
      join public.floors f on u.floor_id = f.id
      join public.buildings b on f.building_id = b.id
      where u.id = residents.unit_id and b.admin_id = auth.uid()
    )
  );

-- charges: residents see only their unit's charges
create policy "Resident sees own charges" on public.charges
  for select using (
    exists (
      select 1 from public.residents r
      where r.unit_id = charges.unit_id and r.user_id = auth.uid()
    )
  );

-- payments: residents see own; admins see all in their buildings
create policy "Resident sees own payments" on public.payments
  for select using (
    exists (
      select 1 from public.residents r
      where r.id = payments.resident_id and r.user_id = auth.uid()
    )
  );

-- notifications: residents see notifications for their building
create policy "Residents see notifications for their building" on public.notifications
  for select using (
    exists (
      select 1 from public.residents r
      join public.units u on r.unit_id = u.id
      join public.floors f on u.floor_id = f.id
      where f.building_id = notifications.building_id and r.user_id = auth.uid()
    )
  );
```

**Step 3: Create seed data for testing**

```sql
-- supabase/seed.sql (for local dev only)
-- Insert a test admin, building, floor, unit, and resident
-- (fill with realistic Chilean test data)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'admin@test.cl'),
  ('00000000-0000-0000-0000-000000000002', 'resident@test.cl');

insert into public.profiles values
  ('00000000-0000-0000-0000-000000000001', 'admin@test.cl', 'Carlos Pérez', '+56912345678', '12345678-9', 'admin', now()),
  ('00000000-0000-0000-0000-000000000002', 'resident@test.cl', 'María González', '+56987654321', '98765432-1', 'resident', now());
```

**Step 4: Apply migrations to Supabase**

```bash
# Install Supabase CLI if not installed
brew install supabase/tap/supabase
supabase login
supabase db push --db-url "postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres"
```

**Step 5: Commit**
```bash
git add supabase/ && git commit -m "feat: supabase schema and RLS policies"
```

---

## Task 3: Authentication

**Goal:** Supabase Auth integration — login, register, role-based guards for Next.js and FastAPI.

**Files:**
- Create: `frontend/src/lib/supabase/client.ts`
- Create: `frontend/src/lib/supabase/server.ts`
- Create: `frontend/src/middleware.ts`
- Create: `frontend/src/app/auth/login/page.tsx`
- Create: `backend/app/dependencies/auth.py`

**Step 1: Write auth dependency test (backend)**

```python
# backend/tests/test_auth.py
from httpx import AsyncClient
import pytest
from app.main import app

@pytest.mark.asyncio
async def test_protected_route_requires_auth():
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.get("/api/buildings")
    assert response.status_code == 401
```

**Step 2: Run it, verify it fails (401 not returned yet)**
```bash
pytest backend/tests/test_auth.py -v
```
Expected: FAIL

**Step 3: Implement Supabase auth dependency (backend)**

```python
# backend/app/dependencies/auth.py
from fastapi import Header, HTTPException, Depends
from supabase import create_client
from app.config import settings

supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

async def get_current_user(authorization: str = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ")[1]
    try:
        user = supabase.auth.get_user(token)
        return user.user
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

async def require_admin(user=Depends(get_current_user)):
    profile = supabase.table("profiles").select("role").eq("id", user.id).single().execute()
    if profile.data["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return user
```

**Step 4: Set up Supabase client (frontend)**

```typescript
// frontend/src/lib/supabase/client.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// frontend/src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );
}
```

**Step 5: Create Next.js middleware (route guards)**

```typescript
// frontend/src/middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => request.cookies.getAll(), setAll: (cs) => cs.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  if (!user && request.nextUrl.pathname.startsWith("/portal")) {
    return NextResponse.redirect(new URL("/auth/login", request.url));
  }
  return response;
}

export const config = { matcher: ["/admin/:path*", "/portal/:path*"] };
```

**Step 6: Create login page**

```typescript
// frontend/src/app/auth/login/page.tsx
// Full login form component with email/password using Supabase Auth
// Redirects to /admin if role=admin, /portal if role=resident
```

**Step 7: Run backend auth test**
```bash
pytest backend/tests/test_auth.py -v
```
Expected: PASS

**Step 8: Commit**
```bash
git add . && git commit -m "feat: auth — Supabase JWT, role guards, login page"
```

---

## Task 4: Admin Layout & Shell [PARALLEL-SAFE after Task 3]

**Goal:** Build the admin portal shell: sidebar nav, layout, dashboard skeleton.

**Files:**
- Create: `frontend/src/app/admin/layout.tsx`
- Create: `frontend/src/components/admin/Sidebar.tsx`
- Create: `frontend/src/app/admin/page.tsx` (dashboard)
- Create: `frontend/src/components/ui/StatCard.tsx`

**Step 1: Write component test**
```typescript
// frontend/src/__tests__/components/StatCard.test.tsx
import { render, screen } from "@testing-library/react";
import { StatCard } from "@/components/ui/StatCard";

test("renders label and value", () => {
  render(<StatCard label="Total cobrado" value="$1.250.000" trend="+12%" />);
  expect(screen.getByText("Total cobrado")).toBeInTheDocument();
  expect(screen.getByText("$1.250.000")).toBeInTheDocument();
});
```

**Step 2: Run test — verify it fails**
```bash
cd frontend && npm test -- --testPathPattern=StatCard
```
Expected: FAIL

**Step 3: Implement StatCard component**
```typescript
// frontend/src/components/ui/StatCard.tsx
export function StatCard({ label, value, trend }: { label: string; value: string; trend?: string }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {trend && <span className="stat-trend">{trend}</span>}
    </div>
  );
}
```

**Step 4: Build Sidebar with all admin nav items**
```typescript
// frontend/src/components/admin/Sidebar.tsx
// Nav items: Dashboard, Buildings, Residents, Gastos Comunes,
// Payments, Reconciliation, Notifications, Spaces, Documents, Reports
// Bottom: Dark mode toggle, user avatar
```

**Step 5: Build admin layout and dashboard page**
```typescript
// frontend/src/app/admin/layout.tsx — wraps all admin pages with Sidebar
// frontend/src/app/admin/page.tsx — dashboard with 4 StatCards + placeholder charts
```

**Step 6: Run StatCard test**
```bash
cd frontend && npm test -- --testPathPattern=StatCard
```
Expected: PASS

**Step 7: Commit**
```bash
git add . && git commit -m "feat: admin shell — sidebar, layout, dashboard skeleton"
```

---

## Task 5: Buildings & Units API (Backend)

**Goal:** Full CRUD FastAPI routes for buildings, floors, and units.

**Files:**
- Create: `backend/app/routers/buildings.py`
- Create: `backend/app/schemas/building.py`
- Create: `backend/tests/test_buildings.py`

**Step 1: Write failing tests**
```python
# backend/tests/test_buildings.py
# Tests: GET /api/buildings (admin only), POST /api/buildings,
# GET /api/buildings/{id}/units, POST /api/buildings/{id}/floors,
# POST /api/floors/{id}/units
```

**Step 2: Run — verify fail**
```bash
pytest backend/tests/test_buildings.py -v
```

**Step 3: Implement schemas**
```python
# backend/app/schemas/building.py
from pydantic import BaseModel
from uuid import UUID
from typing import Optional

class BuildingCreate(BaseModel):
    name: str
    address: str
    commune: str
    region: str
    rut_edificio: str

class BuildingResponse(BuildingCreate):
    id: UUID
    admin_id: UUID

class FloorCreate(BaseModel):
    number: int

class UnitCreate(BaseModel):
    number: str
    type: str = "departamento"
    surface_m2: Optional[float] = None
    alicuota: float
```

**Step 4: Implement router**
```python
# backend/app/routers/buildings.py
from fastapi import APIRouter, Depends
from app.dependencies.auth import require_admin, get_current_user
from app.schemas.building import BuildingCreate, BuildingResponse, FloorCreate, UnitCreate
from app.config import settings
from supabase import create_client

router = APIRouter(prefix="/api/buildings", tags=["buildings"])
supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

@router.get("/")
async def list_buildings(user=Depends(require_admin)):
    result = supabase.table("buildings").select("*").eq("admin_id", user.id).execute()
    return result.data

@router.post("/", status_code=201)
async def create_building(data: BuildingCreate, user=Depends(require_admin)):
    result = supabase.table("buildings").insert({**data.dict(), "admin_id": str(user.id)}).execute()
    return result.data[0]

@router.get("/{building_id}/units")
async def list_units(building_id: str, user=Depends(require_admin)):
    result = supabase.table("units").select("*, floors!inner(building_id)").eq("floors.building_id", building_id).execute()
    return result.data
```

**Step 5: Register router in main.py**
```python
# backend/app/main.py — add:
from app.routers import buildings
app.include_router(buildings.router)
```

**Step 6: Run tests**
```bash
pytest backend/tests/test_buildings.py -v
```
Expected: PASS

**Step 7: Commit**
```bash
git add . && git commit -m "feat: buildings & units API (CRUD)"
```

---

## Task 6: Buildings & Units UI (Frontend)

**Goal:** Admin pages — buildings list, building detail (floors + units tree).

**Files:**
- Create: `frontend/src/app/admin/buildings/page.tsx`
- Create: `frontend/src/app/admin/buildings/[id]/page.tsx`
- Create: `frontend/src/components/admin/BuildingCard.tsx`
- Create: `frontend/src/components/admin/UnitsTree.tsx`

**Step 1: Write component test**
```typescript
// frontend/src/__tests__/components/BuildingCard.test.tsx
import { render, screen } from "@testing-library/react";
import { BuildingCard } from "@/components/admin/BuildingCard";

test("renders building name and address", () => {
  render(<BuildingCard name="Edificio Las Torres" address="Av. Providencia 1234, Santiago" unitCount={24} />);
  expect(screen.getByText("Edificio Las Torres")).toBeInTheDocument();
  expect(screen.getByText("Av. Providencia 1234, Santiago")).toBeInTheDocument();
  expect(screen.getByText("24 unidades")).toBeInTheDocument();
});
```

**Step 2: Run — verify fail**
```bash
cd frontend && npm test -- --testPathPattern=BuildingCard
```

**Step 3: Implement BuildingCard and list page**
- Fetches from FastAPI `/api/buildings`
- "Add Building" modal with form (name, address, commune, region, rut_edificio)
- Click card → navigate to detail page

**Step 4: Implement UnitsTree (accordion by floor)**
- Floor as collapsible section
- Each unit row shows: number, type, resident name, payment status badge

**Step 5: Run test**
```bash
cd frontend && npm test -- --testPathPattern=BuildingCard
```
Expected: PASS

**Step 6: Commit**
```bash
git add . && git commit -m "feat: buildings & units UI"
```

---

## Task 7: Gastos Comunes — Charges API + UI

**Goal:** Generate monthly charges in bulk, view/edit individual charges.

**Files:**
- Create: `backend/app/routers/charges.py`
- Create: `backend/app/schemas/charge.py`
- Create: `backend/tests/test_charges.py`
- Create: `frontend/src/app/admin/charges/page.tsx`

**Step 1: Write failing test for bulk charge generation**
```python
# backend/tests/test_charges.py
async def test_bulk_generate_charges_creates_one_per_unit():
    # POST /api/charges/generate {building_id, period, due_date}
    # Should create one charge per active unit (using alicuota × base amount)
    ...
```

**Step 2: Run — verify fail**

**Step 3: Implement charges router**
```python
# backend/app/routers/charges.py
@router.post("/generate")
async def generate_charges(building_id: str, period: str, base_amount_clp: int, due_date: str, user=Depends(require_admin)):
    # Fetch all units for building
    # Calculate amount_clp = base_amount_clp × unit.alicuota / 100
    # Insert one charge per unit
    # Return count of created charges
```

**Step 4: Run tests**
```bash
pytest backend/tests/test_charges.py -v
```
Expected: PASS

**Step 5: Build charges UI**
- Period selector (month/year picker)
- "Generate Charges" button → modal with base amount input
- Charges table with columns: Unit, Concept, Period, Amount, Due Date, Status badge

**Step 6: Commit**
```bash
git add . && git commit -m "feat: gastos comunes — charge generation and management"
```

---

## Task 8: Payments — Webpay Plus Integration

**Goal:** Online payment flow via Transbank Webpay Plus.

**Files:**
- Create: `backend/app/routers/payments.py`
- Create: `backend/app/services/transbank.py`
- Create: `backend/tests/test_payments.py`
- Create: `frontend/src/app/portal/payments/page.tsx`
- Create: `frontend/src/app/portal/payments/webpay-return/page.tsx`

**Step 1: Install Transbank SDK**
```bash
cd backend && source .venv/bin/activate && pip install transbank-sdk
pip freeze > requirements.txt
```

**Step 2: Write test for payment init**
```python
# backend/tests/test_payments.py
# Test: POST /api/payments/webpay/init {charge_id} returns {url, token}
# Test: using Transbank integration mode (test credentials)
async def test_webpay_init_returns_redirect_url():
    response = await client.post("/api/payments/webpay/init", json={"charge_id": "..."}, headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "url" in data
    assert "token" in data
```

**Step 3: Implement Transbank service**
```python
# backend/app/services/transbank.py
from transbank.webpay.webpay_plus.transaction import Transaction
from transbank.common.options import WebpayOptions
from transbank.common.integration_type import IntegrationType

def get_webpay_transaction():
    # Use integration (test) mode unless prod env
    return Transaction(WebpayOptions(
        commerce_code="597055555532",   # Transbank test code
        api_key="579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C",
        integration_type=IntegrationType.TEST
    ))
```

**Step 4: Implement payment router**
```python
@router.post("/webpay/init")
async def init_webpay(charge_id: str, user=Depends(get_current_user)):
    # Get charge amount
    # Create Webpay transaction
    # Return {url, token} for frontend redirect

@router.post("/webpay/confirm")
async def confirm_webpay(token_ws: str):
    # Confirm transaction with Transbank
    # If approved: mark charge as paid, create payment record
    # Return payment status
```

**Step 5: Resident portal — Payments page**
- List of pending & past charges
- "Pagar en línea" button → calls /api/payments/webpay/init → redirects to Transbank
- Webpay return page → shows success/failure message

**Step 6: Run tests**
```bash
pytest backend/tests/test_payments.py -v
```
Expected: PASS (using Transbank test environment)

**Step 7: Commit**
```bash
git add . && git commit -m "feat: Webpay Plus payment integration"
```

---

## Task 9: Bank Transfer Reconciliation

**Goal:** Manual reconciliation UI + groundwork for Fintoc Phase 2.

**Files:**
- Create: `backend/app/routers/reconciliation.py`
- Create: `frontend/src/app/admin/reconciliation/page.tsx`
- Create: `frontend/src/app/portal/payments/upload-receipt/page.tsx`

**Step 1: Manual flow**
- Resident can upload comprobante (PDF/image) via portal → stored in Supabase Storage
- Admin sees pending bank_transfer payments in reconciliation page
- Admin matches to charge → marks as paid

**Step 2: Fintoc webhook endpoint (stubbed)**
```python
# backend/app/routers/reconciliation.py
@router.post("/fintoc/webhook")
async def fintoc_webhook(payload: dict):
    # Phase 2: parse incoming transfer, auto-match to charge
    # Phase 1: just log and return 200
    return {"received": True}
```

**Step 3: Commit**
```bash
git add . && git commit -m "feat: bank transfer reconciliation (manual + Fintoc stub)"
```

---

## Task 10: Notifications

**Goal:** Admin sends notifications to building residents; residents see inbox.

**Files:**
- Create: `backend/app/routers/notifications.py`
- Create: `frontend/src/app/admin/notifications/page.tsx`
- Create: `frontend/src/app/portal/notifications/page.tsx`

**Step 1: Write test**
```python
async def test_admin_can_create_notification():
    response = await admin_client.post("/api/notifications", json={
        "building_id": "...", "title": "Aviso", "body": "Corte de agua el viernes"
    })
    assert response.status_code == 201
```

**Step 2: Implement router**
```python
@router.post("/", status_code=201)
async def create_notification(data: NotificationCreate, user=Depends(require_admin)):
    result = supabase.table("notifications").insert({**data.dict(), "created_by": str(user.id)}).execute()
    return result.data[0]

@router.get("/my")
async def my_notifications(user=Depends(get_current_user)):
    # Resident: get notifications for their building via Supabase RLS
    ...
```

**Step 3: Frontend**
- Admin: compose form (title + rich text body, send to building or unit)
- Resident: inbox list, unread count badge in sidebar

**Step 4: Run tests**
```bash
pytest backend/tests/test_notifications.py -v
```

**Step 5: Commit**
```bash
git add . && git commit -m "feat: notifications — admin sends, resident inbox"
```

---

## Task 11: Financial Reports

**Goal:** Monthly PDF report per building, compliant with Ley 19.537.

**Files:**
- Create: `backend/app/routers/reports.py`
- Create: `backend/app/services/pdf_report.py`
- Create: `frontend/src/app/admin/reports/page.tsx`

**Step 1: Install reportlab**
```bash
pip install reportlab && pip freeze > requirements.txt
```

**Step 2: Implement PDF service**
```python
# backend/app/services/pdf_report.py
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Table, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
import io

def generate_monthly_report(building_name: str, rut_edificio: str, period: str, charges: list, expenses: list, payments: list) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    # Title, building info, charges table, expenses table, balance summary
    # Returns PDF as bytes
    ...
    return buffer.getvalue()
```

**Step 3: Report endpoint**
```python
@router.get("/{building_id}/monthly/{period}")
async def monthly_report(building_id: str, period: str, user=Depends(require_admin)):
    # Fetch data, generate PDF, return as FileResponse
    from fastapi.responses import Response
    pdf_bytes = generate_monthly_report(...)
    return Response(pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=informe-{period}.pdf"})
```

**Step 4: Frontend reports page**
- Month/year selector per building
- "Descargar PDF" button

**Step 5: Commit**
```bash
git add . && git commit -m "feat: financial reports PDF (Ley 19.537 compliant)"
```

---

## Task 12: Resident Portal — Full Shell

**Goal:** Complete resident portal: My Home, Payments, Notifications, Documents.

**Files:**
- Create: `frontend/src/app/portal/layout.tsx`
- Create: `frontend/src/components/portal/ResidentSidebar.tsx`
- Create: `frontend/src/app/portal/page.tsx` (My Home)
- Create: `frontend/src/app/portal/documents/page.tsx`

**Step 1: Resident sidebar nav items**
- My Home, Payments, Notifications, Book a Space, Documents

**Step 2: My Home page**
- Unit info (building, floor, unit number)
- Current month charges with payment status
- Upcoming due dates highlighted

**Step 3: Documents page**
- Read-only list of building documents (rendered from Supabase Storage URLs)

**Step 4: Commit**
```bash
git add . && git commit -m "feat: resident portal — full shell with all sections"
```

---

## Verification Plan

### Backend Tests

```bash
cd backend && source .venv/bin/activate
pytest tests/ -v --cov=app --cov-report=term-missing
```
Expected: All tests pass, >80% coverage.

### Frontend Tests

```bash
cd frontend && npm test -- --watchAll=false --coverage
```
Expected: All component tests pass.

### Manual Verification (Admin Flow)
1. Start both services: `cd backend && uvicorn app.main:app --reload` and `cd frontend && npm run dev`
2. Open `http://localhost:3000/auth/login` — log in with admin credentials
3. Navigate to `/admin` — verify dashboard loads with sidebar
4. Go to Buildings → create a new building → add floors → add units
5. Go to Gastos Comunes → generate charges for current month
6. Go to Payments → verify charges appear per unit

### Manual Verification (Resident Flow)
1. Log in with resident credentials
2. Navigate to `/portal` → verify My Home shows correct unit and charges
3. Click "Pagar en línea" on a pending charge → verify Webpay redirect
4. Use Transbank test card (4051 8856 0044 6623, CVV 123, any future date) → complete payment
5. Return to portal → verify charge marked as "Pagado"
6. Check Notifications inbox → verify can see admin messages

### Transbank Test Credentials
- Card: `4051 8856 0044 6623`
- Expiry: any future date
- CVV: `123`
- RUT: `11.111.111-1`
- Password: `123`
