import { SupabaseClient } from '@supabase/supabase-js';
import { Message, MessageStatus, MessageType, ServiceResult } from '@/types';
import { getCachedUser } from '@/lib/supabase/cached-auth';

/**
 * Get messages for a conversation with pagination
 * Filters out messages sent before user deleted the conversation
 */
export async function getMessages(
  supabase: SupabaseClient,
  conversationId: string,
  offset: number = 0,
  limit: number = 50
): Promise<ServiceResult<Message[]>> {
  try {
    // Get current user to check for deleted conversation
    const user = await getCachedUser(supabase);
    
    // Check if user has deleted this conversation
    let deletedAt: Date | null = null;
    if (user) {
      const { data: deletedConv } = await supabase
        .from('deleted_conversations')
        .select('deleted_at')
        .eq('user_id', user.id)
        .eq('conversation_id', conversationId)
        .single();
      
      if (deletedConv) {
        deletedAt = new Date(deletedConv.deleted_at);
      }
    }

    // Query messages with sender profile
    // RLS policy ensures only conversation participants can read messages
    let query = supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey(
          id,
          email,
          full_name,
          avatar_url,
          created_at
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false });

    // If user deleted conversation, only show messages after deletion
    if (deletedAt) {
      query = query.gt('created_at', deletedAt.toISOString());
    }

    const { data: messages, error: messagesError } = await query.range(offset, offset + limit - 1);

    if (messagesError) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: messagesError.message,
        },
      };
    }

    // Transform the data to match our Message type
    const transformedMessages: Message[] = (messages || []).map((msg: any) => ({
      id: msg.id,
      conversation_id: msg.conversation_id,
      sender_id: msg.sender_id,
      content: msg.content,
      type: msg.type,
      media_url: msg.media_url,
      media_width: msg.media_width,
      media_height: msg.media_height,
      status: msg.status,
      is_edited: msg.is_edited,
      is_deleted: msg.is_deleted,
      created_at: msg.created_at,
      updated_at: msg.updated_at,
      reply_to_id: msg.reply_to_id || null,
      reply_to: null, // Will be populated after migration
      sender: Array.isArray(msg.sender) ? msg.sender[0] : msg.sender,
    }));

    // If any messages have reply_to_id, fetch the replied messages
    const replyIds = transformedMessages
      .filter(m => m.reply_to_id)
      .map(m => m.reply_to_id as string);

    if (replyIds.length > 0) {
      const { data: repliedMessages } = await supabase
        .from('messages')
        .select(`
          id,
          content,
          sender_id,
          type,
          media_url,
          sender:profiles!messages_sender_id_fkey(
            id,
            full_name,
            avatar_url
          )
        `)
        .in('id', replyIds);

      if (repliedMessages) {
        const replyMap = new Map(repliedMessages.map((r: any) => [r.id, {
          id: r.id,
          content: r.content,
          sender_id: r.sender_id,
          type: r.type,
          media_url: r.media_url,
          sender: Array.isArray(r.sender) ? r.sender[0] : r.sender,
        }]));

        transformedMessages.forEach(msg => {
          if (msg.reply_to_id && replyMap.has(msg.reply_to_id)) {
            msg.reply_to = replyMap.get(msg.reply_to_id) || null;
          }
        });
      }
    }

    return { success: true, data: transformedMessages };
  } catch (error) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}

interface SendMessageParams {
  conversation_id: string;
  content: string;
  type?: MessageType;
}

/**
 * Send a new message
 * SERVER-SIDE VALIDATION: Cannot be bypassed by client manipulation
 */
export async function sendMessage(
  supabase: SupabaseClient,
  params: SendMessageParams
): Promise<ServiceResult<Message>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'User not authenticated',
        },
      };
    }

    // SERVER-SIDE VALIDATION - Cannot be bypassed
    // 1. Check if content exists
    if (!params.content) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Message content is required',
        },
      };
    }

    // 2. Trim and validate trimmed content
    const trimmedContent = params.content.trim();
    if (!trimmedContent || trimmedContent.length === 0) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Message content cannot be empty or whitespace only',
        },
      };
    }

    // 3. Check minimum length (at least 1 character)
    if (trimmedContent.length < 1) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Message must contain at least 1 character',
        },
      };
    }

    // 4. Check maximum length to prevent abuse
    if (trimmedContent.length > 4000) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Message exceeds maximum length of 4000 characters',
        },
      };
    }

    // 5. Validate conversation exists and user is a participant
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, participant_1_id, participant_2_id')
      .eq('id', params.conversation_id)
      .single();

    if (convError || !conversation) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Conversation not found',
        },
      };
    }

    // 6. Verify user is a participant in this conversation
    const isParticipant =
      conversation.participant_1_id === user.id ||
      conversation.participant_2_id === user.id;

    if (!isParticipant) {
      return {
        success: false,
        error: {
          type: 'PERMISSION_DENIED',
          message: 'You are not authorized to send messages in this conversation',
        },
      };
    }

    // 7. Validate message type
    const validTypes: MessageType[] = ['text', 'image', 'video', 'audio', 'file'];
    const messageType = params.type || 'text';
    if (!validTypes.includes(messageType)) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Invalid message type',
        },
      };
    }

    // Insert message (using trimmed content)
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversation_id,
        sender_id: user.id,
        content: trimmedContent, // Use trimmed content
        type: messageType,
        status: 'sent',
      })
      .select(`
        id,
        conversation_id,
        sender_id,
        content,
        type,
        media_url,
        media_width,
        media_height,
        status,
        is_edited,
        is_deleted,
        created_at,
        updated_at
      `)
      .single();

    if (insertError || !message) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: insertError?.message || 'Failed to send message',
        },
      };
    }

    // Update conversation's last message
    await supabase
      .from('conversations')
      .update({
        last_message_content: message.content,
        last_message_time: message.created_at,
        last_message_sender_id: message.sender_id,
      })
      .eq('id', params.conversation_id);

    return { success: true, data: message as Message };
  } catch (error) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}

/**
 * Update message status (delivered/read)
 * Also broadcasts to sender for instant UI update when status is 'read'
 */
export async function updateMessageStatus(
  supabase: SupabaseClient,
  messageId: string,
  status: MessageStatus,
  conversationId?: string // Optional: pass for broadcast
): Promise<ServiceResult<void>> {
  try {
    const { error, data: updatedMessage } = await supabase
      .from('messages')
      .update({ status })
      .eq('id', messageId)
      .select('id, conversation_id, sender_id')
      .single();

    if (error) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: error.message,
        },
      };
    }

    // Broadcast read status to sender for instant UI update
    if (status === 'read' && updatedMessage) {
      const user = await getCachedUser(supabase);
      if (user && updatedMessage.sender_id !== user.id) {
        const convId = conversationId || updatedMessage.conversation_id;
        
        // Get reader's profile for the seen avatar
        const { data: readerProfile } = await supabase
          .from('profiles')
          .select('id, full_name, avatar_url, email')
          .eq('id', user.id)
          .single();

        // Broadcast to the typing channel
        await supabase.channel(`typing:${convId}`).send({
          type: 'broadcast',
          event: 'messages_read',
          payload: {
            conversationId: convId,
            messageIds: [messageId],
            readerId: user.id,
            readerName: readerProfile?.full_name || readerProfile?.email?.split('@')[0] || null,
            readerAvatarUrl: readerProfile?.avatar_url || null,
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}

/**
 * Edit a message
 */
export async function editMessage(
  supabase: SupabaseClient,
  messageId: string,
  newContent: string
): Promise<ServiceResult<Message>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'User not authenticated',
        },
      };
    }

    // Validate content
    if (!newContent || !newContent.trim()) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Message content cannot be empty',
        },
      };
    }

    // Update message
    const { data: message, error: updateError } = await supabase
      .from('messages')
      .update({
        content: newContent.trim(),
        is_edited: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('sender_id', user.id) // Ensure user owns the message
      .select()
      .single();

    if (updateError || !message) {
      return {
        success: false,
        error: {
          type: updateError?.code === 'PGRST116' ? 'PERMISSION_DENIED' : 'NETWORK_ERROR',
          message: updateError?.message || 'Failed to edit message',
        },
      };
    }

    return { success: true, data: message as Message };
  } catch (error) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}

/**
 * Delete a message (soft delete)
 */
export async function deleteMessage(
  supabase: SupabaseClient,
  messageId: string
): Promise<ServiceResult<Message>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'User not authenticated',
        },
      };
    }

    // Soft delete message
    const { data: message, error: updateError } = await supabase
      .from('messages')
      .update({
        content: 'This message was deleted',
        is_deleted: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', messageId)
      .eq('sender_id', user.id) // Ensure user owns the message
      .select()
      .single();

    if (updateError || !message) {
      return {
        success: false,
        error: {
          type: updateError?.code === 'PGRST116' ? 'PERMISSION_DENIED' : 'NETWORK_ERROR',
          message: updateError?.message || 'Failed to delete message',
        },
      };
    }

    return { success: true, data: message as Message };
  } catch (error) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}

/**
 * Mark all messages in a conversation as read
 */
export async function markConversationAsRead(
  supabase: SupabaseClient,
  conversationId: string
): Promise<ServiceResult<void>> {
  try {
    const user = await getCachedUser(supabase);

    if (!user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'User not authenticated',
        },
      };
    }

    // First, get the messages that will be marked as read (to know which ones to broadcast)
    const { data: messagesToUpdate } = await supabase
      .from('messages')
      .select('id, sender_id')
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .in('status', ['sent', 'delivered']);

    // Update all unread messages in the conversation to 'read' status
    // Only update messages that are not sent by the current user
    const { error: updateError } = await supabase
      .from('messages')
      .update({
        status: 'read'
      })
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .in('status', ['sent', 'delivered']);

    if (updateError) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: updateError.message,
        },
      };
    }

    // Reset unread count to 0
    const { error: unreadError } = await supabase
      .from('unread_counts')
      .update({ count: 0 })
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId);

    if (unreadError) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: unreadError.message,
        },
      };
    }

    // Broadcast read status update via WebSocket for instant delivery to sender
    // This ensures the sender sees the "seen" avatar immediately
    if (messagesToUpdate && messagesToUpdate.length > 0) {
      const messageIds = messagesToUpdate.map(m => m.id);
      const senderId = messagesToUpdate[0].sender_id; // All messages are from the same sender
      
      // Get reader's profile for the seen avatar
      const { data: readerProfile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, email')
        .eq('id', user.id)
        .single();

      // Broadcast to the typing channel (which all users subscribe to for all conversations)
      await supabase.channel(`typing:${conversationId}`).send({
        type: 'broadcast',
        event: 'messages_read',
        payload: {
          conversationId,
          messageIds,
          readerId: user.id,
          readerName: readerProfile?.full_name || readerProfile?.email?.split('@')[0] || null,
          readerAvatarUrl: readerProfile?.avatar_url || null,
          timestamp: new Date().toISOString(),
        },
      });
    }

    return { success: true, data: undefined };
  } catch (error) {
    return {
      success: false,
      error: {
        type: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}

