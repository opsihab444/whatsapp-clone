-- Add favorites system
-- Run this in your Supabase SQL Editor

-- Table to track favorite conversations per user
CREATE TABLE IF NOT EXISTS public.favorite_conversations (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

-- Enable RLS
ALTER TABLE public.favorite_conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their favorites" ON public.favorite_conversations;
DROP POLICY IF EXISTS "Users can add favorites" ON public.favorite_conversations;
DROP POLICY IF EXISTS "Users can remove favorites" ON public.favorite_conversations;

-- Policies
CREATE POLICY "Users can view their favorites"
  ON public.favorite_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add favorites"
  ON public.favorite_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove favorites"
  ON public.favorite_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_favorite_conversations_user ON public.favorite_conversations(user_id);
