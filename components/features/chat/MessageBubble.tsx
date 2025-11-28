'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message } from '@/types';
import { cn, formatMessageTimeDisplay } from '@/lib/utils';
import { Check, CheckCheck, ChevronDown, Edit, Trash2, Reply, Copy, Info, Loader2 } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Global cache for blob URLs (for sender's optimistic UI)
const blobUrlCache = new Map<string, string>();

// Global cache for loaded CDN images (prevents reload on conversation switch)
const loadedImageCache = new Set<string>();

// Cache for image dimensions (for images without saved dimensions)
const dimensionCache = new Map<string, { width: number; height: number }>();

// Calculate display dimensions with max size constraint
function calculateDisplayDimensions(w: number | null | undefined, h: number | null | undefined, maxSize = 300) {
  if (!w || !h) return { width: 200, height: 200 };

  let displayW = w;
  let displayH = h;

  if (w > maxSize || h > maxSize) {
    if (w > h) {
      displayH = Math.round((h / w) * maxSize);
      displayW = maxSize;
    } else {
      displayW = Math.round((w / h) * maxSize);
      displayH = maxSize;
    }
  }

  return { width: displayW, height: displayH };
}

// Facebook Messenger style image component with dimension-based skeleton
function ImageMessageContent({
  mediaUrl,
  blobUrl,
  status,
  createdAt,
  messageId,
  width,
  height,
  isLatest,
}: {
  mediaUrl: string;
  blobUrl?: string | null;
  status: string;
  createdAt: string;
  isOwnMessage: boolean;
  messageId: string;
  width?: number | null;
  height?: number | null;
  isLatest?: boolean;
}) {
  const isBlobUrl = mediaUrl.startsWith('blob:');
  const cachedBlobUrl = blobUrlCache.get(messageId) || blobUrlCache.get(mediaUrl) || blobUrl;
  const wasAlreadyLoaded = !isBlobUrl && loadedImageCache.has(mediaUrl);
  const cachedDimensions = dimensionCache.get(mediaUrl);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(isLatest || wasAlreadyLoaded);
  const [cdnLoaded, setCdnLoaded] = useState(wasAlreadyLoaded);
  const [cdnError, setCdnError] = useState(false);

  // Calculate stable display dimensions - prioritize saved DB dimensions
  const { width: displayWidth, height: displayHeight } = useMemo(() => {
    // 1. Use saved dimensions from database (most reliable)
    if (width && height) {
      return calculateDisplayDimensions(width, height);
    }
    // 2. Use cached dimensions from previous load
    if (cachedDimensions) {
      return cachedDimensions;
    }
    // 3. Fallback to fixed size (prevents layout shift)
    return { width: 200, height: 200 };
  }, [width, height, cachedDimensions]);

  // Lazy load with IntersectionObserver (only for non-latest images)
  useEffect(() => {
    if (isLatest || wasAlreadyLoaded || isVisible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [isLatest, wasAlreadyLoaded, isVisible]);

  useEffect(() => {
    if (isBlobUrl && mediaUrl) {
      blobUrlCache.set(messageId, mediaUrl);
    }
  }, [isBlobUrl, mediaUrl, messageId]);

  useEffect(() => {
    if (cdnLoaded && !isBlobUrl) {
      loadedImageCache.add(mediaUrl);
      const cached = blobUrlCache.get(messageId);
      if (cached) {
        setTimeout(() => {
          URL.revokeObjectURL(cached);
          blobUrlCache.delete(messageId);
          blobUrlCache.delete(mediaUrl);
        }, 1000);
      }
    }
  }, [cdnLoaded, isBlobUrl, messageId, mediaUrl]);

  const showBlobUrl = isBlobUrl || (!cdnLoaded && cachedBlobUrl);
  const displayUrl = showBlobUrl ? (isBlobUrl ? mediaUrl : cachedBlobUrl) : mediaUrl;

  // Handle image load and dimension capture
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setCdnLoaded(true);

    // Cache dimensions for future use (only if not already saved in DB)
    if (!width && !cachedDimensions) {
      const dims = calculateDisplayDimensions(img.naturalWidth, img.naturalHeight);
      dimensionCache.set(mediaUrl, dims);
      // Note: We don't update state here to avoid layout shift
      // The fixed container size prevents any visual jump
    }
  };

  // Fixed container with exact dimensions (prevents layout shift)
  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl bg-muted"
      style={{ width: displayWidth, height: displayHeight }}
    >
      {/* Only load image when visible or is latest */}
      {isVisible && (
        <>
          {/* Blob URL for instant display */}
          {showBlobUrl && displayUrl && (
            <img
              src={displayUrl}
              alt="Image message"
              className="rounded-2xl object-cover w-full h-full"
            />
          )}

          {/* CDN image */}
          {!isBlobUrl && !cdnError && (
            <img
              src={mediaUrl}
              alt="Image message"
              className={cn(
                'rounded-2xl object-cover w-full h-full transition-opacity duration-200',
                cdnLoaded && !showBlobUrl ? 'opacity-100' : cachedBlobUrl ? 'hidden' : cdnLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={handleImageLoad}
              onError={() => setCdnError(true)}
              loading="eager"
            />
          )}
        </>
      )}

      {/* Sending overlay with large spinner */}
      {status === 'sending' && (
        <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
          <div className="relative">
            <svg className="w-16 h-16 animate-spin" viewBox="0 0 50 50">
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="4"
              />
              <circle
                cx="25"
                cy="25"
                r="20"
                fill="none"
                stroke="white"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="80"
                strokeDashoffset="60"
              />
            </svg>
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div className="absolute bottom-2 right-2 bg-black/50 rounded px-1.5 py-0.5">
        <time className="text-[11px] text-white" dateTime={createdAt}>
          {formatMessageTimeDisplay(createdAt)}
        </time>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
  isOwnMessage: boolean;
  senderName?: string;
  showTail?: boolean; // Show tail only for first message in a group from same sender
  // Facebook Messenger style seen indicator
  showSeenAvatar?: boolean; // Show recipient avatar below message when seen
  recipientAvatarUrl?: string | null;
  recipientName?: string | null;
  isLatestImage?: boolean; // Priority load for latest images
}

function MessageBubbleComponent({
  message,
  isOwnMessage,
  senderName,
  showTail = true,
  showSeenAvatar = false,
  recipientAvatarUrl,
  recipientName,
  isLatestImage = false,
}: MessageBubbleProps) {
  const {
    id,
    content,
    type,
    media_url,
    status,
    is_edited,
    is_deleted,
    created_at,
  } = message;

  // Get UI store actions
  const openEditModal = useUIStore((state) => state.openEditModal);
  const openDeleteModal = useUIStore((state) => state.openDeleteModal);
  const setReplyTo = useUIStore((state) => state.setReplyTo);

  // Render status indicator for own messages - Facebook Messenger style
  // All status indicators shown below message, not inside bubble
  const renderStatusIndicator = () => {
    // Don't show anything inside bubble - all status shown below
    return null;
  };

  // Render status text below message (Facebook Messenger style)
  const renderStatusBelow = () => {
    if (!isOwnMessage) return null;

    // Show "Sending..." for queued/sending messages
    if ((status === 'queued' || status === 'sending') && showSeenAvatar) {
      return (
        <div className="flex justify-end mt-1 mr-1">
          <span className="text-[11px] text-muted-foreground">Sending...</span>
        </div>
      );
    }

    // If this message shows seen avatar, don't show "Sent" text
    if (showSeenAvatar && status === 'read') {
      return (
        <div className="flex justify-end mt-1 mr-1">
          <Avatar className="h-4 w-4">
            <AvatarImage src={recipientAvatarUrl || undefined} className="object-cover" />
            <AvatarFallback className="bg-muted text-muted-foreground text-[8px]">
              {recipientName?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
        </div>
      );
    }

    // Show "Sent" for sent/delivered messages (only on last message in group)
    if ((status === 'sent' || status === 'delivered') && showSeenAvatar) {
      return (
        <div className="flex justify-end mt-1 mr-1">
          <span className="text-[11px] text-muted-foreground">Sent</span>
        </div>
      );
    }

    return null;
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

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
    }
  };

  return (
    <div
      className={cn(
        'flex w-full mb-2 group relative px-[4%] md:px-[8%] animate-slide-up',
        isOwnMessage ? 'justify-end' : 'justify-start'
      )}
      role="article"
      aria-label={`Message ${is_deleted ? 'deleted' : ''} ${is_edited ? 'edited' : ''}`}
    >
      <div className={cn(
        "flex flex-col max-w-[75%] md:max-w-[65%] relative group/bubble",
        isOwnMessage ? "items-end" : "items-start"
      )}>

        <div className={cn(
          "flex relative",
          isOwnMessage ? "flex-row-reverse" : "flex-row"
        )}>
          {/* Tail SVG - only show for first message in group */}
          {showTail && (
            <div className={cn(
              "absolute top-[-1px] w-2 h-3 z-10",
              isOwnMessage ? "-right-2" : "-left-2",
              is_deleted && "opacity-70"
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
          )}

          {/* Bubble */}
          <div
            className={cn(
              'rounded-[22px] relative text-[15px] leading-[22px]',
              type === 'image' ? 'p-1' : 'px-3 py-2',
              isOwnMessage
                ? cn('bg-primary text-primary-foreground', showTail && 'rounded-tr-none')
                : cn('bg-[hsl(var(--chat-bubble-in))] text-foreground', showTail && 'rounded-tl-none'),
              is_deleted && 'italic opacity-70'
            )}
          >
            {/* Image message */}
            {type === 'image' && media_url && !is_deleted ? (
              <ImageMessageContent
                mediaUrl={media_url}
                blobUrl={(message as any)._blobUrl}
                status={status}
                createdAt={created_at}
                isOwnMessage={isOwnMessage}
                messageId={id}
                width={message.media_width}
                height={message.media_height}
                isLatest={isLatestImage}
              />
            ) : (
              <>
                {/* Text message content with space for timestamp */}
                <div className="whitespace-pre-wrap break-words pr-[75px] pb-[3px] min-h-[22px]">
                  {displayContent}
                </div>

                {/* Timestamp and status INSIDE bubble at bottom-right */}
                <div className="absolute bottom-[6px] right-[8px] flex items-center gap-1">
                  {is_edited && !is_deleted && (
                    <span className={cn(
                      "text-[11px] mr-1",
                      isOwnMessage ? "text-primary-foreground/60" : "text-muted-foreground"
                    )}>edited</span>
                  )}
                  <time className={cn(
                    "text-[11px] leading-[15px]",
                    isOwnMessage ? "text-primary-foreground/60" : "text-muted-foreground"
                  )} dateTime={created_at}>
                    {formatMessageTimeDisplay(created_at)}
                  </time>
                  {isOwnMessage && (
                    <span aria-label={`Message status: ${status}`} className="flex items-center">
                      {renderStatusIndicator()}
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* WhatsApp style dropdown arrow - appears on hover inside bubble */}
        {!is_deleted && (
          <div
            className={cn(
              "absolute top-1 z-20",
              isOwnMessage ? "right-2" : "right-2"
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "h-5 w-5 inline-flex items-center justify-center rounded-full transition-all duration-200",
                    "opacity-0 group-hover/bubble:opacity-100 hover:bg-black/20",
                    "data-[state=open]:opacity-100 data-[state=open]:bg-black/20",
                    isOwnMessage ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                  aria-label="Message options"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align={isOwnMessage ? "end" : "start"}>
                {/* Message Info */}
                <DropdownMenuItem onClick={() => { }}>
                  <Info className="mr-4 h-4 w-4 text-muted-foreground" />
                  Message info
                </DropdownMenuItem>

                {/* Reply */}
                <DropdownMenuItem onClick={handleReply}>
                  <Reply className="mr-4 h-4 w-4 text-muted-foreground" />
                  Reply
                </DropdownMenuItem>

                {/* Copy */}
                <DropdownMenuItem onClick={handleCopy}>
                  <Copy className="mr-4 h-4 w-4 text-muted-foreground" />
                  Copy
                </DropdownMenuItem>

                {/* Edit - only for own messages */}
                {isOwnMessage && (
                  <DropdownMenuItem onClick={handleEdit}>
                    <Edit className="mr-4 h-4 w-4 text-muted-foreground" />
                    Edit
                  </DropdownMenuItem>
                )}

                {/* Delete - only for own messages */}
                {isOwnMessage && (
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-destructive focus:text-destructive focus:bg-destructive/10"
                  >
                    <Trash2 className="mr-4 h-4 w-4 text-destructive" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Facebook Messenger style status below message */}
        {renderStatusBelow()}
      </div>
    </div>
  );
}

// Memoize with custom comparison to prevent unnecessary re-renders
export const MessageBubble = React.memo(MessageBubbleComponent, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.type === nextProps.message.type &&
    prevProps.message.media_url === nextProps.message.media_url &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.is_edited === nextProps.message.is_edited &&
    prevProps.message.is_deleted === nextProps.message.is_deleted &&
    prevProps.message.created_at === nextProps.message.created_at &&
    prevProps.isOwnMessage === nextProps.isOwnMessage &&
    prevProps.senderName === nextProps.senderName &&
    prevProps.showTail === nextProps.showTail &&
    prevProps.showSeenAvatar === nextProps.showSeenAvatar &&
    prevProps.recipientAvatarUrl === nextProps.recipientAvatarUrl &&
    prevProps.recipientName === nextProps.recipientName &&
    prevProps.isLatestImage === nextProps.isLatestImage
  );
});

MessageBubble.displayName = 'MessageBubble';
