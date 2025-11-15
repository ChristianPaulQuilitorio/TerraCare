-- TerraCare RLS and schema setup for challenges, scoring, and storage
-- Run these statements in your Supabase SQL editor using the service role or owner role.

-- 1) Challenges: ensure base_points exists and is constrained 1..100
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS base_points integer NOT NULL DEFAULT 10;

DO $$ BEGIN
  -- Add the check constraint only if it's missing (ADD CONSTRAINT doesn't support IF NOT EXISTS)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'challenges'
      AND c.conname = 'challenges_base_points_chk'
  ) THEN
    EXECUTE 'ALTER TABLE public.challenges ADD CONSTRAINT challenges_base_points_chk CHECK (base_points >= 1 AND base_points <= 100)';
  END IF;
END $$;

-- 2) Challenge history table RLS policies (records user completions)
-- Ensure required columns exist for scoring flow
ALTER TABLE public.challenge_history
  ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.challenge_history ENABLE ROW LEVEL SECURITY;

-- Insert only your own rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_history' AND policyname='challenge_history_insert_self'
  ) THEN
    EXECUTE 'CREATE POLICY challenge_history_insert_self ON public.challenge_history FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Allow delete of history by the user themselves or by the challenge creator (to enable full challenge deletion)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_history' AND policyname='challenge_history_delete_self_or_creator'
  ) THEN
    EXECUTE 'CREATE POLICY challenge_history_delete_self_or_creator ON public.challenge_history FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
  END IF;
END $$;

-- Read only your own rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_history' AND policyname='challenge_history_select_self'
  ) THEN
    EXECUTE 'CREATE POLICY challenge_history_select_self ON public.challenge_history FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- Optional: allow delete of scores by self or challenge creator (if scores is a base table)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'challenge_scores' AND table_type = 'BASE TABLE'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_scores' AND policyname='challenge_scores_delete_self_or_creator'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_scores_delete_self_or_creator ON public.challenge_scores FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
    END IF;
  END IF;
END $$;

-- (Optional) allow updates/deletes on your own rows
-- CREATE POLICY IF NOT EXISTS challenge_history_update_self
-- ON public.challenge_history FOR UPDATE
-- USING (auth.uid() = user_id)
-- WITH CHECK (auth.uid() = user_id);

-- Guard against duplicate completions per user per challenge
CREATE UNIQUE INDEX IF NOT EXISTS ux_challenge_history_completed_once
ON public.challenge_history (challenge_id, user_id)
WHERE action = 'completed';

-- Set default points and timestamps automatically (client can omit points)
CREATE OR REPLACE FUNCTION public.fn_challenge_history_defaults()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.action = 'completed' THEN
    -- If points missing or invalid, derive from challenges.base_points
    IF NEW.points IS NULL OR NEW.points <= 0 THEN
      SELECT COALESCE(base_points, 10) INTO NEW.points FROM public.challenges WHERE id = NEW.challenge_id;
      IF NEW.points IS NULL THEN NEW.points := 10; END IF;
      IF NEW.points < 1 THEN NEW.points := 1; END IF;
      IF NEW.points > 100 THEN NEW.points := 100; END IF;
    END IF;
    -- Snapshot challenge title & base points for future reference even if challenge removed
    IF NEW.challenge_id IS NOT NULL THEN
      SELECT title, base_points INTO NEW.challenge_title_snapshot, NEW.challenge_base_points_snapshot
      FROM public.challenges WHERE id = NEW.challenge_id;
    END IF;
  END IF;
  IF NEW.occurred_at IS NULL THEN NEW.occurred_at := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_challenge_history_defaults ON public.challenge_history;
CREATE TRIGGER trg_challenge_history_defaults
BEFORE INSERT ON public.challenge_history
FOR EACH ROW
EXECUTE FUNCTION public.fn_challenge_history_defaults();

-- 3) Challenge scores RLS (per-user aggregate over history)
-- If this is a table, enable RLS and allow select-only to owner
-- If this is a view, policies apply on the base tables; keep this as select-only table policy if applicable.
DO $$ BEGIN
  -- Apply only if challenge_scores is a base table (not a view)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'challenge_scores' AND table_type = 'BASE TABLE'
  ) THEN
    -- Ensure expected columns are present
    EXECUTE 'ALTER TABLE public.challenge_scores
              ADD COLUMN IF NOT EXISTS user_id uuid,
              ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0';
    EXECUTE 'ALTER TABLE public.challenge_scores ENABLE ROW LEVEL SECURITY';
    -- SELECT policy
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_scores' AND policyname='challenge_scores_select_self'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_scores_select_self ON public.challenge_scores FOR SELECT USING (auth.uid() = user_id)';
    END IF;
    -- INSERT policy (allow a user to create their own score row)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_scores' AND policyname='challenge_scores_insert_self'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_scores_insert_self ON public.challenge_scores FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
    -- UPDATE policy (allow a user to update their own score row)
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_scores' AND policyname='challenge_scores_update_self'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_scores_update_self ON public.challenge_scores FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    END IF;
  END IF;
END $$;

-- 4c) Challenge tasks RLS (managed by challenge creator; readable for public or creator)
DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='challenge_tasks';
  IF FOUND THEN
    EXECUTE 'ALTER TABLE public.challenge_tasks ENABLE ROW LEVEL SECURITY';
    -- SELECT: allow anyone to read tasks for public challenges, or the creator
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_tasks' AND policyname='challenge_tasks_select_public_or_creator'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_tasks_select_public_or_creator ON public.challenge_tasks FOR SELECT USING (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND (c.visibility = ''public'' OR c.creator_id = auth.uid())))';
    END IF;
    -- INSERT: only creator of the linked challenge
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_tasks' AND policyname='challenge_tasks_insert_creator'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_tasks_insert_creator ON public.challenge_tasks FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
    END IF;
    -- UPDATE: only creator
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_tasks' AND policyname='challenge_tasks_update_creator'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_tasks_update_creator ON public.challenge_tasks FOR UPDATE USING (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
    END IF;
    -- DELETE: creator can delete tasks for cleanup before deleting the challenge
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='challenge_tasks' AND policyname='challenge_tasks_delete_creator'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_tasks_delete_creator ON public.challenge_tasks FOR DELETE USING (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
    END IF;
  END IF;
END $$;

-- 4) Participants RLS (joining/leaving challenges)
ALTER TABLE public.challenge_participants ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_participants' AND policyname='challenge_participants_insert_self'
  ) THEN
    EXECUTE 'CREATE POLICY challenge_participants_insert_self ON public.challenge_participants FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_participants' AND policyname='challenge_participants_select_self'
  ) THEN
    EXECUTE 'CREATE POLICY challenge_participants_select_self ON public.challenge_participants FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- 4b) Challenges RLS (creator permissions)
DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN undefined_table THEN
    -- table may not exist in very early setups; skip
    NULL;
  END;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenges' AND policyname='challenges_select_public_or_creator'
  ) THEN
    EXECUTE 'CREATE POLICY challenges_select_public_or_creator ON public.challenges FOR SELECT USING (visibility = ''public'' OR creator_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenges' AND policyname='challenges_update_creator'
  ) THEN
    EXECUTE 'CREATE POLICY challenges_update_creator ON public.challenges FOR UPDATE USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenges' AND policyname='challenges_delete_creator'
  ) THEN
    EXECUTE 'CREATE POLICY challenges_delete_creator ON public.challenges FOR DELETE USING (creator_id = auth.uid())';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_participants' AND policyname='challenge_participants_update_self'
  ) THEN
    EXECUTE 'CREATE POLICY challenge_participants_update_self ON public.challenge_participants FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Allow challenge creator to delete participant rows for their own challenge (needed for cascading manual cleanups before delete)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='challenge_participants' AND policyname='challenge_participants_delete_creator_or_self'
  ) THEN
    EXECUTE 'CREATE POLICY challenge_participants_delete_creator_or_self ON public.challenge_participants FOR DELETE USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
  END IF;
END $$;

-- 5) User task progress RLS (checking off tasks)
DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'user_challenge_tasks';
  IF FOUND THEN
    EXECUTE 'ALTER TABLE public.user_challenge_tasks ENABLE ROW LEVEL SECURITY';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_challenge_tasks' AND policyname='user_challenge_tasks_select_self'
    ) THEN
      EXECUTE 'CREATE POLICY user_challenge_tasks_select_self ON public.user_challenge_tasks FOR SELECT USING (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_challenge_tasks' AND policyname='user_challenge_tasks_insert_self'
    ) THEN
      EXECUTE 'CREATE POLICY user_challenge_tasks_insert_self ON public.user_challenge_tasks FOR INSERT WITH CHECK (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_challenge_tasks' AND policyname='user_challenge_tasks_update_self'
    ) THEN
      EXECUTE 'CREATE POLICY user_challenge_tasks_update_self ON public.user_challenge_tasks FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_challenge_tasks' AND policyname='user_challenge_tasks_delete_self'
    ) THEN
      EXECUTE 'CREATE POLICY user_challenge_tasks_delete_self ON public.user_challenge_tasks FOR DELETE USING (auth.uid() = user_id)';
    END IF;
  END IF;
END $$;

-- Allow challenge creator to delete user task rows tied to their challenge (cleanup before challenge deletion)
DO $$ BEGIN
  PERFORM 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_challenge_tasks';
  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='user_challenge_tasks' AND policyname='user_challenge_tasks_delete_creator'
    ) THEN
      EXECUTE 'CREATE POLICY user_challenge_tasks_delete_creator ON public.user_challenge_tasks FOR DELETE USING (EXISTS (SELECT 1 FROM public.challenges c WHERE c.id = challenge_id AND c.creator_id = auth.uid()))';
    END IF;
  END IF;
END $$;

-- 6) Storage bucket for proofs (challenge-proofs)
-- Create bucket if missing (public read or keep private and use signed URLs)
-- Create bucket via direct insert to avoid version-specific create_bucket signature
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'challenge-proofs') THEN
      INSERT INTO storage.buckets (id, name, public)
      VALUES ('challenge-proofs', 'challenge-proofs', true);
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped creating bucket challenge-proofs (insufficient privilege). Create it in the Dashboard.';
  END;
END $$;

-- Enable RLS on storage.objects if not already enabled
DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped enabling RLS on storage.objects (insufficient privilege). It is usually enabled by default on Supabase.';
  END;
END $$;

-- Read: allow reading any object from this bucket (public)
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='challenge_proofs_public_read'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_proofs_public_read ON storage.objects FOR SELECT USING (bucket_id = ''challenge-proofs'')';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped creating policy challenge_proofs_public_read (insufficient privilege).';
  END;
END $$;

-- Insert: allow authenticated users to upload only under their own folder prefix
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='challenge_proofs_insert_own'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_proofs_insert_own ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = ''challenge-proofs'' AND position((''proofs/'' || auth.uid() || ''/'') in name) = 1)';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped creating policy challenge_proofs_insert_own (insufficient privilege).';
  END;
END $$;

-- Update/Delete: allow users to manage only their own files
DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='challenge_proofs_update_own'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_proofs_update_own ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = ''challenge-proofs'' AND position((''proofs/'' || auth.uid() || ''/'') in name) = 1) WITH CHECK (bucket_id = ''challenge-proofs'' AND position((''proofs/'' || auth.uid() || ''/'') in name) = 1)';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped creating policy challenge_proofs_update_own (insufficient privilege).';
  END;
END $$;

DO $$ BEGIN
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects' AND policyname='challenge_proofs_delete_own'
    ) THEN
      EXECUTE 'CREATE POLICY challenge_proofs_delete_own ON storage.objects FOR DELETE TO authenticated USING (bucket_id = ''challenge-proofs'' AND position((''proofs/'' || auth.uid() || ''/'') in name) = 1)';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipped creating policy challenge_proofs_delete_own (insufficient privilege).';
  END;
END $$;

-- 7) Scoring helper NOTE:
-- The authoritative scoring trigger & function are defined in schema.sql (fn_recalc_score + trg_history_sync).
-- Removed older per-user aggregate logic here to avoid conflict with existing (challenge_id,user_id) PK design.

-- Cleanup: if older per-user scoring trigger/functions were created previously, drop them now
DO $$ BEGIN
  -- Drop legacy trigger that may upsert into challenge_scores without challenge_id
  IF EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'challenge_history' AND t.tgname = 'trg_challenge_history_recalc'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_challenge_history_recalc ON public.challenge_history';
  END IF;

  -- Drop helper functions if present
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'trg_recalc_user_score'
  ) THEN
    EXECUTE 'DROP FUNCTION public.trg_recalc_user_score()';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_recalc_user_score'
  ) THEN
    EXECUTE 'DROP FUNCTION public.fn_recalc_user_score(uuid)';
  END IF;
END $$;
