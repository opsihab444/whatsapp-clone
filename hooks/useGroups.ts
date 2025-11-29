'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getGroups } from '@/services/group.service';
import { getFavorites } from '@/services/chat.service';
import { GroupConversation } from '@/types';
import { useMemo, useState, useEffect } from 'react';

/**
 * Hook to fetch and manage group list
 * Integrates with TanStack Query for caching and state management
 */
export function useGroups(searchQuery: string = '') {
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
    queryKey: ['groups'],
    queryFn: async () => {
      const result = await getGroups(supabase);

      if (!result.success) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    select: (data: GroupConversation[]) => {
      return data.sort((a, b) => {
        const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : new Date(a.group.created_at).getTime();
        const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : new Date(b.group.created_at).getTime();
        return timeB - timeA;
      });
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
  });

  // Filter groups based on search query and merge favorites
  const filteredGroups = useMemo(() => {
    if (!query.data) return [];

    // Merge favorite status
    const groupsWithFavorites = query.data.map(group => ({
      ...group,
      is_favorite: favorites.includes(group.id)
    }));

    if (!searchQuery.trim()) return groupsWithFavorites;

    const lowerQuery = searchQuery.toLowerCase();
    return groupsWithFavorites.filter((g) =>
      g.group.name.toLowerCase().includes(lowerQuery) ||
      g.group.description?.toLowerCase().includes(lowerQuery)
    );
  }, [query.data, searchQuery, favorites]);

  return {
    ...query,
    groups: filteredGroups,
  };
}
