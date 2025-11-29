'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, ChevronRight, Trash2, Loader2, Ban, ArrowLeft, Link, FileText } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createClient } from '@/lib/supabase/client';
import { deleteConversation, blockUser, unblockUser, getBlockStatus } from '@/services/chat.service';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { showSuccessToast, showErrorToast } from '@/lib/toast.utils';
import { ImagePreviewModal } from './ImagePreviewModal';

interface MediaItem {
  id: string;
  media_url: string;
  created_at: string;
  sender_id: string;
}

interface LinkItem {
  id: string;
  url: string;
  content: string;
  created_at: string;
}

// URL regex pattern
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

interface ContactInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  otherUserId: string;
  user: {
    full_name?: string | null;
    email: string;
    avatar_url?: string | null;
  };
  onBlockStatusChange?: (isBlocked: boolean) => void;
}

export function ContactInfoPanel({ isOpen, onClose, conversationId, otherUserId, user, onBlockStatusChange }: ContactInfoPanelProps) {
  const displayName = user.full_name || user.email;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isBlocking, setIsBlocking] = useState(false);
  const [isBlocked, setIsBlocked] = useState(false);
  const [theyBlockedMe, setTheyBlockedMe] = useState(false);
  const [showMediaGallery, setShowMediaGallery] = useState(false);
  const [activeTab, setActiveTab] = useState<'media' | 'links' | 'docs'>('media');
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [linkItems, setLinkItems] = useState<LinkItem[]>([]);
  const [mediaCount, setMediaCount] = useState(0);
  const [linksCount, setLinksCount] = useState(0);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [isLoadingLinks, setIsLoadingLinks] = useState(false);
  const [selectedImage, setSelectedImage] = useState<MediaItem | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const supabase = createClient();

  // Check block status when panel opens
  useEffect(() => {
    if (isOpen && otherUserId) {
      getBlockStatus(supabase, otherUserId).then((result) => {
        if (result.success) {
          setIsBlocked(result.data.iBlocked);
          setTheyBlockedMe(result.data.theyBlockedMe);
        }
      });
    }
  }, [isOpen, otherUserId, supabase]);

  // Fetch media count when panel opens
  useEffect(() => {
    if (isOpen && conversationId) {
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('type', 'image')
        .then(({ count }) => {
          setMediaCount(count || 0);
        });
    }
  }, [isOpen, conversationId, supabase]);

  // Fetch media items when gallery opens
  const fetchMediaItems = useCallback(async () => {
    if (!conversationId) return;
    
    setIsLoadingMedia(true);
    const { data, error } = await supabase
      .from('messages')
      .select('id, media_url, created_at, sender_id')
      .eq('conversation_id', conversationId)
      .eq('type', 'image')
      .order('created_at', { ascending: false })
      .limit(100);

    if (!error && data) {
      setMediaItems(data);
    }
    setIsLoadingMedia(false);
  }, [conversationId, supabase]);

  // Fetch links from messages
  const fetchLinks = useCallback(async () => {
    if (!conversationId) return;
    
    setIsLoadingLinks(true);
    const { data, error } = await supabase
      .from('messages')
      .select('id, content, created_at')
      .eq('conversation_id', conversationId)
      .eq('type', 'text')
      .not('content', 'is', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (!error && data) {
      // Extract URLs from messages
      const links: LinkItem[] = [];
      data.forEach((msg) => {
        if (msg.content) {
          const urls = msg.content.match(URL_REGEX);
          if (urls) {
            urls.forEach((url: string) => {
              links.push({
                id: `${msg.id}-${url}`,
                url: url,
                content: msg.content,
                created_at: msg.created_at,
              });
            });
          }
        }
      });
      setLinkItems(links);
      setLinksCount(links.length);
    }
    setIsLoadingLinks(false);
  }, [conversationId, supabase]);

  // Load media when gallery opens
  useEffect(() => {
    if (showMediaGallery && activeTab === 'media') {
      fetchMediaItems();
    } else if (showMediaGallery && activeTab === 'links') {
      fetchLinks();
    }
  }, [showMediaGallery, activeTab, fetchMediaItems, fetchLinks]);

  const handleBlockUser = async () => {
    setIsBlocking(true);
    
    if (isBlocked) {
      // Unblock
      const result = await unblockUser(supabase, otherUserId);
      if (result.success) {
        setIsBlocked(false);
        onBlockStatusChange?.(false);
        showSuccessToast(`${displayName} has been unblocked`);
      } else {
        showErrorToast(result.error.message);
      }
    } else {
      // Block
      const result = await blockUser(supabase, otherUserId);
      if (result.success) {
        setIsBlocked(true);
        onBlockStatusChange?.(true);
        showSuccessToast(`${displayName} has been blocked`);
      } else {
        showErrorToast(result.error.message);
      }
    }
    
    setIsBlocking(false);
    setShowBlockConfirm(false);
  };

  const handleDeleteChat = async () => {
    setIsDeleting(true);
    const result = await deleteConversation(supabase, conversationId);
    
    if (result.success) {
      // Remove from cache
      queryClient.setQueryData(['conversations'], (old: any) => {
        if (!old) return old;
        return old.filter((conv: any) => conv.id !== conversationId);
      });
      queryClient.removeQueries({ queryKey: ['messages', conversationId] });
      
      showSuccessToast('Chat deleted successfully');
      onClose();
      router.push('/');
    } else {
      showErrorToast(result.error.message);
    }
    
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/20 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div 
        className={`absolute top-0 right-0 h-full w-[340px] bg-background border-l border-border/50 flex flex-col z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-6 px-4 py-3 bg-background border-b border-border/50 min-h-[70px]">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-full transition-all duration-300"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
          <h2 className="text-foreground text-base font-medium">Contact info</h2>
        </div>

        <ScrollArea className="flex-1">
          {/* Profile Section */}
          <div className="flex flex-col items-center py-10 bg-background">
            <Avatar className="h-[200px] w-[200px] mb-4">
              <AvatarImage src={user.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="bg-muted text-muted-foreground text-6xl">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h3 className="text-[22px] text-foreground font-normal mt-2">
              {displayName}
            </h3>
            <p className="text-[14px] text-muted-foreground mt-1">
              {user.email}
            </p>
          </div>

          {/* Media Section */}
          <div className="mt-2 border-t border-border/50">
            <button 
              onClick={() => setShowMediaGallery(true)}
              className="flex items-center justify-between px-8 py-4 w-full hover:bg-secondary/50 cursor-pointer transition-colors text-left"
            >
              <div className="flex items-center gap-6">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-foreground text-[15px]">Media, links and docs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">{mediaCount}</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </button>
          </div>

          {/* Block User Section */}
          <div className="mt-2 border-t border-border/50">
            <button 
              onClick={() => setShowBlockConfirm(true)}
              className="flex items-center gap-6 px-8 py-4 w-full hover:bg-destructive/10 cursor-pointer transition-colors text-left"
            >
              <Ban className="h-5 w-5 text-destructive" />
              <span className="text-destructive text-[15px]">
                {isBlocked ? 'Unblock' : 'Block'} {displayName}
              </span>
            </button>
          </div>

          {/* Delete Chat Section */}
          <div className="border-t border-border/50">
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-6 px-8 py-4 w-full hover:bg-destructive/10 cursor-pointer transition-colors text-left"
            >
              <Trash2 className="h-5 w-5 text-destructive" />
              <span className="text-destructive text-[15px]">Delete chat</span>
            </button>
          </div>
        </ScrollArea>

        {/* Block Confirmation Modal - Using Portal for full screen */}
        {showBlockConfirm && createPortal(
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]">
            <div className="bg-background rounded-xl p-6 mx-4 max-w-md w-full shadow-2xl border border-border/50 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-xl font-semibold text-foreground mb-3">
                {isBlocked ? 'Unblock' : 'Block'} {displayName}?
              </h3>
              <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                {isBlocked 
                  ? `${displayName} will be able to send you messages again.`
                  : `Blocked contacts will no longer be able to send you messages. You won't receive any messages from ${displayName}.`
                }
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowBlockConfirm(false)}
                  disabled={isBlocking}
                  className="px-6"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleBlockUser}
                  disabled={isBlocking}
                  className="px-6"
                >
                  {isBlocking ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {isBlocked ? 'Unblocking...' : 'Blocking...'}
                    </>
                  ) : (
                    isBlocked ? 'Unblock' : 'Block'
                  )}
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* Delete Confirmation Modal - Using Portal for full screen */}
        {showDeleteConfirm && createPortal(
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[200]">
            <div className="bg-background rounded-xl p-6 mx-4 max-w-md w-full shadow-2xl border border-border/50 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-xl font-semibold text-foreground mb-3">Delete chat?</h3>
              <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
                Messages will be removed from this device. {displayName} will still be able to see the chat history.
              </p>
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-6"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDeleteChat}
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

        {/* Media Gallery Panel */}
        <div 
          className={`absolute inset-0 bg-background flex flex-col transition-transform duration-300 ease-in-out ${
            showMediaGallery ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          {/* Gallery Header */}
          <div className="flex items-center gap-4 px-4 py-3 bg-background border-b border-border/50 min-h-[70px]">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-full transition-all duration-300"
              onClick={() => setShowMediaGallery(false)}
            >
              <ArrowLeft className="h-6 w-6" />
            </Button>
            <h2 className="text-foreground text-base font-medium">Media, links and docs</h2>
          </div>

          {/* Gallery Content */}
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-border/50">
              <button 
                onClick={() => setActiveTab('media')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'media' 
                    ? 'text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Media
              </button>
              <button 
                onClick={() => setActiveTab('links')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'links' 
                    ? 'text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Links
              </button>
              <button 
                onClick={() => setActiveTab('docs')}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'docs' 
                    ? 'text-primary border-b-2 border-primary' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Docs
              </button>
            </div>

            <ScrollArea className="flex-1">
              {/* Media Tab Content */}
              {activeTab === 'media' && (
                <>
                  {isLoadingMedia ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : mediaItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <ImageIcon className="h-16 w-16 mb-4 opacity-50" />
                      <p className="text-sm">No media shared yet</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1 p-2">
                      {mediaItems.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedImage(item)}
                          className="aspect-square overflow-hidden rounded-sm hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={item.media_url}
                            alt="Shared media"
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Links Tab Content */}
              {activeTab === 'links' && (
                <>
                  {isLoadingLinks ? (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : linkItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                      <Link className="h-16 w-16 mb-4 opacity-50" />
                      <p className="text-sm">No links shared yet</p>
                    </div>
                  ) : (
                    <div className="p-2 space-y-2">
                      {linkItems.map((item) => (
                        <a
                          key={item.id}
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                              <Link className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-primary truncate">{item.url}</p>
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {item.content}
                              </p>
                              <p className="text-xs text-muted-foreground/60 mt-1">
                                {new Date(item.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Docs Tab Content */}
              {activeTab === 'docs' && (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <FileText className="h-16 w-16 mb-4 opacity-50" />
                  <p className="text-sm">No documents shared yet</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

      </div>

      {/* Image Preview Modal */}
      <ImagePreviewModal
        isOpen={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        imageUrl={selectedImage?.media_url || null}
        senderName={displayName}
        timestamp={selectedImage ? new Date(selectedImage.created_at).toLocaleString() : undefined}
      />
    </>
  );
}
