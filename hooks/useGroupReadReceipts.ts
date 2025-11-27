'use client';

import { useEffect, useMemo, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getGroupReadReceipts, updateGroupReadReceipt, GroupReadReceipt } from '@/services/group.service';

/**
 * Hook to manage group read receipts
 * - Fetches who has read which message
 * - Updates current user's read receipt when viewing messages
 * - Subscribes to realtime updates
 */
export function useGroupReadReceipts(groupId: string | null, latestMessageId?: string | null) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const lastUpdatedMessageRef = useRef<string | null>(null);

  // Fetch read receipts
  const { data: readReceipts = [], isLoading } = useQuery({
    queryKey: ['group-read-receipts', groupId],
    queryFn: async () => {
      if (!groupId) return [];
      const result = await getGroupReadReceipts(supabase, groupId);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: !!groupId,
    staleTime: 1000 * 30, // 30 seconds
    refetchOnWindowFocus: true,
  });

  // Update read receipt when latest message changes (only if window is visible)
  useEffect(() => {
    if (!groupId || !latestMessageId) return;
    if (latestMessageId === lastUpdatedMessageRef.current) return;
    if (latestMessageId.startsWith('temp-')) return; // Don't update for temp messages
    if (document.visibilityState !== 'visible') return; // Only mark as read if window is visible

    lastUpdatedMessageRef.current = latestMessageId;
    
    // Debounce the update
    const timeout = setTimeout(async () => {
      // Double check visibility before updating
      if (document.visibilityState === 'visible') {
        await updateGroupReadReceipt(supabase, groupId, latestMessageId);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [groupId, latestMessageId, supabase]);

  // Subscribe to realtime updates for read receipts
  useEffect(() => {
    if (!groupId) return;

    const channel = supabase
      .channel(`group-reads:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'group_message_reads',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          // Invalidate query to refetch
          queryClient.invalidateQueries({ queryKey: ['group-read-receipts', groupId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupId, supabase, queryClient]);

  // Helper to get users who have read a specific message
  const getUsersWhoReadMessage = useCallback((messageId: string): GroupReadReceipt[] => {
    if (!readReceipts.length) return [];
    
    // Return users whose last_read_message_id is >= this message
    // For simplicity, we'll show users who have read this exact message or later
    // This requires knowing message order - for now, show users who read this message
    return readReceipts.filter(r => r.last_read_message_id === messageId);
  }, [readReceipts]);

  // Get all users who have read up to at least a certain message
  const getReadReceiptsForMessage = useCallback((messageId: string, allMessageIds: string[]): GroupReadReceipt[] => {
    if (!readReceipts.length || !allMessageIds.length) return [];
    
    const messageIndex = allMessageIds.indexOf(messageId);
    if (messageIndex === -1) return [];

    // Return users whose last_read_message_id is at or after this message in the list
    return readReceipts.filter(r => {
      if (!r.last_read_message_id) return false;
      const readIndex = allMessageIds.indexOf(r.last_read_message_id);
      return readIndex !== -1 && readIndex <= messageIndex; // Lower index = newer message
    });
  }, [readReceipts]);

  return {
    readReceipts,
    isLoading,
    getUsersWhoReadMessage,
    getReadReceiptsForMessage,
  };
}
