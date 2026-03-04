-- ============================================================
-- EdificioApp: Polls / Voting Feature
-- ============================================================

-- Polls (the voting topic)
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  building_id uuid references public.buildings(id) on delete cascade not null,
  title text not null,
  description text not null,
  show_results_before_deadline boolean default false,
  deadline timestamptz not null,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- Poll options (the choices residents pick from)
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) on delete cascade not null,
  label text not null,
  display_order integer not null default 0
);

-- Poll votes (one per unit, cast by the active resident)
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid references public.polls(id) on delete cascade not null,
  option_id uuid references public.poll_options(id) on delete cascade not null,
  unit_id uuid references public.units(id) on delete cascade not null,
  resident_id uuid references public.residents(id) on delete cascade not null,
  voted_at timestamptz default now(),
  -- Enforce one vote per unit per poll
  unique(poll_id, unit_id)
);

-- ── RLS ─────────────────────────────────────────────────────

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

-- Polls: admin full access for their buildings
create policy "polls: admin all" on public.polls
  for all using (
    exists (
      select 1 from public.buildings b
      where b.id = polls.building_id and b.admin_id = auth.uid()
    )
  );

-- Polls: residents can read polls for their building
create policy "polls: resident read" on public.polls
  for select using (
    exists (
      select 1 from public.residents r
      join public.units u on r.unit_id = u.id
      join public.floors f on u.floor_id = f.id
      where f.building_id = polls.building_id and r.user_id = auth.uid()
    )
  );

-- Poll options: admin full access via poll's building
create policy "poll_options: admin all" on public.poll_options
  for all using (
    exists (
      select 1 from public.polls p
      join public.buildings b on p.building_id = b.id
      where p.id = poll_options.poll_id and b.admin_id = auth.uid()
    )
  );

-- Poll options: residents can read options for polls in their building
create policy "poll_options: resident read" on public.poll_options
  for select using (
    exists (
      select 1 from public.polls p
      join public.residents r on r.user_id = auth.uid()
      join public.units u on r.unit_id = u.id
      join public.floors f on u.floor_id = f.id
      where p.id = poll_options.poll_id
        and f.building_id = p.building_id
    )
  );

-- Poll votes: admin can read all votes for their buildings' polls
create policy "poll_votes: admin read" on public.poll_votes
  for select using (
    exists (
      select 1 from public.polls p
      join public.buildings b on p.building_id = b.id
      where p.id = poll_votes.poll_id and b.admin_id = auth.uid()
    )
  );

-- Poll votes: residents can insert their own vote
create policy "poll_votes: resident insert" on public.poll_votes
  for insert with check (
    exists (
      select 1 from public.residents r
      where r.id = poll_votes.resident_id and r.user_id = auth.uid()
    )
  );

-- Poll votes: residents can read their own vote
create policy "poll_votes: resident read own" on public.poll_votes
  for select using (
    exists (
      select 1 from public.residents r
      where r.id = poll_votes.resident_id and r.user_id = auth.uid()
    )
  );
