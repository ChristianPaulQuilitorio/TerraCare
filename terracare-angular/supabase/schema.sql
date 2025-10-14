-- TerraCare Supabase Schema
-- Purpose: Challenges, participation, history (private), public leaderboard, posts, knowledge hub
-- Safe to run multiple times (IF NOT EXISTS guards)

-- Extensions
create extension if not exists pgcrypto with schema public; -- for gen_random_uuid()

-- Profiles: basic public profile linked to auth.users
create table if not exists public.profiles (
	id uuid primary key references auth.users(id) on delete cascade,
	username text unique,
	full_name text,
	avatar_url text,
	created_at timestamptz not null default now()
);

-- If a legacy profiles table already exists, ensure required columns are present
alter table if exists public.profiles
  add column if not exists username text unique,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists created_at timestamptz not null default now();

-- Challenges
create table if not exists public.challenges (
	id uuid primary key default gen_random_uuid(),
	creator_id uuid not null references auth.users(id) on delete cascade,
	title text not null,
	description text,
	category text,
	status text not null default 'active' check (status in ('draft','active','completed')),
	visibility text not null default 'public' check (visibility in ('public','private')),
	starts_at timestamptz,
	ends_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Participants (join a challenge)
create table if not exists public.challenge_participants (
	id uuid primary key default gen_random_uuid(),
	challenge_id uuid not null references public.challenges(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	joined_at timestamptz not null default now(),
	-- optional denormalized progress field if you want quick reads; authoritative is in history
	progress numeric not null default 0,
	unique (challenge_id, user_id)
);

create index if not exists idx_participants_challenge on public.challenge_participants(challenge_id);
create index if not exists idx_participants_user on public.challenge_participants(user_id);

-- History (private per-user)
create table if not exists public.challenge_history (
	id uuid primary key default gen_random_uuid(),
	challenge_id uuid not null references public.challenges(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	action text not null default 'progress',
	points numeric not null default 0,
	details jsonb,
	occurred_at timestamptz not null default now()
);

create index if not exists idx_history_ch_user on public.challenge_history(challenge_id, user_id);
create index if not exists idx_history_user_time on public.challenge_history(user_id, occurred_at desc);

-- Aggregated scores for public leaderboard
create table if not exists public.challenge_scores (
	challenge_id uuid not null references public.challenges(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	total_points numeric not null default 0,
	updated_at timestamptz not null default now(),
	primary key (challenge_id, user_id)
);

-- Function: Recalculate a single user's score for a challenge
create or replace function public.fn_recalc_score(p_challenge_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
	v_total numeric;
begin
	select coalesce(sum(points), 0) into v_total
	from public.challenge_history
	where challenge_id = p_challenge_id and user_id = p_user_id;

	insert into public.challenge_scores as cs (challenge_id, user_id, total_points, updated_at)
	values (p_challenge_id, p_user_id, v_total, now())
	on conflict (challenge_id, user_id)
	do update set total_points = excluded.total_points, updated_at = now();
end;
$$;

-- Trigger: keep scores in sync on history changes
create or replace function public.trg_history_after_change()
returns trigger
language plpgsql
as $$
begin
	if (tg_op = 'INSERT') then
		perform public.fn_recalc_score(new.challenge_id, new.user_id);
		return new;
	elsif (tg_op = 'UPDATE') then
		-- If challenge_id/user_id changed, recalc both old and new
		if (old.challenge_id <> new.challenge_id or old.user_id <> new.user_id) then
			perform public.fn_recalc_score(old.challenge_id, old.user_id);
		end if;
		perform public.fn_recalc_score(new.challenge_id, new.user_id);
		return new;
	elsif (tg_op = 'DELETE') then
		perform public.fn_recalc_score(old.challenge_id, old.user_id);
		return old;
	end if;
	return null;
end;
$$;

drop trigger if exists trg_history_sync on public.challenge_history;
create trigger trg_history_sync
after insert or update or delete on public.challenge_history
for each row execute procedure public.trg_history_after_change();

-- Posts (public)
create table if not exists public.posts (
	id uuid primary key default gen_random_uuid(),
	author_id uuid not null references auth.users(id) on delete cascade,
	author_name text,
	title text not null,
	content text not null,
	is_public boolean not null default true,
	attachment_url text,
	attachment_type text check (attachment_type in ('image','video')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_posts_public_time on public.posts(is_public, created_at desc);

-- Knowledge hub (already used by the app)
create table if not exists public.knowledge (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	description text not null,
	category text,
	created_at timestamptz not null default now()
);

-- Utility: updated_at triggers
create or replace function public.trg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
	new.updated_at := now();
	return new;
end;
$$;

drop trigger if exists set_updated_at_challenges on public.challenges;
create trigger set_updated_at_challenges
before update on public.challenges
for each row execute procedure public.trg_set_updated_at();

drop trigger if exists set_updated_at_posts on public.posts;
create trigger set_updated_at_posts
before update on public.posts
for each row execute procedure public.trg_set_updated_at();

-- Optional helper view: leaderboard with usernames (reads from challenge_scores; safe for public)
create or replace view public.leaderboard as
select 
	cs.challenge_id,
	c.title as challenge_title,
	cs.user_id,
	coalesce(p.username, p.full_name, left(cs.user_id::text, 8)) as display_name,
	cs.total_points,
	cs.updated_at
from public.challenge_scores cs
join public.challenges c on c.id = cs.challenge_id
left join public.profiles p on p.id = cs.user_id;

-- Convenience indexes for leaderboard consuming queries
create index if not exists idx_scores_challenge_points on public.challenge_scores(challenge_id, total_points desc);

