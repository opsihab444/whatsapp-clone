'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore, useCallback } from 'react';

/**
 * Hook to check if all critical data is loaded
 * Returns true only when conversations AND currentUser are both loaded
 * This ensures all UI elements appear together, not sequentially
 */
export function useAppReady() {
  const queryClient = useQueryClient();

  // Subscribe to query cache changes
  const subscribe = useCallback(
    (callback: () => void) => {
      const unsubscribe = queryClient.getQueryCache().subscribe(callback);
      return unsubscribe;
    },
    [queryClient]
  );

  const getSnapshot = useCallback(() => {
    const conversationsState = queryClient.getQueryState(['conversations']);
    const currentUserState = queryClient.getQueryState(['currentUser']);

    // Check if both queries have completed (have data or error)
    const conversationsReady =
      conversationsState?.status === 'success' || conversationsState?.status === 'error';
    const currentUserReady =
      currentUserState?.status === 'success' || currentUserState?.status === 'error';

    return conversationsReady && currentUserReady;
  }, [queryClient]);

  const isReady = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return isReady;
}

/**
 * Hook to check if messages for a specific conversation are loaded
 */
export function useMessagesReady(conversationId: string) {
  const queryClient = useQueryClient();

  const subscribe = useCallback(
    (callback: () => void) => {
      const unsubscribe = queryClient.getQueryCache().subscribe(callback);
      return unsubscribe;
    },
    [queryClient]
  );

  const getSnapshot = useCallback(() => {
    const messagesState = queryClient.getQueryState(['messages', conversationId]);

    // Check if messages query has completed
    return messagesState?.status === 'success' || messagesState?.status === 'error';
  }, [queryClient, conversationId]);

  const isReady = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return isReady;
}
