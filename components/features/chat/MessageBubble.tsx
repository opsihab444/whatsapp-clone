'use client';

import React from 'react';
import { Message } from '@/types';
import { cn, formatMessageTimeDisplay } from '@/lib/utils';
import { Check, CheckCheck, MoreVertical, Edit, Trash2, Reply } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  senderName?: string;
}

function MessageBubbleComponent({ message, isOwnMessage, senderName }: MessageBubbleProps) {
  const {
    id,
    content,
    status,
    is_edited,
    is_deleted,
    created_at,
  } = message;

  // Get UI store actions
  const openEditModal = useUIStore((state) => state.openEditModal);
  const openDeleteModal = useUIStore((state) => state.openDeleteModal);
  const setReplyTo = useUIStore((state) => state.setReplyTo);

  // Render status indicator for own messages - WhatsApp style
  const renderStatusIndicator = () => {
    if (!isOwnMessage) return null;

    switch (status) {
      case 'queued':
        return <span className="text-[10px] opacity-70">⏱️</span>;
      case 'sending':
        return <Check className="w-4 h-4 opacity-50" strokeWidth={2.5} />;
      case 'sent':
        return <Check className="w-4 h-4 opacity-60" strokeWidth={2.5} />;
      case 'delivered':
        return <CheckCheck className="w-4 h-4 opacity-60" strokeWidth={2.5} />;
      case 'read':
        return <CheckCheck className="w-4 h-4 text-[#53bdeb]" strokeWidth={2.5} />;
      default:
        return null;
    }
  };

  // Display content based on deleted status
  const displayContent = is_deleted ? 'This message was deleted' : content;

  const handleEdit = () => {
    if (content) {
      openEditModal(id);
    }
  };

  const handleDelete = () => {
    openDeleteModal(id);
  };

  const handleReply = () => {
    if (content) {
      setReplyTo({
        id,
        content,
        senderName: senderName || 'Unknown',
      });
    }
  };

  return (
    <div
      className={cn(
        'flex w-full mb-1 group relative px-[6%] md:px-[9%]',
        isOwnMessage ? 'justify-end' : 'justify-start'
      )}
      role="article"
      aria-label={`Message ${is_deleted ? 'deleted' : ''} ${is_edited ? 'edited' : ''}`}
    >
      <div className={cn(
        "flex flex-col max-w-[65%] relative group/bubble",
        isOwnMessage ? "items-end" : "items-start"
      )}>

        <div className={cn(
          "flex relative",
          isOwnMessage ? "flex-row-reverse" : "flex-row"
        )}>
          {/* Tail SVG */}
          <div className={cn(
            "absolute top-0 w-2 h-3 z-10",
            isOwnMessage ? "-right-2" : "-left-2"
          )}>
            {isOwnMessage ? (
              <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="none" className="fill-chat-bubble-out block">
                <path d="M5.188 1H0v11.193l6.467-8.625C7.526 2.156 6.958 1 5.188 1z"></path>
              </svg>
            ) : (
              <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="none" className="fill-chat-bubble-in block">
                <path d="M1.533 3.568L8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"></path>
              </svg>
            )}
          </div>

          {/* Bubble */}
          <div
            className={cn(
              'rounded-lg px-2 py-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] relative text-[14.2px] leading-[19px]',
              isOwnMessage
                ? 'bg-chat-bubble-out text-white rounded-tr-none'
                : 'bg-chat-bubble-in text-[#e9edef] rounded-tl-none',
              is_deleted && 'italic opacity-70'
            )}
          >
            {/* Message content with space for timestamp */}
            <div className="whitespace-pre-wrap break-words pr-[70px] pb-[2px] min-h-[20px]">
              {displayContent}
            </div>

            {/* Timestamp and status INSIDE bubble at bottom-right */}
            <div className="absolute bottom-[5px] right-[7px] flex items-center gap-1">
              {is_edited && !is_deleted && (
                <span className={cn(
                  "text-[11px] mr-1",
                  isOwnMessage ? "text-[rgba(255,255,255,0.6)]" : "text-[rgba(241,241,242,0.63)]"
                )}>edited</span>
              )}
              <time className={cn(
                "text-[11px] leading-[15px]",
                isOwnMessage ? "text-[rgba(255,255,255,0.6)]" : "text-[rgba(241,241,242,0.63)]"
              )} dateTime={created_at}>
                {formatMessageTimeDisplay(created_at)}
              </time>
              {isOwnMessage && (
                <span aria-label={`Message status: ${status}`} className="flex items-center">
                  {renderStatusIndicator()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Context menu - inline menu without portal */}
        {!is_deleted && (
          <div className={cn(
            "absolute top-0 z-20",
            isOwnMessage ? "-left-8" : "-right-8"
          )}>
            <div className="relative group/menu">
              <button
                className="h-6 w-6 inline-flex items-center justify-center rounded-full bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground shadow-sm backdrop-blur-sm opacity-0 group-hover/bubble:opacity-100 transition-opacity"
                aria-label="Message options"
                onClick={(e) => {
                  e.stopPropagation();
                  const menu = e.currentTarget.nextElementSibling as HTMLElement;
                  if (menu) {
                    menu.classList.toggle('hidden');
                  }
                }}
                onBlur={(e) => {
                  setTimeout(() => {
                    const menu = e.currentTarget.nextElementSibling as HTMLElement;
                    if (menu && !menu.contains(document.activeElement)) {
                      menu.classList.add('hidden');
                    }
                  }, 200);
                }}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </button>

              {/* Inline dropdown menu */}
              <div
                className={cn(
                  "hidden absolute top-full mt-1 min-w-[10rem] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg backdrop-blur-sm bg-opacity-95",
                  isOwnMessage ? "right-0" : "left-0"
                )}
                onClick={(e) => e.currentTarget.classList.add('hidden')}
              >
                <div
                  role="menuitem"
                  className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                  onClick={handleReply}
                >
                  <Reply className="mr-2 h-4 w-4" />
                  Reply
                </div>
                {isOwnMessage && (
                  <>
                    <div
                      role="menuitem"
                      className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
                      onClick={handleEdit}
                    >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </div>
                    <div
                      role="menuitem"
                      className="relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground text-destructive"
                      onClick={handleDelete}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Memoize with custom comparison to prevent unnecessary re-renders
export const MessageBubble = React.memo(MessageBubbleComponent, (prevProps, nextProps) => {
  // Only re-render if these message properties change
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.is_edited === nextProps.message.is_edited &&
    prevProps.message.is_deleted === nextProps.message.is_deleted &&
    prevProps.message.created_at === nextProps.message.created_at &&
    prevProps.isOwnMessage === nextProps.isOwnMessage &&
    prevProps.senderName === nextProps.senderName
  );
});

MessageBubble.displayName = 'MessageBubble';
