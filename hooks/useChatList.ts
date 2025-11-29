'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getConversations, filterConversations, getPinnedConversations, getFavoriteConversations } from '@/services/chat.service';
import { Conversation } from '@/types';
import { useMemo, useEffect } from 'react';

/**
 * Hook to fetch and manage conversation list
 * Integrates with TanStack Query for caching and state management
 * 
 * Optimization: Uses staleTime and gcTime to minimize refetches
 * Realtime updates handle live data, so we don't need frequent refetches
 * 
 * @param searchQuery - Optional search query to filter conversations
 * @returns Query result with conversations data, loading, and error states
 */
export function useChatList(searchQuery: string = '') {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  // Fetch pinned chats from database
  const pinnedQuery = useQuery({
    queryKey: ['pinned-conversations'],
    queryFn: async () => {
      const result = await getPinnedConversations(supabase);
      if (!result.success) {
        return [];
      }
      return result.data;
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });

  // Fetch favorites from database
  const favoritesQuery = useQuery({
    queryKey: ['favorite-conversations'],
    queryFn: async () => {
      const result = await getFavoriteConversations(supabase);
      if (!result.success) {
        return [];
      }
      return result.data;
    },
    staleTime: 0,
    gcTime: 1000 * 60 * 5,
  });

  // Memoize for stable reference
  const pinnedChats = useMemo(() => pinnedQuery.data || [], [pinnedQuery.data]);
  const favorites = useMemo(() => favoritesQuery.data || [], [favoritesQuery.data]);

  // Listen for updates
  useEffect(() => {
    const handleFavoritesUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['favorite-conversations'] });
    };

    const handlePinnedUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-conversations'] });
    };

    window.addEventListener('favorites-updated', handleFavoritesUpdate);
    window.addEventListener('pinned-updated', handlePinnedUpdate);
    return () => {
      window.removeEventListener('favorites-updated', handleFavoritesUpdate);
      window.removeEventListener('pinned-updated', handlePinnedUpdate);
    };
  }, [queryClient]);

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
    staleTime: 1000 * 60 * 10, // 10 minutes - realtime handles updates
    gcTime: 1000 * 60 * 30, // 30 minutes - keep in cache longer
    refetchOnWindowFocus: false, // Disable - realtime handles updates
    refetchOnMount: false, // Don't refetch if data exists
    refetchOnReconnect: true,
  });

  // Stringify for stable dependency comparison
  const pinnedChatsKey = JSON.stringify(pinnedChats);
  const favoritesKey = JSON.stringify(favorites);

  // Filter conversations based on search query and merge favorites/pinned status
  const filteredConversations = useMemo(() => {
    if (!query.data) return [];

    // Parse from keys for this render
    const currentPinned: string[] = JSON.parse(pinnedChatsKey);
    const currentFavorites: string[] = JSON.parse(favoritesKey);

    // Merge favorite and pinned status
    const conversationsWithStatus = query.data.map(conv => ({
      ...conv,
      is_favorite: currentFavorites.includes(conv.id),
      is_pinned: currentPinned.includes(conv.id)
    }));

    // Filter by search query
    const filtered = filterConversations(conversationsWithStatus, searchQuery);

    // Sort: pinned first, then by last_message_time
    return filtered.sort((a, b) => {
      // Pinned chats always come first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      
      // Then sort by last_message_time
      const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
      const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
      return timeB - timeA;
    });
  }, [query.data, searchQuery, pinnedChatsKey, favoritesKey]);

  return {
    ...query,
    conversations: filteredConversations,
  };
}
