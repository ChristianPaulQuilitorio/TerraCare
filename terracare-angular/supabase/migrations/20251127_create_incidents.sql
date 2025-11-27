-- Migration: create incidents table and RLS policies
-- Run this in Supabase SQL editor or add to your migrations directory

create extension if not exists "pgcrypto";

-- Create incidents table
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  description text not null,
  lat numeric(9,6) null check (lat >= -90 and lat <= 90),
  lng numeric(9,6) null check (lng >= -180 and lng <= 180),
  location_text text null,
  user_id uuid null references auth.users(id) on delete set null,
  severity smallint default 1,
  status text default 'open',
  attachments jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Helpful indexes
create index if not exists incidents_created_at_idx on public.incidents (created_at desc);
create index if not exists incidents_user_id_idx on public.incidents (user_id);
create index if not exists incidents_lat_lng_idx on public.incidents (lat, lng);

-- Trigger to update updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at
  before update on public.incidents
  for each row execute procedure public.set_updated_at();

-- Enable RLS
alter table public.incidents enable row level security;

-- Public read policy
drop policy if exists "Public read incidents" on public.incidents;
create policy "Public read incidents" on public.incidents
  for select using (true);

-- Insert policy: allow authenticated users to insert with user_id = auth.uid();
-- Allow anonymous inserts only when user_id IS NULL (so anonymous reports are anonymous)
drop policy if exists "Insert incidents (auth or anonymous)" on public.incidents;
create policy "Insert incidents (auth or anonymous)" on public.incidents
  for insert
  with check (
    (
      auth.role() = 'authenticated' AND (user_id IS NULL OR user_id = auth.uid())
    )
    OR
    (
      auth.role() = 'anon' AND user_id IS NULL
    )
  );

-- Allow updates/deletes only by owner
drop policy if exists "Update own incidents" on public.incidents;
create policy "Update own incidents" on public.incidents
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Delete own incidents" on public.incidents;
create policy "Delete own incidents" on public.incidents
  for delete
  using (user_id = auth.uid());

-- Sample data (optional) - comment out in production
-- Insert sample incidents using human-readable location_text (map-picked location). lat/lng left null.
insert into public.incidents (type, title, description, location_text, user_id)
values
('illegal_logging', 'Chainsaw activity observed', 'Chainsaw noise and felled trees along Rizal Park, Manila', 'Rizal Park, Manila, Philippines', null),
('wildlife_threat', 'Traps spotted', 'Makeshift traps observed near mangrove in Puerto Princesa', 'Puerto Princesa, Palawan, Philippines', null)
on conflict do nothing;

-- End migration
