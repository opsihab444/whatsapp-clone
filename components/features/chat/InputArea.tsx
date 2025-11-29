'use client';

import React, { useState, useRef, useEffect, KeyboardEvent, useCallback, useMemo } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Send, Smile, Mic, Image as ImageIcon, X, Loader2, Reply } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { showInfoToast, showErrorToast } from '@/lib/toast.utils';
import { addToQueue } from '@/lib/offline-queue';
import { Message } from '@/types';
import Image from 'next/image';
import { useUIStore } from '@/store/ui.store';

interface InputAreaProps {
  conversationId: string;
  currentUserId?: string;
  currentUserName?: string;
  isBlocked?: boolean;
  amIBlocked?: boolean;
  otherUserName?: string;
}

function InputAreaComponent({ conversationId, currentUserId, currentUserName, isBlocked, amIBlocked, otherUserName }: InputAreaProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  // Memoize Supabase client to prevent recreation on every render
  const supabase = useMemo(() => createClient(), []);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  
  // Reply state from UI store
  const replyTo = useUIStore((state) => state.replyTo);
  const setReplyTo = useUIStore((state) => state.setReplyTo);

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

  // Handle image selection
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      showErrorToast('Please select an image file');
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      showErrorToast('Image size must be less than 10MB');
      return;
    }

    setSelectedImage(file);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Clear selected image
  const clearSelectedImage = useCallback(() => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedImage(null);
    setImagePreview(null);
  }, [imagePreview]);

  // Direct browser-to-Cloudinary upload with XHR (faster than fetch for uploads)
  const uploadImageToCDN = useCallback(async (file: File): Promise<string | null> => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      console.error('Cloudinary config missing');
      return null;
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();

      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);
      formData.append('folder', 'chat-images');

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, true);

      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          // Add optimization params for CDN delivery
          const optimizedUrl = data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/');
          resolve(optimizedUrl);
        } else {
          console.error('Upload failed:', xhr.status);
          resolve(null);
        }
      };

      xhr.onerror = () => {
        console.error('Upload error');
        resolve(null);
      };

      xhr.send(formData);
    });
  }, []);

  // Get image dimensions from blob URL
  const getImageDimensions = useCallback((url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        // Calculate display dimensions (max 300px, maintain aspect ratio)
        const maxSize = 300;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height / width) * maxSize);
            width = maxSize;
          } else {
            width = Math.round((width / height) * maxSize);
            height = maxSize;
          }
        }
        resolve({ width, height });
      };
      img.onerror = () => resolve({ width: 200, height: 200 }); // fallback
      img.src = url;
    });
  }, []);

  // Send image message - ULTRA FAST with fire-and-forget pattern
  const sendImageMessage = useCallback(async () => {
    if (!currentUserId || !selectedImage || !imagePreview) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = new Date().toISOString();
    const currentPreviewUrl = imagePreview;
    const currentFile = selectedImage;
    const replyToId = replyTo?.id || null;

    // Build reply_to object BEFORE clearing (so reply shows instantly)
    const replyToData = replyTo ? {
      id: replyTo.id,
      content: replyTo.content,
      sender_id: replyTo.senderId, // Original message sender's ID
      type: replyTo.mediaUrl ? 'image' as const : 'text' as const,
      media_url: replyTo.mediaUrl || null,
    } : null;

    // Clear reply state immediately
    if (replyTo) {
      setReplyTo(null);
    }

    // Get image dimensions BEFORE showing (instant from blob)
    const dimensions = await getImageDimensions(currentPreviewUrl);

    // 1. INSTANT UI UPDATE - user sees image immediately with correct dimensions
    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: currentUserId,
      content: null,
      type: 'image',
      media_url: currentPreviewUrl,
      media_width: dimensions.width,
      media_height: dimensions.height,
      status: 'sending',
      is_edited: false,
      is_deleted: false,
      created_at: timestamp,
      updated_at: timestamp,
      reply_to_id: replyToId,
      reply_to: replyToData,
    };

    queryClient.setQueryData(['messages', conversationId], (old: any) => {
      if (!old) return { pages: [[optimisticMessage]], pageParams: [0] };
      return {
        ...old,
        pages: old.pages.map((page: any[], index: number) =>
          index === 0 ? [optimisticMessage, ...page] : page
        ),
      };
    });

    // Update conversation list instantly
    queryClient.setQueryData(['conversations'], (old: any) => {
      if (!old) return old;
      const updated = old.map((conv: any) =>
        conv.id === conversationId
          ? { ...conv, last_message_content: '📷 Photo', last_message_time: timestamp, last_message_sender_id: currentUserId }
          : conv
      );
      return updated.sort((a: any, b: any) =>
        (b.last_message_time ? new Date(b.last_message_time).getTime() : 0) -
        (a.last_message_time ? new Date(a.last_message_time).getTime() : 0)
      );
    });

    // 2. CLEAR INPUT IMMEDIATELY - user can select another image
    setSelectedImage(null);
    setImagePreview(null);
    setIsUploadingImage(true);

    // 3. BACKGROUND UPLOAD - don't block UI
    const cdnUrl = await uploadImageToCDN(currentFile);

    if (!cdnUrl) {
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page: any[]) =>
            page.map((msg: any) => msg.id === tempId ? { ...msg, status: 'failed' } : msg)
          ),
        };
      });
      showErrorToast('Failed to upload image');
      setIsUploadingImage(false);
      return;
    }

    // 4. FIRE-AND-FORGET database save - don't await, update UI immediately
    setIsUploadingImage(false);

    // Update UI to show sent (before DB confirms)
    queryClient.setQueryData(['messages', conversationId], (old: any) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page: any[]) =>
          page.map((msg: any) =>
            msg.id === tempId
              ? { ...msg, media_url: cdnUrl, status: 'sent', _blobUrl: currentPreviewUrl }
              : msg
          )
        ),
      };
    });

    // Database operations in background (non-blocking)
    supabase
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: null,
        type: 'image',
        media_url: cdnUrl,
        media_width: dimensions.width,
        media_height: dimensions.height,
        status: 'sent',
        reply_to_id: replyToId,
      })
      .select()
      .single()
      .then(({ data: savedMessage, error }) => {
        if (error) {
          console.error('Message save failed:', error);
          return;
        }
        // Update with real ID from database (preserve reply_to)
        queryClient.setQueryData(['messages', conversationId], (old: any) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page: any[]) =>
              page.map((msg: any) =>
                msg.id === tempId 
                  ? { ...savedMessage, _blobUrl: currentPreviewUrl, reply_to: msg.reply_to } 
                  : msg
              )
            ),
          };
        });

        // Update conversation in database (fire-and-forget)
        supabase
          .from('conversations')
          .update({
            last_message_content: '📷 Photo',
            last_message_time: savedMessage.created_at,
            last_message_sender_id: currentUserId,
          })
          .eq('id', conversationId);
      });
  }, [conversationId, currentUserId, selectedImage, imagePreview, queryClient, supabase, uploadImageToCDN, replyTo, setReplyTo, getImageDimensions]);

  // Send message - optimistic UI + database insert
  // Using only Postgres Realtime for message delivery (no WebSocket broadcast)
  const sendMessage = useCallback(async (
    content: string, 
    replyToId?: string | null,
    replyToInfo?: { id: string; content: string; senderName: string; senderId: string; mediaUrl?: string | null } | null
  ) => {
    if (!currentUserId) return;

    const trimmedContent = content.trim();
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = new Date().toISOString();

    // Build reply_to object for optimistic UI (so reply shows instantly)
    const replyToData = replyToInfo ? {
      id: replyToInfo.id,
      content: replyToInfo.content,
      sender_id: replyToInfo.senderId, // Original message sender's ID
      type: replyToInfo.mediaUrl ? 'image' as const : 'text' as const,
      media_url: replyToInfo.mediaUrl || null,
    } : null;

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
      reply_to_id: replyToId || null,
      reply_to: replyToData,
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

    // 3. IMMEDIATELY return - user doesn't wait!
    setIsSending(false);
    textareaRef.current?.focus();

    // 4. Save to database - Postgres realtime will notify receiver
    try {
      const { data: savedMessage, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: currentUserId,
          content: trimmedContent,
          type: 'text',
          status: 'sent',
          reply_to_id: replyToId || null,
        })
        .select()
        .single();

      if (error) {
        // Update UI to show failed
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
        console.error('Message save failed:', error);
        return;
      }

      // Replace temp message with real one (keep original timestamp and reply_to)
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
                  created_at: msg.created_at,
                  updated_at: msg.updated_at,
                  reply_to: msg.reply_to, // Preserve optimistic reply_to data
                }
                : msg
            )
          ),
        };
      });

      // Update conversation in database
      supabase
        .from('conversations')
        .update({
          last_message_content: trimmedContent,
          last_message_time: savedMessage.created_at,
          last_message_sender_id: currentUserId,
        })
        .eq('id', conversationId);
    } catch (err) {
      console.error('Message send error:', err);
    }
  }, [conversationId, currentUserId, queryClient, supabase]);

  const handleSend = () => {
    // If image is selected, send image
    if (selectedImage && !isUploadingImage) {
      sendImageMessage();
      return;
    }

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
    
    // Get reply info before clearing
    const replyToId = replyTo?.id || null;
    const replyToInfo = replyTo ? { ...replyTo } : null;
    
    // Clear reply state
    if (replyTo) {
      setReplyTo(null);
    }

    // Set sending state and send message with reply info
    setIsSending(true);
    sendMessage(trimmedMessage, replyToId, replyToInfo);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Show blocked message instead of input
  if (isBlocked || amIBlocked) {
    return (
      <div className="px-4 py-4 z-20 min-h-[80px] flex items-center justify-center bg-transparent">
        <div className="text-center text-muted-foreground text-sm px-4 py-3 bg-secondary/50 rounded-xl">
          {isBlocked 
            ? `You blocked ${otherUserName || 'this user'}. Unblock to send messages.`
            : `You can't send messages to ${otherUserName || 'this user'}.`
          }
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 z-20 min-h-[80px] flex flex-col bg-transparent" role="form" aria-label="Message input">
      {/* Reply Preview */}
      {replyTo && (
        <div className="flex items-center gap-2 mb-2 px-2 max-w-4xl mx-auto w-full">
          <div className="flex-1 flex items-center gap-3 bg-secondary/50 rounded-xl px-3 py-2 border-l-4 border-primary">
            <Reply className="h-4 w-4 text-primary shrink-0" />
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-primary truncate">
                  {replyTo.senderName}
                </p>
                {/* Show text content only if not an image */}
                {!replyTo.mediaUrl && (
                  <p className="text-sm text-muted-foreground truncate">
                    {replyTo.content}
                  </p>
                )}
              </div>
              {/* Image thumbnail for image replies */}
              {replyTo.mediaUrl && (
                <img
                  src={replyTo.mediaUrl}
                  alt="Reply image"
                  className="h-10 w-10 rounded object-cover shrink-0"
                />
              )}
            </div>
            <button
              onClick={() => setReplyTo(null)}
              className="p-1 hover:bg-muted rounded-full transition-colors shrink-0"
              aria-label="Cancel reply"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Image Preview */}
      {imagePreview && (
        <div className="flex items-center gap-2 mb-2 px-2 max-w-4xl mx-auto w-full">
          <div className="relative inline-block">
            <Image
              src={imagePreview}
              alt="Selected image"
              width={80}
              height={80}
              className="rounded-lg object-cover"
              style={{ maxHeight: '80px', width: 'auto' }}
            />
            <button
              onClick={clearSelectedImage}
              className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1 transition-colors"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
            {isUploadingImage && (
              <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              </div>
            )}
          </div>
          <span className="text-sm text-muted-foreground">
            {isUploadingImage ? 'Uploading...' : 'Ready to send'}
          </span>
        </div>
      )}

      <div className="flex items-end gap-2 w-full max-w-4xl mx-auto bg-background/80 backdrop-blur-xl p-2 rounded-2xl shadow-lg border border-border/50">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          className="hidden"
          aria-label="Select image"
        />

        {/* Image Button - Outside input */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2 mb-1 text-muted-foreground hover:text-foreground transition-colors outline-none focus:outline-none"
          aria-label="Attach image"
        >
          <ImageIcon className="h-6 w-6" />
        </button>

        {/* Input Field Container - WhatsApp Style with icons inside */}
        <div className="flex-1 flex items-end bg-secondary/50 hover:bg-secondary/80 transition-colors rounded-xl px-3 py-2 outline-none border border-transparent focus-within:border-primary/30 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/10">
          {/* Emoji Button - Inside input */}
          <button className="p-1 mr-2 text-muted-foreground hover:text-foreground transition-colors outline-none focus:outline-none">
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
            className="flex-1 min-h-[24px] max-h-[120px] resize-none border-0 bg-transparent px-0 py-1 focus:ring-0 focus:border-0 focus-visible:ring-0 placeholder:text-muted-foreground leading-6 text-[15px] text-foreground outline-none"
            rows={1}
            aria-label="Message input"
          />
        </div>

        {/* Mic/Send Button - Outside input */}
        {message.trim() || selectedImage ? (
          <button
            onClick={handleSend}
            disabled={isUploadingImage}
            className="mb-1 p-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 outline-none focus:outline-none flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            aria-label="Send message"
          >
            {isUploadingImage ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5 fill-current" />
            )}
          </button>
        ) : (
          <button className="mb-1 p-2.5 text-muted-foreground hover:bg-muted rounded-xl transition-colors outline-none focus:outline-none flex items-center justify-center">
            <Mic className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}

// Memoize component with custom comparison to prevent unnecessary re-renders
export const InputArea = React.memo(InputAreaComponent, (prevProps, nextProps) => {
  // Only re-render if these specific properties change
  return (
    prevProps.conversationId === nextProps.conversationId &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.currentUserName === nextProps.currentUserName &&
    prevProps.isBlocked === nextProps.isBlocked &&
    prevProps.amIBlocked === nextProps.amIBlocked &&
    prevProps.otherUserName === nextProps.otherUserName
  );
});

InputArea.displayName = 'InputArea';
