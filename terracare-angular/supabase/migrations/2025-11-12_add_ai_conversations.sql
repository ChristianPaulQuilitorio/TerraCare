-- Migration: add ai_conversations table and RLS policies
-- Created: 2025-11-12

-- Table to persist AI conversation history per user
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null default 'llama-3.3-70b',
  messages jsonb not null,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_conversations_user_time on public.ai_conversations(user_id, created_at desc);

-- Enable Row Level Security so clients can only access their own conversations
alter table if exists public.ai_conversations enable row level security;

-- Allow authenticated users to insert their own conversation rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_conversations' AND policyname='ai_conversations_insert_own'
  ) THEN
    EXECUTE 'CREATE POLICY ai_conversations_insert_own ON public.ai_conversations FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- Allow authenticated users to select their own conversation rows
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_conversations' AND policyname='ai_conversations_select_own'
  ) THEN
    EXECUTE 'CREATE POLICY ai_conversations_select_own ON public.ai_conversations FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

-- Allow authenticated users to delete their own conversations (optional)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ai_conversations' AND policyname='ai_conversations_delete_own'
  ) THEN
    EXECUTE 'CREATE POLICY ai_conversations_delete_own ON public.ai_conversations FOR DELETE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- Grant minimal access to authenticated role for convenience (these grants don't bypass RLS)
GRANT SELECT, INSERT, DELETE ON public.ai_conversations TO authenticated;

-- Note: Server-side service role (using SUPABASE_SERVICE_ROLE_KEY) can bypass RLS for admin operations.
