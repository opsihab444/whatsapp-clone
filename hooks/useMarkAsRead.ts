'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { markConversationAsRead } from '@/services/message.service';
import { Conversation } from '@/types';

/**
 * Hook to mark messages as read when a conversation is opened
 * 
 * @param conversationId - The ID of the currently active conversation
 */
export function useMarkAsRead(conversationId: string | null) {
  const queryClient = useQueryClient();
  const supabase = createClient();

  useEffect(() => {
    if (!conversationId) return;

    // Function to mark as read
    const markAsRead = async () => {
      if (document.visibilityState === 'visible') {
        const result = await markConversationAsRead(supabase, conversationId);

        if (result.success) {
          // Update the conversations cache to set unread_count to 0
          queryClient.setQueryData<Conversation[]>(['conversations'], (old) => {
            if (!old) return old;

            return old.map((conv) =>
              conv.id === conversationId
                ? { ...conv, unread_count: 0 }
                : conv
            );
          });
        }
      }
    };

    // Initial check
    markAsRead();

    // Listen for window focus and visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markAsRead();
      }
    };

    const handleFocus = () => {
      markAsRead();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [conversationId, supabase, queryClient]);
}
