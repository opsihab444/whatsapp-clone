'use client';

import { useRef, useMemo, useState, useEffect, useLayoutEffect, useCallback } from 'react';
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

// ------------------------------------------------------------------
// 1. ISOLATED COMPONENTS
// ------------------------------------------------------------------

const TypingHeader = ({ 
    conversationId, 
    onTypingChange 
}: { 
    conversationId: string;
    onTypingChange?: (isTyping: boolean) => void;
}) => {
    const typingUser = useUIStore((state) => state.typingUsers.get(conversationId));
    const prevTypingRef = useRef<boolean>(false);

    useEffect(() => {
        const isTyping = !!typingUser;
        if (isTyping !== prevTypingRef.current) {
            prevTypingRef.current = isTyping;
            onTypingChange?.(isTyping);
        }
    }, [typingUser, onTypingChange]);

    if (!typingUser) return null;

    return <TypingIndicator userName={typingUser.userName} />;
};

const LoadingIndicator = ({ isFetching }: { isFetching: boolean }) => {
    if (!isFetching) return null;
    return (
        <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
    );
};

// ------------------------------------------------------------------
// 2. MAIN COMPONENT - WhatsApp Style Natural Scroll
// ------------------------------------------------------------------

interface MessageListProps {
    conversationId: string;
    currentUserId?: string;
    otherUserAvatarUrl?: string | null;
    otherUserName?: string | null;
}

export function MessageList({ conversationId, currentUserId, otherUserAvatarUrl, otherUserName }: MessageListProps) {
    const { 
        data, 
        fetchNextPage, 
        hasNextPage, 
        isFetchingNextPage, 
        isLoading, 
        isError, 
        refetch 
    } = useMessages(conversationId);
    
    // Check if ALL app data is ready (conversations + currentUser)
    const isAppReady = useAppReady();
    
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const isInitialLoadRef = useRef(true);
    const savedScrollInfoRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);
    const prevFetchingRef = useRef(false);
    const prevMessageCountRef = useRef(0);
    const [showScrollBottom, setShowScrollBottom] = useState(false);
    const [isNearBottom, setIsNearBottom] = useState(true);

    // Flatten and reverse messages (oldest first for display)
    const messages = useMemo(() => {
        const allMessages = data?.pages.flat() || [];
        // Messages come DESC from API, reverse to show oldest first (top) to newest (bottom)
        return [...allMessages].reverse();
    }, [data]);

    // Initial scroll to bottom - runs after DOM is painted
    useLayoutEffect(() => {
        if (isInitialLoadRef.current && messages.length > 0 && !isLoading && isAppReady) {
            const container = scrollContainerRef.current;
            if (container) {
                // Use requestAnimationFrame to ensure DOM is fully rendered
                requestAnimationFrame(() => {
                    if (container) {
                        container.scrollTop = container.scrollHeight;
                    }
                });
            }
            isInitialLoadRef.current = false;
        }
    }, [messages.length, isLoading, isAppReady]);

    // Restore scroll position after loading older messages
    useLayoutEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // Detect when fetching transitions from true to false (loading complete)
        const wasFetching = prevFetchingRef.current;
        prevFetchingRef.current = isFetchingNextPage;

        if (wasFetching && !isFetchingNextPage && savedScrollInfoRef.current) {
            const { scrollHeight: oldScrollHeight, scrollTop: oldScrollTop } = savedScrollInfoRef.current;
            const newScrollHeight = container.scrollHeight;
            const heightDiff = newScrollHeight - oldScrollHeight;
            
            // Restore scroll position
            container.scrollTop = oldScrollTop + heightDiff;
            savedScrollInfoRef.current = null;
        }
    }, [isFetchingNextPage, messages]);

    // Auto-scroll to bottom ONLY when a NEW message arrives (not when loading older messages)
    useLayoutEffect(() => {
        const prevCount = prevMessageCountRef.current;
        const currentCount = messages.length;
        
        // Skip if count hasn't changed
        if (prevCount === currentCount) return;
        
        const isNewMessage = currentCount > prevCount && (currentCount - prevCount) <= 3;
        prevMessageCountRef.current = currentCount;

        // Only scroll if:
        // 1. Not initial load
        // 2. Not fetching older messages
        // 3. User is near bottom
        // 4. Message count increased by a small amount (new message, not page load)
        if (isNearBottom && !isInitialLoadRef.current && !isFetchingNextPage && isNewMessage) {
            const container = scrollContainerRef.current;
            if (container) {
                // Use direct scrollTop instead of scrollIntoView for smoother behavior
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                });
            }
        }
    }, [messages, isNearBottom, isFetchingNextPage]);

    // Scroll event handler
    const handleScroll = useCallback(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        const { scrollTop, scrollHeight, clientHeight } = container;
        
        // Check if near bottom (within 150px)
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        setIsNearBottom(distanceFromBottom < 150);
        setShowScrollBottom(distanceFromBottom > 150);

        // Load more when scrolled near top (and not already loading)
        if (scrollTop < 100 && hasNextPage && !isFetchingNextPage) {
            // Save current scroll position before loading
            savedScrollInfoRef.current = { scrollHeight, scrollTop };
            fetchNextPage();
        }
    }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

    // Attach scroll listener
    useEffect(() => {
        const container = scrollContainerRef.current;
        if (!container) return;

        container.addEventListener('scroll', handleScroll, { passive: true });
        return () => container.removeEventListener('scroll', handleScroll);
    }, [handleScroll]);

    // Reset on conversation change
    useEffect(() => {
        isInitialLoadRef.current = true;
        savedScrollInfoRef.current = null;
        prevFetchingRef.current = false;
        prevMessageCountRef.current = 0;
        setIsNearBottom(true);
        setShowScrollBottom(false);
    }, [conversationId]);

    // Ensure scroll to bottom after content renders (handles page refresh)
    useEffect(() => {
        if (!isLoading && messages.length > 0 && isAppReady && isInitialLoadRef.current) {
            const container = scrollContainerRef.current;
            if (container) {
                // Double RAF to ensure content is fully painted
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (container && isInitialLoadRef.current) {
                            container.scrollTop = container.scrollHeight;
                            isInitialLoadRef.current = false;
                        }
                    });
                });
            }
        }
    }, [isLoading, messages.length, isAppReady]);

    const handleScrollToBottom = useCallback(() => {
        const container = scrollContainerRef.current;
        if (container) {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, []);

    // Auto scroll when typing indicator appears
    const handleTypingChange = useCallback((isTyping: boolean) => {
        if (isTyping && isNearBottom) {
            const container = scrollContainerRef.current;
            if (container) {
                // Small delay to let the typing indicator render first
                requestAnimationFrame(() => {
                    container.scrollTo({
                        top: container.scrollHeight,
                        behavior: 'smooth'
                    });
                });
            }
        }
    }, [isNearBottom]);

    // Show skeleton in two cases:
    // 1. Initial page load (!isAppReady) - wait for all app data
    // 2. Messages still loading for this conversation
    // On conversation switch, isAppReady is true so only messages loading matters
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

    if (messages.length === 0) {
        return (
            <div className="flex flex-col h-full">
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    No messages yet. Say hello! 👋
                </div>
                <div className="p-4">
                    <TypingHeader conversationId={conversationId} onTypingChange={handleTypingChange} />
                </div>
            </div>
        );
    }

    return (
        <div className="relative h-full chat-background">
            {/* Scroll Container */}
            <div
                ref={scrollContainerRef}
                className="h-full overflow-y-auto px-1 md:px-2 scrollbar-thin"
            >
                {/* Loading indicator at top */}
                <LoadingIndicator isFetching={isFetchingNextPage} />

                {/* Messages - oldest at top, newest at bottom */}
                <div className="flex flex-col gap-1 py-2">
                    {(() => {
                        // Find the last message from current user for each status type
                        // Facebook Messenger style: show BOTH read avatar AND sending/sent status
                        let lastSendingOwnMessageId: string | null = null;
                        let lastReadOwnMessageId: string | null = null;
                        let lastSentOwnMessageId: string | null = null;
                        
                        // Iterate from end to find last own messages by status
                        for (let i = messages.length - 1; i >= 0; i--) {
                            const msg = messages[i];
                            if (msg.sender_id === currentUserId) {
                                // Check for sending/queued status first
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

                        // Determine which message should show sending/sent status
                        // This is separate from read avatar
                        const pendingStatusMessageId = lastSendingOwnMessageId || lastSentOwnMessageId;
                        
                        return messages.map((message, index) => {
                            // Check if this is the first message in a group from the same sender
                            const prevMessage = index > 0 ? messages[index - 1] : null;
                            const showTail = !prevMessage || prevMessage.sender_id !== message.sender_id;
                            
                            const isOwnMessage = message.sender_id === currentUserId;
                            
                            // Show status indicator on:
                            // 1. Last read message (shows avatar)
                            // 2. Last sending/sent message (shows Sending.../Sent text)
                            // Both can be shown simultaneously on different messages
                            const showSeenAvatar = isOwnMessage && (
                                message.id === lastReadOwnMessageId ||
                                message.id === pendingStatusMessageId
                            );
                            
                            return (
                                <div key={message.id} className="px-2">
                                    <MessageBubble
                                        message={message}
                                        isOwnMessage={isOwnMessage}
                                        senderName={message.sender?.full_name || 'Unknown'}
                                        showTail={showTail}
                                        showSeenAvatar={showSeenAvatar}
                                        recipientAvatarUrl={otherUserAvatarUrl}
                                        recipientName={otherUserName}
                                    />
                                </div>
                            );
                        });
                    })()}
                </div>

                {/* Typing indicator at bottom */}
                <TypingHeader conversationId={conversationId} onTypingChange={handleTypingChange} />

                {/* Scroll anchor */}
                <div ref={messagesEndRef} />
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
