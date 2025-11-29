-- Add deleted_conversations table for per-user chat deletion
-- Run this in your Supabase SQL Editor

-- Table to track which users have deleted which conversations
CREATE TABLE IF NOT EXISTS public.deleted_conversations (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, conversation_id)
);

-- Enable RLS
ALTER TABLE public.deleted_conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their deleted conversations" ON public.deleted_conversations;
DROP POLICY IF EXISTS "Users can insert their deleted conversations" ON public.deleted_conversations;
DROP POLICY IF EXISTS "Users can delete their deleted conversations record" ON public.deleted_conversations;
DROP POLICY IF EXISTS "Users can update their deleted conversations" ON public.deleted_conversations;

-- Policies
CREATE POLICY "Users can view their deleted conversations"
  ON public.deleted_conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their deleted conversations"
  ON public.deleted_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their deleted conversations"
  ON public.deleted_conversations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their deleted conversations record"
  ON public.deleted_conversations FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_deleted_conversations_user_id ON public.deleted_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_deleted_conversations_conversation_id ON public.deleted_conversations(conversation_id);
