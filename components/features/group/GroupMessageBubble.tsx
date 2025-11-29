'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GroupMessage, GroupMember } from '@/types';
import { cn, formatMessageTimeDisplay } from '@/lib/utils';
import { ChevronDown, Edit, Trash2, Copy, Info, Download } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImagePreviewModal } from '@/components/features/chat/ImagePreviewModal';
import { SeenAvatars } from './SeenAvatars';

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

// Image component - memoized for performance
const GroupImageContent = React.memo(function GroupImageContent({
  mediaUrl,
  blobUrl,
  status,
  createdAt,
  messageId,
  width,
  height,
  isLatest,
  onClick,
}: {
  mediaUrl: string;
  blobUrl?: string | null;
  status: string;
  createdAt: string;
  messageId: string;
  width?: number | null;
  height?: number | null;
  isLatest?: boolean;
  onClick?: () => void;
}) {
  const isBlobUrl = mediaUrl.startsWith('blob:');
  const cachedBlobUrl = blobUrlCache.get(messageId) || blobUrlCache.get(mediaUrl) || blobUrl;
  const wasAlreadyLoaded = !isBlobUrl && loadedImageCache.has(mediaUrl);
  const cachedDimensions = dimensionCache.get(mediaUrl);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(isLatest || wasAlreadyLoaded);
  const [cdnLoaded, setCdnLoaded] = useState(wasAlreadyLoaded);
  const [cdnError, setCdnError] = useState(false);

  const { width: displayWidth, height: displayHeight } = useMemo(() => {
    if (width && height) return calculateDisplayDimensions(width, height);
    if (cachedDimensions) return cachedDimensions;
    return { width: 200, height: 200 };
  }, [width, height, cachedDimensions]);

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

    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isLatest, wasAlreadyLoaded, isVisible]);

  useEffect(() => {
    if (isBlobUrl && mediaUrl) blobUrlCache.set(messageId, mediaUrl);
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

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    setCdnLoaded(true);
    if (!width && !cachedDimensions) {
      const img = e.currentTarget;
      const dims = calculateDisplayDimensions(img.naturalWidth, img.naturalHeight);
      dimensionCache.set(mediaUrl, dims);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl bg-muted cursor-pointer"
      style={{ width: displayWidth, height: displayHeight }}
      onClick={onClick}
    >
      {isVisible && (
        <>
          {showBlobUrl && displayUrl && (
            <img src={displayUrl} alt="Image message" className="rounded-2xl object-cover w-full h-full" />
          )}
          {!isBlobUrl && !cdnError && (
            <img
              src={mediaUrl}
              alt="Image message"
              className={cn(
                'rounded-2xl object-cover w-full h-full',
                cdnLoaded && !showBlobUrl ? 'opacity-100' : cachedBlobUrl ? 'hidden' : cdnLoaded ? 'opacity-100' : 'opacity-0'
              )}
              onLoad={handleImageLoad}
              onError={() => setCdnError(true)}
              loading="eager"
            />
          )}
        </>
      )}

      {status === 'sending' && (
        <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center z-20">
          <svg className="w-16 h-16 animate-spin" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="4" />
            <circle cx="25" cy="25" r="20" fill="none" stroke="white" strokeWidth="4" strokeLinecap="round" strokeDasharray="80" strokeDashoffset="60" />
          </svg>
        </div>
      )}

      <div className="absolute bottom-2 right-2 bg-black/50 rounded px-1.5 py-0.5 z-20">
        <time className="text-[11px] text-white" dateTime={createdAt}>{formatMessageTimeDisplay(createdAt)}</time>
      </div>
    </div>
  );
});


interface GroupMessageBubbleProps {
  message: GroupMessage;
  isOwnMessage: boolean;
  groupId: string;
  showTail?: boolean;
  showSender?: boolean;
  senderName?: string;
  senderAvatar?: string | null;
  isAdmin?: boolean;
  isLatestImage?: boolean;
  seenUsers?: Array<{ id: string; name: string | null; avatarUrl: string | null }>;
}

function GroupMessageBubbleComponent({
  message,
  isOwnMessage,
  groupId,
  showTail = true,
  showSender = false,
  senderName,
  senderAvatar,
  isAdmin = false,
  isLatestImage = false,
  seenUsers,
}: GroupMessageBubbleProps) {
  const { id, content, type, media_url, status, is_edited, is_deleted, created_at } = message;

  const openEditGroupMessageModal = useUIStore((state) => state.openEditGroupMessageModal);
  const openDeleteGroupMessageModal = useUIStore((state) => state.openDeleteGroupMessageModal);

  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    if (isMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMenuOpen]);

  const handleCopy = async () => {
    if (content) await navigator.clipboard.writeText(content);
    setIsMenuOpen(false);
  };

  const handleEdit = () => {
    openEditGroupMessageModal(id, groupId);
    setIsMenuOpen(false);
  };

  const handleDelete = () => {
    openDeleteGroupMessageModal(id, groupId);
    setIsMenuOpen(false);
  };

  const handleDownload = async () => {
    if (!media_url) return;
    try {
      const response = await fetch(media_url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `image-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch {
      window.open(media_url, '_blank');
    }
    setIsMenuOpen(false);
  };

  const displayContent = is_deleted ? 'This message was deleted' : content;

  return (
    <div
      className={cn(
        'flex w-full px-2 md:px-3 py-0.5',
        isOwnMessage ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Avatar for received messages */}
      {!isOwnMessage && (
        <div className="w-8 mr-2 flex-shrink-0 self-end">
          {showTail && (
            <Avatar className="h-8 w-8">
              <AvatarImage src={senderAvatar || undefined} className="object-cover" />
              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                {senderName?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={cn(
        "flex flex-col max-w-[75%] md:max-w-[65%] relative group/bubble",
        isOwnMessage ? "items-end" : "items-start"
      )}>
        <div className={cn("flex relative", isOwnMessage ? "flex-row-reverse" : "flex-row")}>
          {/* Tail SVG */}
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
            {/* Dropdown menu */}
            {!is_deleted && (
              <div ref={menuRef} className="absolute top-1 right-2 z-20">
                <button
                  ref={buttonRef}
                  className={cn(
                    "h-5 w-5 inline-flex items-center justify-center rounded-full",
                    isMenuOpen ? "opacity-100 bg-black/20" : "opacity-0 group-hover/bubble:opacity-100 hover:bg-black/20",
                    isOwnMessage ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (buttonRef.current) {
                      const rect = buttonRef.current.getBoundingClientRect();
                      setOpenUpward(window.innerHeight - rect.bottom < 200);
                    }
                    setIsMenuOpen(!isMenuOpen);
                  }}
                >
                  <ChevronDown className="h-4 w-4" />
                </button>

                {isMenuOpen && (
                  <div className={cn(
                    "absolute min-w-[160px] rounded-md bg-popover border shadow-xl z-50 py-1",
                    openUpward ? "bottom-full mb-1" : "top-full mt-1",
                    isOwnMessage ? "right-0" : "left-0"
                  )}>
                    <div role="menuitem" className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent" onClick={() => setIsMenuOpen(false)}>
                      <Info className="mr-4 h-4 w-4 text-muted-foreground" />Message info
                    </div>
                    {type === 'image' && media_url && (
                      <div role="menuitem" className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent" onClick={handleDownload}>
                        <Download className="mr-4 h-4 w-4 text-muted-foreground" />Download
                      </div>
                    )}
                    {content && (
                      <div role="menuitem" className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent" onClick={handleCopy}>
                        <Copy className="mr-4 h-4 w-4 text-muted-foreground" />Copy
                      </div>
                    )}
                    {isOwnMessage && type === 'text' && content && (
                      <div role="menuitem" className="flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent" onClick={handleEdit}>
                        <Edit className="mr-4 h-4 w-4 text-muted-foreground" />Edit
                      </div>
                    )}
                    {isOwnMessage && (
                      <div role="menuitem" className="flex cursor-pointer items-center px-3 py-2 text-sm text-destructive hover:bg-destructive/10" onClick={handleDelete}>
                        <Trash2 className="mr-4 h-4 w-4" />Delete
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sender name */}
            {showSender && (
              <div className={cn("flex items-center gap-1.5 mb-0.5", type === 'image' && "px-2 pt-1")}>
                <span className={cn('text-[13px] font-medium', isAdmin ? 'text-amber-500' : 'text-primary')}>{senderName}</span>
                {isAdmin && <span className="text-[10px] text-amber-500/70">Admin</span>}
              </div>
            )}

            {/* Image message */}
            {type === 'image' && media_url && !is_deleted ? (
              <>
                <GroupImageContent
                  mediaUrl={media_url}
                  blobUrl={(message as any)._blobUrl}
                  status={status}
                  createdAt={created_at}
                  messageId={id}
                  width={message.media_width}
                  height={message.media_height}
                  isLatest={isLatestImage}
                  onClick={() => setIsPreviewOpen(true)}
                />
                <ImagePreviewModal
                  isOpen={isPreviewOpen}
                  onClose={() => setIsPreviewOpen(false)}
                  imageUrl={media_url}
                  senderName={senderName}
                  timestamp={formatMessageTimeDisplay(created_at)}
                />
              </>
            ) : (
              <>
                <div className="whitespace-pre-wrap break-words pr-[75px] pb-[3px] min-h-[22px]" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {displayContent}
                </div>
                <div className="absolute bottom-[6px] right-[8px] flex items-center gap-1">
                  {is_edited && !is_deleted && (
                    <span className={cn("text-[11px] mr-1", isOwnMessage ? "text-primary-foreground/60" : "text-muted-foreground")}>edited</span>
                  )}
                  <time className={cn("text-[11px] leading-[15px]", isOwnMessage ? "text-primary-foreground/60" : "text-muted-foreground")} dateTime={created_at}>
                    {formatMessageTimeDisplay(created_at)}
                  </time>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Seen avatars */}
        {isOwnMessage && seenUsers && seenUsers.length > 0 && (
          <div className="h-5 flex justify-end items-center mr-1">
            <SeenAvatars users={seenUsers} maxAvatars={4} size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}

export const GroupMessageBubble = React.memo(GroupMessageBubbleComponent, (prevProps, nextProps) => {
  return (
    prevProps.message.id === nextProps.message.id &&
    prevProps.message.content === nextProps.message.content &&
    prevProps.message.status === nextProps.message.status &&
    prevProps.message.is_edited === nextProps.message.is_edited &&
    prevProps.message.is_deleted === nextProps.message.is_deleted &&
    prevProps.isOwnMessage === nextProps.isOwnMessage &&
    prevProps.showTail === nextProps.showTail &&
    prevProps.showSender === nextProps.showSender &&
    prevProps.isLatestImage === nextProps.isLatestImage &&
    prevProps.seenUsers?.length === nextProps.seenUsers?.length
  );
});

GroupMessageBubble.displayName = 'GroupMessageBubble';
