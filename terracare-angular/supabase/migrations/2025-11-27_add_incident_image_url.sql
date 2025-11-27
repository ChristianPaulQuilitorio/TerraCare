-- Migration: add image_url column to incidents table
-- Date: 2025-11-27
-- This migration is idempotent: safe to paste/run multiple times in Supabase SQL editor.

BEGIN;

-- Add a nullable text column to hold the public URL for incident attachments
ALTER TABLE IF EXISTS public.incidents
  ADD COLUMN IF NOT EXISTS image_url text;

-- Optional: create an index for faster lookups by image_url (cheap, but safe)
CREATE INDEX IF NOT EXISTS idx_incidents_image_url ON public.incidents USING btree (image_url);

COMMIT;

-- Rollback (for manual usage):
-- ALTER TABLE IF EXISTS public.incidents DROP COLUMN IF EXISTS image_url;
-- DROP INDEX IF EXISTS idx_incidents_image_url;
