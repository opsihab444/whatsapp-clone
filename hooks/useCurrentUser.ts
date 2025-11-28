'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useMemo, useEffect, useRef, useCallback } from 'react';

// Module-level cache to prevent duplicate fetches across hook instances
let cachedUserData: {
  id: string;
  email: string | undefined;
  name: string;
  avatar: string | null;
} | null = null;
let lastFetchTime = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour

// Export function to clear cache from outside
export function clearUserCache() {
  cachedUserData = null;
  lastFetchTime = 0;
}

// Export function to update cache directly (for optimistic updates)
export function updateUserCache(data: Partial<{ name: string; avatar: string | null }>) {
  if (cachedUserData) {
    cachedUserData = {
      ...cachedUserData,
      ...data,
    };
  }
}

export function useCurrentUser() {
    const supabase = useMemo(() => createClient(), []);
    const queryClient = useQueryClient();
    const listenerSetup = useRef(false);

    // Set up auth state listener once per component instance
    useEffect(() => {
        if (listenerSetup.current) return;
        listenerSetup.current = true;

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event) => {
                if (event === 'SIGNED_OUT') {
                    // Clear module-level cache
                    cachedUserData = null;
                    lastFetchTime = 0;
                    queryClient.setQueryData(['currentUser'], null);
                } else if (event === 'SIGNED_IN') {
                    // Clear cache to force refetch on next access
                    cachedUserData = null;
                    lastFetchTime = 0;
                    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
                }
            }
        );

        return () => {
            subscription.unsubscribe();
            listenerSetup.current = false;
        };
    }, [supabase, queryClient]);

  // Function to force refresh user data
  const refreshUser = useCallback(() => {
    clearUserCache();
    queryClient.invalidateQueries({ queryKey: ['currentUser'] });
  }, [queryClient]);

  const query = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const now = Date.now();

      // Return cached data if still valid (sync, no promise)
      if (cachedUserData && now - lastFetchTime < CACHE_DURATION) {
        return cachedUserData;
      }

      // Get fresh user data from auth
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      // Try to get name from user metadata first (no extra query needed)
      const metadataName = user.user_metadata?.full_name || user.user_metadata?.name;
      const metadataAvatar = user.user_metadata?.avatar_url;

      // If we have metadata, use it directly (faster - no DB query)
      if (metadataName) {
        cachedUserData = {
          id: user.id,
          email: user.email,
          name: metadataName,
          avatar: metadataAvatar || null,
        };
        lastFetchTime = now;
        return cachedUserData;
      }

      // Fallback: Get user profile from DB (only if metadata not available)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();

      cachedUserData = {
        id: user.id,
        email: user.email,
        name: profile?.full_name || user.email?.split('@')[0] || 'User',
        avatar: profile?.avatar_url || null,
      };
      lastFetchTime = now;

      return cachedUserData;
    },
    staleTime: Infinity, // Never consider stale - we manage staleness ourselves
    gcTime: 1000 * 60 * 60 * 24, // 24 hours
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    // Return cached data immediately while revalidating
    placeholderData: () => cachedUserData,
  });

  return {
    ...query,
    refreshUser,
  };
}
