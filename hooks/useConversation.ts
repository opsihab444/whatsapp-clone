'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Conversation } from '@/types';
import { useMemo, useSyncExternalStore } from 'react';

/**
 * Hook to get a single conversation from cache
 * Subscribes to cache updates so component re-renders when data changes
 * Returns proper loading state based on whether conversations have been fetched
 * 
 * @param conversationId - The ID of the conversation to find
 */
export function useConversation(conversationId: string) {
  const queryClient = useQueryClient();
  
  // Subscribe to query cache changes
  const queryState = useSyncExternalStore(
    (callback) => {
      const unsubscribe = queryClient.getQueryCache().subscribe(callback);
      return unsubscribe;
    },
    () => queryClient.getQueryState<Conversation[]>(['conversations']),
    () => queryClient.getQueryState<Conversation[]>(['conversations'])
  );
  
  const conversations = queryState?.data;
  
  // isLoading = true if:
  // 1. Query state doesn't exist yet (never fetched)
  // 2. Query has no data yet (initial load or refetch without stale data)
  // 3. Query is currently fetching and has no data
  const isLoading = !queryState || !queryState.data || (queryState.fetchStatus === 'fetching' && !queryState.data);
  
  // Find the specific conversation
  const conversation = useMemo(() => {
    return conversations?.find((c) => c.id === conversationId) || null;
  }, [conversations, conversationId]);
  
  return {
    conversation,
    isLoading,
  };
}
