import { SupabaseClient } from '@supabase/supabase-js';
import { Message, MessageStatus, MessageType, ServiceResult } from '@/types';

/**
 * Get messages for a conversation with pagination
 */
export async function getMessages(
  supabase: SupabaseClient,
  conversationId: string,
  offset: number = 0,
  limit: number = 50
): Promise<ServiceResult<Message[]>> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'User not authenticated',
        },
      };
    }

    // Query messages with sender profile
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
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
        updated_at,
        sender:profiles!messages_sender_id_fkey(
          id,
          email,
          full_name,
          avatar_url,
          created_at
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

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
      sender: Array.isArray(msg.sender) ? msg.sender[0] : msg.sender,
    }));

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
 */
export async function sendMessage(
  supabase: SupabaseClient,
  params: SendMessageParams
): Promise<ServiceResult<Message>> {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'User not authenticated',
        },
      };
    }

    // Validate message content
    if (!params.content || !params.content.trim()) {
      return {
        success: false,
        error: {
          type: 'VALIDATION_ERROR',
          message: 'Message content cannot be empty',
        },
      };
    }

    // Insert message
    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        conversation_id: params.conversation_id,
        sender_id: user.id,
        content: params.content.trim(),
        type: params.type || 'text',
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
 */
export async function updateMessageStatus(
  supabase: SupabaseClient,
  messageId: string,
  status: MessageStatus
): Promise<ServiceResult<void>> {
  try {
    const { error } = await supabase
      .from('messages')
      .update({ status })
      .eq('id', messageId);

    if (error) {
      return {
        success: false,
        error: {
          type: 'NETWORK_ERROR',
          message: error.message,
        },
      };
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
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
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
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
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
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return {
        success: false,
        error: {
          type: 'AUTH_ERROR',
          message: 'User not authenticated',
        },
      };
    }

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

