'use client';

import { useEffect, useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { sendMessage } from '@/services/message.service';
import {
  getQueue,
  removeFromQueue,
  incrementRetryCount,
  hasQueuedMessages
} from '@/lib/offline-queue';
import { showInfoToast, showErrorToast } from '@/lib/toast.utils';

/**
 * Hook to manage offline message queue
 * Automatically retries queued messages when connection is restored
 */
export function useOfflineQueue() {
  const queryClient = useQueryClient();
  // Memoize Supabase client to prevent recreation on every render
  const supabase = useMemo(() => createClient(), []);

  /**
   * Process all queued messages
   */
  const processQueue = useCallback(async () => {
    const queue = getQueue();

    if (queue.length === 0) {
      return;
    }

    console.log(`Processing ${queue.length} queued messages...`);

    let successCount = 0;
    let failureCount = 0;

    // Process messages sequentially to avoid overwhelming the server
    for (const queuedMessage of queue) {
      try {
        const result = await sendMessage(supabase, {
          conversation_id: queuedMessage.conversationId,
          content: queuedMessage.content,
          type: 'text',
        });

        if (result.success) {
          // Remove from queue on success
          removeFromQueue(queuedMessage.id);
          successCount++;

          // Update the cache: replace queued message with real message
          queryClient.setQueryData(
            ['messages', queuedMessage.conversationId],
            (old: any) => {
              if (!old) return old;

              return {
                ...old,
                pages: old.pages.map((page: any[]) =>
                  page.map((msg: any) =>
                    msg.id === queuedMessage.id ? result.data : msg
                  )
                ),
              };
            }
          );

          // Optimistically update conversations list to prevent jumping
          queryClient.setQueryData(['conversations'], (old: any) => {
            if (!old) return old;

            // Update the conversation with new last message info
            const updated = old.map((conv: any) =>
              conv.id === queuedMessage.conversationId
                ? {
                  ...conv,
                  last_message_content: result.data.content,
                  last_message_time: result.data.created_at,
                }
                : conv
            );

            // Sort by last_message_time DESC (most recent first)
            return updated.sort((a: any, b: any) => {
              const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
              const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
              return timeB - timeA;
            });
          });
        } else {
          // Increment retry count or remove if max retries reached
          const shouldRetry = incrementRetryCount(queuedMessage.id);
          if (!shouldRetry) {
            failureCount++;
            console.error(
              `Message ${queuedMessage.id} failed after max retries:`,
              result.error
            );

            // Remove failed message from cache
            queryClient.setQueryData(
              ['messages', queuedMessage.conversationId],
              (old: any) => {
                if (!old) return old;

                return {
                  ...old,
                  pages: old.pages.map((page: any[]) =>
                    page.filter((msg: any) => msg.id !== queuedMessage.id)
                  ),
                };
              }
            );
          }
        }
      } catch (error) {
        // Increment retry count or remove if max retries reached
        const shouldRetry = incrementRetryCount(queuedMessage.id);
        if (!shouldRetry) {
          failureCount++;
          console.error(
            `Message ${queuedMessage.id} failed after max retries:`,
            error
          );

          // Remove failed message from cache
          queryClient.setQueryData(
            ['messages', queuedMessage.conversationId],
            (old: any) => {
              if (!old) return old;

              return {
                ...old,
                pages: old.pages.map((page: any[]) =>
                  page.filter((msg: any) => msg.id !== queuedMessage.id)
                ),
              };
            }
          );
        }
      }
    }

    // Show notification about results
    if (successCount > 0) {
      showInfoToast(
        `${successCount} queued message${successCount > 1 ? 's' : ''} sent successfully`
      );
    }

    if (failureCount > 0) {
      showErrorToast(
        `${failureCount} message${failureCount > 1 ? 's' : ''} failed to send after multiple retries`
      );
    }
  }, [queryClient, supabase]);

  /**
   * Listen for online/offline events and process queue when online
   */
  useEffect(() => {
    const handleOnline = () => {
      // Check if there are queued messages before processing
      if (hasQueuedMessages()) {
        console.log('Connection restored, processing offline queue...');
        // Add a small delay to ensure connection is stable
        setTimeout(() => {
          processQueue();
        }, 1000);
      }
    };

    // Process queue on mount if online and has queued messages
    if (navigator.onLine && hasQueuedMessages()) {
      processQueue();
    }

    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [processQueue]);

  return {
    processQueue,
  };
}
