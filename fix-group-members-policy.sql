-- Fix group_members SELECT policy
-- Run this in Supabase SQL Editor

-- Drop old restrictive policy
DROP POLICY IF EXISTS "group_members_select_policy" ON public.group_members;
DROP POLICY IF EXISTS "Users can view members of their groups" ON public.group_members;

-- Create new policy that allows viewing all members of groups you belong to
CREATE POLICY "group_members_select_policy"
  ON public.group_members FOR SELECT
  USING (
    group_id IN (SELECT gm.group_id FROM public.group_members gm WHERE gm.user_id = auth.uid())
  );
