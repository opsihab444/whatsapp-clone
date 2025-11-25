-- Function to increment unread count for the recipient
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

-- Trigger to execute the function on new message
DROP TRIGGER IF EXISTS on_message_created_unread_count ON public.messages;
CREATE TRIGGER on_message_created_unread_count
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_message_unread_count();
