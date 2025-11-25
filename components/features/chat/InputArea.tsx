'use client';

import React, { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Plus, Smile, Mic } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { sendMessage } from '@/services/message.service';
import { createClient } from '@/lib/supabase/client';
import { showErrorWithRetry, showServiceError, showInfoToast } from '@/lib/toast.utils';
import { addToQueue } from '@/lib/offline-queue';

interface InputAreaProps {
  conversationId: string;
  currentUserId: string;
  currentUserName: string;
}

export function InputArea({ conversationId, currentUserId, currentUserName }: InputAreaProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();
  const supabase = createClient();
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);

  // Broadcast typing event (debounced)
  const broadcastTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      supabase.channel(`typing:${conversationId}`).send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, userName: currentUserName },
      });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop broadcasting after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
    }, 2000);
  }, [conversationId, currentUserId, currentUserName, supabase]);

  // Stop broadcasting typing on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // Send message mutation with optimistic updates
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const result = await sendMessage(supabase, {
        conversation_id: conversationId,
        content,
        type: 'text',
      });

      if (!result.success) {
        throw new Error(result.error.message);
      }

      return result.data;
    },
    onMutate: async (content: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });

      // Snapshot the previous value
      const previousMessages = queryClient.getQueryData(['messages', conversationId]);

      // Create optimistic message with temporary ID
      const optimisticMessage = {
        id: `temp-${Date.now()}`,
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: content.trim(),
        type: 'text' as const,
        media_url: null,
        media_width: null,
        media_height: null,
        status: 'sending' as any, // Temporary status
        is_edited: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistically update the cache
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page: any[], index: number) =>
            // Add to the first page (newest messages)
            index === 0 ? [optimisticMessage, ...page] : page
          ),
        };
      });

      // Return context with previous data for rollback
      return { previousMessages };
    },
    onSuccess: (data) => {
      // Replace optimistic message with real message from server
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;

        // Remove temp message and add real message if not already present
        const updatedPages = old.pages.map((page: any[]) => {
          // Filter out temp messages
          const withoutTemp = page.filter((msg: any) => !msg.id.startsWith('temp-'));

          // Check if real message already exists
          const realMessageExists = withoutTemp.some((msg: any) => msg.id === data.id);

          // If real message doesn't exist, add it at the beginning
          if (!realMessageExists && page === old.pages[0]) {
            return [data, ...withoutTemp];
          }

          return withoutTemp;
        });

        return {
          ...old,
          pages: updatedPages,
        };
      });


      // Re-enable input and maintain focus
      setIsSending(false);
      textareaRef.current?.focus();

      // Optimistically update conversations list to prevent jumping
      queryClient.setQueryData(['conversations'], (old: any) => {
        if (!old) return old;

        // Update the conversation with new last message info
        const updated = old.map((conv: any) =>
          conv.id === conversationId
            ? {
              ...conv,
              last_message_content: data.content,
              last_message_time: data.created_at,
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
    },
    onError: (error: Error, content, context) => {
      // Rollback to previous state on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['messages', conversationId], context.previousMessages);
      }

      setIsSending(false);

      // Restore the message content so user doesn't lose it
      setMessage(content);

      // Show error with retry option
      showErrorWithRetry(
        'Failed to send message. Please try again.',
        () => {
          setIsSending(true);
          sendMessageMutation.mutate(content);
        },
        'Retry'
      );
    },
  });

  const handleSend = () => {
    const trimmedMessage = message.trim();

    if (!trimmedMessage || isSending) {
      return;
    }

    // Stop broadcasting typing immediately on send
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    isTypingRef.current = false;

    // Check if user is offline
    if (!navigator.onLine) {
      // Add message to offline queue
      const queuedId = addToQueue(conversationId, trimmedMessage);

      // Create optimistic message for offline queue
      const optimisticMessage = {
        id: queuedId,
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: trimmedMessage,
        type: 'text' as const,
        media_url: null,
        media_width: null,
        media_height: null,
        status: 'queued' as any, // Special status for queued messages
        is_edited: false,
        is_deleted: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Add to cache immediately
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;

        return {
          ...old,
          pages: old.pages.map((page: any[], index: number) =>
            index === 0 ? [optimisticMessage, ...page] : page
          ),
        };
      });

      // Clear input
      setMessage('');
      textareaRef.current?.focus();

      // Show notification
      showInfoToast('Message queued. Will be sent when connection is restored.');

      return;
    }

    // Clear input immediately for better UX (optimistic)
    setMessage('');

    // Set sending state and send message
    setIsSending(true);
    sendMessageMutation.mutate(trimmedMessage);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-secondary px-4 py-2 border-t border-border z-20 min-h-[62px] flex items-end" role="form" aria-label="Message input">
      <div className="flex items-end gap-2 w-full max-w-4xl mx-auto">
        {/* Attach Button */}
        <div className="flex items-center gap-2 pb-2">
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground/60 hover:text-muted-foreground hover:bg-transparent shrink-0 transition-colors">
            <Smile className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground/60 hover:text-muted-foreground hover:bg-transparent shrink-0 transition-colors">
            <Plus className="h-6 w-6" />
          </Button>
        </div>

        <div className="flex-1 flex items-end gap-2 bg-input rounded-lg px-3 py-2 my-1.5 focus-within:bg-input/80 transition-all">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (e.target.value.trim()) {
                broadcastTyping();
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder="Type a message"
            className="min-h-[24px] max-h-[150px] w-full resize-none border-0 bg-transparent p-0 focus-visible:ring-0 placeholder:text-muted-foreground/60 leading-6 py-0.5 text-[15px] text-foreground"
            rows={1}
            aria-label="Message input"
          />
        </div>

        {/* Send/Mic Button */}
        <div className="pb-2 pl-1">
          {message.trim() ? (
            <Button
              onClick={handleSend}
              size="icon"
              className="h-10 w-10 rounded-full shrink-0 bg-transparent text-muted-foreground/60 hover:text-primary hover:bg-transparent shadow-none transition-all"
              aria-label="Send message"
            >
              <Send className="h-6 w-6" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground/60 hover:text-muted-foreground hover:bg-transparent shrink-0 transition-colors"
              aria-label="Voice message"
            >
              <Mic className="h-6 w-6" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
