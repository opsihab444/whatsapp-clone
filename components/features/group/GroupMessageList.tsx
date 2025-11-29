'use client';

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useGroupMessages } from '@/hooks/useGroupMessages';
import { useAppReady } from '@/hooks/useAppReady';
import { useGroupReadReceipts } from '@/hooks/useGroupReadReceipts';
import { TypingIndicator } from '@/components/features/chat/TypingIndicator';
import { GroupMessageBubble } from './GroupMessageBubble';
import { Loader2, ArrowDown, RefreshCw, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';
import { GroupMember, GroupMessage } from '@/types';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarkGroupAsRead } from '@/hooks/useMarkGroupAsRead';

// ------------------------------------------------------------------
// 1. ISOLATED COMPONENTS
// ------------------------------------------------------------------

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

const GroupMessageListSkeleton = () => (
  <div className="flex flex-col h-full p-4 space-y-3">
    {[...Array(8)].map((_, i) => (
      <div key={i} className={cn('flex', i % 3 === 0 ? 'justify-end' : 'justify-start')}>
        <Skeleton className={cn('h-12 rounded-lg', i % 2 === 0 ? 'w-[60%]' : 'w-[45%]')} />
      </div>
    ))}
  </div>
);

// ------------------------------------------------------------------
// 2. MAIN COMPONENT
// ------------------------------------------------------------------

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

  // Get typing status
  const typingUser = useUIStore((state) => state.typingUsers.get(groupId));
  const typingUsersMap = useUIStore((state) => state.typingUsersMultiple.get(groupId));
  const typingUsersMultiple = useMemo(() => {
    if (!typingUsersMap) return [];
    return Array.from(typingUsersMap.values());
  }, [typingUsersMap]);
  const isTyping = typingUsersMultiple.length > 0 || !!typingUser;

  // Clear measured sizes cache when group changes
  const prevGroupIdRef = useRef(groupId);
  useEffect(() => {
    if (prevGroupIdRef.current !== groupId) {
      measuredSizesRef.current.clear();
      prevGroupIdRef.current = groupId;
    }
  }, [groupId]);

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

  // Read receipts
  const { readReceipts } = useGroupReadReceipts(groupId, latestMessageId);

  // Compute seen avatars map
  const messageSeenAvatarsMap = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string | null; avatarUrl: string | null }>>();
    if (!readReceipts.length || !currentUserId || !messages.length) return map;

    const myMessages = messages.filter(m => m.sender_id === currentUserId && !m.id.startsWith('temp-'));
    if (!myMessages.length) return map;

    const messageIndexMap = new Map<string, number>();
    messages.forEach((m, idx) => messageIndexMap.set(m.id, idx));

    readReceipts.forEach(receipt => {
      if (!receipt.last_read_message_id) return;
      const readMsgIndex = messageIndexMap.get(receipt.last_read_message_id);
      if (readMsgIndex === undefined) return;

      const lastSeenMyMessage = myMessages.find(myMsg => {
        const myMsgIndex = messageIndexMap.get(myMsg.id);
        if (myMsgIndex === undefined) return false;
        return myMsgIndex >= readMsgIndex;
      });

      if (!lastSeenMyMessage) return;

      const profile = Array.isArray(receipt.profile) ? receipt.profile[0] : receipt.profile;
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

  // Pre-compute showSender/showTail info
  const messageSenderMap = useMemo(() => {
    const map = new Map<string, { showSender: boolean; showTail: boolean }>();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const olderMsg = i < messages.length - 1 ? messages[i + 1] : null;
      const isFirstInGroup = !olderMsg || olderMsg.sender_id !== msg.sender_id;
      map.set(msg.id, { showSender: isFirstInGroup, showTail: isFirstInGroup });
    }
    return map;
  }, [messages]);

  // Virtual items list
  const virtualItemsList = useMemo(() => {
    const items: Array<{ type: 'loader' } | { type: 'message'; data: GroupMessage } | { type: 'typing' }> = [];

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

  // Cache measured sizes
  const measuredSizesRef = useRef<Map<string, number>>(new Map());

  // Get stable size estimate
  const getEstimatedSize = useCallback((index: number) => {
    const item = virtualItemsList[index];
    if (!item) return 60;

    if (item.type === 'typing') return 48;
    if (item.type === 'loader') return 50;

    const cachedSize = measuredSizesRef.current.get(item.data.id);
    if (cachedSize) return cachedSize;

    if (item.data.type === 'image') {
      const { media_width, media_height } = item.data;
      if (media_width && media_height) {
        const maxSize = 300;
        let displayHeight = media_height;
        if (media_width > maxSize || media_height > maxSize) {
          if (media_width > media_height) {
            displayHeight = Math.round((media_height / media_width) * maxSize);
          } else {
            displayHeight = maxSize;
          }
        }
        const senderInfo = messageSenderMap.get(item.data.id);
        const hasName = senderInfo?.showSender ? 20 : 0;
        const isOwn = item.data.sender_id === currentUserId;
        const hasSeenAvatars = isOwn ? 20 : 0;
        return displayHeight + 24 + hasName + hasSeenAvatars;
      }
      return 224;
    }

    const contentLength = item.data.content?.length || 0;
    const senderInfo = messageSenderMap.get(item.data.id);
    const hasName = senderInfo?.showSender ? 20 : 0;
    const isOwn = item.data.sender_id === currentUserId;
    const hasSeenAvatars = isOwn ? 20 : 0;

    if (contentLength > 300) return 140 + hasName + hasSeenAvatars;
    if (contentLength > 200) return 100 + hasName + hasSeenAvatars;
    if (contentLength > 100) return 75 + hasName + hasSeenAvatars;
    if (contentLength > 50) return 60 + hasName + hasSeenAvatars;
    return 52 + hasName + hasSeenAvatars;
  }, [virtualItemsList, messageSenderMap, currentUserId]);

  // Stable getItemKey
  const getItemKey = useCallback((index: number) => {
    const item = virtualItemsList[index];
    if (!item) return `item-${index}`;
    if (item.type === 'typing') return 'typing';
    if (item.type === 'loader') return 'loader';
    return item.data.id;
  }, [virtualItemsList]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: virtualItemsList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getEstimatedSize,
    overscan: 10,
    paddingStart: 0,
    paddingEnd: 0,
    getItemKey,
  });

  // Custom measure function
  const measureElement = useCallback((element: HTMLElement | null) => {
    if (!element) return;

    const index = Number(element.dataset.index);
    if (isNaN(index)) return;

    const item = virtualItemsList[index];
    if (!item) return;

    if (item.type === 'message') {
      const cachedSize = measuredSizesRef.current.get(item.data.id);
      const currentHeight = element.getBoundingClientRect().height;

      if (!cachedSize || Math.abs(cachedSize - currentHeight) > 5) {
        if (currentHeight > 0) {
          measuredSizesRef.current.set(item.data.id, currentHeight);
          rowVirtualizer.measureElement(element);
        }
      }
    } else {
      rowVirtualizer.measureElement(element);
    }
  }, [virtualItemsList, rowVirtualizer]);


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
          <p className="text-sm text-muted-foreground/70 mt-1">Send a message to start the conversation</p>
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
        className="h-full overflow-y-auto scrollbar-thin flex flex-col pb-24"
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

              if (isSystemMessage) {
                content = (
                  <div className="flex w-full justify-center py-1">
                    <div className="bg-muted/80 text-muted-foreground text-[12.5px] px-3 py-1 rounded-lg shadow-sm">
                      {message.content}
                    </div>
                  </div>
                );
              } else {
                const senderInfo = messageSenderMap.get(message.id) || { showSender: false, showTail: false };
                const showSender = !isOwn && senderInfo.showSender;
                const showTail = senderInfo.showTail;
                const senderMember = memberMap.get(message.sender_id);
                const isAdmin = senderMember?.role === 'admin';
                const senderAvatar = message.sender?.avatar_url || senderMember?.profile?.avatar_url;
                const senderName = message.sender?.full_name || senderMember?.profile?.full_name || message.sender?.email?.split('@')[0];
                const seenUsers = messageSeenAvatarsMap.get(message.id);
                const isLatestImage = message.type === 'image' && virtualItem.index < 5;

                content = (
                  <GroupMessageBubble
                    message={message}
                    isOwnMessage={isOwn}
                    groupId={groupId}
                    showTail={showTail}
                    showSender={showSender}
                    senderName={senderName}
                    senderAvatar={senderAvatar}
                    isAdmin={isAdmin}
                    isLatestImage={isLatestImage}
                    seenUsers={seenUsers}
                  />
                );
              }
            }

            return (
              <div
                key={virtualItem.key}
                ref={measureElement}
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
    </div>
  );
}

// Memoize component
export const GroupMessageList = React.memo(GroupMessageListComponent, (prevProps, nextProps) => {
  return (
    prevProps.groupId === nextProps.groupId &&
    prevProps.currentUserId === nextProps.currentUserId &&
    prevProps.members.length === nextProps.members.length
  );
});

GroupMessageList.displayName = 'GroupMessageList';
