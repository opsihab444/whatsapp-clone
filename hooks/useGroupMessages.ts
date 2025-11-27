'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { getGroupMessages } from '@/services/group.service';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { GroupMessage } from '@/types';

const FIRST_PAGE_SIZE = 16;
const SUBSEQUENT_PAGE_SIZE = 5;
const CACHE_MESSAGE_LIMIT = 20; // Keep max 20 messages in cache when switching groups

/**
 * Hook to fetch group messages with infinite scroll pagination
 * 
 * Professional Caching Strategy (same as useMessages):
 * - Initial load: Fetch FIRST_PAGE_SIZE (16) messages
 * - Cache retention: Keep up to CACHE_MESSAGE_LIMIT (20) most recent messages when switching
 * - New messages: Append to existing cache (no refetch needed)
 * - Group switch: Load fresh FIRST_PAGE_SIZE messages, cache is trimmed to limit
 * - All message types supported: text, image, video, audio, file
 */
export function useGroupMessages(groupId: string) {
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
  const previousGroupIdRef = useRef<string | null>(null);

  // Track group switches and trim cache appropriately
  useEffect(() => {
    const prevId = previousGroupIdRef.current;
    
    // When switching away from a group, trim its cache to limit
    if (prevId && prevId !== groupId) {
      queryClient.setQueryData(
        ['group-messages', prevId],
        (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
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
    
    previousGroupIdRef.current = groupId;
  }, [groupId, queryClient]);

  const query = useInfiniteQuery({
    queryKey: ['group-messages', groupId],
    queryFn: async ({ pageParam = 0 }) => {
      const limit = pageParam === 0 ? FIRST_PAGE_SIZE : SUBSEQUENT_PAGE_SIZE;
      const result = await getGroupMessages(supabase, groupId, pageParam, limit);

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
    staleTime: 1000 * 60 * 15,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
    structuralSharing: false, // Disable for faster optimistic updates
  });

  const addMessageToCache = useCallback((newMessage: GroupMessage) => {
    queryClient.setQueryData(
      ['group-messages', groupId],
      (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
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
                  sender: msg.sender || newMessage.sender, // Keep sender info
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
  }, [queryClient, groupId]);

  const updateMessageInCache = useCallback((messageId: string, updates: Partial<GroupMessage>) => {
    queryClient.setQueryData(
      ['group-messages', groupId],
      (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
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
        
        return found ? { ...oldData, pages: newPages } : oldData;
      }
    );
  }, [queryClient, groupId]);

  const removeMessageFromCache = useCallback((messageId: string) => {
    queryClient.setQueryData(
      ['group-messages', groupId],
      (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
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
  }, [queryClient, groupId]);

  return {
    ...query,
    addMessageToCache,
    updateMessageInCache,
    removeMessageFromCache,
  };
}
