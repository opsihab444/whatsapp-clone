'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { markGroupAsRead } from '@/services/group.service';
import { GroupConversation } from '@/types';

/**
 * Hook to mark group messages as read when a group is opened
 * Optimized to prevent excessive API calls with caching and debouncing
 * 
 * @param groupId - The ID of the currently active group
 */
export function useMarkGroupAsRead(groupId: string | null) {
  const queryClient = useQueryClient();
  const supabase = createClient();
  const lastMarkedRef = useRef<{ id: string; timestamp: number } | null>(null);
  const isMarkingRef = useRef(false);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const markAsRead = useCallback(async () => {
    if (!groupId) return;
    if (document.visibilityState !== 'visible') return;
    if (isMarkingRef.current) return;

    // Check if group has unread messages first
    const groups = queryClient.getQueryData<GroupConversation[]>(['groups']);
    const currentGroup = groups?.find(g => g.group?.id === groupId || g.id === groupId);

    // Skip if no unread messages
    if (!currentGroup || currentGroup.unread_count === 0) {
      return;
    }

    // Skip if we marked this group recently (within 10 seconds)
    const now = Date.now();
    if (lastMarkedRef.current?.id === groupId &&
      (now - lastMarkedRef.current.timestamp) < 10000) {
      return;
    }

    isMarkingRef.current = true;

    try {
      const result = await markGroupAsRead(supabase, groupId);

      if (result.success) {
        lastMarkedRef.current = { id: groupId, timestamp: now };

        // Update the groups cache to set unread_count to 0
        queryClient.setQueryData<GroupConversation[]>(['groups'], (old) => {
          if (!old) return old;

          return old.map((groupConv) =>
            (groupConv.group?.id === groupId || groupConv.id === groupId)
              ? { ...groupConv, unread_count: 0 }
              : groupConv
          );
        });
      }
    } finally {
      isMarkingRef.current = false;
    }
  }, [groupId, supabase, queryClient]);

  const debouncedMarkAsRead = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      markAsRead();
    }, 300);
  }, [markAsRead]);

  useEffect(() => {
    if (!groupId) return;

    // Initial check (debounced)
    debouncedMarkAsRead();

    // Listen for visibility change
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        debouncedMarkAsRead();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [groupId, debouncedMarkAsRead]);
}
