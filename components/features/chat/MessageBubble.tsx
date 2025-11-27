'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Message } from '@/types';
import { cn, formatMessageTimeDisplay } from '@/lib/utils';
import { Check, CheckCheck, ChevronDown, Edit, Trash2, Reply, Copy, Info, Loader2 } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import Image from 'next/image';

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
      className="relative overflow-hidden rounded-lg bg-[#3a3b3c]" 
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
              className="rounded-lg object-cover w-full h-full"
            />
          )}

          {/* CDN image */}
          {!isBlobUrl && !cdnError && (
            <img
              src={mediaUrl}
              alt="Image message"
              className={cn(
                'rounded-lg object-cover w-full h-full transition-opacity duration-200',
                cdnLoaded && !showBlobUrl ? 'opacity-100' : cachedBlobUrl ? 'hidden' : cdnLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={handleImageLoad}
              onError={() => setCdnError(true)}
              loading="eager"
            />
          )}
        </>
      )}

      {/* Sending overlay */}
      {status === 'sending' && (
        <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
          <div className="flex flex-col items-center gap-1">
            <Loader2 className="h-6 w-6 text-white animate-spin" />
            <span className="text-xs text-white">Sending...</span>
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

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Get UI store actions
  const openEditModal = useUIStore((state) => state.openEditModal);
  const openDeleteModal = useUIStore((state) => state.openDeleteModal);
  const setReplyTo = useUIStore((state) => state.setReplyTo);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    if (isMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

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
    setIsMenuOpen(false);
  };

  const handleCopy = async () => {
    if (content) {
      await navigator.clipboard.writeText(content);
    }
    setIsMenuOpen(false);
  };

  const handleMenuItemClick = (action: () => void) => {
    action();
    setIsMenuOpen(false);
  };

  return (
    <div
      className={cn(
        'flex w-full mb-2 group relative px-[4%] md:px-[8%]',
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
          )}

          {/* Bubble */}
          <div
            className={cn(
              'rounded-lg shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] relative text-[15px] leading-[22px]',
              type === 'image' ? 'p-1' : 'px-3 py-2',
              isOwnMessage
                ? cn('bg-chat-bubble-out text-white', showTail && 'rounded-tr-none')
                : cn('bg-chat-bubble-in text-[#e9edef]', showTail && 'rounded-tl-none'),
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
                <div className="whitespace-pre-wrap break-words break-all pr-[75px] pb-[3px] min-h-[22px]">
                  {displayContent}
                </div>

                {/* Timestamp and status INSIDE bubble at bottom-right */}
                <div className="absolute bottom-[6px] right-[8px] flex items-center gap-1">
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
              </>
            )}
          </div>
        </div>

        {/* WhatsApp style dropdown arrow - appears on hover inside bubble */}
        {!is_deleted && (
          <div 
            ref={menuRef}
            className={cn(
              "absolute top-1 z-20",
              isOwnMessage ? "right-2" : "right-2"
            )}
          >
            {/* Dropdown arrow button */}
            <button
              className={cn(
                "h-5 w-5 inline-flex items-center justify-center rounded-full transition-all duration-200",
                isMenuOpen 
                  ? "opacity-100 bg-black/20" 
                  : "opacity-0 group-hover/bubble:opacity-100 hover:bg-black/20",
                isOwnMessage ? "text-white/80" : "text-white/80"
              )}
              aria-label="Message options"
              ref={buttonRef}
              onClick={(e) => {
                e.stopPropagation();
                // Check if there's enough space below
                if (buttonRef.current) {
                  const rect = buttonRef.current.getBoundingClientRect();
                  const spaceBelow = window.innerHeight - rect.bottom;
                  // Menu height is approximately 200px for own messages, 150px for others
                  const menuHeight = isOwnMessage ? 220 : 150;
                  setOpenUpward(spaceBelow < menuHeight);
                }
                setIsMenuOpen(!isMenuOpen);
              }}
            >
              <ChevronDown className="h-4 w-4" />
            </button>

            {/* WhatsApp style dropdown menu */}
            {isMenuOpen && (
              <div
                className={cn(
                  "absolute min-w-[160px] overflow-hidden rounded-md bg-[#233138] shadow-xl z-50 py-2",
                  openUpward ? "bottom-full mb-1" : "top-full mt-1",
                  isOwnMessage ? "right-0" : "left-0"
                )}
              >
                {/* Message Info */}
                <div
                  role="menuitem"
                  className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Info className="mr-4 h-4 w-4 text-[#aebac1]" />
                  Message info
                </div>

                {/* Reply */}
                <div
                  role="menuitem"
                  className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
                  onClick={handleReply}
                >
                  <Reply className="mr-4 h-4 w-4 text-[#aebac1]" />
                  Reply
                </div>

                {/* Copy */}
                <div
                  role="menuitem"
                  className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
                  onClick={handleCopy}
                >
                  <Copy className="mr-4 h-4 w-4 text-[#aebac1]" />
                  Copy
                </div>

                {/* Edit - only for own messages */}
                {isOwnMessage && (
                  <div
                    role="menuitem"
                    className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors"
                    onClick={() => handleMenuItemClick(handleEdit)}
                  >
                    <Edit className="mr-4 h-4 w-4 text-[#aebac1]" />
                    Edit
                  </div>
                )}

                {/* Delete - only for own messages */}
                {isOwnMessage && (
                  <div
                    role="menuitem"
                    className="flex cursor-pointer items-center px-4 py-2.5 text-sm text-[#e9edef] hover:bg-[#182229] transition-colors border-t border-[#3b4a54] mt-1 pt-2.5"
                    onClick={() => handleMenuItemClick(handleDelete)}
                  >
                    <Trash2 className="mr-4 h-4 w-4 text-[#ea0038]" />
                    <span className="text-[#ea0038]">Delete</span>
                  </div>
                )}
              </div>
            )}
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
