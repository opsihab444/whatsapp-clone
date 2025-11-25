'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getConversations, filterConversations } from '@/services/chat.service';
import { Conversation } from '@/types';
import { useMemo } from 'react';

/**
 * Hook to fetch and manage conversation list
 * Integrates with TanStack Query for caching and state management
 * 
 * @param searchQuery - Optional search query to filter conversations
 * @returns Query result with conversations data, loading, and error states
 */
export function useChatList(searchQuery: string = '') {
  const supabase = createClient();

  const query = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const result = await getConversations(supabase);

      if (!result.success) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    // Sort by last_message_time in descending order (most recent first)
    select: (data: Conversation[]) => {
      return data.sort((a, b) => {
        const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
        const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
        return timeB - timeA;
      });
    },
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Filter conversations based on search query
  const filteredConversations = useMemo(() => {
    if (!query.data) return [];
    return filterConversations(query.data, searchQuery);
  }, [query.data, searchQuery]);

  return {
    ...query,
    conversations: filteredConversations,
  };
}
