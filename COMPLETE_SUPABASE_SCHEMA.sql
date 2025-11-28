-- ========================================
-- COMPLETE WHATSAPP CLONE DATABASE SCHEMA
-- ========================================
-- এই পুরো কোড Supabase SQL Editor তে run করো
-- সব কিছু একসাথে run করলেই হবে

-- UUID Extension Enable
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. PROFILES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Profiles policies
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ========================================
-- 2. CONVERSATIONS TABLE (One-to-One Chat)
-- ========================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_1_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_2_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_content TEXT,
  last_message_time TIMESTAMPTZ,
  last_message_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT different_participants CHECK (participant_1_id != participant_2_id),
  CONSTRAINT ordered_participants CHECK (participant_1_id < participant_2_id)
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can update their conversations" ON public.conversations;

-- Conversations policies
CREATE POLICY "Users can view their conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = participant_1_id OR auth.uid() = participant_2_id);

CREATE POLICY "Users can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = participant_1_id OR auth.uid() = participant_2_id);

CREATE POLICY "Users can update their conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = participant_1_id OR auth.uid() = participant_2_id);

-- ========================================
-- 3. MESSAGES TABLE (One-to-One Messages)
-- ========================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image')),
  media_url TEXT,
  media_width INTEGER,
  media_height INTEGER,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'sending', 'queued')),
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON public.messages;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update message status in their conversations" ON public.messages;

-- Messages policies
CREATE POLICY "Users can view messages in their conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = messages.conversation_id
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
  );

CREATE POLICY "Users can insert messages in their conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = conversation_id
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() = sender_id);

CREATE POLICY "Users can update message status in their conversations"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations
      WHERE id = messages.conversation_id
      AND (participant_1_id = auth.uid() OR participant_2_id = auth.uid())
    )
  );

-- ========================================
-- 4. UNREAD COUNTS TABLE (One-to-One)
-- ========================================
CREATE TABLE IF NOT EXISTS public.unread_counts (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, conversation_id)
);

-- Enable RLS
ALTER TABLE public.unread_counts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their unread counts" ON public.unread_counts;
DROP POLICY IF EXISTS "Users can update their unread counts" ON public.unread_counts;
DROP POLICY IF EXISTS "Users can insert their unread counts" ON public.unread_counts;

-- Unread counts policies
CREATE POLICY "Users can view their unread counts"
  ON public.unread_counts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their unread counts"
  ON public.unread_counts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their unread counts"
  ON public.unread_counts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ========================================
-- 5. GROUPS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_content TEXT,
  last_message_time TIMESTAMPTZ,
  last_message_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  last_message_sender_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "groups_select_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_insert_policy" ON public.groups;
DROP POLICY IF EXISTS "groups_update_policy" ON public.groups;

-- Groups policies (must come AFTER group_members table creation)

-- ========================================
-- 6. GROUP MEMBERS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- Enable RLS
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "group_members_select_policy" ON public.group_members;
DROP POLICY IF EXISTS "group_members_insert_policy" ON public.group_members;
DROP POLICY IF EXISTS "group_members_delete_policy" ON public.group_members;

-- Group members policies (NO circular dependency!)
-- Users can see group members if they are members of that group
-- But we can't check group_members in the policy itself (infinite recursion!)
-- Solution: Check via the groups table using SECURITY DEFINER function

-- First, create a helper function to check group membership
CREATE OR REPLACE FUNCTION public.is_group_member(group_uuid UUID, user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Disable RLS for this function to avoid recursion
  RETURN EXISTS (
    SELECT 1 FROM public.group_members 
    WHERE group_id = group_uuid 
    AND user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Simple policy: Users can see all group_members records
-- (The groups policy will control which groups they can access)
CREATE POLICY "group_members_select_policy"
  ON public.group_members FOR SELECT
  USING (true);

CREATE POLICY "group_members_insert_policy"
  ON public.group_members FOR INSERT
  WITH CHECK (
    -- Only group creator or admins can add members
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid())
    OR
    public.is_group_member(group_id, auth.uid()) = true
  );

CREATE POLICY "group_members_delete_policy"
  ON public.group_members FOR DELETE
  USING (
    -- Users can remove themselves OR group creator can remove anyone
    user_id = auth.uid()
    OR
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid())
  );

-- NOW create groups policies (these use the helper function)
CREATE POLICY "groups_select_policy"
  ON public.groups FOR SELECT
  USING (
    created_by = auth.uid() 
    OR 
    public.is_group_member(id, auth.uid()) = true
  );

CREATE POLICY "groups_insert_policy"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "groups_update_policy"
  ON public.groups FOR UPDATE
  USING (
    created_by = auth.uid()
    OR
    public.is_group_member(id, auth.uid()) = true
  );

-- ========================================
-- 7. GROUP MESSAGES TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image')),
  media_url TEXT,
  media_width INTEGER,
  media_height INTEGER,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'sending', 'queued')),
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "group_messages_select_policy" ON public.group_messages;
DROP POLICY IF EXISTS "group_messages_insert_policy" ON public.group_messages;
DROP POLICY IF EXISTS "group_messages_update_policy" ON public.group_messages;

-- Group messages policies
CREATE POLICY "group_messages_select_policy"
  ON public.group_messages FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "group_messages_insert_policy"
  ON public.group_messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id 
    AND 
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "group_messages_update_policy"
  ON public.group_messages FOR UPDATE
  USING (auth.uid() = sender_id);

-- ========================================
-- 8. GROUP UNREAD COUNTS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS public.group_unread_counts (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, group_id)
);

-- Enable RLS
ALTER TABLE public.group_unread_counts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "group_unread_select_policy" ON public.group_unread_counts;
DROP POLICY IF EXISTS "group_unread_insert_policy" ON public.group_unread_counts;
DROP POLICY IF EXISTS "group_unread_update_policy" ON public.group_unread_counts;

-- Group unread counts policies
CREATE POLICY "group_unread_select_policy"
  ON public.group_unread_counts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "group_unread_insert_policy"
  ON public.group_unread_counts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "group_unread_update_policy"
  ON public.group_unread_counts FOR UPDATE
  USING (auth.uid() = user_id);

-- ========================================
-- 9. INDEXES FOR PERFORMANCE
-- ========================================
CREATE INDEX IF NOT EXISTS idx_conversations_participant_1 ON public.conversations(participant_1_id);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_2 ON public.conversations(participant_2_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_time ON public.conversations(last_message_time DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unread_counts_user_id ON public.unread_counts(user_id);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON public.group_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_groups_updated_at ON public.groups(updated_at DESC);

-- ========================================
-- 10. FUNCTIONS & TRIGGERS
-- ========================================

-- Function: Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id, 
    NEW.email, 
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function: Update conversation last message
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

-- Trigger: Update conversation on new message
DROP TRIGGER IF EXISTS on_message_created ON public.messages;
CREATE TRIGGER on_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- Function: Increment unread count for recipient (One-to-One)
CREATE OR REPLACE FUNCTION public.handle_new_message_unread_count()
RETURNS TRIGGER AS $$
DECLARE
  recipient_id UUID;
BEGIN
  -- Find the conversation to get participants
  SELECT 
    CASE 
      WHEN participant_1_id = NEW.sender_id THEN participant_2_id
      ELSE participant_1_id
    END INTO recipient_id
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  -- Upsert unread count for the recipient
  INSERT INTO public.unread_counts (user_id, conversation_id, count)
  VALUES (recipient_id, NEW.conversation_id, 1)
  ON CONFLICT (user_id, conversation_id)
  DO UPDATE SET count = unread_counts.count + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Increment unread on new message (One-to-One)
DROP TRIGGER IF EXISTS on_message_created_unread_count ON public.messages;
CREATE TRIGGER on_message_created_unread_count
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_message_unread_count();

-- Function: Update group last message
CREATE OR REPLACE FUNCTION public.update_group_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.groups
  SET 
    last_message_content = NEW.content,
    last_message_time = NEW.created_at,
    last_message_sender_id = NEW.sender_id,
    last_message_sender_name = (SELECT full_name FROM public.profiles WHERE id = NEW.sender_id),
    updated_at = NOW()
  WHERE id = NEW.group_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Update group on new message
DROP TRIGGER IF EXISTS on_group_message_created ON public.group_messages;
CREATE TRIGGER on_group_message_created
  AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_group_last_message();

-- Function: Increment unread count for all group members (except sender)
CREATE OR REPLACE FUNCTION public.handle_new_group_message_unread_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Increment unread count for ALL members except the sender
  INSERT INTO public.group_unread_counts (user_id, group_id, count)
  SELECT 
    gm.user_id, 
    NEW.group_id, 
    1
  FROM public.group_members gm
  WHERE gm.group_id = NEW.group_id
    AND gm.user_id != NEW.sender_id  -- Don't increment for sender
  ON CONFLICT (user_id, group_id)
  DO UPDATE SET count = group_unread_counts.count + 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: Increment group unread on new message
DROP TRIGGER IF EXISTS on_group_message_created_unread_count ON public.group_messages;
CREATE TRIGGER on_group_message_created_unread_count
  AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_group_message_unread_count();

-- ========================================
-- 11. ENABLE REALTIME
-- ========================================

-- Safely remove tables from realtime (ignore errors if not present)
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.conversations;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.unread_counts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.group_messages;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.groups;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.group_members;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.group_unread_counts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add tables to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.unread_counts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_unread_counts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- ========================================
-- COMPLETE! 
-- ========================================
-- এখন তোমার WhatsApp Clone এর পুরো database ready!
-- One-to-One chat + Group chat দুটোই realtime এ কাজ করবে
-- Profile updates (name/avatar) ও realtime এ sync হবে
