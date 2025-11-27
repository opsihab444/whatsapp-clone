'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getMessages } from '@/services/message.service';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Message } from '@/types';

const FIRST_PAGE_SIZE = 16;
const SUBSEQUENT_PAGE_SIZE = 5;
const CACHE_MESSAGE_LIMIT = 20; // Keep max 20 messages in cache when switching conversations

/**
 * Hook to fetch messages for a conversation with infinite scroll pagination
 * 
 * Professional Caching Strategy:
 * - Initial load: Fetch FIRST_PAGE_SIZE (16) messages
 * - Cache retention: Keep up to CACHE_MESSAGE_LIMIT (20) most recent messages when switching
 * - New messages: Append to existing cache (no refetch needed)
 * - Conversation switch: Load fresh FIRST_PAGE_SIZE messages, cache is trimmed to limit
 * - All message types supported: text, image, video, audio, file
 */
export function useMessages(conversationId: string) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const previousConversationIdRef = useRef<string | null>(null);

  // Track conversation switches and trim cache appropriately
  useEffect(() => {
    const prevId = previousConversationIdRef.current;
    
    // When switching away from a conversation, trim its cache to limit
    if (prevId && prevId !== conversationId) {
      queryClient.setQueryData(
        ['messages', prevId],
        (oldData: { pages: Message[][]; pageParams: number[] } | undefined) => {
          if (!oldData?.pages?.length) return oldData;
          
          // Flatten all messages and keep only the most recent ones
          const allMessages = oldData.pages.flat();
          const trimmedMessages = allMessages.slice(0, CACHE_MESSAGE_LIMIT);
          
          // Return as single page for clean cache structure
          return {
            pages: [trimmedMessages],
            pageParams: [0],
          };
        }
      );
    }
    
    previousConversationIdRef.current = conversationId;
  }, [conversationId, queryClient]);

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
    staleTime: 1000 * 60 * 15, // 15 minutes - realtime handles updates
    gcTime: 1000 * 60 * 60, // 1 hour - keep in cache longer for smooth switching
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data, realtime handles updates
    refetchOnReconnect: true,
    structuralSharing: false, // Disable for faster optimistic updates
  });

  const addMessageToCache = useCallback((newMessage: Message) => {
    queryClient.setQueryData(
      ['messages', conversationId],
      (oldData: { pages: Message[][]; pageParams: number[] } | undefined) => {
        if (!oldData?.pages?.length) {
          return { pages: [[newMessage]], pageParams: [0] };
        }
        
        // Check if message already exists by ID (prevent duplicates)
        const existsById = oldData.pages.some(page => 
          page.some(msg => msg.id === newMessage.id)
        );
        if (existsById) return oldData;
        
        // Check for temp message replacement (optimistic update)
        // Match by content + sender + close timestamp (within 5 seconds)
        let foundTempMessage = false;
        const newMessageTime = new Date(newMessage.created_at).getTime();
        
        const updatedPages = oldData.pages.map((page) =>
          page.map((msg) => {
            if (foundTempMessage) return msg;
            
            if (
              msg.id.startsWith('temp-') &&
              msg.content === newMessage.content &&
              msg.sender_id === newMessage.sender_id
            ) {
              const tempMsgTime = new Date(msg.created_at).getTime();
              if (Math.abs(tempMsgTime - newMessageTime) < 5000) {
                foundTempMessage = true;
                // Replace temp with real, keep original timestamp for smooth UX
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
          return { ...oldData, pages: updatedPages };
        }
        
        // Add new message to first page (newest messages at top)
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
        
        let found = false;
        const newPages = oldData.pages.map((page) =>
          page.map((msg) => {
            if (msg.id === messageId) {
              found = true;
              return { ...msg, ...updates };
            }
            return msg;
          })
        );
        
        // Only return new object if something changed
        return found ? { ...oldData, pages: newPages } : oldData;
      }
    );
  }, [queryClient, conversationId]);

  const removeMessageFromCache = useCallback((messageId: string) => {
    queryClient.setQueryData(
      ['messages', conversationId],
      (oldData: { pages: Message[][]; pageParams: number[] } | undefined) => {
        if (!oldData?.pages) return oldData;
        
        let found = false;
        const newPages = oldData.pages.map((page) => {
          const filtered = page.filter((msg) => {
            if (msg.id === messageId) {
              found = true;
              return false;
            }
            return true;
          });
          return filtered;
        });
        
        return found ? { ...oldData, pages: newPages } : oldData;
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

  const hasCachedMessages = useCallback((): boolean => {
    const data = queryClient.getQueryData<{ pages: Message[][] }>(['messages', conversationId]);
    return !!(data?.pages?.length && data.pages[0]?.length > 0);
  }, [queryClient, conversationId]);

  const getCachedMessageCount = useCallback((): number => {
    const data = queryClient.getQueryData<{ pages: Message[][] }>(['messages', conversationId]);
    return data?.pages.flat().length || 0;
  }, [queryClient, conversationId]);

  return { getCachedMessages, hasCachedMessages, getCachedMessageCount };
}

/**
 * Global message cache utilities
 * Use this for operations across multiple conversations
 */
export function useMessageCacheManager() {
  const queryClient = useQueryClient();

  // Trim all conversation caches to limit (useful on app background/memory pressure)
  const trimAllCaches = useCallback((limit: number = CACHE_MESSAGE_LIMIT) => {
    const queries = queryClient.getQueriesData<{ pages: Message[][] }>({ queryKey: ['messages'] });
    
    queries.forEach(([queryKey, data]) => {
      if (!data?.pages?.length) return;
      
      const allMessages = data.pages.flat();
      if (allMessages.length > limit) {
        const trimmedMessages = allMessages.slice(0, limit);
        queryClient.setQueryData(queryKey, {
          pages: [trimmedMessages],
          pageParams: [0],
        });
      }
    });
  }, [queryClient]);

  // Clear cache for a specific conversation
  const clearConversationCache = useCallback((conversationId: string) => {
    queryClient.removeQueries({ queryKey: ['messages', conversationId] });
  }, [queryClient]);

  // Get total cached messages count across all conversations
  const getTotalCachedCount = useCallback((): number => {
    const queries = queryClient.getQueriesData<{ pages: Message[][] }>({ queryKey: ['messages'] });
    return queries.reduce((total, [, data]) => {
      return total + (data?.pages.flat().length || 0);
    }, 0);
  }, [queryClient]);

  return { trimAllCaches, clearConversationCache, getTotalCachedCount };
}
