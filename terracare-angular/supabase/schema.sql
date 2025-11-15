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
	image text,
	-- Base points awarded when a participant completes the entire challenge (1-100)
	base_points integer not null default 10 check (base_points between 1 and 100),
	category text,
	status text not null default 'active' check (status in ('draft','active','completed')),
	archived boolean not null default false,
	archived_at timestamptz,
	visibility text not null default 'public' check (visibility in ('public','private')),
	starts_at timestamptz,
	ends_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- Ensure image column exists on legacy installs
alter table if exists public.challenges
  add column if not exists image text;

-- Add base_points column for scoring if missing (1-100 range enforced)
alter table if exists public.challenges
	add column if not exists base_points integer not null default 10 check (base_points between 1 and 100);

-- Add archived columns on legacy installs
alter table if exists public.challenges
	add column if not exists archived boolean not null default false,
	add column if not exists archived_at timestamptz;

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

-- Challenge tasks (managed by challenge creator)
create table if not exists public.challenge_tasks (
	id uuid primary key default gen_random_uuid(),
	challenge_id uuid not null references public.challenges(id) on delete cascade,
	title text not null,
	detail text,
	order_index integer not null default 0,
	created_at timestamptz not null default now()
);

create index if not exists idx_tasks_challenge on public.challenge_tasks(challenge_id, order_index);

-- Per-user task completion
create table if not exists public.user_challenge_tasks (
	id uuid primary key default gen_random_uuid(),
	user_id uuid not null references auth.users(id) on delete cascade,
	challenge_id uuid not null references public.challenges(id) on delete cascade,
	task_id uuid not null references public.challenge_tasks(id) on delete cascade,
	completed boolean not null default false,
	completed_at timestamptz,
	unique (user_id, task_id)
);

create index if not exists idx_user_task_user on public.user_challenge_tasks(user_id);
create index if not exists idx_user_task_challenge on public.user_challenge_tasks(challenge_id);

-- History (private per-user)
create table if not exists public.challenge_history (
	id uuid primary key default gen_random_uuid(),
	challenge_id uuid references public.challenges(id) on delete set null,
	user_id uuid not null references auth.users(id) on delete cascade,
	action text not null default 'progress',
	points numeric not null default 0,
	details jsonb,
	occurred_at timestamptz not null default now(),
	-- snapshots to preserve history if challenge is later deleted
	challenge_title_snapshot text,
	challenge_base_points_snapshot integer
);

-- Ensure snapshot columns exist if table pre-dated this migration
alter table if exists public.challenge_history
  add column if not exists challenge_title_snapshot text,
  add column if not exists challenge_base_points_snapshot integer;

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

-- Note: We no longer auto-sync challenge_scores from history because the app
-- now computes Impact Score directly from challenge_history. Ensure any old
-- trigger is dropped to avoid RLS errors on challenge_scores.
drop trigger if exists trg_history_sync on public.challenge_history;

-- Function: Recalculate participant progress (%) from per-user task completion
create or replace function public.fn_recalc_participant_progress(p_challenge_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
	v_total integer;
	v_done integer;
	v_pct numeric;
begin
	select count(*) into v_total from public.challenge_tasks where challenge_id = p_challenge_id;
	if v_total is null or v_total = 0 then
		v_pct := 0;
	else
		select count(*) into v_done from public.user_challenge_tasks
		where challenge_id = p_challenge_id and user_id = p_user_id and completed = true;
		v_pct := round((coalesce(v_done,0)::numeric / v_total::numeric) * 100.0);
	end if;

	insert into public.challenge_participants as cp (challenge_id, user_id, progress)
	values (p_challenge_id, p_user_id, coalesce(v_pct,0))
	on conflict (challenge_id, user_id)
	do update set progress = excluded.progress;
end;
$$;

-- Trigger: when a user's task completion changes, update their progress
create or replace function public.trg_user_task_after_change()
returns trigger
language plpgsql
as $$
begin
	if (tg_op = 'INSERT') then
		perform public.fn_recalc_participant_progress(new.challenge_id, new.user_id);
		return new;
	elsif (tg_op = 'UPDATE') then
		perform public.fn_recalc_participant_progress(new.challenge_id, new.user_id);
		return new;
	elsif (tg_op = 'DELETE') then
		perform public.fn_recalc_participant_progress(old.challenge_id, old.user_id);
		return old;
	end if;
	return null;
end;
$$;

drop trigger if exists trg_user_task_sync on public.user_challenge_tasks;
create trigger trg_user_task_sync
after insert or update or delete on public.user_challenge_tasks
for each row execute procedure public.trg_user_task_after_change();

-- Posts (public)
create table if not exists public.posts (
	id uuid primary key default gen_random_uuid(),
	author_id uuid not null references auth.users(id) on delete cascade,
	author_name text,
	author_avatar_url text,
	title text not null,
	content text not null,
	is_public boolean not null default true,
	attachment_url text,
	attachment_type text check (attachment_type in ('image','video')),
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index if not exists idx_posts_public_time on public.posts(is_public, created_at desc);

-- Ensure author_avatar_url exists on legacy installs
alter table if exists public.posts
	add column if not exists author_avatar_url text;

-- Post comments (simple flat structure for forum discussions)
create table if not exists public.post_comments (
	id uuid primary key default gen_random_uuid(),
	post_id uuid not null references public.posts(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	content text not null,
	created_at timestamptz not null default now()
);

create index if not exists idx_post_comments_post on public.post_comments(post_id, created_at);
create index if not exists idx_post_comments_user on public.post_comments(user_id, created_at);
-- Threaded replies (one-level nesting): parent comment id
alter table if exists public.post_comments
	add column if not exists parent_comment_id uuid;
create index if not exists idx_post_comments_parent on public.post_comments(parent_comment_id, created_at);

create table if not exists public.post_reactions (
	id uuid primary key default gen_random_uuid(),
	post_id uuid not null references public.posts(id) on delete cascade,
	user_id uuid not null references auth.users(id) on delete cascade,
	reaction text not null check (reaction in ('heart')),
	created_at timestamptz not null default now(),
	unique (post_id, user_id, reaction)
);

create index if not exists idx_post_reactions_post on public.post_reactions(post_id);
create index if not exists idx_post_reactions_user on public.post_reactions(user_id);

-- Comment reactions (hearts/likes on comments)
create table if not exists public.comment_reactions (
    id uuid primary key default gen_random_uuid(),
    comment_id uuid not null references public.post_comments(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    reaction text not null check (reaction in ('heart')),
    created_at timestamptz not null default now(),
    unique (comment_id, user_id, reaction)
);

create index if not exists idx_comment_reactions_comment on public.comment_reactions(comment_id);
create index if not exists idx_comment_reactions_user on public.comment_reactions(user_id);

-- Knowledge hub (already used by the app)
create table if not exists public.knowledge (
	id uuid primary key default gen_random_uuid(),
	title text not null,
	description text not null,
	category text,
	url text,
	type text,
	created_at timestamptz not null default now()
);

-- Ensure user_id exists to attribute uploads
alter table if exists public.knowledge
  add column if not exists user_id uuid references auth.users(id) on delete set null;

-- Enable RLS and keep public read policy defined in policies.sql effective
alter table if exists public.knowledge enable row level security;

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

-- Optional helper view: leaderboard (username preferred over user_id)
drop view if exists public.leaderboard;
create view public.leaderboard as
select
	h.challenge_id,
	coalesce(c.title, h.challenge_title_snapshot, left(coalesce(h.challenge_id::text, ''), 8)) as challenge_title,
	h.user_id,
	p.username as username,
	coalesce(p.username, p.full_name, left(h.user_id::text, 8)) as display_name,
	sum(h.points) as total_points,
	max(h.occurred_at) as updated_at
from public.challenge_history h
left join public.challenges c on c.id = h.challenge_id
left join public.profiles p on p.id = h.user_id
where h.action = 'completed'
group by h.challenge_id, coalesce(c.title, h.challenge_title_snapshot, left(coalesce(h.challenge_id::text, ''), 8)), h.user_id, p.username, coalesce(p.username, p.full_name, left(h.user_id::text, 8));

-- Convenience indexes for leaderboard consuming queries
-- indexes for history-backed leaderboard can rely on existing history indexes

-- Helper RPC: safely map user ids to display names using profiles or auth.users metadata
-- This uses SECURITY DEFINER to allow reading auth.users but only returns id + display_name
create or replace function public.get_user_display_names(ids uuid[])
returns table(id uuid, display_name text)
language sql
security definer
set search_path = public
as $$
	select u.id,
				 coalesce(p.full_name,
									p.username,
									(u.raw_user_meta_data ->> 'name'),
									(u.raw_user_meta_data ->> 'full_name'),
									u.email) as display_name
	from auth.users u
	left join public.profiles p on p.id = u.id
	where u.id = any(ids);
$$;

revoke all on function public.get_user_display_names(uuid[]) from public;
grant execute on function public.get_user_display_names(uuid[]) to anon, authenticated;

-- Public RPC to get top leaderboard entries with display names, bypassing RLS safely
create or replace function public.get_public_leaderboard(limit_count integer default 50)
returns table(user_id uuid, display_name text, total_points numeric)
language sql
security definer
set search_path = public
as $$
	with lb as (
		select h.user_id, sum(h.points) as total_points
		from public.challenge_history h
		where h.action = 'completed'
		group by h.user_id
		order by sum(h.points) desc
		limit limit_count
	)
	select lb.user_id,
				 coalesce(p.full_name,
									p.username,
									(u.raw_user_meta_data ->> 'name'),
									(u.raw_user_meta_data ->> 'full_name'),
									u.email) as display_name,
				 lb.total_points
	from lb
	left join auth.users u on u.id = lb.user_id
	left join public.profiles p on p.id = lb.user_id
	order by lb.total_points desc;
$$;

revoke all on function public.get_public_leaderboard(integer) from public;
grant execute on function public.get_public_leaderboard(integer) to anon, authenticated;

