-- ========================================
-- ADD PROFILES TABLE TO REALTIME
-- ========================================
-- এই SQL run করলে user profile updates (name/avatar) 
-- realtime এ sidebar এ update হবে

-- Safely remove first (ignore error if not present)
DO $$ 
BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.profiles;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Add profiles table to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- Verify it's added
SELECT tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
