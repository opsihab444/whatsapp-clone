-- Fix: Update last_message_content to show '📷 Photo' for image messages
-- This fixes the bug where image messages show "No messages yet" in conversation list

-- Update conversation last message trigger to handle image messages
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET 
    last_message_content = CASE 
      WHEN NEW.type = 'image' THEN '📷 Photo'
      ELSE NEW.content
    END,
    last_message_time = NEW.created_at,
    last_message_sender_id = NEW.sender_id
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update group last message trigger to handle image messages
CREATE OR REPLACE FUNCTION public.update_group_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.groups
  SET 
    last_message_content = CASE 
      WHEN NEW.type = 'image' THEN '📷 Photo'
      ELSE NEW.content
    END,
    last_message_time = NEW.created_at,
    last_message_sender_id = NEW.sender_id,
    last_message_sender_name = (SELECT full_name FROM public.profiles WHERE id = NEW.sender_id),
    updated_at = NOW()
  WHERE id = NEW.group_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional: Fix existing conversations that have null last_message_content but have image messages
UPDATE public.conversations c
SET last_message_content = '📷 Photo'
FROM (
  SELECT DISTINCT ON (conversation_id) 
    conversation_id, 
    type,
    created_at
  FROM public.messages
  ORDER BY conversation_id, created_at DESC
) m
WHERE c.id = m.conversation_id 
  AND m.type = 'image' 
  AND c.last_message_content IS NULL;

-- Fix existing groups that have null last_message_content but have image messages
UPDATE public.groups g
SET last_message_content = '📷 Photo'
FROM (
  SELECT DISTINCT ON (group_id) 
    group_id, 
    type,
    created_at
  FROM public.group_messages
  ORDER BY group_id, created_at DESC
) m
WHERE g.id = m.group_id 
  AND m.type = 'image' 
  AND g.last_message_content IS NULL;
