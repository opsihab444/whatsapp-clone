'use client';

import { useState, useRef, useEffect, KeyboardEvent, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Plus, Smile, Mic } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { showErrorWithRetry, showInfoToast } from '@/lib/toast.utils';
import { addToQueue } from '@/lib/offline-queue';
import { Message } from '@/types';

interface InputAreaProps {
  conversationId: string;
  currentUserId?: string;
  currentUserName?: string;
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

    // Stop broadcasting after 1.5 seconds of inactivity and send stop event
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      // Send stop typing event to receiver
      supabase.channel(`typing:${conversationId}`).send({
        type: 'broadcast',
        event: 'stopTyping',
        payload: { userId: currentUserId },
      });
    }, 1500);
  }, [conversationId, currentUserId, currentUserName, supabase]);

  // Stop broadcasting typing on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  // WebSocket-based message sending (like Messenger/WhatsApp)
  // No POST request - uses persistent WebSocket connection
  const sendMessageViaWebSocket = useCallback(async (content: string) => {
    // This function is only called after currentUserId check in handleSend
    if (!currentUserId) return;
    
    const trimmedContent = content.trim();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = new Date().toISOString();

    // Create optimistic message
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: trimmedContent,
      type: 'text',
      media_url: null,
      media_width: null,
      media_height: null,
      status: 'sending',
      is_edited: false,
      is_deleted: false,
      created_at: timestamp,
      updated_at: timestamp,
    };

    // 1. Instantly add to local cache (UI updates immediately)
    queryClient.setQueryData(['messages', conversationId], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any[], index: number) =>
          index === 0 ? [optimisticMessage, ...page] : page
        ),
      };
    });

    // 2. Update conversations list instantly
    queryClient.setQueryData(['conversations'], (old: any) => {
      if (!old) return old;
      const updated = old.map((conv: any) =>
        conv.id === conversationId
          ? {
            ...conv,
            last_message_content: trimmedContent,
            last_message_time: timestamp,
            last_message_sender_id: currentUserId,
          }
          : conv
      );
      return updated.sort((a: any, b: any) => {
        const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
        const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
        return timeB - timeA;
      });
    });

    // 3. Send via WebSocket broadcast (instant delivery to other user)
    // This is the "magic" - just WebSocket frame, no waiting!
    const messageChannel = supabase.channel(`chat:${conversationId}`);
    messageChannel.subscribe();

    messageChannel.send({
      type: 'broadcast',
      event: 'new_message',
      payload: {
        tempId,
        content: trimmedContent,
        senderId: currentUserId,
        senderName: currentUserName,
        timestamp,
      },
    });

    // 4. IMMEDIATELY return - user doesn't wait for anything!
    setIsSending(false);
    textareaRef.current?.focus();

    // 5. Fire-and-forget: Database save happens completely in background
    // This runs AFTER the function returns - true async!
    (async () => {
      try {
        const { data: savedMessage, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: currentUserId,
            content: trimmedContent,
            type: 'text',
            status: 'sent',
          })
          .select()
          .single();

        if (error) {
          // Silent rollback - update UI to show failed
          queryClient.setQueryData(['messages', conversationId], (old: any) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page: any[]) =>
                page.map((msg: any) =>
                  msg.id === tempId ? { ...msg, status: 'failed' } : msg
                )
              ),
            };
          });
          console.error('Background save failed:', error);
          return;
        }

        // Replace temp message with real one (keep original timestamp to prevent jump!)
        queryClient.setQueryData(['messages', conversationId], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any[]) =>
              page.map((msg: any) =>
                msg.id === tempId
                  ? {
                    ...savedMessage,
                    status: 'sent',
                    // Keep the original client timestamp to prevent time jump
                    created_at: msg.created_at,
                    updated_at: msg.updated_at,
                  }
                  : msg
              )
            ),
          };
        });

        // Update conversation's last message in database (fire-and-forget)
        // Note: We keep the original client timestamp in the UI cache to prevent time jump
        supabase
          .from('conversations')
          .update({
            last_message_content: trimmedContent,
            last_message_time: savedMessage.created_at,
            last_message_sender_id: currentUserId,
          })
          .eq('id', conversationId);
      } catch (err) {
        console.error('Background save error:', err);
      }
    })();
  }, [conversationId, currentUserId, currentUserName, queryClient, supabase]);

  const handleSend = () => {
    const trimmedMessage = message.trim();

    // Don't send if no message, already sending, or user not loaded yet
    if (!trimmedMessage || isSending || !currentUserId) {
      return;
    }

    // Stop broadcasting typing immediately on send
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isTypingRef.current) {
      isTypingRef.current = false;
      // Send stop typing event immediately
      supabase.channel(`typing:${conversationId}`).send({
        type: 'broadcast',
        event: 'stopTyping',
        payload: { userId: currentUserId },
      });
    }

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

    // Set sending state and send message via WebSocket (no POST request!)
    setIsSending(true);
    sendMessageViaWebSocket(trimmedMessage);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="bg-[#0b1014] px-4 py-2 z-20 min-h-[56px] flex items-center" role="form" aria-label="Message input">
      <div className="flex items-center gap-3 w-full max-w-4xl mx-auto">
        {/* Input Field Container - WhatsApp Style with icons inside */}
        <div className="flex-1 flex items-center bg-[#202c33] rounded-[24px] pl-2 pr-4 py-1 outline-none">
          {/* Plus Button - Inside input */}
          <button className="p-2 text-[#8696a0] hover:text-[#aebac1] transition-colors outline-none focus:outline-none">
            <Plus className="h-6 w-6" />
          </button>

          {/* Emoji Button - Inside input */}
          <button className="p-2 text-[#8696a0] hover:text-[#aebac1] transition-colors outline-none focus:outline-none">
            <Smile className="h-6 w-6" />
          </button>

          {/* Text Input */}
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
            className="flex-1 min-h-[24px] max-h-[120px] resize-none border-0 bg-transparent px-2 py-1.5 focus:ring-0 focus:border-0 focus-visible:ring-0 placeholder:text-[#8696a0] leading-6 text-[15px] text-[#e9edef] outline-none"
            rows={1}
            aria-label="Message input"
          />
        </div>

        {/* Mic/Send Button - Outside input */}
        {message.trim() ? (
          <Button
            onClick={handleSend}
            size="icon"
            className="h-11 w-11 rounded-full shrink-0 bg-[#00a884] hover:bg-[#06cf9c] text-white shadow-md transition-all duration-200"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </Button>
        ) : (
          <button className="h-11 w-11 flex items-center justify-center text-[#8696a0] hover:text-[#aebac1] transition-colors outline-none focus:outline-none">
            <Mic className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}
