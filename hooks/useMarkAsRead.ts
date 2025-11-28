'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { markConversationAsRead } from '@/services/message.service';
import { Conversation } from '@/types';

/**
 * Hook to mark messages as read when a conversation is opened
 * Optimized to prevent excessive API calls with caching and debouncing
 * 
 * @param conversationId - The ID of the currently active conversation
 */
export function useMarkAsRead(conversationId: string | null) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const lastMarkedRef = useRef<{ id: string; timestamp: number } | null>(null);
  const isMarkingRef = useRef(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const markAsRead = useCallback(async () => {
    if (!conversationId) return;
    if (document.visibilityState !== 'visible') return;
    if (isMarkingRef.current) return; // Prevent concurrent calls

    // Check if conversation has unread messages OR any unread messages in cache
    const conversations = queryClient.getQueryData<Conversation[]>(['conversations']);
    const currentConv = conversations?.find(c => c.id === conversationId);

    // Also check if there are any sent/delivered messages from other user in cache
    const messagesData = queryClient.getQueryData<{ pages: Array<Array<{ id: string; sender_id: string; status: string }>> }>(['messages', conversationId]);
    const hasUnreadMessagesInCache = messagesData?.pages?.some(page => 
      page.some(msg => {
        // Get current user from conversation
        const currentUserId = currentConv?.participant_1_id === currentConv?.other_user?.id 
          ? currentConv?.participant_2_id 
          : currentConv?.participant_1_id;
        return msg.sender_id !== currentUserId && (msg.status === 'sent' || msg.status === 'delivered');
      })
    );

    // Skip if no unread messages in both unread_count and cache
    if (!currentConv || (currentConv.unread_count === 0 && !hasUnreadMessagesInCache)) {
      return;
    }

    // Skip if we marked this conversation recently (within 10 seconds)
    const now = Date.now();
    if (lastMarkedRef.current?.id === conversationId &&
      (now - lastMarkedRef.current.timestamp) < 10000) {
      return;
    }

    isMarkingRef.current = true;

    try {
      const result = await markConversationAsRead(supabase, conversationId);

      if (result.success) {
        lastMarkedRef.current = { id: conversationId, timestamp: now };

        // Update the conversations cache to set unread_count to 0
        queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
          if (!old) return old;

          return old.map((conv) =>
            conv.id === conversationId
              ? { ...conv, unread_count: 0 }
              : conv
          );
        });

        // Also update message status in cache to 'read' for all messages from other user
        // This ensures UI shows correct status even if realtime event is missed
        queryClient.setQueryData<{ pages: Array<Array<{ id: string; sender_id: string; status: string }>> }>(
          ['messages', conversationId],
          (old) => {
            if (!old) return old;
            
            const currentUserId = currentConv?.participant_1_id === currentConv?.other_user?.id 
              ? currentConv?.participant_2_id 
              : currentConv?.participant_1_id;

            return {
              ...old,
              pages: old.pages.map(page =>
                page.map(msg => {
                  // Update status to 'read' for messages from other user that are sent/delivered
                  if (msg.sender_id !== currentUserId && (msg.status === 'sent' || msg.status === 'delivered')) {
                    return { ...msg, status: 'read' };
                  }
                  return msg;
                })
              ),
            };
          }
        );
      }
    } finally {
      isMarkingRef.current = false;
    }
  }, [conversationId, supabase, queryClient]);

  const debouncedMarkAsRead = useCallback(() => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Debounce by 300ms to prevent rapid calls
    debounceTimeoutRef.current = setTimeout(() => {
      markAsRead();
    }, 300);
  }, [markAsRead]);

  useEffect(() => {
    if (!conversationId) return;

    // Initial check (debounced)
    debouncedMarkAsRead();

    // Only listen for visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        debouncedMarkAsRead();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [conversationId, debouncedMarkAsRead]);
}
