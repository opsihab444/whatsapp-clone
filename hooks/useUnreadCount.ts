'use client';

import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Conversation } from '@/types';
import { updateTabTitle } from '@/lib/utils';

/**
 * Hook to manage unread count and tab title updates
 * Calculates total unread count from all conversations and updates browser tab title
 */
export function useUnreadCount() {
  const queryClient = useQueryClient();
  const isMounted = useRef(false);
  const [conversations, setConversations] = useState<Conversation[] | undefined>(
    () => queryClient.getQueryData<Conversation[]>(['conversations'])
  );

  useEffect(() => {
    isMounted.current = true;
    
    // Subscribe to cache changes for the conversations query
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryKey[0] === 'conversations' && isMounted.current) {
        setConversations(queryClient.getQueryData<Conversation[]>(['conversations']));
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [queryClient]);

  useEffect(() => {
    if (conversations) {
      const totalUnread = conversations.reduce((sum, conv) => sum + conv.unread_count, 0);
      updateTabTitle(totalUnread);
    } else {
      updateTabTitle(0);
    }
  }, [conversations]);
}
