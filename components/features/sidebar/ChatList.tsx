'use client';

import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChatRow } from './ChatRow';
import { ChatListSkeleton } from './ChatListSkeleton';
import { useChatList } from '@/hooks/useChatList';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ChatListProps {
  searchQuery: string;
  activeChatId?: string;
  onChatSelect?: (chatId: string) => void;
}

/**
 * Virtualized conversation list component
 * Uses @tanstack/react-virtual for performance with large lists
 * Integrates with useChatList hook for data fetching
 */
export function ChatList({ searchQuery, activeChatId, onChatSelect }: ChatListProps) {
  const { conversations, isLoading, isError, error, refetch } = useChatList(searchQuery);
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: conversations?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Fixed height from ChatRow
    overscan: 5,
  });

  // Loading state
  if (isLoading) {
    return <ChatListSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex items-center justify-center h-full p-4 animate-fade-in">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-destructive mb-2">Failed to load conversations</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : 'An unknown error occurred'}
          </p>
          <Button
            onClick={() => refetch()}
            variant="outline"
            size="sm"
            className="mt-2"
            aria-label="Retry loading conversations"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state - no conversations
  if (!conversations || conversations.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-4 animate-fade-in" role="status">
        <div className="text-center">
          <p className="text-sm font-medium text-muted-foreground mb-1">
            {searchQuery ? 'No conversations found' : 'No conversations yet'}
          </p>
          <p className="text-xs text-muted-foreground">
            {searchQuery ? 'Try a different search query' : 'Start a new conversation to get started'}
          </p>
        </div>
      </div>
    );
  }

  // Render virtualized list
  return (
    <div
      ref={parentRef}
      role="list"
      aria-label="Conversations"
      className="h-full w-full overflow-y-auto contain-strict scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const conversation = conversations[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <ChatRow
                conversation={conversation}
                isActive={activeChatId === conversation.id}
                onClick={() => onChatSelect?.(conversation.id)}
                searchQuery={searchQuery}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
