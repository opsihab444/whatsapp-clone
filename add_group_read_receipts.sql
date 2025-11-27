-- ========================================
-- GROUP MESSAGE READ RECEIPTS
-- Tracks which users have read messages in a group
-- ========================================

-- Table to track last read message per user per group
CREATE TABLE IF NOT EXISTS public.group_message_reads (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  last_read_message_id UUID REFERENCES public.group_messages(id) ON DELETE SET NULL,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

-- Enable RLS
ALTER TABLE public.group_message_reads ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "group_message_reads_select_policy"
  ON public.group_message_reads FOR SELECT
  USING (
    group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
  );

CREATE POLICY "group_message_reads_insert_policy"
  ON public.group_message_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "group_message_reads_update_policy"
  ON public.group_message_reads FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_group_message_reads_group_id ON public.group_message_reads(group_id);
CREATE INDEX IF NOT EXISTS idx_group_message_reads_last_read_message_id ON public.group_message_reads(last_read_message_id);

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_message_reads;
