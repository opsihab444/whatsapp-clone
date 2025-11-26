'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getGroups } from '@/services/group.service';
import { GroupConversation } from '@/types';
import { useMemo } from 'react';

/**
 * Hook to fetch and manage group list
 * Integrates with TanStack Query for caching and state management
 */
export function useGroups(searchQuery: string = '') {
  const supabase = useMemo(() => createClient(), []);

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

  // Filter groups based on search query
  const filteredGroups = useMemo(() => {
    if (!query.data) return [];
    if (!searchQuery.trim()) return query.data;
    
    const lowerQuery = searchQuery.toLowerCase();
    return query.data.filter((g) => 
      g.group.name.toLowerCase().includes(lowerQuery) ||
      g.group.description?.toLowerCase().includes(lowerQuery)
    );
  }, [query.data, searchQuery]);

  return {
    ...query,
    groups: filteredGroups,
  };
}
