'use client';

import { CSSProperties, ReactElement } from 'react';
import { List, useListRef } from 'react-window';
import { ChatRow } from './ChatRow';
import { GroupRow } from '@/components/features/group/GroupRow';
import { ChatListSkeleton } from './ChatListSkeleton';
import { useAppReady } from '@/hooks/useAppReady';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conversation, GroupConversation } from '@/types';

type ChatItem = Conversation | GroupConversation;

interface ChatListProps {
  items: ChatItem[];
  isLoading: boolean;
  activeId?: string;
  onSelect: (item: ChatItem) => void;
  searchQuery: string;
  currentUserId?: string;
  isError?: boolean;
  onRetry?: () => void;
}

// Row props for react-window
interface RowProps {
  items: ChatItem[];
  activeId?: string;
  onSelect: (item: ChatItem) => void;
  searchQuery: string;
  currentUserId?: string;
}

// Helper to check if item is a group
function isGroup(item: ChatItem): item is GroupConversation {
  return 'group' in item;
}

// Row component for virtualized list
function ChatListRow({
  index,
  style,
  items,
  activeId,
  onSelect,
  searchQuery,
  currentUserId,
}: {
  ariaAttributes: { "aria-posinset": number; "aria-setsize": number; role: "listitem" };
  index: number;
  style: CSSProperties;
} & RowProps): ReactElement {
  const item = items[index];

  if (isGroup(item)) {
    return (
      <div style={style}>
        <GroupRow
          group={item}
          isActive={activeId === item.id}
          onClick={() => onSelect(item)}
          currentUserId={currentUserId}
          searchQuery={searchQuery}
        />
      </div>
    );
  }

  return (
    <div style={style}>
      <ChatRow
        conversation={item}
        isActive={activeId === item.id}
        onClick={() => onSelect(item)}
        searchQuery={searchQuery}
        currentUserId={currentUserId}
      />
    </div>
  );
}

/**
 * Virtualized conversation list component
 * Uses react-window for performance with large lists
 */
export function ChatList({ 
  items, 
  isLoading, 
  activeId, 
  onSelect, 
  searchQuery, 
  currentUserId,
  isError,
  onRetry
}: ChatListProps) {
  const isAppReady = useAppReady();
  const listRef = useListRef(null);

  // Show skeleton until ALL critical data is loaded
  if (isLoading || !isAppReady) {
    return <ChatListSkeleton />;
  }

  // Error state
  if (isError) {
    return (
      <div className="flex items-center justify-center h-full p-4 animate-fade-in">
        <div className="text-center space-y-3">
          <p className="text-sm font-medium text-destructive mb-2">Failed to load conversations</p>
          <Button
            onClick={onRetry}
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

  // Empty state
  if (!items || items.length === 0) {
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

  return (
    <List
      listRef={listRef}
      rowCount={items.length}
      rowHeight={80}
      rowComponent={ChatListRow}
      rowProps={{
        items,
        activeId,
        onSelect,
        searchQuery,
        currentUserId,
      }}
      className="h-full w-full scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent"
      overscanCount={5}
    />
  );
}
