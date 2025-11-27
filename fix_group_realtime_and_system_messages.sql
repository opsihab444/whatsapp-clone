-- ========================================
-- FIX GROUP REALTIME + SYSTEM MESSAGES
-- ========================================
-- এই পুরো SQL একসাথে Supabase SQL Editor এ run করো

-- ========================================
-- 1. SYSTEM MESSAGE TYPE ADD করো
-- ========================================
-- Drop the existing constraint
ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS group_messages_type_check;

-- Add new constraint with 'system' type included
ALTER TABLE public.group_messages 
ADD CONSTRAINT group_messages_type_check 
CHECK (type IN ('text', 'image', 'system'));

-- ========================================
-- 2. FIX GROUP LAST MESSAGE TRIGGER
-- ========================================
-- এই trigger টা group এ message আসলে last_message_sender_name update করবে
-- full_name না থাকলে email থেকে name নেবে
CREATE OR REPLACE FUNCTION public.update_group_last_message()
RETURNS TRIGGER AS $$
DECLARE
  sender_name TEXT;
BEGIN
  -- Get sender name: full_name or email prefix
  SELECT COALESCE(full_name, SPLIT_PART(email, '@', 1)) 
  INTO sender_name 
  FROM public.profiles 
  WHERE id = NEW.sender_id;

  UPDATE public.groups
  SET 
    last_message_content = NEW.content,
    last_message_time = NEW.created_at,
    last_message_sender_id = NEW.sender_id,
    last_message_sender_name = sender_name,
    updated_at = NOW()
  WHERE id = NEW.group_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger
DROP TRIGGER IF EXISTS on_group_message_created ON public.group_messages;
CREATE TRIGGER on_group_message_created
  AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_group_last_message();

-- ========================================
-- 3. GROUP MEMBERS REALTIME FIX (DELETE events)
-- ========================================
-- REPLICA IDENTITY FULL set করো group_members table এ
-- এটা DELETE events এ old row data পাঠাবে (user_id, group_id)
ALTER TABLE public.group_members REPLICA IDENTITY FULL;

-- ========================================
-- 4. REALTIME PUBLICATION - ALL TABLES
-- ========================================
-- Safely remove all tables first
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.messages; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.conversations; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.unread_counts; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.group_messages; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.groups; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.group_members; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.group_unread_counts; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Add all tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.unread_counts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_unread_counts;

-- ========================================
-- DONE! এখন যা কাজ করবে:
-- ========================================
-- ✅ Group message realtime (sidebar update, unread count)
-- ✅ Member add করলে sidebar এ group দেখাবে (নতুন member এর জন্য)
-- ✅ Member kick করলে sidebar থেকে group remove হবে (kicked user এর জন্য)
-- ✅ Conversation এ system message দেখাবে:
--    - "Admin added User1"
--    - "Admin removed User2"  
--    - "User3 left the group"
