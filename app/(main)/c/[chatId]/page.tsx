'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MessageList } from '@/components/features/chat/MessageList';
import { InputArea } from '@/components/features/chat/InputArea';
import { useUIStore } from '@/store/ui.store';
import { useConversation } from '@/hooks/useConversation';
import { useMarkAsRead } from '@/hooks/useMarkAsRead';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppReady } from '@/hooks/useAppReady';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Chat conversation page
 * Displays messages for a specific conversation and input area
 * Handles marking messages as read when conversation is opened
 * 
 * Loading Strategy: ALL data must be ready before showing real content
 * - Shows skeleton until conversations, currentUser, AND messages are all loaded
 * - This ensures everything appears together, not sequentially
 */
export default function ChatPage() {
  const params = useParams();
  const chatId = params.chatId as string;
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);

  // Read conversation from cache only (no API request)
  const { conversation, isLoading: isLoadingConversations } = useConversation(chatId);
  const { data: currentUser } = useCurrentUser();
  
  // Check if app data is ready (conversations + currentUser)
  const isAppReady = useAppReady();

  // Mark messages as read when conversation is opened
  useMarkAsRead(chatId);

  // Set active chat ID in store
  useEffect(() => {
    setActiveChatId(chatId);

    return () => {
      setActiveChatId(null);
    };
  }, [chatId, setActiveChatId]);

  // Conversation not found (only after loading is done AND we have no conversation)
  if (isAppReady && !conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0b141a]" role="alert">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-zinc-200">Conversation not found</p>
          <p className="text-sm text-zinc-500">
            This conversation may have been deleted or you don&apos;t have access to it
          </p>
        </div>
      </div>
    );
  }

  // Show header skeleton only during initial app load (page reload)
  // On conversation switch, header shows instantly (data already in cache)
  const showHeaderSkeleton = !isAppReady || (isLoadingConversations && !conversation);

  return (
    <div className="flex flex-col h-full">
      {/* Chat header - shows skeleton or real content */}
      <header className="flex items-center justify-between bg-background px-4 py-3 border-b border-border z-10 shadow-sm min-h-[64px]" role="banner">
        <div className="flex items-center gap-4 overflow-hidden">
          {showHeaderSkeleton ? (
            // Header Skeleton - shown while conversation loads
            <>
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            </>
          ) : conversation ? (
            // Real header content
            <>
              <Avatar className="h-11 w-11 cursor-pointer hover:opacity-90 transition-opacity">
                <AvatarImage src={conversation.other_user.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-muted text-muted-foreground text-lg">
                  {conversation.other_user.full_name?.[0]?.toUpperCase() ||
                    conversation.other_user.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col justify-center overflow-hidden cursor-pointer">
                <h1 className="font-medium text-[17px] text-foreground truncate leading-tight">
                  {conversation.other_user.full_name || conversation.other_user.email}
                </h1>
                <p className="text-[13px] text-muted-foreground truncate mt-0.5">
                  click here for contact info
                </p>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full hover:bg-muted/50">
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full hover:bg-muted/50">
            <MoreVertical className="h-5 w-5" />
            <span className="sr-only">Menu</span>
          </Button>
        </div>
      </header>

      {/* Message list - ALWAYS renders to start fetching messages in parallel with conversation */}
      <main className="flex-1 overflow-hidden" role="main" aria-label="Messages">
        <MessageList
          key={chatId}
          conversationId={chatId}
          currentUserId={currentUser?.id}
          otherUserAvatarUrl={conversation?.other_user?.avatar_url}
          otherUserName={conversation?.other_user?.full_name || conversation?.other_user?.email}
        />
      </main>

      {/* Input area - always instant */}
      <InputArea
        key={chatId}
        conversationId={chatId}
        currentUserId={currentUser?.id}
        currentUserName={currentUser?.name}
      />
    </div>
  );
}
