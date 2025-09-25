-- Messages table for broadcast messages shown in the app
-- Run this script in the Supabase SQL editor

-- Ensure UUID generator is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper: update updated_at on UPDATE (idempotent create)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER AS $upd$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $upd$ LANGUAGE plpgsql;
  END IF;
END $$;

-- Create messages table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  business_id TEXT NOT NULL,
  -- Time-to-live in hours for homepage visibility (1 hour up to 30 days)
  ttl_hours INT NOT NULL DEFAULT 24 CHECK (ttl_hours BETWEEN 1 AND 720),
  published_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  -- Expires at (set by trigger from published_at + ttl_minutes)
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_business ON public.messages(business_id);
CREATE INDEX IF NOT EXISTS idx_messages_published_at ON public.messages(published_at);
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON public.messages(expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_business_active ON public.messages(business_id, expires_at, published_at);

-- updated_at trigger
DROP TRIGGER IF EXISTS update_messages_updated_at ON public.messages;
CREATE TRIGGER update_messages_updated_at
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- If the table already existed with ttl_minutes, migrate it to ttl_hours
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'ttl_minutes'
  ) THEN
    -- Drop dependent view if exists (will be recreated below)
    IF EXISTS (
      SELECT 1 FROM information_schema.views 
      WHERE table_schema = 'public' AND table_name = 'active_messages'
    ) THEN
      EXECUTE 'DROP VIEW IF EXISTS public.active_messages';
    END IF;

    -- Rename column minutes -> hours
    ALTER TABLE public.messages RENAME COLUMN ttl_minutes TO ttl_hours;
    -- Update default to 24 hours
    ALTER TABLE public.messages ALTER COLUMN ttl_hours SET DEFAULT 24;

    -- Backfill expires_at if needed
    UPDATE public.messages
    SET expires_at = COALESCE(published_at, created_at) + make_interval(hours => ttl_hours)
    WHERE expires_at IS NULL;
  END IF;
END $$;

-- keep expires_at in sync via trigger (since generated columns require IMMUTABLE-only expressions on PG)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'set_messages_expires_at' AND n.nspname = 'public'
  ) THEN
    CREATE OR REPLACE FUNCTION public.set_messages_expires_at()
    RETURNS TRIGGER AS $setexp$
    BEGIN
      NEW.expires_at := COALESCE(NEW.published_at, NEW.created_at) + make_interval(hours => NEW.ttl_hours);
      RETURN NEW;
    END;
    $setexp$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_set_messages_expires_at ON public.messages;
CREATE TRIGGER trg_set_messages_expires_at
  BEFORE INSERT OR UPDATE OF published_at, ttl_hours ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_messages_expires_at();

-- Follow existing project policy: disable RLS on application tables
ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY;

-- Optional helper view for active messages per business (safe to drop/create)
CREATE OR REPLACE VIEW public.active_messages AS
SELECT m.*
FROM public.messages m
WHERE m.expires_at > NOW();


