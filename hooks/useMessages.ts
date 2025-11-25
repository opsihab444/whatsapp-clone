'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getMessages } from '@/services/message.service';
import { useCallback, useEffect } from 'react';
import { Message } from '@/types';

const FIRST_PAGE_SIZE = 18;
const SUBSEQUENT_PAGE_SIZE = 8;

/**
 * Hook to fetch messages for a conversation with infinite scroll pagination
 * 
 * Caching Strategy:
 * - First page (24 messages) is cached
 * - Subsequent pages from infinite scroll are NOT cached
 * - When user leaves conversation, only first page remains in cache
 */
export function useMessages(conversationId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: ['messages', conversationId],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = pageParam === 0 ? FIRST_PAGE_SIZE : SUBSEQUENT_PAGE_SIZE;
      const result = await getMessages(supabase, conversationId, pageParam, limit);

      if (!result.success) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    getNextPageParam: (lastPage, allPages) => {
      const expectedPageSize = allPages.length === 1 ? FIRST_PAGE_SIZE : SUBSEQUENT_PAGE_SIZE;

      if (lastPage.length < expectedPageSize) {
        return undefined;
      }

      if (allPages.length === 1) {
        return FIRST_PAGE_SIZE;
      }
      return FIRST_PAGE_SIZE + (allPages.length - 1) * SUBSEQUENT_PAGE_SIZE;
    },
    initialPageParam: 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
  });

  // Clean up: Keep only first page in cache when unmounting
  useEffect(() => {
    return () => {
      queryClient.setQueryData(
        ['messages', conversationId],
        (oldData: { pages: Message[][]; pageParams: number[] } | undefined) => {
          if (!oldData?.pages?.length) return oldData;
          return {
            pages: [oldData.pages[0]],
            pageParams: [0],
          };
        }
      );
    };
  }, [conversationId, queryClient]);

  const addMessageToCache = useCallback((newMessage: Message) => {
    queryClient.setQueryData(
      ['messages', conversationId],
      (oldData: { pages: Message[][]; pageParams: number[] } | undefined) => {
        if (!oldData?.pages?.length) {
          return { pages: [[newMessage]], pageParams: [0] };
        }
        const newPages = [...oldData.pages];
        newPages[0] = [newMessage, ...newPages[0]];
        return { ...oldData, pages: newPages };
      }
    );
  }, [queryClient, conversationId]);

  const updateMessageInCache = useCallback((messageId: string, updates: Partial<Message>) => {
    queryClient.setQueryData(
      ['messages', conversationId],
      (oldData: { pages: Message[][]; pageParams: number[] } | undefined) => {
        if (!oldData?.pages) return oldData;
        const newPages = oldData.pages.map((page) =>
          page.map((msg) => (msg.id === messageId ? { ...msg, ...updates } : msg))
        );
        return { ...oldData, pages: newPages };
      }
    );
  }, [queryClient, conversationId]);

  const removeMessageFromCache = useCallback((messageId: string) => {
    queryClient.setQueryData(
      ['messages', conversationId],
      (oldData: { pages: Message[][]; pageParams: number[] } | undefined) => {
        if (!oldData?.pages) return oldData;
        const newPages = oldData.pages.map((page) => page.filter((msg) => msg.id !== messageId));
        return { ...oldData, pages: newPages };
      }
    );
  }, [queryClient, conversationId]);

  const invalidateMessages = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
  }, [queryClient, conversationId]);

  const prefetchMessages = useCallback(async (targetConversationId: string) => {
    await queryClient.prefetchInfiniteQuery({
      queryKey: ['messages', targetConversationId],
      queryFn: async () => {
        const result = await getMessages(supabase, targetConversationId, 0, FIRST_PAGE_SIZE);
        if (!result.success) throw new Error(result.error.message);
        return result.data;
      },
      initialPageParam: 0,
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient, supabase]);

  return {
    ...query,
    addMessageToCache,
    updateMessageInCache,
    removeMessageFromCache,
    invalidateMessages,
    prefetchMessages,
  };
}

export function useCachedMessages(conversationId: string) {
  const queryClient = useQueryClient();
  
  const getCachedMessages = useCallback((): Message[] => {
    const data = queryClient.getQueryData<{ pages: Message[][] }>(['messages', conversationId]);
    return data?.pages.flat() || [];
  }, [queryClient, conversationId]);

  return { getCachedMessages };
}
