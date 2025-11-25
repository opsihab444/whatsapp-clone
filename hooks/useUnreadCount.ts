'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Conversation } from '@/types';
import { updateTabTitle } from '@/lib/utils';

/**
 * Hook to manage unread count and tab title updates
 * Calculates total unread count from all conversations and updates browser tab title
 */
export function useUnreadCount() {
  // Use useQuery to subscribe to the conversations cache
  // We don't provide a queryFn because we expect the data to be managed by other components/hooks
  const { data: conversations } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    enabled: false, // Don't fetch, just read from cache
    staleTime: Infinity,
  });

  useEffect(() => {
    if (conversations) {
      const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
      updateTabTitle(totalUnread);
    } else {
      updateTabTitle(0);
    }
  }, [conversations]);
}
