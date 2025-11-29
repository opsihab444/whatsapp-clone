-- Add pinned chats system
-- Run this in your Supabase SQL Editor

-- Table to track pinned conversations per user
CREATE TABLE IF NOT EXISTS public.pinned_conversations (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

-- Enable RLS
ALTER TABLE public.pinned_conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their pinned chats" ON public.pinned_conversations;
DROP POLICY IF EXISTS "Users can pin chats" ON public.pinned_conversations;
DROP POLICY IF EXISTS "Users can unpin chats" ON public.pinned_conversations;

-- Policies
CREATE POLICY "Users can view their pinned chats"
  ON public.pinned_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can pin chats"
  ON public.pinned_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unpin chats"
  ON public.pinned_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_pinned_conversations_user ON public.pinned_conversations(user_id);
