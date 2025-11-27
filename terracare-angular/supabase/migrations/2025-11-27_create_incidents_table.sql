-- Create `public.incidents` table (idempotent)
-- Adds trigger function `set_updated_at()` and indexes used by the app

-- Ensure pgcrypto is available for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.incidents (
  id uuid not null default gen_random_uuid(),
  type text not null,
  title text not null,
  description text not null,
  lat numeric(9,6) null,
  lng numeric(9,6) null,
  user_id uuid null,
  severity smallint null default 1,
  status text null default 'open'::text,
  attachments jsonb null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  location_text text null,
  image_url text null,
  constraint incidents_pkey primary key (id),
  constraint incidents_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null,
  constraint incidents_lat_check check (
    ( (lat >= ('-90'::integer)::numeric) and (lat <= (90)::numeric) )
  ),
  constraint incidents_lng_check check (
    ( (lng >= ('-180'::integer)::numeric) and (lng <= (180)::numeric) )
  )
) tablespace pg_default;

create index if not exists incidents_created_at_idx on public.incidents using btree (created_at desc) tablespace pg_default;
create index if not exists incidents_user_id_idx on public.incidents using btree (user_id) tablespace pg_default;
create index if not exists incidents_lat_lng_idx on public.incidents using btree (lat, lng) tablespace pg_default;
create index if not exists idx_incidents_image_url on public.incidents using btree (image_url) tablespace pg_default;

-- Create or replace a small trigger function to maintain updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Ensure the trigger exists. If it already exists, drop+create to be idempotent.
drop trigger if exists incidents_set_updated_at on public.incidents;
create trigger incidents_set_updated_at
  before update
  on public.incidents
  for each row
  execute function public.set_updated_at();
