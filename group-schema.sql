-- Group Chat Database Schema
-- Run this in your Supabase SQL Editor after the main schema

-- Groups table
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

-- Group members table
CREATE TABLE IF NOT EXISTS public.group_members (
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);

-- Enable RLS
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Group messages table
CREATE TABLE IF NOT EXISTS public.group_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT,
  type TEXT NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'image')),
  media_url TEXT,
  media_width INTEGER,
  media_height INTEGER,
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read')),
  is_edited BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Group unread counts table
CREATE TABLE IF NOT EXISTS public.group_unread_counts (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  count INTEGER DEFAULT 0,
  PRIMARY KEY (user_id, group_id)
);

-- Enable RLS
ALTER TABLE public.group_unread_counts ENABLE ROW LEVEL SECURITY;


-- =====================
-- POLICIES
-- =====================

-- Groups policies (uses group_members, so group_members must have simple policy first)
CREATE POLICY "groups_select_policy"
  ON public.groups FOR SELECT
  USING (
    created_by = auth.uid() 
    OR 
    id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "groups_insert_policy"
  ON public.groups FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "groups_update_policy"
  ON public.groups FOR UPDATE
  USING (
    id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Group members policies (simple, no self-reference)
CREATE POLICY "group_members_select_policy"
  ON public.group_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "group_members_insert_policy"
  ON public.group_members FOR INSERT
  WITH CHECK (
    -- Creator can add members to their groups
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid())
    OR
    -- Admins can add members
    EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "group_members_delete_policy"
  ON public.group_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR
    EXISTS (SELECT 1 FROM public.groups WHERE id = group_id AND created_by = auth.uid())
  );

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

-- =====================
-- INDEXES
-- =====================
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON public.group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON public.group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON public.group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_created_at ON public.group_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_groups_updated_at ON public.groups(updated_at DESC);

-- =====================
-- FUNCTIONS & TRIGGERS
-- =====================
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

DROP TRIGGER IF EXISTS on_group_message_created ON public.group_messages;
CREATE TRIGGER on_group_message_created
  AFTER INSERT ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_group_last_message();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_members;
