'use client';

import React, { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useMessages } from '@/hooks/useMessages';
import { MessageBubble } from './MessageBubble';
import { MessageListSkeleton } from './MessageListSkeleton';
import { TypingIndicator } from './TypingIndicator';
import { Loader2, ArrowDown, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUIStore } from '@/store/ui.store';
import { cn } from '@/lib/utils';

// ------------------------------------------------------------------
// 1. ISOLATED COMPONENTS
// ------------------------------------------------------------------

const TypingHeader = ({ conversationId }: { conversationId: string }) => {
    const typingUser = useUIStore((state) => state.typingUsers.get(conversationId));

    if (!typingUser) return null;

    return (
        <div className="pb-2 px-4" style={{ transform: 'scaleY(-1)' }}>
            <TypingIndicator userName={typingUser.userName} />
        </div>
    );
};

const LoadingFooter = ({ isFetching }: { isFetching: boolean }) => {
    if (!isFetching) return null;
    return (
        <div className="flex justify-center py-4" style={{ transform: 'scaleY(-1)' }}>
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    );
};

// ------------------------------------------------------------------
// 2. MAIN COMPONENT
// ------------------------------------------------------------------

interface MessageListProps {
    conversationId: string;
    currentUserId: string;
}

export function MessageList({ conversationId, currentUserId }: MessageListProps) {
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, refetch } = useMessages(conversationId);
    const parentRef = useRef<HTMLDivElement>(null);
    const [showScrollBottom, setShowScrollBottom] = useState(false);

    // Flatten data
    const messages = useMemo(() => {
        return data?.pages.flat() || [];
    }, [data]);

    // Virtualizer setup
    const rowVirtualizer = useVirtualizer({
        count: messages.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 60, // Estimate row height
        overscan: 5, // Reduced from 40 to prevent eager loading of all pages
    });

    // Infinite Scroll Logic
    useEffect(() => {
        const [lastItem] = [...rowVirtualizer.getVirtualItems()].reverse();

        if (!lastItem) {
            return;
        }

        // If we are near the end of the list (visually top), load more
        // In reverse scroll, the "end" of the list is the visual top
        if (
            lastItem.index >= messages.length - 1 &&
            hasNextPage &&
            !isFetchingNextPage
        ) {
            fetchNextPage();
        }
    }, [
        hasNextPage,
        fetchNextPage,
        messages.length,
        isFetchingNextPage,
        rowVirtualizer.getVirtualItems(),
    ]);

    // Scroll Button Visibility Logic
    useEffect(() => {
        const scrollElement = parentRef.current;
        if (!scrollElement) return;

        const handleScroll = () => {
            // In reverse mode, scrollTop 0 is the bottom
            // We show the button if we are scrolled up (scrollTop > 100)
            setShowScrollBottom(scrollElement.scrollTop > 100);
        };

        scrollElement.addEventListener('scroll', handleScroll);
        return () => scrollElement.removeEventListener('scroll', handleScroll);
    }, []);

    const handleScrollToBottom = () => {
        rowVirtualizer.scrollToOffset(0, { behavior: 'smooth' });
    };

    if (isLoading) return <MessageListSkeleton />;

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

    if (messages.length === 0) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    No messages yet. Say hello! 👋
                </div>
                <div className="p-4">
                    <TypingHeader conversationId={conversationId} />
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full group">
            {/* Scroll Container - Reversed */}
            <div
                ref={parentRef}
                className="h-full overflow-y-auto px-2 md:px-4 scrollbar-hide contain-strict"
                style={{
                    transform: 'scaleY(-1)', // Flip container
                }}
            >
                {/* Typing Header (Visual Bottom / DOM Start) */}
                <TypingHeader conversationId={conversationId} />

                {/* Virtual List Container */}
                <div
                    style={{
                        height: `${rowVirtualizer.getTotalSize()}px`,
                        width: '100%',
                        position: 'relative',
                    }}
                >
                    {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const message = messages[virtualRow.index];
                        return (
                            <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                className="absolute top-0 left-0 w-full py-1 will-change-transform"
                                style={{
                                    transform: `translateY(${virtualRow.start}px) scaleY(-1)`, // Position and flip back content
                                }}
                            >
                                <MessageBubble
                                    message={message}
                                    isOwnMessage={message.sender_id === currentUserId}
                                    senderName={message.sender?.full_name || 'Unknown'}
                                />
                            </div>
                        );
                    })}
                </div>

                {/* Loading Footer (Visual Top / DOM End) */}
                <LoadingFooter isFetching={isFetchingNextPage} />
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