'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getCachedUser } from '@/lib/supabase/cached-auth';
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
  const supabase = useMemo(() => createClient(), []);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  
  // Use ref to always have the latest activeChatId in callbacks (avoid stale closure)
  const activeChatIdRef = useRef(activeChatId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // Main message subscription - only recreate when supabase/queryClient changes (not activeChatId)
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

          // Use ref to get the CURRENT activeChatId (not stale closure value)
          const currentActiveChatId = activeChatIdRef.current;
          
          // Check if this message is for the active conversation and window is visible
          const isActiveConversation = newMessage.conversation_id === currentActiveChatId;
          const isWindowVisible = document.visibilityState === 'visible';

          // Get current user (cached)
          const user = await getCachedUser(supabase);

          // ALWAYS add message to its conversation's cache (so it's there when user switches)
          queryClient.setQueryData<{ pages: Message[][]; pageParams: number[] }>(
            ['messages', newMessage.conversation_id],
            (old) => {
              if (!old) return old;

              // Check if message already exists by ID
              const messageExistsById = old.pages.some((page) =>
                page.some((msg) => msg.id === newMessage.id)
              );

              if (messageExistsById) {
                return old;
              }

              // Check if this is a temp message that needs ID update (same content + sender + close timestamp)
              // This handles the case where WebSocket broadcast arrived before DB event
              let foundTempMessage = false;
              const updatedPages = old.pages.map((page) =>
                page.map((msg) => {
                  // Match by content, sender, and temp ID prefix
                  if (
                    msg.id.startsWith('temp-') &&
                    msg.content === newMessage.content &&
                    msg.sender_id === newMessage.sender_id
                  ) {
                    foundTempMessage = true;
                    // Replace temp message with real one, but KEEP original timestamp!
                    return {
                      ...newMessage,
                      created_at: msg.created_at,
                      updated_at: msg.updated_at,
                    };
                  }
                  return msg;
                })
              );

              if (foundTempMessage) {
                return { ...old, pages: updatedPages };
              }

              // Add the new message to the first page (most recent messages)
              return {
                ...old,
                pages: [[newMessage, ...old.pages[0]], ...old.pages.slice(1)],
              };
            }
          );

          if (isActiveConversation) {
            // Handle read status based on visibility
            if (isWindowVisible && user && newMessage.sender_id !== user.id) {
              // Mark as read and keep unread count at 0
              await updateMessageStatus(supabase, newMessage.id, 'read');
              newMessage.status = 'read';

              // Keep unread count at 0 in local cache (don't let it increment)
              queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
                if (!old) return old;
                return old.map((conv) =>
                  conv.id === newMessage.conversation_id
                    ? { ...conv, unread_count: 0 }
                    : conv
                );
              });
            } else if (!isWindowVisible && user && newMessage.sender_id !== user.id) {
              // Window is hidden, mark as delivered
              await updateMessageStatus(supabase, newMessage.id, 'delivered');
              newMessage.status = 'delivered';

              // Don't manually increment here - let the database trigger handle it
              // The unread_counts realtime subscription will update the cache
            }
          } else {
            // For inactive conversations (different chat open), mark as delivered
            if (user && newMessage.sender_id !== user.id) {
              await updateMessageStatus(supabase, newMessage.id, 'delivered');
              newMessage.status = 'delivered';
            }

            // Don't manually increment unread count here!
            // The database trigger will update unread_counts table,
            // and our unread_counts realtime subscription will update the cache
          }

          // Update conversation's last message and move to top
          queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
            if (!old) return old;

            // Update the conversation with new last message info
            const updated = old.map((conv) => {
              if (conv.id !== newMessage.conversation_id) return conv;

              // If this is our own message and content matches (optimistic update already done),
              // keep the original timestamp to prevent time jump
              const isOwnOptimisticUpdate =
                user &&
                newMessage.sender_id === user.id &&
                conv.last_message_content === newMessage.content;

              return {
                ...conv,
                last_message_content: newMessage.content,
                // Keep original timestamp if optimistic update already happened
                last_message_time: isOwnOptimisticUpdate
                  ? conv.last_message_time
                  : newMessage.created_at,
                last_message_sender_id: newMessage.sender_id,
              };
            });

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
          const user = await getCachedUser(supabase);

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
          const user = await getCachedUser(supabase);
          const newRecord = payload.new as { user_id: string; conversation_id: string; count: number };

          if (user && newRecord && newRecord.user_id === user.id) {
            // Use ref to get the CURRENT activeChatId (not stale closure value)
            const currentActiveChatId = activeChatIdRef.current;
            
            // If this is the active conversation and window is visible, keep count at 0
            const isActiveAndVisible = 
              newRecord.conversation_id === currentActiveChatId && 
              document.visibilityState === 'visible';

            queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
              if (!old) return old;
              return old.map((conv) =>
                conv.id === newRecord.conversation_id
                  ? { ...conv, unread_count: isActiveAndVisible ? 0 : newRecord.count }
                  : conv
              );
            });

            // If active and visible, immediately reset in database too
            if (isActiveAndVisible && newRecord.count > 0) {
              await supabase
                .from('unread_counts')
                .update({ count: 0 })
                .eq('user_id', user.id)
                .eq('conversation_id', newRecord.conversation_id);
            }
          }
        }
      )
      .subscribe();

    // Cleanup main subscription on unmount
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient, supabase]); // Note: activeChatId removed - we use ref instead

  // Separate effect for chat channel WebSocket messages - recreate when activeChatId changes
  useEffect(() => {
    if (!activeChatId) return;

    // Listen for WebSocket broadcast messages (instant delivery - no POST request)
    const chatChannel = supabase
      .channel(`chat:${activeChatId}`)
      .on('broadcast', { event: 'new_message' }, async (payload) => {
        const { tempId, content, senderId, senderName, timestamp } = payload.payload;

        // Get current user (cached)
        const user = await getCachedUser(supabase);

        // Don't process own messages (sender already has it in cache)
        if (user && senderId === user.id) return;

        // Create message object for receiver
        const receivedMessage: Message = {
          id: tempId, // Will be replaced when DB event comes
          conversation_id: activeChatId,
          sender_id: senderId,
          content,
          type: 'text',
          media_url: null,
          media_width: null,
          media_height: null,
          status: 'delivered',
          is_edited: false,
          is_deleted: false,
          created_at: timestamp,
          updated_at: timestamp,
        };

        // Instantly add to cache (receiver sees message immediately!)
        queryClient.setQueryData<{ pages: Message[][]; pageParams: number[] }>(
          ['messages', activeChatId],
          (old) => {
            if (!old) return old;

            // Check if message already exists
            const messageExists = old.pages.some((page) =>
              page.some((msg) => msg.id === tempId || msg.content === content && msg.sender_id === senderId)
            );

            if (messageExists) return old;

            return {
              ...old,
              pages: [[receivedMessage, ...old.pages[0]], ...old.pages.slice(1)],
            };
          }
        );

        // Update conversation sidebar
        queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
          if (!old) return old;
          const updated = old.map((conv) =>
            conv.id === activeChatId
              ? {
                  ...conv,
                  last_message_content: content,
                  last_message_time: timestamp,
                  last_message_sender_id: senderId,
                }
              : conv
          );
          return updated.sort((a, b) => {
            const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
            const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
            return timeB - timeA;
          });
        });
      })
      .subscribe();

    // Cleanup chat channel when activeChatId changes
    return () => {
      supabase.removeChannel(chatChannel);
    };
  }, [activeChatId, supabase, queryClient]);

  // Track subscribed conversation IDs to avoid duplicate subscriptions
  const subscribedConvIdsRef = useRef<Set<string>>(new Set());
  const typingChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());

  // Subscribe to typing events for ALL conversations (so sidebar shows typing for any chat)
  useEffect(() => {
    // Subscribe to cache changes for conversations
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] !== 'conversations') return;

      const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
      if (!conversations || conversations.length === 0) return;

      // Find new conversations that need subscription
      conversations.forEach((conv) => {
        if (subscribedConvIdsRef.current.has(conv.id)) return;

        // Mark as subscribed
        subscribedConvIdsRef.current.add(conv.id);

        const typingChannel = supabase
          .channel(`typing:${conv.id}`)
          .on('broadcast', { event: 'typing' }, async (payload) => {
            const { userId, userName } = payload.payload;

            // Get current user to filter out own typing events (cached)
            const user = await getCachedUser(supabase);

            // Don't show typing indicator for own messages
            if (user && userId !== user.id) {
              setUserTyping(conv.id, userName);

              // Clear existing timeout for this conversation
              const existingTimeout = typingTimeoutRef.current.get(conv.id);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
              }

              // Hide typing indicator after 2 seconds (fallback if stopTyping event doesn't arrive)
              const timeout = setTimeout(() => {
                clearUserTyping(conv.id);
                typingTimeoutRef.current.delete(conv.id);
              }, 2000);

              typingTimeoutRef.current.set(conv.id, timeout);
            }
          })
          .on('broadcast', { event: 'stopTyping' }, async (payload) => {
            const { userId } = payload.payload;

            // Get current user to filter out own events (cached)
            const user = await getCachedUser(supabase);

            // Immediately hide typing indicator when stop event received
            if (user && userId !== user.id) {
              // Clear any pending timeout
              const existingTimeout = typingTimeoutRef.current.get(conv.id);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
                typingTimeoutRef.current.delete(conv.id);
              }

              clearUserTyping(conv.id);
            }
          })
          .subscribe();

        typingChannelsRef.current.set(conv.id, typingChannel);
      });
    });

    // Initial subscription for existing conversations
    const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
    if (conversations && conversations.length > 0) {
      conversations.forEach((conv) => {
        if (subscribedConvIdsRef.current.has(conv.id)) return;

        subscribedConvIdsRef.current.add(conv.id);

        const typingChannel = supabase
          .channel(`typing:${conv.id}`)
          .on('broadcast', { event: 'typing' }, async (payload) => {
            const { userId, userName } = payload.payload;
            const user = await getCachedUser(supabase);

            if (user && userId !== user.id) {
              setUserTyping(conv.id, userName);

              const existingTimeout = typingTimeoutRef.current.get(conv.id);
              if (existingTimeout) clearTimeout(existingTimeout);

              const timeout = setTimeout(() => {
                clearUserTyping(conv.id);
                typingTimeoutRef.current.delete(conv.id);
              }, 2000);

              typingTimeoutRef.current.set(conv.id, timeout);
            }
          })
          .on('broadcast', { event: 'stopTyping' }, async (payload) => {
            const { userId } = payload.payload;
            const user = await getCachedUser(supabase);

            if (user && userId !== user.id) {
              const existingTimeout = typingTimeoutRef.current.get(conv.id);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
                typingTimeoutRef.current.delete(conv.id);
              }
              clearUserTyping(conv.id);
            }
          })
          .subscribe();

        typingChannelsRef.current.set(conv.id, typingChannel);
      });
    }

    // Cleanup
    return () => {
      unsubscribe();
      typingChannelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      typingChannelsRef.current.clear();
      subscribedConvIdsRef.current.clear();
      typingTimeoutRef.current.forEach((timeout) => clearTimeout(timeout));
      typingTimeoutRef.current.clear();
    };
  }, [queryClient, supabase, setUserTyping, clearUserTyping]);
}
