'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getConversations, filterConversations, getFavorites } from '@/services/chat.service';
import { Conversation } from '@/types';
import { useMemo, useState, useEffect } from 'react';

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
  const [favorites, setFavorites] = useState<string[]>([]);

  // Load favorites on mount and listen for updates
  useEffect(() => {
    setFavorites(getFavorites());

    const handleFavoritesUpdate = () => {
      setFavorites(getFavorites());
    };

    window.addEventListener('favorites-updated', handleFavoritesUpdate);
    return () => window.removeEventListener('favorites-updated', handleFavoritesUpdate);
  }, []);

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

  // Filter conversations based on search query and merge favorites
  const filteredConversations = useMemo(() => {
    if (!query.data) return [];

    // Merge favorite status
    const conversationsWithFavorites = query.data.map(conv => ({
      ...conv,
      is_favorite: favorites.includes(conv.id)
    }));

    return filterConversations(conversationsWithFavorites, searchQuery);
  }, [query.data, searchQuery, favorites]);

  return {
    ...query,
    conversations: filteredConversations,
  };
}
