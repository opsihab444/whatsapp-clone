'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo, KeyboardEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Send, Smile, Mic, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { showErrorToast } from '@/lib/toast.utils';
import { sendGroupMessage } from '@/services/group.service';
import { GroupMessage } from '@/types';
import Image from 'next/image';

interface GroupInputAreaProps {
  groupId: string;
  currentUserId?: string;
  currentUserName?: string | null;
  currentUserEmail?: string | null;
  currentUserAvatar?: string | null;
}

function GroupInputAreaComponent({
  groupId,
  currentUserId,
  currentUserName,
  currentUserEmail,
  currentUserAvatar,
}: GroupInputAreaProps) {
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const supabase = useMemo(() => createClient(), []);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscribe to typing channel
  useEffect(() => {
    const channel = supabase.channel(`group-typing:${groupId}`);
    channel.subscribe();
    typingChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      typingChannelRef.current = null;
    };
  }, [groupId, supabase]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [message]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const broadcastTyping = useCallback(() => {
    if (!currentUserId || !typingChannelRef.current) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: { userId: currentUserId, userName: currentUserName || currentUserEmail, userAvatar: currentUserAvatar },
      });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      typingChannelRef.current?.send({ type: 'broadcast', event: 'stopTyping', payload: { userId: currentUserId } });
    }, 1500);
  }, [currentUserId, currentUserName, currentUserEmail, currentUserAvatar]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showErrorToast('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { showErrorToast('Image size must be less than 10MB'); return; }
    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const clearSelectedImage = useCallback(() => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setSelectedImage(null);
    setImagePreview(null);
  }, [imagePreview]);

  const uploadImageToCDN = useCallback(async (file: File): Promise<string | null> => {
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    if (!cloudName || !uploadPreset) return null;
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
          resolve(data.secure_url.replace('/upload/', '/upload/f_auto,q_auto/'));
        } else resolve(null);
      };
      xhr.onerror = () => resolve(null);
      xhr.send(formData);
    });
  }, []);

  const getImageDimensions = useCallback((url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
        const maxSize = 300;
        let w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round((h / w) * maxSize); w = maxSize; }
          else { w = Math.round((w / h) * maxSize); h = maxSize; }
        }
        resolve({ width: w, height: h });
      };
      img.onerror = () => resolve({ width: 200, height: 200 });
      img.src = url;
    });
  }, []);


  const sendImageMessage = useCallback(async () => {
    if (!currentUserId || !selectedImage || !imagePreview) return;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = new Date().toISOString();
    const currentPreviewUrl = imagePreview;
    const currentFile = selectedImage;
    const dimensions = await getImageDimensions(currentPreviewUrl);

    const optimisticMessage: GroupMessage = {
      id: tempId, group_id: groupId, sender_id: currentUserId, content: null, type: 'image',
      media_url: currentPreviewUrl, media_width: dimensions.width, media_height: dimensions.height,
      status: 'sending', is_edited: false, is_deleted: false, created_at: timestamp, updated_at: timestamp,
      sender: { id: currentUserId, email: currentUserEmail || '', full_name: currentUserName ?? null, avatar_url: currentUserAvatar ?? null, created_at: timestamp },
    };

    queryClient.setQueryData(['group-messages', groupId], (old: any) => {
      if (!old?.pages?.length) return { pages: [[optimisticMessage]], pageParams: [0] };
      const newPages = [...old.pages];
      newPages[0] = [optimisticMessage, ...newPages[0]];
      return { ...old, pages: newPages };
    });

    setSelectedImage(null);
    setImagePreview(null);
    setIsUploadingImage(true);

    const cdnUrl = await uploadImageToCDN(currentFile);
    if (!cdnUrl) {
      queryClient.setQueryData(['group-messages', groupId], (old: any) => {
        if (!old?.pages) return old;
        return { ...old, pages: old.pages.map((p: any[]) => p.map((m: any) => m.id === tempId ? { ...m, status: 'failed' } : m)) };
      });
      showErrorToast('Failed to upload image');
      setIsUploadingImage(false);
      return;
    }

    const result = await sendGroupMessage(supabase, groupId, null, 'image', cdnUrl, tempId,
      { full_name: currentUserName, avatar_url: currentUserAvatar }, dimensions.width, dimensions.height);

    if (result.success) {
      queryClient.setQueryData(['group-messages', groupId], (old: any) => {
        if (!old?.pages) return old;
        return { ...old, pages: old.pages.map((p: any[]) => p.map((m: any) =>
          m.id === tempId ? { ...m, id: result.data.id, media_url: cdnUrl, status: 'sent', _blobUrl: currentPreviewUrl } : m)) };
      });
      queryClient.setQueryData(['groups'], (old: any) => {
        if (!old) return old;
        return old.map((g: any) => g.id === groupId || g.group?.id === groupId
          ? { ...g, last_message_content: '📷 Photo', last_message_time: timestamp, last_message_sender_id: currentUserId, last_message_sender_name: currentUserName }
          : g
        ).sort((a: any, b: any) => (b.last_message_time ? new Date(b.last_message_time).getTime() : 0) - (a.last_message_time ? new Date(a.last_message_time).getTime() : 0));
      });
    } else {
      queryClient.setQueryData(['group-messages', groupId], (old: any) => {
        if (!old?.pages) return old;
        return { ...old, pages: old.pages.map((p: any[]) => p.filter((m: any) => m.id !== tempId)) };
      });
    }
    setIsUploadingImage(false);
  }, [currentUserId, currentUserName, currentUserEmail, currentUserAvatar, selectedImage, imagePreview, groupId, queryClient, supabase, uploadImageToCDN, getImageDimensions]);

  const handleSend = useCallback(() => {
    if (selectedImage && !isUploadingImage) { sendImageMessage(); return; }
    if (!message.trim() || !currentUserId) return;

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (isTypingRef.current && typingChannelRef.current) {
      isTypingRef.current = false;
      typingChannelRef.current.send({ type: 'broadcast', event: 'stopTyping', payload: { userId: currentUserId } });
    }

    const content = message.trim();
    setMessage('');
    const tempId = `temp-${Date.now()}`;
    const timestamp = new Date().toISOString();

    const optimisticMessage: GroupMessage = {
      id: tempId, group_id: groupId, sender_id: currentUserId, content, type: 'text',
      media_url: null, media_width: null, media_height: null, status: 'sending',
      is_edited: false, is_deleted: false, created_at: timestamp, updated_at: timestamp,
      sender: { id: currentUserId, email: currentUserEmail || '', full_name: currentUserName ?? null, avatar_url: currentUserAvatar ?? null, created_at: timestamp },
    };

    queryClient.setQueryData(['group-messages', groupId], (old: any) => {
      if (!old?.pages?.length) return { pages: [[optimisticMessage]], pageParams: [0] };
      const newPages = [...old.pages];
      newPages[0] = [optimisticMessage, ...newPages[0]];
      return { ...old, pages: newPages };
    });

    queryClient.setQueryData(['groups'], (old: any) => {
      if (!old) return old;
      return old.map((g: any) => g.id === groupId || g.group?.id === groupId
        ? { ...g, last_message_content: content, last_message_time: timestamp, last_message_sender_id: currentUserId, last_message_sender_name: currentUserName }
        : g
      ).sort((a: any, b: any) => (b.last_message_time ? new Date(b.last_message_time).getTime() : 0) - (a.last_message_time ? new Date(a.last_message_time).getTime() : 0));
    });

    sendGroupMessage(supabase, groupId, content, 'text', undefined, tempId, { full_name: currentUserName, avatar_url: currentUserAvatar }).then((result) => {
      if (result.success) {
        queryClient.setQueryData(['group-messages', groupId], (old: any) => {
          if (!old?.pages) return old;
          return { ...old, pages: old.pages.map((p: any[]) => p.map((m: any) => m.id === tempId ? { ...m, id: result.data.id, status: 'sent' } : m)) };
        });
      } else {
        queryClient.setQueryData(['group-messages', groupId], (old: any) => {
          if (!old?.pages) return old;
          return { ...old, pages: old.pages.map((p: any[]) => p.filter((m: any) => m.id !== tempId)) };
        });
      }
    });
  }, [message, selectedImage, isUploadingImage, currentUserId, currentUserName, currentUserEmail, currentUserAvatar, groupId, queryClient, supabase, sendImageMessage]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="px-4 py-4 z-20 min-h-[80px] flex flex-col bg-transparent" role="form" aria-label="Message input">
      {imagePreview && (
        <div className="flex items-center gap-2 mb-2 px-2 max-w-4xl mx-auto w-full">
          <div className="relative inline-block">
            <Image src={imagePreview} alt="Selected" width={80} height={80} className="rounded-lg object-cover" style={{ maxHeight: '80px', width: 'auto' }} />
            <button onClick={clearSelectedImage} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1" aria-label="Remove image"><X className="h-3 w-3" /></button>
            {isUploadingImage && <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center"><Loader2 className="h-6 w-6 text-white animate-spin" /></div>}
          </div>
          <span className="text-sm text-muted-foreground">{isUploadingImage ? 'Uploading...' : 'Ready to send'}</span>
        </div>
      )}
      <div className="flex items-end gap-2 w-full max-w-4xl mx-auto bg-background/80 backdrop-blur-xl p-2 rounded-2xl shadow-lg border border-border/50">
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
        <button onClick={() => fileInputRef.current?.click()} className="p-2 mb-1 text-muted-foreground hover:text-foreground transition-colors"><ImageIcon className="h-6 w-6" /></button>
        <div className="flex-1 flex items-end bg-secondary/50 hover:bg-secondary/80 transition-colors rounded-xl px-3 py-2 border border-transparent focus-within:border-primary/30 focus-within:bg-background focus-within:ring-2 focus-within:ring-primary/10">
          <button className="p-1 mr-2 text-muted-foreground hover:text-foreground"><Smile className="h-6 w-6" /></button>
          <Textarea ref={textareaRef} value={message} onChange={(e) => { setMessage(e.target.value); if (e.target.value.trim()) broadcastTyping(); }} onKeyDown={handleKeyDown}
            placeholder="Type a message" className="flex-1 min-h-[24px] max-h-[120px] resize-none border-0 bg-transparent px-0 py-1 focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground leading-6 text-[15px] outline-none" rows={1} />
        </div>
        {message.trim() || selectedImage ? (
          <button onClick={handleSend} disabled={isUploadingImage} className="mb-1 p-2.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-md hover:shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100">
            {isUploadingImage ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5 fill-current" />}
          </button>
        ) : (
          <button className="mb-1 p-2.5 text-muted-foreground hover:bg-muted rounded-xl"><Mic className="h-6 w-6" /></button>
        )}
      </div>
    </div>
  );
}

export const GroupInputArea = React.memo(GroupInputAreaComponent, (prev, next) => (
  prev.groupId === next.groupId && prev.currentUserId === next.currentUserId &&
  prev.currentUserName === next.currentUserName && prev.currentUserAvatar === next.currentUserAvatar
));

GroupInputArea.displayName = 'GroupInputArea';
