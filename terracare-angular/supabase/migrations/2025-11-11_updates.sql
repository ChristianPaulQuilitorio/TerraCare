-- Safe migration for TerraCare (run on your Supabase project)
-- Idempotent where possible; rerunnable without harm.

-- 1) Ensure knowledge table has required columns
create table if not exists public.knowledge (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  category text,
  url text,
  "type" text,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Add columns if the table exists but columns are missing
alter table public.knowledge add column if not exists url text;
alter table public.knowledge add column if not exists "type" text;
alter table public.knowledge add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.knowledge add column if not exists created_at timestamptz not null default now();

-- Enable RLS and basic policies
alter table public.knowledge enable row level security;

-- Public read policy
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='knowledge' and policyname='Knowledge: public read'
  ) then
    create policy "Knowledge: public read" on public.knowledge
      for select
      using (true);
  end if;
end $$;

-- Authenticated insert policy
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='knowledge' and policyname='Knowledge: authenticated insert'
  ) then
    create policy "Knowledge: authenticated insert" on public.knowledge
      for insert
      with check (auth.role() = 'authenticated');
  end if;
end $$;

-- Owner delete policy
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='knowledge' and policyname='Knowledge: owner can delete'
  ) then
    create policy "Knowledge: owner can delete" on public.knowledge
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;

-- 2) Ensure buckets exist (requires storage extension). This will no-op if buckets already exist.
insert into storage.buckets (id, name, public)
values ('knowledge-attachments','knowledge-attachments', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('avatars','avatars', true)
on conflict (id) do nothing;

-- 3) Storage policies for knowledge-attachments
-- Allow public read of knowledge attachments
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Knowledge storage: public read'
  ) then
    create policy "Knowledge storage: public read" on storage.objects
      for select
      using (bucket_id = 'knowledge-attachments');
  end if;
end $$;

-- Allow authenticated users to upload/update/delete their own objects
-- Owner column is auto-populated by Supabase for storage.objects
-- Insert check controls where new rows can be written; Update/Delete use USING with owner check
-- Insert
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Knowledge storage: authenticated insert own'
  ) then
    create policy "Knowledge storage: authenticated insert own" on storage.objects
      for insert
      with check (
        bucket_id = 'knowledge-attachments' and auth.role() = 'authenticated'
      );
  end if;
end $$;

-- Update
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Knowledge storage: update own'
  ) then
    create policy "Knowledge storage: update own" on storage.objects
      for update
      using (bucket_id = 'knowledge-attachments' and owner = auth.uid())
      with check (bucket_id = 'knowledge-attachments' and owner = auth.uid());
  end if;
end $$;

-- Delete
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Knowledge storage: delete own'
  ) then
    create policy "Knowledge storage: delete own" on storage.objects
      for delete
      using (bucket_id = 'knowledge-attachments' and owner = auth.uid());
  end if;
end $$;

-- 4) Storage policies for avatars (public read; users manage their own objects)
-- Public read
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Avatars: public read'
  ) then
    create policy "Avatars: public read" on storage.objects
      for select
      using (bucket_id = 'avatars');
  end if;
end $$;

-- Insert/update/delete own
do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Avatars: insert (authenticated)'
  ) then
    create policy "Avatars: insert (authenticated)" on storage.objects
      for insert
      with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Avatars: update own'
  ) then
    create policy "Avatars: update own" on storage.objects
      for update
      using (bucket_id = 'avatars' and owner = auth.uid())
      with check (bucket_id = 'avatars' and owner = auth.uid());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Avatars: delete own'
  ) then
    create policy "Avatars: delete own" on storage.objects
      for delete
      using (bucket_id = 'avatars' and owner = auth.uid());
  end if;
end $$;

-- 5) RPC to get user display names
create or replace function public.get_user_display_names(ids uuid[])
returns table(id uuid, display_name text)
language sql stable as $$
  select p.id, coalesce(p.full_name, su.email) as display_name
  from unnest(ids) as u(id)
  left join public.profiles p on p.id = u.id
  left join auth.users su on su.id = u.id
$$;
