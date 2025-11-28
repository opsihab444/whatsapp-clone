'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Send, Smile, Mic, Image as ImageIcon, X, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { createClient } from '@/lib/supabase/client';
import { sendGroupMessage, getGroupMembers } from '@/services/group.service';
import { GroupInfoPanel } from '@/components/features/group/GroupInfoPanel';
import { GroupMessageList } from '@/components/features/group/GroupMessageList';
import { EditGroupMessageModal } from '@/components/features/group/EditGroupMessageModal';
import { DeleteGroupMessageModal } from '@/components/features/group/DeleteGroupMessageModal';
import { useMarkGroupAsRead } from '@/hooks/useMarkGroupAsRead';
import { GroupConversation, GroupMessage } from '@/types';
import { showErrorToast } from '@/lib/toast.utils';
import Image from 'next/image';

interface GroupPanelProps {
  groupId: string;
}

export function GroupPanel({ groupId }: GroupPanelProps) {
  const { data: currentUser } = useCurrentUser();
  const [message, setMessage] = useState('');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();
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

  // Fetch group info from cache
  const { data: groups } = useQuery<GroupConversation[]>({ queryKey: ['groups'] });
  const group = useMemo(() => {
    if (!groups) return null;
    return groups.find((g) => g.id === groupId);
  }, [groups, groupId]);

  // Fetch members
  const { data: members = [] } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const result = await getGroupMembers(supabase, groupId);
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    staleTime: 1000 * 60 * 10,
  });

  // Mark group as read
  useMarkGroupAsRead(groupId);

  // Broadcast typing
  const broadcastTyping = useCallback(() => {
    if (!currentUser || !typingChannelRef.current) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: currentUser.id,
          userName: currentUser.name || currentUser.email,
          userAvatar: currentUser.avatar,
        },
      });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      typingChannelRef.current?.send({
        type: 'broadcast',
        event: 'stopTyping',
        payload: { userId: currentUser.id },
      });
    }, 1500);
  }, [currentUser]);

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

    if (!file.type.startsWith('image/')) {
      showErrorToast('Please select an image file');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showErrorToast('Image size must be less than 10MB');
      return;
    }

    setSelectedImage(file);
    setImagePreview(URL.createObjectURL(file));

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const clearSelectedImage = useCallback(() => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedImage(null);
    setImagePreview(null);
  }, [imagePreview]);

  // Upload image
  const uploadImageToCDN = useCallback(async (file: File): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      return data.url || null;
    } catch (error) {
      console.error('Image upload error:', error);
      return null;
    }
  }, []);

  const getImageDimensions = useCallback((url: string): Promise<{ width: number; height: number }> => {
    return new Promise((resolve) => {
      const img = new window.Image();
      img.onload = () => {
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
      img.onerror = () => resolve({ width: 200, height: 200 });
      img.src = url;
    });
  }, []);

  // Send image message
  const sendImageMessage = useCallback(async () => {
    if (!currentUser || !selectedImage || !imagePreview) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const timestamp = new Date().toISOString();
    const currentPreviewUrl = imagePreview;
    const currentFile = selectedImage;

    const dimensions = await getImageDimensions(currentPreviewUrl);

    const optimisticMessage: GroupMessage = {
      id: tempId,
      group_id: groupId,
      sender_id: currentUser.id,
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
      sender: {
        id: currentUser.id,
        email: currentUser.email || '',
        full_name: currentUser.name,
        avatar_url: currentUser.avatar,
        created_at: timestamp,
      },
    };

    queryClient.setQueryData(
      ['group-messages', groupId],
      (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
        if (!oldData?.pages?.length) {
          return { pages: [[optimisticMessage]], pageParams: [0] };
        }
        const newPages = [...oldData.pages];
        newPages[0] = [optimisticMessage, ...newPages[0]];
        return { ...oldData, pages: newPages };
      }
    );

    setSelectedImage(null);
    setImagePreview(null);
    setIsUploadingImage(true);

    const cdnUrl = await uploadImageToCDN(currentFile);

    if (!cdnUrl) {
      queryClient.setQueryData(
        ['group-messages', groupId],
        (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
          if (!oldData?.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) =>
              page.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg))
            ),
          };
        }
      );
      showErrorToast('Failed to upload image');
      setIsUploadingImage(false);
      return;
    }

    const result = await sendGroupMessage(
      supabase,
      groupId,
      null,
      'image',
      cdnUrl,
      tempId,
      { full_name: currentUser.name, avatar_url: currentUser.avatar },
      dimensions.width,
      dimensions.height
    );

    if (result.success) {
      queryClient.setQueryData(
        ['group-messages', groupId],
        (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
          if (!oldData?.pages) return oldData;
          return {
            ...oldData,
            pages: oldData.pages.map((page) =>
              page.map((msg) =>
                msg.id === tempId ? { ...msg, id: result.data.id, media_url: cdnUrl, status: 'sent' as const, _blobUrl: currentPreviewUrl } : msg
              )
            ),
          };
        }
      );

      // Don't revoke blob URL here - GroupImageMessageContent will handle it after CDN image loads

      queryClient.setQueryData(['groups'], (old: any) => {
        if (!old) return old;
        const updated = old.map((g: any) =>
          g.id === groupId || g.group?.id === groupId
            ? {
                ...g,
                last_message_content: '📷 Photo',
                last_message_time: timestamp,
                last_message_sender_id: currentUser.id,
                last_message_sender_name: currentUser.name,
              }
            : g
        );
        return updated.sort((a: any, b: any) => {
          const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
          const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
          return timeB - timeA;
        });
      });
    } else {
      queryClient.setQueryData(
        ['group-messages', groupId],
        (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
          if (!oldData?.pages) return oldData;
          return { ...oldData, pages: oldData.pages.map((page) => page.filter((msg) => msg.id !== tempId)) };
        }
      );
    }

    setIsUploadingImage(false);
  }, [currentUser, selectedImage, imagePreview, groupId, queryClient, supabase, uploadImageToCDN, getImageDimensions]);

  const handleSend = () => {
    if (selectedImage && !isUploadingImage) {
      sendImageMessage();
      return;
    }
    if (!message.trim() || !currentUser) return;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (isTypingRef.current && typingChannelRef.current) {
      isTypingRef.current = false;
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'stopTyping',
        payload: { userId: currentUser.id },
      });
    }

    const messageContent = message.trim();
    setMessage('');

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: GroupMessage = {
      id: tempId,
      group_id: groupId,
      sender_id: currentUser.id,
      content: messageContent,
      type: 'text',
      media_url: null,
      media_width: null,
      media_height: null,
      status: 'sending',
      is_edited: false,
      is_deleted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender: {
        id: currentUser.id,
        email: currentUser.email || '',
        full_name: currentUser.name,
        avatar_url: currentUser.avatar,
        created_at: new Date().toISOString(),
      },
    };

    queryClient.setQueryData(
      ['group-messages', groupId],
      (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
        if (!oldData?.pages?.length) {
          return { pages: [[optimisticMessage]], pageParams: [0] };
        }
        const newPages = [...oldData.pages];
        newPages[0] = [optimisticMessage, ...newPages[0]];
        return { ...oldData, pages: newPages };
      }
    );

    queryClient.setQueryData(['groups'], (old: any) => {
      if (!old) return old;
      const updated = old.map((g: any) =>
        g.id === groupId || g.group?.id === groupId
          ? {
              ...g,
              last_message_content: messageContent,
              last_message_time: optimisticMessage.created_at,
              last_message_sender_id: currentUser.id,
              last_message_sender_name: currentUser.name,
            }
          : g
      );
      return updated.sort((a: any, b: any) => {
        const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
        const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
        return timeB - timeA;
      });
    });

    sendGroupMessage(supabase, groupId, messageContent, 'text', undefined, tempId, {
      full_name: currentUser.name,
      avatar_url: currentUser.avatar,
    }).then((result) => {
      if (result.success) {
        queryClient.setQueryData(
          ['group-messages', groupId],
          (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
            if (!oldData?.pages) return oldData;
            return {
              ...oldData,
              pages: oldData.pages.map((page) =>
                page.map((msg) => (msg.id === tempId ? { ...msg, id: result.data.id, status: 'sent' as const } : msg))
              ),
            };
          }
        );
      } else {
        queryClient.setQueryData(
          ['group-messages', groupId],
          (oldData: { pages: GroupMessage[][]; pageParams: number[] } | undefined) => {
            if (!oldData?.pages) return oldData;
            return { ...oldData, pages: oldData.pages.map((page) => page.filter((msg) => msg.id !== tempId)) };
          }
        );
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const memberCount = members?.length || 0;
  const memberNames = members
    .slice(0, 3)
    .map((m) => m.profile?.full_name?.split(' ')[0] || m.profile?.email?.split('@')[0])
    .join(', ');

  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between bg-background px-4 py-2 border-b border-border z-10 shadow-sm min-h-[64px]">
        <button
          onClick={() => setShowInfoPanel(true)}
          className="flex items-center gap-3 overflow-hidden hover:bg-muted/50 -ml-2 px-2 py-1.5 rounded-lg transition-colors flex-1"
        >
          {!group ? (
            <>
              <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
              <div className="flex flex-col gap-1">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
              </div>
            </>
          ) : (
            <>
              <Avatar className="h-10 w-10 flex-shrink-0">
                {group.group.avatar_url && <AvatarImage src={group.group.avatar_url} />}
                <AvatarFallback className="bg-primary/20 text-primary">
                  <Users className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col justify-center overflow-hidden text-left">
                <h1 className="font-medium text-[15px] text-foreground truncate leading-tight">{group.group.name}</h1>
                <p className="text-[12px] text-muted-foreground truncate">
                  {memberNames}
                  {memberCount > 3 ? ` and ${memberCount - 3} more` : ''}
                </p>
              </div>
            </>
          )}
        </button>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-hidden">
        <GroupMessageList key={groupId} groupId={groupId} currentUserId={currentUser?.id} members={members} />
      </main>

      {/* Input Area */}
      <div className="bg-[#0b1014] px-4 py-2 z-20 min-h-[62px] flex flex-col border-t border-border/10">
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
              >
                <X className="h-3 w-3" />
              </button>
              {isUploadingImage && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                </div>
              )}
            </div>
            <span className="text-sm text-[#8696a0]">{isUploadingImage ? 'Uploading...' : 'Ready to send'}</span>
          </div>
        )}

        <div className="flex items-end gap-3 w-full max-w-4xl mx-auto">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            className="mb-2 p-2 text-[#8696a0] hover:text-[#aebac1] transition-colors rounded-full hover:bg-[#202c33]/50"
          >
            <ImageIcon className="h-6 w-6" />
          </button>

          <div className="flex-1 flex items-end bg-[#202c33] rounded-[24px] px-2 py-1.5 min-h-[42px]">
            <button className="mb-1 p-2 text-[#8696a0] hover:text-[#aebac1] transition-colors">
              <Smile className="h-6 w-6" />
            </button>

            <Textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                setMessage(e.target.value);
                if (e.target.value.trim()) broadcastTyping();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Type a message"
              className="flex-1 min-h-[24px] max-h-[120px] resize-none border-0 bg-transparent px-3 py-2 focus:ring-0 focus-visible:ring-0 placeholder:text-[#8696a0] text-[15px] text-[#e9edef] outline-none scrollbar-hide"
              rows={1}
            />

            {message.trim() || selectedImage ? (
              <button
                onClick={handleSend}
                disabled={isUploadingImage}
                className="mb-1 p-2 text-[#00a884] hover:text-[#06cf9c] transition-colors disabled:opacity-50"
              >
                {isUploadingImage ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
              </button>
            ) : (
              <button className="mb-1 p-2 text-[#8696a0] hover:text-[#aebac1] transition-colors">
                <Mic className="h-6 w-6" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Group Info Panel */}
      <GroupInfoPanel
        isOpen={showInfoPanel}
        onClose={() => setShowInfoPanel(false)}
        groupId={groupId}
        groupName={group?.group.name || ''}
        groupAvatar={group?.group.avatar_url}
        groupDescription={group?.group.description}
        members={members}
        currentUserId={currentUser?.id}
        createdBy={group?.group.created_by || ''}
      />

      {/* Modals */}
      <EditGroupMessageModal />
      <DeleteGroupMessageModal />
    </div>
  );
}
