-- Allow group admins to update other members' roles (e.g. promote/demote)

-- 1. Enable RLS on group_members (just in case)
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing update policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can update group members" ON group_members;
DROP POLICY IF EXISTS "Group admins can update members" ON group_members;

-- 3. Create policy to allow admins to update members in their groups
CREATE POLICY "Admins can update group members"
ON group_members
FOR UPDATE
TO authenticated
USING (
  -- The user performing the update must be an admin of the group
  EXISTS (
    SELECT 1 
    FROM group_members gm 
    WHERE gm.group_id = group_members.group_id 
    AND gm.user_id = auth.uid() 
    AND gm.role = 'admin'
  )
)
WITH CHECK (
  -- The user performing the update must be an admin of the group
  EXISTS (
    SELECT 1 
    FROM group_members gm 
    WHERE gm.group_id = group_members.group_id 
    AND gm.user_id = auth.uid() 
    AND gm.role = 'admin'
  )
);
