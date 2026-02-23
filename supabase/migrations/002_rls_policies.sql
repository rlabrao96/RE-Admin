-- ============================================================
-- EdificioApp: Row Level Security Policies
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- Enable RLS on all public tables
alter table public.profiles enable row level security;
alter table public.buildings enable row level security;
alter table public.floors enable row level security;
alter table public.units enable row level security;
alter table public.residents enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.bank_account_config enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.common_spaces enable row level security;
alter table public.bookings enable row level security;
alter table public.documents enable row level security;
alter table public.expenses enable row level security;
alter table public.maintenance_requests enable row level security;

-- ── Profiles ────────────────────────────────────────────────
-- Users see only their own profile
create policy "profiles: own read" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles: own update" on public.profiles
  for update using (auth.uid() = id);

-- ── Buildings ────────────────────────────────────────────────
-- Admins see only buildings they manage
create policy "buildings: admin all" on public.buildings
  for all using (admin_id = auth.uid());

-- ── Floors ───────────────────────────────────────────────────
create policy "floors: admin all" on public.floors
  for all using (
    exists (
      select 1 from public.buildings b
      where b.id = floors.building_id and b.admin_id = auth.uid()
    )
  );

create policy "floors: resident read" on public.floors
  for select using (
    exists (
      select 1 from public.residents r
      join public.units u on r.unit_id = u.id
      where u.floor_id = floors.id and r.user_id = auth.uid()
    )
  );

-- ── Units ─────────────────────────────────────────────────────
create policy "units: admin all" on public.units
  for all using (
    exists (
      select 1 from public.floors f
      join public.buildings b on f.building_id = b.id
      where f.id = units.floor_id and b.admin_id = auth.uid()
    )
  );

create policy "units: resident read own" on public.units
  for select using (
    exists (
      select 1 from public.residents r
      where r.unit_id = units.id and r.user_id = auth.uid()
    )
  );

-- ── Residents ─────────────────────────────────────────────────
create policy "residents: resident read own" on public.residents
  for select using (user_id = auth.uid());

create policy "residents: admin all" on public.residents
  for all using (
    exists (
      select 1 from public.units u
      join public.floors f on u.floor_id = f.id
      join public.buildings b on f.building_id = b.id
      where u.id = residents.unit_id and b.admin_id = auth.uid()
    )
  );

-- ── Charges ───────────────────────────────────────────────────
create policy "charges: resident read own" on public.charges
  for select using (
    exists (
      select 1 from public.residents r
      where r.unit_id = charges.unit_id and r.user_id = auth.uid()
    )
  );

create policy "charges: admin all" on public.charges
  for all using (
    exists (
      select 1 from public.units u
      join public.floors f on u.floor_id = f.id
      join public.buildings b on f.building_id = b.id
      where u.id = charges.unit_id and b.admin_id = auth.uid()
    )
  );

-- ── Payments ──────────────────────────────────────────────────
create policy "payments: resident read own" on public.payments
  for select using (
    exists (
      select 1 from public.residents r
      where r.id = payments.resident_id and r.user_id = auth.uid()
    )
  );

create policy "payments: resident insert own" on public.payments
  for insert with check (
    exists (
      select 1 from public.residents r
      where r.id = payments.resident_id and r.user_id = auth.uid()
    )
  );

create policy "payments: admin all" on public.payments
  for all using (
    exists (
      select 1 from public.charges c
      join public.units u on c.unit_id = u.id
      join public.floors f on u.floor_id = f.id
      join public.buildings b on f.building_id = b.id
      where c.id = payments.charge_id and b.admin_id = auth.uid()
    )
  );

-- ── Notifications ──────────────────────────────────────────────
create policy "notifications: resident read for building" on public.notifications
  for select using (
    exists (
      select 1 from public.residents r
      join public.units u on r.unit_id = u.id
      join public.floors f on u.floor_id = f.id
      where f.building_id = notifications.building_id and r.user_id = auth.uid()
    )
  );

create policy "notifications: admin all" on public.notifications
  for all using (
    exists (
      select 1 from public.buildings b
      where b.id = notifications.building_id and b.admin_id = auth.uid()
    )
  );

-- ── Common Spaces ─────────────────────────────────────────────
create policy "common_spaces: resident read for building" on public.common_spaces
  for select using (
    exists (
      select 1 from public.residents r
      join public.units u on r.unit_id = u.id
      join public.floors f on u.floor_id = f.id
      where f.building_id = common_spaces.building_id and r.user_id = auth.uid()
    )
  );

create policy "common_spaces: admin all" on public.common_spaces
  for all using (
    exists (
      select 1 from public.buildings b
      where b.id = common_spaces.building_id and b.admin_id = auth.uid()
    )
  );

-- ── Documents ─────────────────────────────────────────────────
create policy "documents: resident read for building" on public.documents
  for select using (
    exists (
      select 1 from public.residents r
      join public.units u on r.unit_id = u.id
      join public.floors f on u.floor_id = f.id
      where f.building_id = documents.building_id and r.user_id = auth.uid()
    )
  );

create policy "documents: admin all" on public.documents
  for all using (
    exists (
      select 1 from public.buildings b
      where b.id = documents.building_id and b.admin_id = auth.uid()
    )
  );

-- ── Expenses ──────────────────────────────────────────────────
create policy "expenses: admin all" on public.expenses
  for all using (
    exists (
      select 1 from public.buildings b
      where b.id = expenses.building_id and b.admin_id = auth.uid()
    )
  );
