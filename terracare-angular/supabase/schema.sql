-- Profiles table to store usernames and user info
create schema if not exists public;

create table if not exists public.profiles (
	id uuid primary key references auth.users(id) on delete cascade,
	username text unique not null,
	full_name text null,
	avatar_url text null,
	bio text null,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

-- helper function and trigger to maintain updated_at
create or replace function public.set_updated_at()
returns trigger as $$
begin
	new.updated_at = now();
	return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

