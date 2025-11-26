'use client';

import React from 'react';
import { Conversation } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, formatConversationTime, truncate } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';

interface ChatRowProps {
  conversation: Conversation;
  isActive?: boolean;
  onClick?: () => void;
  searchQuery?: string;
  currentUserId?: string;
}

// Separate component for typing indicator to avoid memo issues
function TypingOrMessage({
  conversationId,
  lastMessage,
  unreadCount,
  searchQuery,
  highlightText
}: {
  conversationId: string;
  lastMessage: string;
  unreadCount: number;
  searchQuery: string;
  highlightText: (text: string) => React.ReactNode;
}) {
  // This hook will cause re-render when typing status changes
  const typingUser = useUIStore((state) => state.typingUsers.get(conversationId));

  if (typingUser) {
    return (
      <p className="text-[15px] truncate leading-5 text-primary italic">
        typing...
      </p>
    );
  }

  return (
    <p className={cn(
      "text-[15px] truncate leading-5",
      unreadCount > 0 ? "text-foreground font-semibold" : "text-muted-foreground"
    )}>
      {highlightText(truncate(lastMessage, 40))}
    </p>
  );
}

function ChatRowComponent({
  conversation,
  isActive = false,
  onClick,
  searchQuery = '',
  currentUserId,
}: ChatRowProps) {
  const { other_user, last_message_content, last_message_time, last_message_sender_id, unread_count } = conversation;

  // Generate initials for avatar fallback
  const initials = other_user.full_name
    ? other_user.full_name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    : other_user.email.slice(0, 2).toUpperCase();

  // Highlight matching text
  const highlightText = (text: string): React.ReactNode => {
    if (!searchQuery.trim()) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = searchQuery.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) return text;

    return (
      <>
        {text.slice(0, index)}
        <span className="text-primary font-bold">
          {text.slice(index, index + searchQuery.length)}
        </span>
        {text.slice(index + searchQuery.length)}
      </>
    );
  };

  const displayName = other_user.full_name || other_user.email;

  // Format last message with "You:" prefix if sent by current user
  const formatLastMessage = () => {
    if (!last_message_content) return 'No messages yet';

    const isOwnMessage = currentUserId && last_message_sender_id === currentUserId;
    const prefix = isOwnMessage ? 'You: ' : '';
    return prefix + last_message_content;
  };

  const lastMessage = formatLastMessage();
  const timestamp = last_message_time ? formatConversationTime(last_message_time) : '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      aria-label={`Chat with ${displayName}${unread_count > 0 ? `, ${unread_count} unread messages` : ''}`}
      aria-current={isActive ? 'true' : 'false'}
      className={cn(
        'group flex items-center gap-4 px-4 py-0 h-[80px] cursor-pointer transition-colors duration-200 hover:bg-accent focus:outline-none focus:bg-accent mx-2 rounded-xl',
        isActive && 'bg-accent hover:bg-accent'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="h-[54px] w-[54px]">
          {other_user.avatar_url && (
            <AvatarImage src={other_user.avatar_url} alt={displayName} className="object-cover" />
          )}
          <AvatarFallback className="bg-muted text-muted-foreground font-medium text-xl">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center h-full border-b border-border/50 pr-2 group-last:border-none">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[18px] text-foreground truncate leading-6 font-medium">
            {highlightText(displayName)}
          </p>
          {timestamp && (
            <span
              className={cn(
                'text-[13px] leading-4 transition-colors ml-2',
                unread_count > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {timestamp}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <TypingOrMessage
            conversationId={conversation.id}
            lastMessage={lastMessage}
            unreadCount={unread_count}
            searchQuery={searchQuery}
            highlightText={highlightText}
          />

          {unread_count > 0 && (
            <div className="flex-shrink-0">
              <Badge
                className="rounded-full h-[24px] min-w-[24px] px-2 flex items-center justify-center bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary border-none shadow-none"
                aria-label={`${unread_count} unread messages`}
              >
                {unread_count > 99 ? '99+' : unread_count}
              </Badge>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Memoize with custom comparison function
export const ChatRow = React.memo(ChatRowComponent, (prevProps, nextProps) => {
  // Only re-render if these specific properties change
  return (
    prevProps.conversation.id === nextProps.conversation.id &&
    prevProps.conversation.last_message_content === nextProps.conversation.last_message_content &&
    prevProps.conversation.last_message_time === nextProps.conversation.last_message_time &&
    prevProps.conversation.last_message_sender_id === nextProps.conversation.last_message_sender_id &&
    prevProps.conversation.unread_count === nextProps.conversation.unread_count &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.currentUserId === nextProps.currentUserId
  );
});

ChatRow.displayName = 'ChatRow';
