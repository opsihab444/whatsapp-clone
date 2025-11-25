'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getMessages } from '@/services/message.service';
import { Message } from '@/types';

/**
 * Hook to fetch messages for a conversation with infinite scroll pagination
 * Messages are ordered by created_at DESC (newest first in the query)
 * but displayed in reverse order (oldest at top, newest at bottom)
 * 
 * @param conversationId - The ID of the conversation to fetch messages for
 * @returns Infinite query result with messages data, loading, and pagination functions
 */
export function useMessages(conversationId: string) {
  const supabase = createClient();

  return useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam = 0 }) => {
      // First page: 28 messages, subsequent pages: 10 messages
      const limit = pageParam === 0 ? 28 : 10;
      const result = await getMessages(supabase, conversationId, pageParam, limit);

      if (!result.success) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    getNextPageParam: (lastPage, allPages) => {
      // First page has 28 items, subsequent pages have 10 items
      const expectedPageSize = allPages.length === 1 ? 28 : 10;

      // If the last page has the expected number of items, there might be more
      if (lastPage.length === expectedPageSize) {
        // Calculate offset: first page is 28, then add 10 for each subsequent page
        const offset = allPages.length === 1 ? 28 : 28 + (allPages.length - 1) * 10;
        return offset;
      }
      return undefined;
    },
    initialPageParam: 0,
    // Only cache the first 28 messages, not the infinitely loaded ones
    // When user revisits, only first page is loaded from cache
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}
