-- Migration: Add last_message_sender_id to conversations table
-- Run this in your Supabase SQL Editor

-- Add the new column
ALTER TABLE public.conversations 
ADD COLUMN IF NOT EXISTS last_message_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Update the trigger function to include sender_id
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET 
    last_message_content = NEW.content,
    last_message_time = NEW.created_at,
    last_message_sender_id = NEW.sender_id
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill existing conversations with the sender_id from their last message
UPDATE public.conversations c
SET last_message_sender_id = (
  SELECT m.sender_id 
  FROM public.messages m 
  WHERE m.conversation_id = c.id 
  ORDER BY m.created_at DESC 
  LIMIT 1
)
WHERE c.last_message_content IS NOT NULL;
