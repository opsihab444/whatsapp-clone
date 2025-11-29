'use client';

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useGroupMessages } from '@/hooks/useGroupMessages';
import { useAppReady } from '@/hooks/useAppReady';
import { useGroupReadReceipts } from '@/hooks/useGroupReadReceipts';
import { TypingIndicator } from '@/components/features/chat/TypingIndicator';
import { SeenAvatars } from '@/components/features/group/SeenAvatars';
import { Loader2, ArrowDown, RefreshCw, Users, ChevronDown, Edit, Trash2, Copy, Info, Reply, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';
import { formatMessageTimeDisplay } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GroupMember, GroupMessage } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMarkGroupAsRead } from '@/hooks/useMarkGroupAsRead';
import { ImagePreviewModal } from '@/components/features/chat/ImagePreviewModal';

// Global cache for blob URLs (for sender's optimistic UI)
const blobUrlCache = new Map<string, string>();

// Global cache for loaded CDN images (prevents reload on conversation switch)
const loadedImageCache = new Set<string>();

// Cache for image dimensions (for images without saved dimensions)
const dimensionCache = new Map<string, { width: number; height: number }>();

// Calculate display dimensions with max size constraint
function calculateDisplayDimensions(w: number | null | undefined, h: number | null | undefined, maxSize = 300) {
  if (!w || !h) return { width: 200, height: 200 };

  let displayW = w;
  let displayH = h;

  if (w > maxSize || h > maxSize) {
    if (w > h) {
      displayH = Math.round((h / w) * maxSize);
      displayW = maxSize;
    } else {
      displayW = Math.round((w / h) * maxSize);
      displayH = maxSize;
    }
  }

  return { width: displayW, height: displayH };
}

// Image component with dimension-based skeleton (same as one-to-one)
function GroupImageMessageContent({
  mediaUrl,
  blobUrl,
  status,
  createdAt,
  messageId,
  width,
  height,
  isLatest,
  onClick,
}: {
  mediaUrl: string;
  blobUrl?: string | null;
  status: string;
  createdAt: string;
  messageId: string;
  width?: number | null;
  height?: number | null;
  isLatest?: boolean;
  onClick?: () => void;
}) {
  const isBlobUrl = mediaUrl.startsWith('blob:');
  const cachedBlobUrl = blobUrlCache.get(messageId) || blobUrlCache.get(mediaUrl) || blobUrl;
  const wasAlreadyLoaded = !isBlobUrl && loadedImageCache.has(mediaUrl);
  const cachedDimensions = dimensionCache.get(mediaUrl);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(isLatest || wasAlreadyLoaded);
  const [cdnLoaded, setCdnLoaded] = useState(wasAlreadyLoaded);
  const [cdnError, setCdnError] = useState(false);

  // Calculate stable display dimensions - prioritize saved DB dimensions
  const { width: displayWidth, height: displayHeight } = useMemo(() => {
    // 1. Use saved dimensions from database (most reliable)
    if (width && height) {
      return calculateDisplayDimensions(width, height);
    }
    // 2. Use cached dimensions from previous load
    if (cachedDimensions) {
      return cachedDimensions;
    }
    // 3. Fallback to fixed size (prevents layout shift)
    return { width: 200, height: 200 };
  }, [width, height, cachedDimensions]);

  // Lazy load with IntersectionObserver (only for non-latest images)
  useEffect(() => {
    if (isLatest || wasAlreadyLoaded || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isLatest, wasAlreadyLoaded, isVisible]);

  useEffect(() => {
    if (isBlobUrl && mediaUrl) {
      blobUrlCache.set(messageId, mediaUrl);
    }
  }, [isBlobUrl, mediaUrl, messageId]);

  useEffect(() => {
    if (cdnLoaded && !isBlobUrl) {
      loadedImageCache.add(mediaUrl);
      const cached = blobUrlCache.get(messageId);
      if (cached) {
        setTimeout(() => {
          URL.revokeObjectURL(cached);
          blobUrlCache.delete(messageId);
          blobUrlCache.delete(mediaUrl);
        }, 1000);
      }
    }
  }, [cdnLoaded, isBlobUrl, messageId, mediaUrl]);

  const showBlobUrl = isBlobUrl || (!cdnLoaded && cachedBlobUrl);
  const displayUrl = showBlobUrl ? (isBlobUrl ? mediaUrl : cachedBlobUrl) : mediaUrl;

  // Handle image load and dimension capture
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setCdnLoaded(true);

    // Cache dimensions for future use (only if not already saved in DB)
    if (!width && !cachedDimensions) {
      const dims = calculateDisplayDimensions(img.naturalWidth, img.naturalHeight);
      dimensionCache.set(mediaUrl, dims);
    }
  };

  // Fixed container with exact dimensions (prevents layout shift)
  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-lg bg-[#3a3b3c] cursor-pointer group/image"
      style={{ width: displayWidth, height: displayHeight }}
      onClick={onClick}
    >
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors z-10" />

      {/* Only load image when visible or is latest */}
      {isVisible && (
        <>
          {/* Blob URL for instant display */}
          {showBlobUrl && displayUrl && (
            <img
              src={displayUrl}
              alt="Image message"
              className="rounded-lg object-cover w-full h-full"
            />
          )}

          {/* CDN image */}
          {!isBlobUrl && !cdnError && (
            <img
              src={mediaUrl}
              alt="Image message"
              className={cn(
                'rounded-lg object-cover w-full h-full transition-opacity duration-200',
                cdnLoaded && !showBlobUrl ? 'opacity-100' : cachedBlobUrl ? 'hidden' : cdnLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={handleImageLoad}
              onError={() => setCdnError(true)}
              loading="eager"
            />
          )}
        </>
      )}

      {/* Sending overlay with large spinner */}
      {status === 'sending' && (
        <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
          <div className="relative">
            <svg className="w-16 h-16 animate-spin" viewBox="0 0 50 50">
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="4"
              />
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="80"
                strokeDashoffset="60"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Timestamp overlay on image */}
      <div className="absolute bottom-2 right-2 bg-black/50 rounded px-1.5 py-0.5 z-20">
        <time className="text-[11px] text-white" dateTime={createdAt}>
          {formatMessageTimeDisplay(createdAt)}
        </time>
      </div>
    </div>
  );
}

// Message dropdown menu component
interface MessageDropdownProps {
  message: GroupMessage;
  isOwnMessage: boolean;
  groupId: string;
}

function MessageDropdown({ message, isOwnMessage, groupId }: MessageDropdownProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const openEditGroupMessageModal = useUIStore((state) => state.openEditGroupMessageModal);
  const openDeleteGroupMessageModal = useUIStore((state) => state.openDeleteGroupMessageModal);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const handleCopy = async () => {
    if (message.content) {
      await navigator.clipboard.writeText(message.content);
    }
    setIsMenuOpen(false);
  };

  const handleEdit = () => {
    openEditGroupMessageModal(message.id, groupId);
    setIsMenuOpen(false);
  };

  const handleDelete = () => {
    openDeleteGroupMessageModal(message.id, groupId);
    setIsMenuOpen(false);
  };

  const handleDownload = async () => {
    if (!message.media_url) return;
    try {
      const response = await fetch(message.media_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp-image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download failed:', error);
      window.open(message.media_url, '_blank');
    }
    setIsMenuOpen(false);
  };

  return (
    <div
      ref={menuRef}
      className={cn(
        "absolute top-1 z-20",
        isOwnMessage ? "right-2" : "right-2"
      )}
    >
      <button
        className={cn(
          "h-5 w-5 inline-flex items-center justify-center rounded-full transition-all duration-200",
          isMenuOpen
            ? "opacity-100 bg-black/20"
            : "opacity-0 group-hover/bubble:opacity-100 hover:bg-black/20",
          "text-white/80"
        )}
        aria-label="Message options"
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const menuHeight = isOwnMessage ? 220 : 150;
            setOpenUpward(spaceBelow < menuHeight);
          }
          setIsMenuOpen(!isMenuOpen);
        }}
      >
        <ChevronDown className="h-4 w-4" />
      </button>

      {isMenuOpen && (
        <div
          className={cn(
            "absolute min-w-[160px] overflow-hidden rounded-md bg-[#233138] shadow-xl z-50 py-2",
            openUpward ? "bottom-full mb-1" : "top-full mt-1",
            isOwnMessage ? "right-0" : "left-0"
          )}
        >
          {/* Message Info */}
          <div
            role="menuitem"
            className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
            onClick={() => setIsMenuOpen(false)}
          >
            <Info className="mr-4 h-4 w-4 text-[#aebac1]" />
            Message info
          </div>

          {/* Download - only for images */}
          {message.type === 'image' && message.media_url && (
            <div
              role="menuitem"
              className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
              onClick={handleDownload}
            >
              <Download className="mr-4 h-4 w-4 text-[#aebac1]" />
              Download
            </div>
          )}

          {/* Copy */}
          {message.content && (
            <div
              role="menuitem"
              className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
              onClick={handleCopy}
            >
              <Copy className="mr-4 h-4 w-4 text-[#aebac1]" />
              Copy
            </div>
          )}

          {/* Edit - only for own text messages */}
          {isOwnMessage && message.type === 'text' && message.content && (
            <div
              role="menuitem"
              className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
              onClick={handleEdit}
            >
              <Edit className="mr-4 h-4 w-4 text-[#aebac1]" />
              Edit
            </div>
          )}

          {/* Delete - only for own messages */}
          {isOwnMessage && (
            <div
              role="menuitem"
              className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors border-t border-[#3b4a54] mt-1 pt-2.5"
              onClick={handleDelete}
            >
              <Trash2 className="mr-4 h-4 w-4 text-[#ea0038]" />
              <span className="text-[#ea0038]">Delete</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Loading indicator component
const LoadingIndicator = ({ isFetching }: { isFetching: boolean }) => {
  if (!isFetching) return null;

  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex justify-center py-3 pointer-events-none">
      <div className="bg-background/80 backdrop-blur-sm rounded-full px-4 py-2 shadow-md">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    </div>
  );
};

// Skeleton loader
const GroupMessageListSkeleton = () => (
  <div className="flex flex-col h-full p-4 space-y-3">
    {[...Array(8)].map((_, i) => (
      <div key={i} className={cn('flex', i % 3 === 0 ? 'justify-end' : 'justify-start')}>
        <Skeleton className={cn('h-12 rounded-lg', i % 2 === 0 ? 'w-[60%]' : 'w-[45%]')} />
      </div>
    ))}
  </div>
);

interface GroupMessageListProps {
  groupId: string;
  currentUserId?: string;
  members: GroupMember[];
}

function GroupMessageListComponent({ groupId, currentUserId, members }: GroupMessageListProps) {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch
  } = useGroupMessages(groupId);

  // Mark group as read
  useMarkGroupAsRead(groupId);

  const isAppReady = useAppReady();
  const parentRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; sender: string; time: string } | null>(null);

  // Get typing status - use multiple typing users for groups
  const typingUser = useUIStore((state) => state.typingUsers.get(groupId));
  const typingUsersMap = useUIStore((state) => state.typingUsersMultiple.get(groupId));
  const typingUsersMultiple = useMemo(() => {
    if (!typingUsersMap) return [];
    return Array.from(typingUsersMap.values());
  }, [typingUsersMap]);
  const isTyping = typingUsersMultiple.length > 0 || !!typingUser;

  // Process messages: Deduplicate and Keep Newest -> Oldest
  const messages = useMemo(() => {
    if (!data?.pages) return [];
    const allMessages = data.pages.flat();
    const seen = new Set<string>();
    const unique = [];
    for (const msg of allMessages) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        unique.push(msg);
      }
    }
    return unique;
  }, [data?.pages]);

  // Get latest message ID for read receipt tracking
  const latestMessageId = useMemo(() => {
    const latestNonTemp = messages.find(m => !m.id.startsWith('temp-'));
    return latestNonTemp?.id || null;
  }, [messages]);

  // Read receipts - track who has seen which message
  const { readReceipts } = useGroupReadReceipts(groupId, latestMessageId);

  // Compute which message should show which users' seen avatars
  // Avatar should only appear on current user's OWN messages (not received messages)
  // Each user's avatar appears on the LAST message sent by current user that they have read
  const messageSeenAvatarsMap = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string | null; avatarUrl: string | null }>>();

    if (!readReceipts.length || !currentUserId || !messages.length) return map;

    // Get only current user's sent messages (newest first)
    const myMessages = messages.filter(m => m.sender_id === currentUserId && !m.id.startsWith('temp-'));
    if (!myMessages.length) return map;

    // Create a map of message id to its index (for ordering comparison)
    const messageIndexMap = new Map<string, number>();
    messages.forEach((m, idx) => messageIndexMap.set(m.id, idx));

    // For each user who has read receipts, find the LAST of MY messages they have seen
    readReceipts.forEach(receipt => {
      if (!receipt.last_read_message_id) return;

      const readMsgIndex = messageIndexMap.get(receipt.last_read_message_id);
      if (readMsgIndex === undefined) return;

      // Find the last (newest) message I sent that this user has seen
      // A user has seen my message if my message index >= their last_read index (lower index = newer)
      const lastSeenMyMessage = myMessages.find(myMsg => {
        const myMsgIndex = messageIndexMap.get(myMsg.id);
        if (myMsgIndex === undefined) return false;
        // My message is seen if it's at or before (older or same as) their last read position
        return myMsgIndex >= readMsgIndex;
      });

      if (!lastSeenMyMessage) return;

      // Profile might be an array from Supabase join, handle both cases
      const profile = Array.isArray(receipt.profile) ? receipt.profile[0] : receipt.profile;

      // Use full_name, or email prefix as fallback
      const displayName = profile?.full_name || profile?.email?.split('@')[0] || null;

      const existing = map.get(lastSeenMyMessage.id) || [];
      existing.push({
        id: receipt.user_id,
        name: displayName,
        avatarUrl: profile?.avatar_url || null,
      });
      map.set(lastSeenMyMessage.id, existing);
    });

    return map;
  }, [readReceipts, currentUserId, messages]);

  // Create member lookup map
  const memberMap = useMemo(() => {
    const map = new Map<string, GroupMember>();
    members.forEach(m => map.set(m.user_id, m));
    return map;
  }, [members]);

  // Pre-compute showSender/showTail info BEFORE virtualItemsList
  // messages array: newest (index 0) -> oldest (last index)
  // With double scaleY(-1) flip, visually: oldest at TOP, newest at BOTTOM
  // Avatar + Name + Tail should show on FIRST message of a sender group (visually TOP = oldest in group)
  const messageSenderMap = useMemo(() => {
    const map = new Map<string, { showSender: boolean; showTail: boolean }>();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // olderMsg = next in array (higher index) = visually ABOVE (older)
      const olderMsg = i < messages.length - 1 ? messages[i + 1] : null;

      // showTail/showSender: true if older message is from different sender (or no older msg)
      // This means this is the FIRST message of this sender's group (visually TOP)
      const isFirstInGroup = !olderMsg || olderMsg.sender_id !== msg.sender_id;

      map.set(msg.id, { showSender: isFirstInGroup, showTail: isFirstInGroup });
    }
    return map;
  }, [messages]);

  // Virtual items list
  const virtualItemsList = useMemo(() => {
    const items: Array<{ type: 'loader' } | { type: 'message'; data: typeof messages[0] } | { type: 'typing' }> = [];

    if (isTyping) {
      items.push({ type: 'typing' });
    }

    messages.forEach(msg => {
      items.push({ type: 'message', data: msg });
    });

    if (hasNextPage) {
      items.push({ type: 'loader' });
    }

    return items;
  }, [messages, hasNextPage, isTyping]);

  // Cache measured sizes to prevent jump on re-render
  const measuredSizesRef = useRef<Map<string, number>>(new Map());

  // Get stable size estimate based on cached measurements
  const getEstimatedSize = useCallback((index: number) => {
    const item = virtualItemsList[index];
    if (!item) return 70;

    if (item.type === 'typing') return 40;
    if (item.type === 'loader') return 50;

    // For messages, check if we have a cached size
    const cachedSize = measuredSizesRef.current.get(item.data.id);
    if (cachedSize) return cachedSize;

    // Estimate based on content length (group messages have sender name too)
    const contentLength = item.data.content?.length || 0;
    const senderInfo = messageSenderMap.get(item.data.id);
    const hasName = senderInfo?.showSender ? 20 : 0; // Extra height for sender name
    const isOwn = item.data.sender_id === currentUserId;
    const hasSeenAvatars = isOwn ? 20 : 0; // Fixed height for seen avatars container

    if (contentLength > 200) return 130 + hasName + hasSeenAvatars;
    if (contentLength > 100) return 90 + hasName + hasSeenAvatars;
    return 70 + hasName + hasSeenAvatars;
  }, [virtualItemsList, messageSenderMap, currentUserId]);

  // Virtualizer with stable size estimation
  const rowVirtualizer = useVirtualizer({
    count: virtualItemsList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getEstimatedSize,
    overscan: 8, // Increased overscan for smoother experience
    paddingStart: 0,
    paddingEnd: 0,
    // Use message ID as key for stable identity
    getItemKey: useCallback((index: number) => {
      const item = virtualItemsList[index];
      if (item.type === 'typing') return 'typing';
      if (item.type === 'loader') return 'loader';
      return item.data.id;
    }, [virtualItemsList]),
  });

  // Cache measured sizes when items are measured
  useEffect(() => {
    const items = rowVirtualizer.getVirtualItems();
    items.forEach(item => {
      const virtualItem = virtualItemsList[item.index];
      if (virtualItem?.type === 'message' && item.size > 0) {
        measuredSizesRef.current.set(virtualItem.data.id, item.size);
      }
    });
  }, [rowVirtualizer.getVirtualItems(), virtualItemsList]);

  // Fix Mouse Wheel Direction for scaleY(-1)
  const handleWheel = useCallback((e: WheelEvent) => {
    if (!parentRef.current) return;
    e.preventDefault();
    parentRef.current.scrollTop -= e.deltaY;
  }, []);

  const setRef = useCallback((node: HTMLDivElement | null) => {
    if (parentRef.current) {
      parentRef.current.removeEventListener('wheel', handleWheel);
    }

    parentRef.current = node;

    if (node) {
      node.addEventListener('wheel', handleWheel, { passive: false });
    }
  }, [handleWheel]);

  // Handle Scroll Events
  const handleScroll = useCallback(() => {
    const container = parentRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;

    const isAtBottom = scrollTop < 150;
    setShowScrollBottom(!isAtBottom);

    const distanceFromPhysicalBottom = scrollHeight - clientHeight - scrollTop;
    if (distanceFromPhysicalBottom < 150 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    const container = parentRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll, isLoading, isAppReady, currentUserId]);

  const handleScrollToBottom = () => {
    const container = parentRef.current;
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (isLoading || !currentUserId || !isAppReady) return <GroupMessageListSkeleton />;

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 gap-2">
        <p className="text-destructive">Failed to load messages</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Retry
        </Button>
      </div>
    );
  }

  if (messages.length === 0 && !hasNextPage) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Users className="h-10 w-10 text-primary/60" />
          </div>
          <p className="text-muted-foreground font-medium">No messages yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Send a message to start the conversation
          </p>
        </div>
        <div className="p-4">
          {isTyping && (
            <TypingIndicator
              userName={typingUser?.userName}
              typingUsers={typingUsersMultiple.map(u => ({
                userId: u.userId,
                userName: u.userName,
                avatarUrl: u.avatarUrl,
              }))}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full chat-background">
      <LoadingIndicator isFetching={isFetchingNextPage} />

      <div
        ref={setRef}
        className="h-full overflow-y-auto scrollbar-thin flex flex-col"
        style={{ transform: 'scaleY(-1)' }}
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualItem) => {
            const item = virtualItemsList[virtualItem.index];

            let content;
            if (item.type === 'loader') {
              content = (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              );
            } else if (item.type === 'typing') {
              content = (
                <div className="px-4 py-2">
                  <TypingIndicator
                    userName={typingUser?.userName}
                    typingUsers={typingUsersMultiple.map(u => ({
                      userId: u.userId,
                      userName: u.userName,
                      avatarUrl: u.avatarUrl,
                    }))}
                  />
                </div>
              );
            } else {
              const message = item.data;
              const isOwn = message.sender_id === currentUserId;
              const isSystemMessage = message.type === 'system';
              const senderInfo = messageSenderMap.get(message.id) || { showSender: false, showTail: false };
              const showSender = !isOwn && !isSystemMessage && senderInfo.showSender;
              const showTail = !isSystemMessage && senderInfo.showTail;
              const senderMember = memberMap.get(message.sender_id);
              const isAdmin = senderMember?.role === 'admin';
              const senderAvatar = message.sender?.avatar_url || senderMember?.profile?.avatar_url;
              const senderName = message.sender?.full_name || senderMember?.profile?.full_name || message.sender?.email?.split('@')[0];

              // System message (member added/removed/left)
              if (isSystemMessage) {
                content = (
                  <div className="flex w-full justify-center py-1">
                    <div className="bg-[#182229] text-[#8696a0] text-[12.5px] px-3 py-1 rounded-lg shadow-sm">
                      {message.content}
                    </div>
                  </div>
                );
              } else {
                content = (
                  <div className={cn(
                    'flex w-full px-[4%] md:px-[8%] py-0.5',
                    isOwn ? 'justify-end' : 'justify-start',
                    // Animate if message is new (< 3s) AND (not own message OR is sending)
                    (Date.now() - new Date(message.created_at).getTime() < 3000) &&
                    (!isOwn || message.status === 'sending') &&
                    "animate-slide-up"
                  )}>
                    {/* Avatar for received messages - only show on first message of group */}
                    {!isOwn && (
                      <div className="w-8 mr-2 flex-shrink-0 self-start">
                        {showTail && (
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={senderAvatar || undefined} className="object-cover" />
                            <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                              {senderName?.[0]?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                      </div>
                    )}

                    <div className={cn(
                      "flex flex-col max-w-[75%] md:max-w-[65%] relative",
                      isOwn ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "flex relative",
                        isOwn ? "flex-row-reverse" : "flex-row"
                      )}>
                        {/* Tail SVG - only show for last message in group (visually first) */}
                        {showTail && (
                          <div className={cn(
                            "absolute top-0 w-2 h-3 z-10",
                            isOwn ? "-right-2" : "-left-2"
                          )}>
                            {isOwn ? (
                              <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="none" className="fill-chat-bubble-out block">
                                <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
                              </svg>
                            ) : (
                              <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="none" className="fill-chat-bubble-in block">
                                <path d="M1.533 3.568L8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"></path>
                              </svg>
                            )}
                          </div>
                        )}

                        {/* Bubble */}
                        <div
                          className={cn(
                            'rounded-lg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] relative text-[15px] leading-[22px] group/bubble',
                            message.type === 'image' ? 'p-1' : 'px-3 py-2',
                            isOwn
                              ? cn('bg-[#005c4b] text-[#e9edef]', showTail && 'rounded-tr-none')
                              : cn('bg-[#202c33] text-[#e9edef]', showTail && 'rounded-tl-none'),
                            message.is_deleted && 'italic opacity-70'
                          )}
                        >
                          {/* Dropdown menu - only show if not deleted */}
                          {!message.is_deleted && (
                            <MessageDropdown
                              message={message}
                              isOwnMessage={isOwn}
                              groupId={groupId}
                            />
                          )}
                          {/* Sender name for received messages - only on first message of group */}
                          {showSender && (
                            <div className={cn("flex items-center gap-1.5 mb-0.5", message.type === 'image' && "px-2 pt-1")}>
                              <span
                                className={cn(
                                  'text-[13px] font-medium',
                                  isAdmin ? 'text-amber-400' : 'text-emerald-400'
                                )}
                              >
                                {senderName}
                              </span>
                              {isAdmin && (
                                <span className="text-[10px] text-amber-400/70">Admin</span>
                              )}
                            </div>
                          )}

                          {/* Image message */}
                          {message.type === 'image' && message.media_url ? (
                            <GroupImageMessageContent
                              mediaUrl={message.media_url}
                              blobUrl={(message as any)._blobUrl}
                              status={message.status}
                              createdAt={message.created_at}
                              messageId={message.id}
                              width={message.media_width}
                              height={message.media_height}
                              isLatest={virtualItem.index === 0}
                              onClick={() => setPreviewImage({
                                url: message.media_url!,
                                sender: senderName || 'Unknown',
                                time: formatMessageTimeDisplay(message.created_at)
                              })}
                            />
                          ) : (
                            <>
                              {/* Message content with space for timestamp */}
                              <div className="whitespace-pre-wrap break-words break-all pr-[75px] pb-[3px] min-h-[22px]">
                                {message.is_deleted ? 'This message was deleted' : message.content}
                              </div>

                              {/* Timestamp INSIDE bubble at bottom-right */}
                              <div className="absolute bottom-[6px] right-[8px] flex items-center gap-1">
                                {message.is_edited && !message.is_deleted && (
                                  <span className={cn(
                                    "text-[11px] mr-1",
                                    isOwn ? "text-[rgba(255,255,255,0.6)]" : "text-[rgba(241,241,242,0.63)]"
                                  )}>edited</span>
                                )}
                                <time className={cn(
                                  "text-[11px] leading-[15px]",
                                  isOwn ? "text-[rgba(255,255,255,0.6)]" : "text-[rgba(241,241,242,0.63)]"
                                )} dateTime={message.created_at}>
                                  {formatMessageTimeDisplay(message.created_at)}
                                </time>
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Seen avatars - show who has read up to this message (only for own messages) */}
                      {isOwn && (() => {
                        const seenUsers = messageSeenAvatarsMap.get(message.id);
                        if (!seenUsers || seenUsers.length === 0) return null;
                        return (
                          <div className="h-5 flex justify-end items-center mr-1">
                            <SeenAvatars
                              users={seenUsers}
                              maxAvatars={4}
                              size="sm"
                            />
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              }
            }

            return (
              <div
                key={virtualItem.key}
                ref={rowVirtualizer.measureElement}
                data-index={virtualItem.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px) scaleY(-1)`,
                }}
              >
                {content}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll To Bottom Button */}
      <div
        className={cn(
          "absolute bottom-4 right-4 z-10 transition-all duration-300 ease-in-out transform",
          showScrollBottom
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <Button
          variant="secondary"
          size="icon"
          className="rounded-full shadow-lg bg-background/80 backdrop-blur-sm border hover:bg-background"
          onClick={handleScrollToBottom}
        >
          <ArrowDown className="w-5 h-5 text-primary" />
        </Button>
      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={!!previewImage}
        onClose={() => setPreviewImage(null)}
        imageUrl={previewImage?.url || null}
        senderName={previewImage?.sender}
        timestamp={previewImage?.time}
      />
    </div>
  );
}

// Memoize component with custom comparison to prevent unnecessary re-renders
export const GroupMessageList = React.memo(GroupMessageListComponent, (prevProps, nextProps) => {
  // Only re-render if these specific properties change
  return (
    prevProps.groupId === nextProps.groupId &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.members.length === nextProps.members.length
  );
});

GroupMessageList.displayName = 'GroupMessageList';
