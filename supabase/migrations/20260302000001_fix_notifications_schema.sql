-- Fix notifications schema to match backend requirements
-- Add missing columns to regular notifications
alter table public.notifications add column if not exists category text default 'general';
alter table public.notifications add column if not exists unit_id uuid references public.units(id) on delete cascade;

-- Rename or create notification_deliveries to track per-resident delivery status
-- Note: the schema previously had notification_reads which tracked read status. 
-- We'll standardize on notification_deliveries as used in the backend.

do $$ 
begin
  if exists (select from pg_tables where schemaname = 'public' and tablename = 'notification_reads') then
    alter table public.notification_reads rename to notification_deliveries;
  else
    create table if not exists public.notification_deliveries (
      notification_id uuid references public.notifications(id) on delete cascade,
      resident_id uuid references public.residents(id) on delete cascade,
      read_at timestamptz,
      primary key (notification_id, resident_id)
    );
  end if;
end $$;

-- Update RLS policies for the renamed/new table
alter table public.notification_deliveries enable row level security;

-- Residents can see their own deliveries
drop policy if exists "notification_reads: resident read own" on public.notification_deliveries;
create policy "notification_deliveries: resident read own" on public.notification_deliveries
  for select using (
    exists (
      select 1 from public.residents r
      where r.id = notification_deliveries.resident_id and r.user_id = auth.uid()
    )
  );

-- Admins can manage all deliveries for notifications in their buildings
drop policy if exists "notification_reads: admin all" on public.notification_deliveries;
create policy "notification_deliveries: admin all" on public.notification_deliveries
  for all using (
    exists (
      select 1 from public.notifications n
      join public.buildings b on n.building_id = b.id
      where n.id = notification_deliveries.notification_id and b.admin_id = auth.uid()
    )
  );
