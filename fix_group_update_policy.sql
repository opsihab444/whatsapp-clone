-- Allow group admins to update group details (name, description, avatar)

-- 1. Enable RLS on groups (should be already enabled)
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing update policies to avoid conflicts
DROP POLICY IF EXISTS "Admins can update groups" ON groups;
DROP POLICY IF EXISTS "Group admins can update group details" ON groups;

-- 3. Create policy to allow admins to update the group they belong to
CREATE POLICY "Admins can update groups"
ON groups
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM group_members gm 
    WHERE gm.group_id = groups.id 
    AND gm.user_id = auth.uid() 
    AND gm.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 
    FROM group_members gm 
    WHERE gm.group_id = groups.id 
    AND gm.user_id = auth.uid() 
    AND gm.role = 'admin'
  )
);
