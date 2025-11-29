-- Add reply system to messages table
-- Run this in your Supabase SQL Editor

-- Add reply_to_id column to messages table
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- Create index for faster reply lookups
CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id);

-- Add same column to group_messages if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'group_messages') THEN
    ALTER TABLE public.group_messages 
    ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_group_messages_reply_to_id ON public.group_messages(reply_to_id);
  END IF;
END $$;
