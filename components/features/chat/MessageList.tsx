'use client';

import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { useMessages } from '@/hooks/useMessages';
import { useAppReady } from '@/hooks/useAppReady';
import { MessageBubble } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import { TypingIndicator } from './TypingIndicator';
import { EditMessageModal } from './EditMessageModal';
import { DeleteMessageModal } from './DeleteMessageModal';
import { Loader2, ArrowDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';
import { useVirtualizer } from '@tanstack/react-virtual';

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

// ------------------------------------------------------------------
// 2. MAIN COMPONENT
// ------------------------------------------------------------------

interface MessageListProps {
    conversationId: string;
    currentUserId?: string;
    currentUserName?: string | null;
    otherUserAvatarUrl?: string | null;
    otherUserName?: string | null;
}

function MessageListComponent({ conversationId, currentUserId, currentUserName, otherUserAvatarUrl, otherUserName }: MessageListProps) {
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
        refetch
    } = useMessages(conversationId);

    const isAppReady = useAppReady();
    const parentRef = useRef<HTMLDivElement>(null);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    // Get typing status directly here to include in virtual list
    const typingUser = useUIStore((state) => state.typingUsers.get(conversationId));
    const isTyping = !!typingUser;

    // Clear measured sizes cache when conversation changes
    const prevConversationIdRef = useRef(conversationId);
    useEffect(() => {
        if (prevConversationIdRef.current !== conversationId) {
            measuredSizesRef.current.clear();
            prevConversationIdRef.current = conversationId;
        }
    }, [conversationId]);

    // Process messages: Deduplicate and Keep Newest -> Oldest
    const messages = useMemo(() => {
        if (!data?.pages) return [];
        const allMessages = data.pages.flat();
        const seen = new Set<string>();
        const unique = [];
        // data.pages is Newest -> Oldest.
        for (const msg of allMessages) {
            if (!seen.has(msg.id)) {
                seen.add(msg.id);
                unique.push(msg);
            }
        }
        return unique; // [Newest, ..., Oldest]
    }, [data?.pages]);

    // Create a unified list of items for virtualization
    // Order for scale-y-[-1]:
    // Visual Bottom (Physical Top, Index 0) -> [Typing, Newest, ..., Oldest, Loader] -> Visual Top (Physical Bottom, Index N)
    const virtualItemsList = useMemo(() => {
        const items: Array<{ type: 'loader' } | { type: 'message'; data: typeof messages[0] } | { type: 'typing' }> = [];

        // Index 0: Typing (Visual Bottom)
        if (isTyping) {
            items.push({ type: 'typing' });
        }

        // Messages (Newest -> Oldest)
        messages.forEach(msg => {
            items.push({ type: 'message', data: msg });
        });

        // Index N: Loader (Visual Top)
        if (hasNextPage) {
            items.push({ type: 'loader' });
        }

        return items;
    }, [messages, hasNextPage, isTyping]);

    // Cache measured sizes to prevent jump on re-render - GLOBAL cache
    const measuredSizesRef = useRef<Map<string, number>>(new Map());

    // Get stable size estimate based on cached measurements
    const getEstimatedSize = useCallback((index: number) => {
        const item = virtualItemsList[index];
        if (!item) return 60;

        if (item.type === 'typing') return 48;
        if (item.type === 'loader') return 50;

        // For messages, check if we have a cached size - use it immediately
        const cachedSize = measuredSizesRef.current.get(item.data.id);
        if (cachedSize) return cachedSize;

        // Image messages - use saved dimensions from database for accurate estimate
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
                return displayHeight + 24;
            }
            return 224;
        }

        // Text messages - better estimation based on content
        const contentLength = item.data.content?.length || 0;
        if (contentLength > 300) return 140;
        if (contentLength > 200) return 100;
        if (contentLength > 100) return 75;
        if (contentLength > 50) return 60;
        return 52; // Minimum height for short messages
    }, [virtualItemsList]);

    // Stable getItemKey - memoized separately
    const getItemKey = useCallback((index: number) => {
        const item = virtualItemsList[index];
        if (!item) return `item-${index}`;
        if (item.type === 'typing') return 'typing';
        if (item.type === 'loader') return 'loader';
        return item.data.id;
    }, [virtualItemsList]);

    // Virtualizer with stable configuration
    const rowVirtualizer = useVirtualizer({
        count: virtualItemsList.length,
        getScrollElement: () => parentRef.current,
        estimateSize: getEstimatedSize,
        overscan: 10, // Higher overscan for smoother scrolling
        paddingStart: 0,
        paddingEnd: 0,
        getItemKey,
    });

    // Custom measure function that caches sizes
    const measureElement = useCallback((element: HTMLElement | null) => {
        if (!element) return;

        const index = Number(element.dataset.index);
        if (isNaN(index)) return;

        const item = virtualItemsList[index];
        if (!item) return;

        // For messages, cache the measured size
        if (item.type === 'message') {
            const cachedSize = measuredSizesRef.current.get(item.data.id);
            const currentHeight = element.getBoundingClientRect().height;

            // Only re-measure if size changed significantly (>5px) or not cached
            if (!cachedSize || Math.abs(cachedSize - currentHeight) > 5) {
                if (currentHeight > 0) {
                    measuredSizesRef.current.set(item.data.id, currentHeight);
                    rowVirtualizer.measureElement(element);
                }
            }
        } else {
            // For typing/loader, always measure
            rowVirtualizer.measureElement(element);
        }
    }, [virtualItemsList, rowVirtualizer]);

    // ------------------------------------------------------------------
    // SCROLL HANDLING (The Tricky Part)
    // ------------------------------------------------------------------

    // 1. Fix Mouse Wheel Direction (Callback Ref Pattern)
    // We use a callback ref to ensure the listener is attached IMMEDIATELY when the node is created.
    // This fixes the race condition where useEffect might run too late or not trigger on initial render.

    const handleWheel = useCallback((e: WheelEvent) => {
        if (!parentRef.current) return;
        e.preventDefault();
        // Invert deltaY: 
        // Wheel Down (positive) -> Want to go Down Visually -> Up Physically -> Decrease scrollTop
        // Wheel Up (negative) -> Want to go Up Visually -> Down Physically -> Increase scrollTop
        parentRef.current.scrollTop -= e.deltaY;
    }, []);

    const setRef = useCallback((node: HTMLDivElement | null) => {
        if (parentRef.current) {
            // Cleanup old listener
            parentRef.current.removeEventListener('wheel', handleWheel);
        }

        parentRef.current = node;

        if (node) {
            // Attach new listener
            node.addEventListener('wheel', handleWheel, { passive: false });
        }
    }, [handleWheel]);

    // 2. Handle Scroll Events (Infinite Load & Scroll Button)
    const handleScroll = useCallback(() => {
        const container = parentRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;

        // With scale-y-[-1]:
        // scrollTop 0 = Physical Top = Visual Bottom (Newest)
        // scrollTop Max = Physical Bottom = Visual Top (Oldest)

        // Check if near bottom (Visual Bottom = scrollTop 0)
        const isAtBottom = scrollTop < 150;
        setShowScrollBottom(!isAtBottom);

        // Load more when near top (Visual Top = scrollTop Max)
        const distanceFromPhysicalBottom = scrollHeight - clientHeight - scrollTop;
        if (distanceFromPhysicalBottom < 150 && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Attach scroll listener using useEffect (this is fine as it's for logic, not critical UI feel)
    // But we need to make sure it attaches to the current node.
    // Since we are using setRef, we can't easily attach scroll listener there without duplicating logic.
    // We'll stick to useEffect for scroll listener, but add parentRef.current as dependency? No, refs don't trigger effects.
    // We'll rely on the fact that when isLoading changes, this effect re-runs.
    useEffect(() => {
        const container = parentRef.current;
        if (!container) return;
        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [handleScroll, isLoading, isAppReady, currentUserId]); // Re-attach when data loads

    const handleScrollToBottom = () => {
        const container = parentRef.current;
        if (container) {
            // Scroll to bottom (Visual Bottom = Physical Top = 0)
            container.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Pre-compute showTail and status info
    // Note: messages is Newest -> Oldest
    const messageTailMap = useMemo(() => {
        const map = new Map<string, boolean>();
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            // Tail logic: Show tail if the NEXT OLDER message (index i+1) is different sender
            // This means the tail appears on the first (oldest) message in each consecutive group
            const olderMsg = i < messages.length - 1 ? messages[i + 1] : null;
            map.set(msg.id, !olderMsg || olderMsg.sender_id !== msg.sender_id);
        }
        return map;
    }, [messages]);

    const messageStatusInfo = useMemo(() => {
        let lastSendingOwnMessageId: string | null = null;
        let lastReadOwnMessageId: string | null = null;
        let lastSentOwnMessageId: string | null = null;

        // Iterate from Newest (Start) to Oldest (End)
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.sender_id === currentUserId) {
                if (!lastSendingOwnMessageId && (msg.status === 'sending' || msg.status === 'queued')) {
                    lastSendingOwnMessageId = msg.id;
                }
                if (!lastReadOwnMessageId && msg.status === 'read') {
                    lastReadOwnMessageId = msg.id;
                }
                if (!lastSentOwnMessageId && (msg.status === 'sent' || msg.status === 'delivered')) {
                    lastSentOwnMessageId = msg.id;
                }
            }
        }

        return {
            lastReadOwnMessageId,
            pendingStatusMessageId: lastSendingOwnMessageId || lastSentOwnMessageId
        };
    }, [messages, currentUserId]);

    if (isLoading || !currentUserId || !isAppReady) return <MessageListSkeleton />;

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
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    No messages yet. Say hello! 👋
                </div>
                <div className="p-4">
                    {isTyping && <TypingIndicator userName={typingUser?.userName} />}
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full chat-background">
            <LoadingIndicator isFetching={isFetchingNextPage} />

            {/* 
                scale-y-[-1] trick:
                - Container is flipped. Top is Bottom.
                - Items are flipped back.
                - Scrollbar is at Physical Top (Visual Bottom).
                - Default scroll position is 0 (Visual Bottom).
            */}
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

                        // Render based on type
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
                                    <TypingIndicator userName={typingUser?.userName} />
                                </div>
                            );
                        } else {
                            const message = item.data;
                            const isOwnMessage = message.sender_id === currentUserId;
                            const showTail = messageTailMap.get(message.id) ?? true;
                            const showSeenAvatar = isOwnMessage && (
                                message.id === messageStatusInfo.lastReadOwnMessageId ||
                                message.id === messageStatusInfo.pendingStatusMessageId
                            );
                            // Priority load for first 3 image messages (latest ones)
                            const isLatestImage = message.type === 'image' && virtualItem.index < 5;

                            content = (
                                <div className="px-2 md:px-3 py-0.5">
                                    <MessageBubble
                                        message={message}
                                        isOwnMessage={isOwnMessage}
                                        senderName={message.sender?.full_name || 'Unknown'}
                                        showTail={showTail}
                                        showSeenAvatar={showSeenAvatar}
                                        recipientAvatarUrl={otherUserAvatarUrl}
                                        recipientName={otherUserName}
                                        isLatestImage={isLatestImage}
                                        currentUserName={currentUserName}
                                        currentUserId={currentUserId}
                                    />
                                </div>
                            );
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

            {/* Edit & Delete Modals */}
            <EditMessageModal messages={messages} />
            <DeleteMessageModal />

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

// Memoize component with custom comparison to prevent unnecessary re-renders
export const MessageList = React.memo(MessageListComponent, (prevProps, nextProps) => {
    // Only re-render if these specific properties change
    return (
        prevProps.conversationId === nextProps.conversationId &&
        prevProps.currentUserId === nextProps.currentUserId &&
        prevProps.currentUserName === nextProps.currentUserName &&
        prevProps.otherUserAvatarUrl === nextProps.otherUserAvatarUrl &&
        prevProps.otherUserName === nextProps.otherUserName
    );
});

MessageList.displayName = 'MessageList';
