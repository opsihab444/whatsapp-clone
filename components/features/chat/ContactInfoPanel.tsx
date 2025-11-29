'use client';

import { useState } from 'react';
import { X, Image as ImageIcon, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { createClient } from '@/lib/supabase/client';
import { deleteConversation } from '@/services/chat.service';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { showSuccessToast, showErrorToast } from '@/lib/toast.utils';

interface ContactInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  user: {
    full_name?: string | null;
    email: string;
    avatar_url?: string | null;
  };
}

export function ContactInfoPanel({ isOpen, onClose, conversationId, user }: ContactInfoPanelProps) {
  const displayName = user.full_name || user.email;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();
  const supabase = createClient();

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
            <div 
              className="flex items-center justify-between px-8 py-4 hover:bg-secondary/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-6">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-foreground text-[15px]">Media, links and docs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">0</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Delete Chat Section */}
          <div className="mt-2 border-t border-border/50">
            <button 
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-6 px-8 py-4 w-full hover:bg-destructive/10 cursor-pointer transition-colors text-left"
            >
              <Trash2 className="h-5 w-5 text-destructive" />
              <span className="text-destructive text-[15px]">Delete chat</span>
            </button>
          </div>
        </ScrollArea>

        {/* Delete Confirmation Modal - Full Screen */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
            <div className="bg-background rounded-xl p-6 mx-4 max-w-md w-full shadow-2xl border border-border/50">
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
          </div>
        )}
      </div>
    </>
  );
}
