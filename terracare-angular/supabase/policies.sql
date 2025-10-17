-- TerraCare Supabase RLS Policies
-- Enable RLS and set policies matching the requested visibility

-- Helper: enable RLS for all tables we manage
alter table if exists public.profiles enable row level security;
alter table if exists public.challenges enable row level security;
alter table if exists public.challenge_participants enable row level security;
alter table if exists public.challenge_history enable row level security;
alter table if exists public.challenge_scores enable row level security;
alter table if exists public.posts enable row level security;
alter table if exists public.knowledge enable row level security;

-- profiles
drop policy if exists "profiles_public_read" on public.profiles;
create policy "profiles_public_read" on public.profiles for select using (true);

drop policy if exists "profiles_self_write" on public.profiles;
create policy "profiles_self_write" on public.profiles for all
using (auth.uid() = id) with check (auth.uid() = id);

-- challenges (public read; creator can write)
drop policy if exists "challenges_public_read" on public.challenges;
create policy "challenges_public_read" on public.challenges for select using (visibility = 'public');

drop policy if exists "challenges_creator_write" on public.challenges;
create policy "challenges_creator_write" on public.challenges for all
using (auth.uid() = creator_id) with check (auth.uid() = creator_id);

-- challenge_participants (public read; any authed user can join themselves; self can delete)
drop policy if exists "participants_public_read" on public.challenge_participants;
create policy "participants_public_read" on public.challenge_participants for select using (true);

drop policy if exists "participants_self_join" on public.challenge_participants;
create policy "participants_self_join" on public.challenge_participants for insert
with check (auth.uid() = user_id);

drop policy if exists "participants_self_leave" on public.challenge_participants;
create policy "participants_self_leave" on public.challenge_participants for delete
using (auth.uid() = user_id);

-- challenge_history (private: only the owner can see/modify)
drop policy if exists "history_owner_read" on public.challenge_history;
create policy "history_owner_read" on public.challenge_history for select using (auth.uid() = user_id);

drop policy if exists "history_owner_write" on public.challenge_history;
create policy "history_owner_write" on public.challenge_history for all
using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- challenge_scores (public leaderboard read; system writes through triggers; restrict direct DML)
drop policy if exists "scores_public_read" on public.challenge_scores;
create policy "scores_public_read" on public.challenge_scores for select using (true);

-- You can optionally deny insert/update/delete by omitting write policies, leaving only the trigger to maintain data

-- posts (public read; authors can write)
drop policy if exists "posts_public_read" on public.posts;
create policy "posts_public_read" on public.posts for select using (is_public);

drop policy if exists "posts_author_write" on public.posts;
create policy "posts_author_write" on public.posts for all
using (auth.uid() = author_id) with check (auth.uid() = author_id);

-- knowledge (public read; optionally allow admins or service role to write; here we allow authenticated users to insert)
drop policy if exists "knowledge_public_read" on public.knowledge;
create policy "knowledge_public_read" on public.knowledge for select using (true);

drop policy if exists "knowledge_auth_insert" on public.knowledge;
create policy "knowledge_auth_insert" on public.knowledge for insert
with check (auth.role() = 'authenticated');

-- Storage bucket policies for forum-attachments
-- Public can read; authenticated users can write/delete only their own files under forum/<uid>/...
-- Note: These policies apply on storage.objects and filter by bucket_id
drop policy if exists "forum_public_read" on storage.objects;
create policy "forum_public_read" on storage.objects for select
using (bucket_id = 'forum-attachments');

drop policy if exists "forum_user_upload" on storage.objects;
create policy "forum_user_upload" on storage.objects for insert
with check (
	bucket_id = 'forum-attachments'
	and auth.role() = 'authenticated'
	and (name like 'forum/' || auth.uid() || '/%')
);

drop policy if exists "forum_user_update" on storage.objects;
create policy "forum_user_update" on storage.objects for update
using (
	bucket_id = 'forum-attachments'
	and auth.role() = 'authenticated'
	and (name like 'forum/' || auth.uid() || '/%')
);

drop policy if exists "forum_user_delete" on storage.objects;
create policy "forum_user_delete" on storage.objects for delete
using (
	bucket_id = 'forum-attachments'
	and auth.role() = 'authenticated'
	and (name like 'forum/' || auth.uid() || '/%')
);

-- Storage bucket policies for challenge-attachments (images under challenges/<uid>/...)
drop policy if exists "challenges_public_read" on storage.objects;
create policy "challenges_public_read" on storage.objects for select
using (bucket_id = 'challenge-attachments');

drop policy if exists "challenges_user_upload" on storage.objects;
create policy "challenges_user_upload" on storage.objects for insert
with check (
	bucket_id = 'challenge-attachments'
	and auth.role() = 'authenticated'
	and (name like 'challenges/' || auth.uid() || '/%')
);

drop policy if exists "challenges_user_update" on storage.objects;
create policy "challenges_user_update" on storage.objects for update
using (
	bucket_id = 'challenge-attachments'
	and auth.role() = 'authenticated'
	and (name like 'challenges/' || auth.uid() || '/%')
);

drop policy if exists "challenges_user_delete" on storage.objects;
create policy "challenges_user_delete" on storage.objects for delete
using (
	bucket_id = 'challenge-attachments'
	and auth.role() = 'authenticated'
	and (name like 'challenges/' || auth.uid() || '/%')
);

-- Storage bucket policies for avatars
-- Public can read avatars; authenticated users can write/delete only their own files under avatars/<uid>/...
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "avatars_user_upload" on storage.objects;
create policy "avatars_user_upload" on storage.objects for insert
with check (
	bucket_id = 'avatars'
	and auth.role() = 'authenticated'
	and (name like 'avatars/' || auth.uid() || '/%')
);

drop policy if exists "avatars_user_update" on storage.objects;
create policy "avatars_user_update" on storage.objects for update
using (
	bucket_id = 'avatars'
	and auth.role() = 'authenticated'
	and (name like 'avatars/' || auth.uid() || '/%')
);

drop policy if exists "avatars_user_delete" on storage.objects;
create policy "avatars_user_delete" on storage.objects for delete
using (
	bucket_id = 'avatars'
	and auth.role() = 'authenticated'
	and (name like 'avatars/' || auth.uid() || '/%')
);

