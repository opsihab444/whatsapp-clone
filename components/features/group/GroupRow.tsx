'use client';

import React from 'react';
import { GroupConversation } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn, formatConversationTime, truncate } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import { Users } from 'lucide-react';

interface GroupRowProps {
  group: GroupConversation;
  isActive: boolean;
  onClick: () => void;
  currentUserId?: string;
  searchQuery?: string;
}

// Separate component for typing indicator to avoid memo issues
function TypingOrMessage({
  groupId,
  lastMessage,
  unreadCount,
  searchQuery,
  highlightText,
  senderPrefix
}: {
  groupId: string;
  lastMessage: string;
  unreadCount: number;
  searchQuery?: string;
  highlightText: (text: string) => React.ReactNode;
  senderPrefix: string;
}) {
  // This hook will cause re-render when typing status changes
  const typingUser = useUIStore((state) => state.typingUsers.get(groupId));
  const typingUsersMap = useUIStore((state) => state.typingUsersMultiple.get(groupId));

  // Prioritize multiple typing users if available
  const typingUsers = typingUsersMap && typingUsersMap.size > 0
    ? Array.from(typingUsersMap.values())
    : (typingUser ? [typingUser] : []);

  if (typingUsers.length > 0) {
    const text = typingUsers.length === 1
      ? `${typingUsers[0].userName} is typing...`
      : `${typingUsers.length} people are typing...`;

    return (
      <p className="text-[15px] truncate leading-5 text-primary italic">
        {text}
      </p>
    );
  }

  return (
    <p className={cn(
      "text-[15px] truncate leading-5",
      unreadCount > 0 ? "text-foreground font-semibold" : "text-muted-foreground"
    )}>
      <span className="text-muted-foreground/80">{senderPrefix}</span>
      {highlightText(truncate(lastMessage, 40))}
    </p>
  );
}

function GroupRowComponent({
  group,
  isActive,
  onClick,
  currentUserId,
  searchQuery = ''
}: GroupRowProps) {
  const {
    last_message_content,
    last_message_time,
    last_message_sender_id,
    last_message_sender_name,
    unread_count
  } = group;

  // Generate initials for avatar fallback
  const initials = group.group.name
    ? group.group.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    : 'GR';

  // Highlight matching text
  const highlightText = (text: string): React.ReactNode => {
    if (!searchQuery?.trim()) return text;

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

  const displayName = group.group.name;

  // Format last message with sender prefix
  const isOwnMessage = currentUserId && last_message_sender_id === currentUserId;
  const senderPrefix = isOwnMessage
    ? 'You: '
    : last_message_sender_name
      ? `${last_message_sender_name.split(' ')[0]}: `
      : '';

  const lastMessage = last_message_content || 'No messages yet';
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
      aria-label={`Group chat ${displayName}${unread_count > 0 ? `, ${unread_count} unread messages` : ''}`}
      aria-current={isActive ? 'true' : 'false'}
      className={cn(
        'group flex items-center gap-4 px-4 py-0 h-[80px] cursor-pointer transition-colors duration-200 hover:bg-accent focus:outline-none focus:bg-accent mx-2 rounded-xl',
        isActive && 'bg-accent hover:bg-accent'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="h-[54px] w-[54px]">
          {group.group.avatar_url && (
            <AvatarImage src={group.group.avatar_url} alt={displayName} className="object-cover" />
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
            groupId={group.group.id}
            lastMessage={lastMessage}
            unreadCount={unread_count}
            searchQuery={searchQuery}
            highlightText={highlightText}
            senderPrefix={senderPrefix}
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
export const GroupRow = React.memo(GroupRowComponent, (prevProps, nextProps) => {
  // Only re-render if these specific properties change
  return (
    prevProps.group.id === nextProps.group.id &&
    prevProps.group.last_message_content === nextProps.group.last_message_content &&
    prevProps.group.last_message_time === nextProps.group.last_message_time &&
    prevProps.group.last_message_sender_id === nextProps.group.last_message_sender_id &&
    prevProps.group.unread_count === nextProps.group.unread_count &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.currentUserId === nextProps.currentUserId
  );
});

GroupRow.displayName = 'GroupRow';
