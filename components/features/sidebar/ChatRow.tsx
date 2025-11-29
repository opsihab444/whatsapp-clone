'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Conversation } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatConversationTime, truncate } from '@/lib/utils';
import { useUIStore } from '@/store/ui.store';
import { toggleFavorite, deleteConversation, blockUser } from '@/services/chat.service';
import { createClient } from '@/lib/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { showSuccessToast, showErrorToast } from '@/lib/toast.utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronDown,
  Archive,
  BellOff,
  Pin,
  Tag,
  MessageSquare,
  Heart,
  HeartOff,
  Trash2,
  Ban,
  Loader2
} from 'lucide-react';

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();

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
    // If no content but has timestamp, it's likely an image message (content is null for images)
    if (!last_message_content) {
      if (last_message_time) {
        // Has a message but content is null - likely an image
        const isOwnMessage = currentUserId && last_message_sender_id === currentUserId;
        return isOwnMessage ? 'You: 📷 Photo' : '📷 Photo';
      }
      return 'No messages yet';
    }

    const isOwnMessage = currentUserId && last_message_sender_id === currentUserId;
    const prefix = isOwnMessage ? 'You: ' : '';
    return prefix + last_message_content;
  };

  const lastMessage = formatLastMessage();
  const timestamp = last_message_time ? formatConversationTime(last_message_time) : '';

  // Handlers for menu actions
  const handleArchive = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Archive chat', conversation.id);
  };

  const handleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Mute chat', conversation.id);
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Pin chat', conversation.id);
  };

  const handleLabel = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Label chat', conversation.id);
  };

  const handleMarkUnread = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log('Mark as unread', conversation.id);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavorite(conversation.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const handleBlock = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowBlockConfirm(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    const result = await deleteConversation(supabase, conversation.id);
    
    if (result.success) {
      queryClient.setQueryData(['conversations'], (old: Conversation[] | undefined) => {
        if (!old) return old;
        return old.filter((conv) => conv.id !== conversation.id);
      });
      queryClient.removeQueries({ queryKey: ['messages', conversation.id] });
      showSuccessToast('Chat deleted');
      if (isActive) {
        router.push('/');
      }
    } else {
      showErrorToast(result.error.message);
    }
    
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  };

  const confirmBlock = async () => {
    setIsBlocking(true);
    const result = await blockUser(supabase, other_user.id);
    
    if (result.success) {
      showSuccessToast(`${displayName} has been blocked`);
      // Broadcast block status to the other user
      await supabase.channel(`typing:${conversation.id}`).send({
        type: 'broadcast',
        event: 'block_status',
        payload: {
          blockerId: currentUserId,
          blockedId: other_user.id,
          isBlocked: true,
        },
      });
    } else {
      showErrorToast(result.error.message);
    }
    
    setIsBlocking(false);
    setShowBlockConfirm(false);
  };

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
        'group flex items-center gap-4 px-4 py-3 cursor-pointer transition-all duration-300 hover:bg-accent/50 focus:outline-none focus:bg-accent/50 mx-2 rounded-xl border border-transparent hover:border-border/50 relative',
        isActive && 'bg-accent shadow-sm border-border/50'
      )}
    >
      {/* Avatar */}
      <div className="relative shrink-0 transition-transform duration-300 group-hover:scale-105">
        <Avatar className="h-[50px] w-[50px] ring-2 ring-transparent group-hover:ring-primary/20 transition-all">
          {other_user.avatar_url && (
            <AvatarImage src={other_user.avatar_url} alt={displayName} className="object-cover" />
          )}
          <AvatarFallback className="bg-muted text-muted-foreground font-medium text-xl">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center h-full pr-2">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[18px] text-foreground truncate leading-6 font-medium flex items-center gap-1">
            {highlightText(displayName)}
          </p>
          {timestamp && (
            <span
              className={cn(
                'text-[13px] leading-4 transition-colors ml-2 group-hover:hidden',
                unread_count > 0 ? 'text-primary font-semibold' : 'text-muted-foreground'
              )}
            >
              {timestamp}
            </span>
          )}

          {/* Dropdown Menu Trigger - Visible on Hover */}
          <div className="hidden group-hover:block absolute right-4 top-3 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="p-1 rounded-full hover:bg-background/80 text-muted-foreground hover:text-foreground transition-colors shadow-sm bg-background/50 backdrop-blur-sm">
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onClick={handleArchive}>
                  <Archive className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Archive chat</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMute}>
                  <BellOff className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Mute notifications</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePin}>
                  <Pin className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Pin chat</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLabel}>
                  <Tag className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Label chat</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMarkUnread}>
                  <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Mark as unread</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleFavorite}>
                  {conversation.is_favorite ? (
                    <HeartOff className="mr-2 h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Heart className="mr-2 h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{conversation.is_favorite ? 'Remove from favourites' : 'Add to favorites'}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleBlock}>
                  <Ban className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>Block user</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete chat</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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

      {/* Delete Confirmation Modal - Using Portal for full screen */}
      {showDeleteConfirm && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
          onClick={(e) => {
            e.stopPropagation();
            setShowDeleteConfirm(false);
          }}
        >
          <div 
            className="bg-background rounded-xl p-6 mx-4 max-w-md w-full shadow-2xl border border-border/50 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-foreground mb-3">Delete chat?</h3>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              Messages will be removed from this device. {displayName} will still be able to see the chat history.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(false);
                }}
                disabled={isDeleting}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete();
                }}
                disabled={isDeleting}
                className="px-6"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Block Confirmation Modal - Using Portal for full screen */}
      {showBlockConfirm && createPortal(
        <div 
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]"
          onClick={(e) => {
            e.stopPropagation();
            setShowBlockConfirm(false);
          }}
        >
          <div 
            className="bg-background rounded-xl p-6 mx-4 max-w-md w-full shadow-2xl border border-border/50 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-semibold text-foreground mb-3">Block {displayName}?</h3>
            <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
              Blocked contacts will no longer be able to send you messages. You won&apos;t receive any messages from {displayName}.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowBlockConfirm(false);
                }}
                disabled={isBlocking}
                className="px-6"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmBlock();
                }}
                disabled={isBlocking}
                className="px-6"
              >
                {isBlocking ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Blocking...
                  </>
                ) : (
                  'Block'
                )}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
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
    prevProps.conversation.is_favorite === nextProps.conversation.is_favorite &&
    // Check for profile updates (name/avatar changes)
    prevProps.conversation.other_user?.full_name === nextProps.conversation.other_user?.full_name &&
    prevProps.conversation.other_user?.avatar_url === nextProps.conversation.other_user?.avatar_url &&
    prevProps.isActive === nextProps.isActive &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.currentUserId === nextProps.currentUserId
  );
});

ChatRow.displayName = 'ChatRow';
