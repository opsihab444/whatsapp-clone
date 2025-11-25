'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MessageList } from '@/components/features/chat/MessageList';
import { InputArea } from '@/components/features/chat/InputArea';
import { useUIStore } from '@/store/ui.store';
import { useChatList } from '@/hooks/useChatList';
import { useMarkAsRead } from '@/hooks/useMarkAsRead';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Loader2, Search, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Chat conversation page
 * Displays messages for a specific conversation and input area
 * Handles marking messages as read when conversation is opened
 */
export default function ChatPage() {
  const params = useParams();
  const chatId = params.chatId as string;
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);

  // Use cached hooks
  const { conversations, isLoading: isLoadingConversations } = useChatList('');
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();

  // Mark messages as read when conversation is opened
  useMarkAsRead(chatId);

  // Set active chat ID in store
  useEffect(() => {
    setActiveChatId(chatId);

    return () => {
      setActiveChatId(null);
    };
  }, [chatId, setActiveChatId]);

  // Find the current conversation to display header
  const conversation = conversations?.find((c) => c.id === chatId);

  // Show full page loader ONLY if we have absolutely no data to show
  // (i.e. first load of application and we don't know if conversation exists)
  if (isLoadingConversations && !conversation) {
    return (
      <div className="flex h-full items-center justify-center animate-fade-in" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span className="sr-only">Loading conversation...</span>
        </div>
      </div>
    );
  }

  // Conversation not found (only after loading is done)
  if (!isLoadingConversations && !conversation) {
    return (
      <div className="flex h-full items-center justify-center animate-fade-in" role="alert">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium">Conversation not found</p>
          <p className="text-sm text-muted-foreground">
            This conversation may have been deleted or you don't have access to it
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <header className="flex items-center justify-between bg-background px-4 py-2.5 border-b border-border z-10 shadow-sm" role="banner">
        <div className="flex items-center gap-4 overflow-hidden">
          {conversation ? (
            <>
              <Avatar className="h-10 w-10 cursor-pointer hover:opacity-90 transition-opacity">
                <AvatarImage src={conversation.other_user.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {conversation.other_user.full_name?.[0]?.toUpperCase() ||
                    conversation.other_user.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col justify-center overflow-hidden cursor-pointer">
                <h1 className="font-medium text-base text-foreground truncate leading-tight">
                  {conversation.other_user.full_name || conversation.other_user.email}
                </h1>
                <p className="text-xs text-muted-foreground truncate">
                  click here for contact info
                </p>
              </div>
            </>
          ) : (
            // Header Skeleton
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-muted-foreground">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted/50">
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted/50">
            <MoreVertical className="h-5 w-5" />
            <span className="sr-only">Menu</span>
          </Button>
        </div>
      </header>

      {/* Message list */}
      <main className="flex-1 overflow-hidden" role="main" aria-label="Messages">
        {currentUser ? (
          <MessageList
            conversationId={chatId}
            currentUserId={currentUser.id}
          />
        ) : (
          // Show nothing or a skeleton while user loads (should be fast/instant if cached)
          <div className="h-full w-full bg-background" />
        )}
      </main>

      {/* Input area */}
      {currentUser ? (
        <InputArea
          conversationId={chatId}
          currentUserId={currentUser.id}
          currentUserName={currentUser.name}
        />
      ) : (
        <div className="bg-secondary px-4 py-2 border-t border-border min-h-[62px] flex items-end">
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
