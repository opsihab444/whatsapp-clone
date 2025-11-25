'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useUIStore } from '@/store/ui.store';
import { Message, Conversation } from '@/types';
import { updateMessageStatus } from '@/services/message.service';

/**
 * Global realtime subscription hook
 * Handles real-time message events and updates the React Query cache accordingly
 * 
 * Responsibilities:
 * - Subscribe to INSERT events on messages table
 * - Append messages to active chat
 * - Update sidebar for inactive conversations
 * - Handle message status updates (delivered/read)
 * - Move conversations to top on new messages
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setUserTyping = useUIStore((state) => state.setUserTyping);
  const clearUserTyping = useUIStore((state) => state.clearUserTyping);
  const supabase = createClient();
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    // Subscribe to message INSERT events
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          // Check if this message is for the active conversation and window is visible
          const isActiveConversation = newMessage.conversation_id === activeChatId;
          const isWindowVisible = document.visibilityState === 'visible';

          // Get current user
          const { data: { user } } = await supabase.auth.getUser();

          if (isActiveConversation) {
            // ALWAYS append message to active chat cache, regardless of visibility
            queryClient.setQueryData<{ pages: Message[][]; pageParams: number[] }>(
              ['messages', activeChatId],
              (old) => {
                if (!old) return old;

                // Check if message already exists (to prevent duplicates from optimistic updates)
                const messageExists = old.pages.some((page) =>
                  page.some((msg) => msg.id === newMessage.id)
                );

                if (messageExists) {
                  // Message already exists, just return old data
                  return old;
                }

                // Add the new message to the first page (most recent messages)
                return {
                  ...old,
                  pages: [[newMessage, ...old.pages[0]], ...old.pages.slice(1)],
                };
              }
            );

            // Handle read status based on visibility
            if (isWindowVisible) {
              // Only mark as read if the message is from another user
              if (user && newMessage.sender_id !== user.id) {
                await updateMessageStatus(supabase, newMessage.id, 'read');
                newMessage.status = 'read';
              }
            } else {
              // Window is hidden, mark as delivered and increment unread count
              if (user && newMessage.sender_id !== user.id) {
                await updateMessageStatus(supabase, newMessage.id, 'delivered');
                newMessage.status = 'delivered';
              }

              // Increment unread count for the active conversation since user isn't looking
              queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
                if (!old) return old;

                return old.map((conv) =>
                  conv.id === newMessage.conversation_id
                    ? { ...conv, unread_count: conv.unread_count + 1 }
                    : conv
                );
              });
            }
          } else {
            // For inactive conversations (different chat open), mark as delivered
            if (user && newMessage.sender_id !== user.id) {
              await updateMessageStatus(supabase, newMessage.id, 'delivered');
              newMessage.status = 'delivered';
            }

            // Increment unread count
            queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
              if (!old) return old;

              return old.map((conv) =>
                conv.id === newMessage.conversation_id
                  ? { ...conv, unread_count: conv.unread_count + 1 }
                  : conv
              );
            });
          }

          // Update conversation's last message and move to top
          queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
            if (!old) return old;

            // Update the conversation with new last message info
            const updated = old.map((conv) =>
              conv.id === newMessage.conversation_id
                ? {
                  ...conv,
                  last_message_content: newMessage.content,
                  last_message_time: newMessage.created_at,
                }
                : conv
            );

            // Sort by last_message_time DESC (most recent first)
            return updated.sort((a, b) => {
              const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
              const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
              return timeB - timeA;
            });
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updatedMessage = payload.new as Message;

          // Update message in cache for this conversation (works for both sender and receiver)
          queryClient.setQueryData<{ pages: Message[][]; pageParams: number[] }>(
            ['messages', updatedMessage.conversation_id],
            (old) => {
              if (!old) return old;

              return {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((msg) =>
                    msg.id === updatedMessage.id ? { ...msg, ...updatedMessage } : msg
                  )
                ),
              };
            }
          );

          // Also update conversation's last message if this was the most recent message
          queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
            if (!old) return old;

            return old.map((conv) => {
              // Check if this message is the last message in this conversation
              if (conv.id === updatedMessage.conversation_id &&
                conv.last_message_content === updatedMessage.content) {
                return {
                  ...conv,
                  last_message_time: updatedMessage.updated_at,
                };
              }
              return conv;
            });
          });
        }
      )
      // Listen for NEW conversations (when a new user messages you)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
        },
        async (payload) => {
          const newConversation = payload.new as Conversation;
          const { data: { user } } = await supabase.auth.getUser();

          if (user && (newConversation.participant_1_id === user.id || newConversation.participant_2_id === user.id)) {
            // Invalidate conversations query to fetch the new conversation with full profile data
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
          }
        }
      )
      // Listen for unread count updates (from DB triggers or other clients)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'unread_counts',
        },
        async (payload) => {
          const { data: { user } } = await supabase.auth.getUser();
          const newRecord = payload.new as { user_id: string; conversation_id: string; count: number };

          if (user && newRecord && newRecord.user_id === user.id) {
            queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
              if (!old) return old;
              return old.map((conv) =>
                conv.id === newRecord.conversation_id
                  ? { ...conv, unread_count: newRecord.count }
                  : conv
              );
            });
          }
        }
      )
      .subscribe();

    // Subscribe to typing events for active conversation
    let typingChannel: any = null;

    if (activeChatId) {
      typingChannel = supabase
        .channel(`typing:${activeChatId}`)
        .on('broadcast', { event: 'typing' }, async (payload) => {
          const { userId, userName } = payload.payload;

          // Get current user to filter out own typing events
          const { data: { user } } = await supabase.auth.getUser();

          // Don't show typing indicator for own messages
          if (user && userId !== user.id) {
            setUserTyping(activeChatId, userName);

            // Clear existing timeout for this conversation
            const existingTimeout = typingTimeoutRef.current.get(activeChatId);
            if (existingTimeout) {
              clearTimeout(existingTimeout);
            }

            // Hide typing indicator after 3 seconds
            const timeout = setTimeout(() => {
              clearUserTyping(activeChatId);
              typingTimeoutRef.current.delete(activeChatId);
            }, 3000);

            typingTimeoutRef.current.set(activeChatId, timeout);
          }
        })
        .subscribe();
    }

    // Cleanup subscriptions on unmount
    return () => {
      supabase.removeChannel(channel);
      if (typingChannel) {
        supabase.removeChannel(typingChannel);
      }

      // Clear all typing timeouts
      typingTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutRef.current.clear();
    };
  }, [activeChatId, queryClient, supabase, setUserTyping, clearUserTyping]);
}
