'use client';

import { useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getCachedUser } from '@/lib/supabase/cached-auth';
import { useUIStore } from '@/store/ui.store';
import { Message, Conversation, GroupMessage, GroupConversation } from '@/types';
import { updateMessageStatus } from '@/services/message.service';

/**
 * Global realtime subscription hook
 * Handles real-time message events and updates the React Query cache accordingly
 * 
 * DUAL DELIVERY SYSTEM:
 * 1. WebSocket Broadcast - Instant delivery (primary, fastest)
 * 2. Postgres Realtime - Database change events (backup, 100% reliable)
 * 
 * This ensures messages are delivered even if one method fails.
 * 
 * IMPORTANT: For Postgres Realtime to work, ensure these tables have
 * replication enabled in Supabase Dashboard:
 * - messages
 * - group_messages
 * - conversations
 * - groups
 * - unread_counts
 * - group_unread_counts
 * 
 * Responsibilities:
 * - Subscribe to INSERT events on messages table (one-to-one)
 * - Subscribe to INSERT events on group_messages table (group chat)
 * - Append messages to active chat
 * - Update sidebar for inactive conversations
 * - Handle message status updates (delivered/read)
 * - Move conversations to top on new messages
 * - Handle group message realtime updates
 */
export function useRealtime() {
  const queryClient = useQueryClient();
  const activeChatId = useUIStore((state) => state.activeChatId);
  const activeGroupId = useUIStore((state) => state.activeGroupId);
  const setUserTyping = useUIStore((state) => state.setUserTyping);
  const clearUserTyping = useUIStore((state) => state.clearUserTyping);
  const setUserTypingWithAvatar = useUIStore((state) => state.setUserTypingWithAvatar);
  const clearUserTypingById = useUIStore((state) => state.clearUserTypingById);
  const supabase = useMemo(() => createClient(), []);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const lastVisibilityChangeRef = useRef<number>(Date.now());

  // Use ref to always have the latest activeChatId/activeGroupId in callbacks (avoid stale closure)
  const activeChatIdRef = useRef(activeChatId);
  const activeGroupIdRef = useRef(activeGroupId);
  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);
  useEffect(() => {
    activeGroupIdRef.current = activeGroupId;
  }, [activeGroupId]);

  // Refetch messages when tab becomes visible (catch any missed realtime events)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const timeSinceLastChange = Date.now() - lastVisibilityChangeRef.current;
        
        // Only refetch if tab was hidden for more than 30 seconds
        // This catches any messages that might have been missed during background
        if (timeSinceLastChange > 30000) {
          console.log('[Realtime] Tab became visible after', Math.round(timeSinceLastChange / 1000), 'seconds, checking for missed messages');
          
          // Invalidate active conversation/group messages to fetch any missed ones
          if (activeChatIdRef.current) {
            queryClient.invalidateQueries({ 
              queryKey: ['messages', activeChatIdRef.current],
              refetchType: 'active'
            });
          }
          if (activeGroupIdRef.current) {
            queryClient.invalidateQueries({ 
              queryKey: ['group-messages', activeGroupIdRef.current],
              refetchType: 'active'
            });
          }
          
          // Also refresh conversations list
          queryClient.invalidateQueries({ 
            queryKey: ['conversations'],
            refetchType: 'active'
          });
          queryClient.invalidateQueries({ 
            queryKey: ['groups'],
            refetchType: 'active'
          });
        }
      }
      lastVisibilityChangeRef.current = Date.now();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [queryClient]);

  // Main message subscription - only recreate when supabase/queryClient changes (not activeChatId)
  useEffect(() => {
    let isSubscribed = false;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    // Subscribe to message INSERT events
    const channel = supabase
      .channel('messages', {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as Message;
          console.log('[Realtime] Message INSERT received:', newMessage.id?.substring(0, 8));

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

              // Check if message already exists by ID only
              // Don't check by content - user may send same message multiple times intentionally
              const messageExistsById = old.pages.some((page) =>
                page.some((msg) => msg.id === newMessage.id)
              );

              if (messageExistsById) {
                return old;
              }

              // Check if this is a temp message that needs ID update
              // Match by content + sender + close timestamp (within 5 seconds)
              // Only replace the FIRST matching temp message to handle multiple same-content messages
              let foundTempMessage = false;
              const newMessageTime = new Date(newMessage.created_at).getTime();
              
              const updatedPages = old.pages.map((page) =>
                page.map((msg) => {
                  // Only replace one temp message per real message
                  if (foundTempMessage) return msg;
                  
                  // Match by content, sender, temp ID prefix, and close timestamp
                  if (
                    msg.id.startsWith('temp-') &&
                    msg.content === newMessage.content &&
                    msg.sender_id === newMessage.sender_id
                  ) {
                    const tempMsgTime = new Date(msg.created_at).getTime();
                    // Only match if timestamps are within 5 seconds
                    if (Math.abs(tempMsgTime - newMessageTime) < 5000) {
                      foundTempMessage = true;
                      // Replace temp message with real one, but KEEP original timestamp!
                      return {
                        ...newMessage,
                        created_at: msg.created_at,
                        updated_at: msg.updated_at,
                      };
                    }
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

            // Determine display content for sidebar (handle image messages)
            const displayContent = newMessage.type === 'image' ? '📷 Photo' : newMessage.content;

            // Update the conversation with new last message info
            const updated = old.map((conv) => {
              if (conv.id !== newMessage.conversation_id) return conv;

              // If this is our own message and content matches (optimistic update already done),
              // keep the original timestamp to prevent time jump
              const isOwnOptimisticUpdate =
                user &&
                newMessage.sender_id === user.id &&
                conv.last_message_content === displayContent;

              return {
                ...conv,
                last_message_content: displayContent,
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
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          isSubscribed = true;
          reconnectAttempts = 0;
          console.log('[Realtime] Messages channel subscribed successfully');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] Messages channel error:', status, err);
          isSubscribed = false;
          
          // Attempt reconnection with exponential backoff
          if (reconnectAttempts < maxReconnectAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            reconnectAttempts++;
            console.log(`[Realtime] Attempting reconnection in ${delay}ms (attempt ${reconnectAttempts})`);
            setTimeout(() => {
              if (!isSubscribed) {
                supabase.removeChannel(channel);
                // The effect will re-run and create a new subscription
              }
            }, delay);
          }
        } else if (status === 'CLOSED') {
          console.log('[Realtime] Messages channel closed');
          isSubscribed = false;
        }
      });

    // Cleanup main subscription on unmount
    return () => {
      isSubscribed = false;
      supabase.removeChannel(channel);
    };
  }, [queryClient, supabase]); // Note: activeChatId removed - we use ref instead

  // ========================================
  // GROUP MESSAGES REALTIME SUBSCRIPTION
  // ========================================
  useEffect(() => {
    let isGroupSubscribed = false;
    
    const groupChannel = supabase
      .channel('group_messages', {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
        },
        async (payload) => {
          const newMessage = payload.new as GroupMessage;
          console.log('[Realtime] Group message INSERT received:', newMessage.id?.substring(0, 8));

          // Use ref to get the CURRENT activeGroupId (not stale closure value)
          const currentActiveGroupId = activeGroupIdRef.current;

          // Check if this message is for the active group
          const isActiveGroup = newMessage.group_id === currentActiveGroupId;
          const isWindowVisible = document.visibilityState === 'visible';

          // Get current user (cached)
          const user = await getCachedUser(supabase);

          // Postgres realtime doesn't include joined data (sender profile)
          // Always fetch sender info to ensure we have full_name for sidebar
          let senderInfo = newMessage.sender;
          
          // First, check if there's a temp message with sender info (for own messages)
          const existingData = queryClient.getQueryData<{ pages: GroupMessage[][] }>(['group-messages', newMessage.group_id]);
          const tempMsg = existingData?.pages?.flat()?.find(
            (msg) => msg.id.startsWith('temp-') && 
                     msg.content === newMessage.content && 
                     msg.sender_id === newMessage.sender_id
          );
          
          if (tempMsg?.sender?.full_name) {
            senderInfo = tempMsg.sender;
          } else {
            // Also check group_messages query key
            const existingData2 = queryClient.getQueryData<{ pages: GroupMessage[][] }>(['group_messages', newMessage.group_id]);
            const tempMsg2 = existingData2?.pages?.flat()?.find(
              (msg) => msg.id.startsWith('temp-') && 
                       msg.content === newMessage.content && 
                       msg.sender_id === newMessage.sender_id
            );
            
            if (tempMsg2?.sender?.full_name) {
              senderInfo = tempMsg2.sender;
            } else if (!senderInfo?.full_name) {
              // Fetch sender profile from database to get full_name
              const { data: profile } = await supabase
                .from('profiles')
                .select('id, email, full_name, avatar_url, created_at')
                .eq('id', newMessage.sender_id)
                .single();
              
              if (profile) {
                senderInfo = profile;
              }
            }
          }

          // Create message with sender info
          const messageWithSender: GroupMessage = {
            ...newMessage,
            sender: senderInfo,
          };

          // Check if this is our own message (already added via optimistic update)
          const isOwnMessage = user && newMessage.sender_id === user.id;

          // Update the 'group-messages' query cache
          queryClient.setQueryData<{ pages: GroupMessage[][]; pageParams: number[] }>(
            ['group-messages', newMessage.group_id],
            (old) => {
              if (!old) return old;

              // Check if message already exists by ID only
              const messageExistsById = old.pages.some((page) =>
                page.some((msg) => msg.id === newMessage.id)
              );

              if (messageExistsById) {
                return old;
              }

              // Check if this is a temp message that needs ID update
              let foundTempMessage2 = false;
              const newMsgTime = new Date(newMessage.created_at).getTime();
              const updatedPages = old.pages.map((page) =>
                page.map((msg) => {
                  if (foundTempMessage2) return msg;
                  
                  if (
                    msg.id.startsWith('temp-') &&
                    msg.content === newMessage.content &&
                    msg.sender_id === newMessage.sender_id
                  ) {
                    const tempMsgTime = new Date(msg.created_at).getTime();
                    if (Math.abs(tempMsgTime - newMsgTime) < 5000) {
                      foundTempMessage2 = true;
                      return {
                        ...messageWithSender,
                        sender: msg.sender || senderInfo,
                        created_at: msg.created_at,
                        updated_at: msg.updated_at,
                      };
                    }
                  }
                  return msg;
                })
              );

              if (foundTempMessage2) {
                return { ...old, pages: updatedPages };
              }

              // If this is our own message and no temp message found, skip adding
              if (isOwnMessage) {
                return old;
              }

              // Add the new message to the first page (most recent messages)
              return {
                ...old,
                pages: [[messageWithSender, ...old.pages[0]], ...old.pages.slice(1)],
              };
            }
          );

          // Update group's last message and move to top
          // GroupConversation has last_message_content, last_message_time at TOP level
          const senderName = senderInfo?.full_name || senderInfo?.email?.split('@')[0] || null;
          
          // Determine display content for sidebar (handle image messages)
          const groupDisplayContent = newMessage.type === 'image' ? '📷 Photo' : newMessage.content;
          
          queryClient.setQueryData<GroupConversation[]>(['groups'], (old) => {
            if (!old) return old;

            // Update the group with new last message info
            const updated = old.map((groupConv) => {
              if (groupConv.group.id !== newMessage.group_id && groupConv.id !== newMessage.group_id) return groupConv;

              // If this is our own message and content matches (optimistic update already done),
              // keep the original timestamp to prevent time jump
              const isOwnOptimisticUpdate =
                user &&
                newMessage.sender_id === user.id &&
                groupConv.last_message_content === groupDisplayContent;

              // Keep existing sender name if new one is null (fallback)
              const finalSenderName = senderName || (
                newMessage.sender_id === groupConv.last_message_sender_id 
                  ? groupConv.last_message_sender_name 
                  : null
              );

              return {
                ...groupConv,
                last_message_content: groupDisplayContent,
                last_message_time: isOwnOptimisticUpdate
                  ? groupConv.last_message_time
                  : newMessage.created_at,
                last_message_sender_id: newMessage.sender_id,
                last_message_sender_name: finalSenderName,
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
          table: 'group_messages',
        },
        (payload) => {
          const updatedMessage = payload.new as GroupMessage;

          // Update message in cache for this group
          queryClient.setQueryData<{ pages: GroupMessage[][]; pageParams: number[] }>(
            ['group-messages', updatedMessage.group_id],
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

          // Also update group's last message if this was the most recent message
          queryClient.setQueryData<GroupConversation[]>(['groups'], (old) => {
            if (!old) return old;

            return old.map((groupConv) => {
              // Check if this message is the last message in this group
              if ((groupConv.group.id === updatedMessage.group_id || groupConv.id === updatedMessage.group_id) &&
                groupConv.last_message_content === updatedMessage.content) {
                return {
                  ...groupConv,
                  last_message_time: updatedMessage.updated_at,
                };
              }
              return groupConv;
            });
          });
        }
      )
      // Listen for NEW groups (when someone adds you to a group)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'groups',
        },
        async (payload) => {
          const newGroup = payload.new;
          const user = await getCachedUser(supabase);

          if (user) {
            // Invalidate groups query to fetch the new group with full data
            queryClient.invalidateQueries({ queryKey: ['groups'] });
          }
        }
      )
      // Listen for group member additions (when you are added to a group)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'group_members',
        },
        async (payload) => {
          const newMember = payload.new as { group_id: string; user_id: string; role: string };
          const user = await getCachedUser(supabase);
          
          console.log('[Realtime] Group member INSERT received:', newMember);

          if (user) {
            // If current user was added to a group, refresh groups list
            if (newMember.user_id === user.id) {
              console.log('[Realtime] Current user added to group, refreshing groups list');
              queryClient.invalidateQueries({ queryKey: ['groups'] });
            }
            
            // Also refresh group members if viewing this group
            const currentActiveGroupId = activeGroupIdRef.current;
            if (currentActiveGroupId === newMember.group_id) {
              console.log('[Realtime] Member added to active group, refreshing members');
              queryClient.invalidateQueries({ queryKey: ['group-members', newMember.group_id] });
            }
          }
        }
      )
      // Listen for group member removals (when you are kicked from a group)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'group_members',
        },
        async (payload) => {
          const removedMember = payload.old as { group_id: string; user_id: string };
          const user = await getCachedUser(supabase);
          
          console.log('[Realtime] Group member DELETE received:', removedMember);

          if (user && removedMember) {
            // If current user was removed from a group, remove it from sidebar
            if (removedMember.user_id === user.id) {
              console.log('[Realtime] Current user removed from group, updating sidebar');
              
              // Remove group from local cache immediately
              queryClient.setQueryData<GroupConversation[]>(['groups'], (old) => {
                if (!old) return old;
                return old.filter((groupConv) => groupConv.group.id !== removedMember.group_id);
              });
              
              // Also clear active group if it was the removed group
              const currentActiveGroupId = activeGroupIdRef.current;
              if (currentActiveGroupId === removedMember.group_id) {
                // User will be redirected by the UI when they try to access the group
                queryClient.removeQueries({ queryKey: ['group-messages', removedMember.group_id] });
                queryClient.removeQueries({ queryKey: ['group-members', removedMember.group_id] });
              }
            } else {
              // Someone else was removed, refresh members list if viewing this group
              const currentActiveGroupId = activeGroupIdRef.current;
              if (currentActiveGroupId === removedMember.group_id) {
                console.log('[Realtime] Member removed from active group, refreshing members');
                queryClient.invalidateQueries({ queryKey: ['group-members', removedMember.group_id] });
              }
            }
          }
        }
      )
      // Listen for group unread count updates
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_unread_counts',
        },
        async (payload) => {
          const user = await getCachedUser(supabase);
          const newRecord = payload.new as { user_id: string; group_id: string; count: number };

          console.log('[Realtime] Group unread count update:', newRecord);

          if (user && newRecord && newRecord.user_id === user.id) {
            // Use ref to get the CURRENT activeGroupId (not stale closure value)
            const currentActiveGroupId = activeGroupIdRef.current;

            // If this is the active group and window is visible, keep count at 0
            const isActiveAndVisible =
              newRecord.group_id === currentActiveGroupId &&
              document.visibilityState === 'visible';

            // Update unread_count at the TOP level of GroupConversation (not inside group)
            queryClient.setQueryData<GroupConversation[]>(['groups'], (old) => {
              if (!old) return old;
              return old.map((groupConv) =>
                groupConv.group.id === newRecord.group_id || groupConv.id === newRecord.group_id
                  ? {
                    ...groupConv,
                    unread_count: isActiveAndVisible ? 0 : newRecord.count,
                  }
                  : groupConv
              );
            });

            // If active and visible, immediately reset in database too
            if (isActiveAndVisible && newRecord.count > 0) {
              await supabase
                .from('group_unread_counts')
                .update({ count: 0 })
                .eq('user_id', user.id)
                .eq('group_id', newRecord.group_id);
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          isGroupSubscribed = true;
          console.log('[Realtime] Group messages channel subscribed successfully');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('[Realtime] Group messages channel error:', status, err);
          isGroupSubscribed = false;
        } else if (status === 'CLOSED') {
          console.log('[Realtime] Group messages channel closed');
          isGroupSubscribed = false;
        }
      });

    // Cleanup group subscription on unmount
    return () => {
      isGroupSubscribed = false;
      supabase.removeChannel(groupChannel);
    };
  }, [queryClient, supabase]);

  // NOTE: WebSocket broadcast channels removed - using only Postgres Realtime for message delivery
  // This prevents duplicate messages from dual delivery system

  // Track subscribed conversation IDs to avoid duplicate subscriptions
  const subscribedConvIdsRef = useRef<Set<string>>(new Set());
  const subscribedGroupIdsRef = useRef<Set<string>>(new Set());
  const typingChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());
  const groupTypingChannelsRef = useRef<Map<string, ReturnType<typeof supabase.channel>>>(new Map());

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
          // Listen for messages_read broadcast (when recipient reads messages)
          .on('broadcast', { event: 'messages_read' }, async (payload) => {
            const { messageIds, readerId } = payload.payload;

            // Get current user (cached)
            const user = await getCachedUser(supabase);

            // Only process if we are the sender (not the reader)
            if (user && readerId === user.id) return;

            // Update message status to 'read' in cache
            queryClient.setQueryData<{ pages: Message[][]; pageParams: number[] }>(
              ['messages', conv.id],
              (old) => {
                if (!old) return old;

                return {
                  ...old,
                  pages: old.pages.map((page) =>
                    page.map((msg) =>
                      messageIds.includes(msg.id) ? { ...msg, status: 'read' as const } : msg
                    )
                  ),
                };
              }
            );
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
          // Listen for messages_read broadcast (when recipient reads messages)
          .on('broadcast', { event: 'messages_read' }, async (payload) => {
            const { messageIds, readerId } = payload.payload;

            const user = await getCachedUser(supabase);

            // Only process if we are the sender (not the reader)
            if (user && readerId === user.id) return;

            // Update message status to 'read' in cache
            queryClient.setQueryData<{ pages: Message[][]; pageParams: number[] }>(
              ['messages', conv.id],
              (old) => {
                if (!old) return old;

                return {
                  ...old,
                  pages: old.pages.map((page) =>
                    page.map((msg) =>
                      messageIds.includes(msg.id) ? { ...msg, status: 'read' as const } : msg
                    )
                  ),
                };
              }
            );
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

  // ========================================
  // GROUP TYPING SUBSCRIPTION
  // ========================================
  useEffect(() => {
    // Subscribe to cache changes for groups
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] !== 'groups') return;

      const groups = queryClient.getQueryData<GroupConversation[]>(['groups']);
      if (!groups || groups.length === 0) return;

      // Find new groups that need subscription
      groups.forEach((groupConv) => {
        const gId = groupConv.group?.id || groupConv.id;
        if (!gId || subscribedGroupIdsRef.current.has(gId)) return;

        // Mark as subscribed
        subscribedGroupIdsRef.current.add(gId);

        const groupTypingChannel = supabase
          .channel(`group-typing:${gId}`)
          .on('broadcast', { event: 'typing' }, async (payload) => {
            const { userId, userName, userAvatar } = payload.payload;
            const user = await getCachedUser(supabase);

            if (user && userId !== user.id) {
              // Use multiple typing users with avatar for groups
              setUserTypingWithAvatar(gId, userId, userName, userAvatar);

              // Clear timeout for this specific user
              const timeoutKey = `${gId}:${userId}`;
              const existingTimeout = typingTimeoutRef.current.get(timeoutKey);
              if (existingTimeout) clearTimeout(existingTimeout);

              const timeout = setTimeout(() => {
                clearUserTypingById(gId, userId);
                typingTimeoutRef.current.delete(timeoutKey);
              }, 2000);

              typingTimeoutRef.current.set(timeoutKey, timeout);
            }
          })
          .on('broadcast', { event: 'stopTyping' }, async (payload) => {
            const { userId } = payload.payload;
            const user = await getCachedUser(supabase);

            if (user && userId !== user.id) {
              const timeoutKey = `${gId}:${userId}`;
              const existingTimeout = typingTimeoutRef.current.get(timeoutKey);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
                typingTimeoutRef.current.delete(timeoutKey);
              }
              clearUserTypingById(gId, userId);
            }
          })
          .subscribe();

        groupTypingChannelsRef.current.set(gId, groupTypingChannel);
      });
    });

    // Initial subscription for existing groups
    const groups = queryClient.getQueryData<GroupConversation[]>(['groups']);
    if (groups && groups.length > 0) {
      groups.forEach((groupConv) => {
        const gId = groupConv.group?.id || groupConv.id;
        if (!gId || subscribedGroupIdsRef.current.has(gId)) return;

        subscribedGroupIdsRef.current.add(gId);

        const groupTypingChannel = supabase
          .channel(`group-typing:${gId}`)
          .on('broadcast', { event: 'typing' }, async (payload) => {
            const { userId, userName, userAvatar } = payload.payload;
            const user = await getCachedUser(supabase);

            if (user && userId !== user.id) {
              // Use multiple typing users with avatar for groups
              setUserTypingWithAvatar(gId, userId, userName, userAvatar);

              // Clear timeout for this specific user
              const timeoutKey = `${gId}:${userId}`;
              const existingTimeout = typingTimeoutRef.current.get(timeoutKey);
              if (existingTimeout) clearTimeout(existingTimeout);

              const timeout = setTimeout(() => {
                clearUserTypingById(gId, userId);
                typingTimeoutRef.current.delete(timeoutKey);
              }, 2000);

              typingTimeoutRef.current.set(timeoutKey, timeout);
            }
          })
          .on('broadcast', { event: 'stopTyping' }, async (payload) => {
            const { userId } = payload.payload;
            const user = await getCachedUser(supabase);

            if (user && userId !== user.id) {
              const timeoutKey = `${gId}:${userId}`;
              const existingTimeout = typingTimeoutRef.current.get(timeoutKey);
              if (existingTimeout) {
                clearTimeout(existingTimeout);
                typingTimeoutRef.current.delete(timeoutKey);
              }
              clearUserTypingById(gId, userId);
            }
          })
          .subscribe();

        groupTypingChannelsRef.current.set(gId, groupTypingChannel);
      });
    }

    // Cleanup
    return () => {
      unsubscribe();
      groupTypingChannelsRef.current.forEach((channel) => {
        supabase.removeChannel(channel);
      });
      groupTypingChannelsRef.current.clear();
      subscribedGroupIdsRef.current.clear();
    };
  }, [queryClient, supabase, setUserTyping, clearUserTyping, setUserTypingWithAvatar, clearUserTypingById]);
}
