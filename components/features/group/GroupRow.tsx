'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { GroupConversation } from '@/types';
import { formatConversationTime } from '@/lib/utils';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GroupRowProps {
  group: GroupConversation;
  isActive: boolean;
  onClick: () => void;
  currentUserId?: string;
}

export function GroupRow({ group, isActive, onClick, currentUserId }: GroupRowProps) {
  const initials = group.group.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const isOwnMessage = group.last_message_sender_id === currentUserId;
  const senderPrefix = isOwnMessage ? 'You: ' : group.last_message_sender_name ? `${group.last_message_sender_name.split(' ')[0]}: ` : '';

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 hover:bg-accent/50 transition-colors text-left',
        isActive && 'bg-accent'
      )}
    >
      <Avatar className="h-12 w-12 flex-shrink-0">
        {group.group.avatar_url && <AvatarImage src={group.group.avatar_url} />}
        <AvatarFallback className="bg-primary/20 text-primary">
          <Users className="h-5 w-5" />
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium text-foreground truncate">{group.group.name}</span>
          {group.last_message_time && (
            <span className={cn(
              'text-xs flex-shrink-0',
              group.unread_count > 0 ? 'text-primary font-medium' : 'text-muted-foreground'
            )}>
              {formatConversationTime(group.last_message_time)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-sm text-muted-foreground truncate">
            {group.last_message_content ? (
              <>
                <span className="text-muted-foreground/80">{senderPrefix}</span>
                {group.last_message_content}
              </>
            ) : (
              'No messages yet'
            )}
          </p>
          {group.unread_count > 0 && (
            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center">
              {group.unread_count > 99 ? '99+' : group.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
