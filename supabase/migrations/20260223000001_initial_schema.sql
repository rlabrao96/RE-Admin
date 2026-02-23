-- ============================================================
-- EdificioApp: Initial Schema
-- Full schema for building management app (Chile)
-- Compliant with Ley 19.537 de Copropiedad Inmobiliaria
-- ============================================================

-- Users profile table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  phone text,
  rut text unique,    -- Chilean RUT (e.g. '12345678-9')
  role text not null check (role in ('admin', 'resident')),
  created_at timestamptz default now()
);

-- Trigger: auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'role', 'resident'));
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Buildings
create table if not exists public.buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  commune text not null,
  region text not null,
  rut_edificio text not null,   -- Required by Ley 19.537
  admin_id uuid references public.profiles(id) not null,
  created_at timestamptz default now()
);

-- Floors
create table if not exists public.floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null,
  number integer not null,
  unique(building_id, number)
);

-- Units (departamentos, locales, bodegas, estacionamientos)
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  floor_id uuid references public.floors(id) on delete cascade not null,
  number text not null,
  type text default 'departamento' check (type in ('departamento', 'local', 'bodega', 'estacionamiento', 'otro')),
  surface_m2 numeric,
  alicuota numeric not null default 0  -- Percentage share of gastos comunes (0-100)
);

-- Residents (links user account to a unit)
create table if not exists public.residents (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete set null,
  move_in_date date,
  is_owner boolean default false,
  status text default 'active' check (status in ('active', 'pending', 'inactive')),
  invite_email text,  -- Email used to invite before account creation
  unique(unit_id, user_id)
);

-- Charges — Gastos Comunes per unit per period
create table if not exists public.charges (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete cascade not null,
  concept text not null,            -- e.g. 'Gasto Común Enero 2025'
  period text not null,             -- 'YYYY-MM' format
  amount_clp integer not null,      -- CLP — no decimals per Chilean convention
  due_date date not null,
  status text default 'pending' check (status in ('pending', 'paid', 'overdue')),
  created_at timestamptz default now()
);

-- Payments
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid references public.charges(id) on delete cascade not null,
  resident_id uuid references public.residents(id),
  amount_clp integer not null,
  payment_method text check (payment_method in ('webpay', 'bank_transfer', 'manual')),
  status text default 'pending' check (status in ('pending', 'completed', 'failed')),
  webpay_token text,                      -- Transbank Webpay Plus buy order token
  webpay_session_id text,
  transfer_reference text,                -- Comprobante number for bank transfers
  receipt_url text,                       -- Supabase Storage URL for uploaded comprobante
  reconciliation_status text default 'pending'
    check (reconciliation_status in ('pending', 'matched', 'unmatched')),
  fintoc_transaction_id text,             -- Phase 2: automatic detection
  paid_at timestamptz,
  created_at timestamptz default now()
);

-- Bank account configuration (per building, for Fintoc Phase 2)
create table if not exists public.bank_account_config (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null unique,
  bank_name text,
  account_number text,
  account_owner_rut text,
  fintoc_link_token text,
  updated_at timestamptz default now()
);

-- Notifications (admin → residents)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null,
  title text not null,
  body text not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Notification read receipts
create table if not exists public.notification_reads (
  notification_id uuid references public.notifications(id) on delete cascade,
  resident_id uuid references public.residents(id) on delete cascade,
  read_at timestamptz default now(),
  primary key (notification_id, resident_id)
);

-- Common spaces
create table if not exists public.common_spaces (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null,
  name text not null,         -- e.g. 'Sala de Eventos', 'Gimnasio', 'Piscina'
  capacity integer,
  rules text,
  is_active boolean default true
);

-- Bookings for common spaces
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.common_spaces(id) on delete cascade not null,
  resident_id uuid references public.residents(id) not null,
  booking_date date not null,
  time_from time not null,
  time_to time not null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  notes text,
  created_at timestamptz default now()
);

-- Documents (reglamentos, actas, circulares)
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null,
  name text not null,
  type text not null check (type in ('reglamento', 'acta', 'circular', 'contrato', 'otro')),
  storage_url text not null,      -- Supabase Storage URL
  uploaded_by uuid references public.profiles(id),
  uploaded_at timestamptz default now()
);

-- Expenses (building operational costs)
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null,
  concept text not null,
  amount_clp integer not null,
  expense_date date not null,
  category text not null check (category in ('limpieza', 'ascensor', 'agua', 'gas', 'electricidad', 'seguridad', 'jardineria', 'reparacion', 'administracion', 'otro')),
  receipt_url text,
  created_at timestamptz default now()
);

-- Maintenance requests (Post-MVP)
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid references public.units(id) on delete cascade not null,
  resident_id uuid references public.residents(id),
  title text not null,
  description text,
  status text default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);
