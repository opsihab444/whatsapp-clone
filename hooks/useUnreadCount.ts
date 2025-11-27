'use client';

import { useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Conversation, GroupConversation } from '@/types';
import { updateTabTitle } from '@/lib/utils';

/**
 * Hook to manage unread count and tab title updates
 * Calculates total unread count from all conversations and groups, updates browser tab title
 */
export function useUnreadCount() {
  const queryClient = useQueryClient();
  const isMounted = useRef(false);
  const [conversations, setConversations] = useState<Conversation[] | undefined>(
    () => queryClient.getQueryData<Conversation[]>(['conversations'])
  );
  const [groups, setGroups] = useState<GroupConversation[] | undefined>(
    () => queryClient.getQueryData<GroupConversation[]>(['groups'])
  );

  useEffect(() => {
    isMounted.current = true;
    
    // Subscribe to cache changes for conversations and groups
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (!isMounted.current) return;
      
      if (event.query.queryKey[0] === 'conversations') {
        setConversations(queryClient.getQueryData<Conversation[]>(['conversations']));
      }
      if (event.query.queryKey[0] === 'groups') {
        setGroups(queryClient.getQueryData<GroupConversation[]>(['groups']));
      }
    });

    return () => {
      isMounted.current = false;
      unsubscribe();
    };
  }, [queryClient]);

  useEffect(() => {
    const convUnread = conversations?.reduce((sum, conv) => sum + conv.unread_count, 0) || 0;
    const groupUnread = groups?.reduce((sum, g) => sum + (g.unread_count || 0), 0) || 0;
    const totalUnread = convUnread + groupUnread;
    updateTabTitle(totalUnread);
  }, [conversations, groups]);
}
