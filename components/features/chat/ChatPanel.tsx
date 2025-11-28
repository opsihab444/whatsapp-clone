'use client';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Search, MoreVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageList } from '@/components/features/chat/MessageList';
import { InputArea } from '@/components/features/chat/InputArea';
import { useConversation } from '@/hooks/useConversation';
import { useMarkAsRead } from '@/hooks/useMarkAsRead';
import { useAppReady } from '@/hooks/useAppReady';

interface ChatPanelProps {
  chatId: string;
}

export function ChatPanel({ chatId }: ChatPanelProps) {
  const { conversation, isLoading: isLoadingConversations } = useConversation(chatId);
  const { data: currentUser } = useCurrentUser();
  const isAppReady = useAppReady();

  // Mark messages as read
  useMarkAsRead(chatId);

  // Conversation not found
  if (isAppReady && !conversation) {
    return (
      <div className="flex h-full items-center justify-center bg-background" role="alert">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-zinc-200">Conversation not found</p>
          <p className="text-sm text-zinc-500">
            This conversation may have been deleted or you don&apos;t have access to it
          </p>
        </div>
      </div>
    );
  }

  const showHeaderSkeleton = !isAppReady || (isLoadingConversations && !conversation);

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <header className="flex items-center justify-between bg-background/80 backdrop-blur-xl px-6 py-3 border-b border-border/50 z-10 shadow-sm min-h-[70px] sticky top-0" role="banner">
        <div className="flex items-center gap-4 overflow-hidden">
          {showHeaderSkeleton ? (
            <>
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="flex flex-col gap-1.5">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3.5 w-24" />
              </div>
            </>
          ) : conversation ? (
            <>
              <Avatar className="h-11 w-11 cursor-pointer hover:opacity-90 transition-opacity">
                <AvatarImage src={conversation.other_user.avatar_url || undefined} className="object-cover" />
                <AvatarFallback className="bg-muted text-muted-foreground text-lg">
                  {conversation.other_user.full_name?.[0]?.toUpperCase() ||
                    conversation.other_user.email[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col justify-center overflow-hidden cursor-pointer">
                <h1 className="font-semibold text-[16px] text-foreground truncate leading-tight tracking-tight">
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
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-secondary hover:text-foreground transition-all duration-300">
            <Search className="h-5 w-5" />
            <span className="sr-only">Search</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-secondary hover:text-foreground transition-all duration-300">
            <MoreVertical className="h-5 w-5" />
            <span className="sr-only">Menu</span>
          </Button>
        </div>
      </header>

      {/* Message list */}
      <main className="flex-1 overflow-hidden" role="main" aria-label="Messages">
        <MessageList
          key={chatId}
          conversationId={chatId}
          currentUserId={currentUser?.id}
          otherUserAvatarUrl={conversation?.other_user?.avatar_url}
          otherUserName={conversation?.other_user?.full_name || conversation?.other_user?.email}
        />
      </main>

      {/* Input area */}
      <InputArea
        key={chatId}
        conversationId={chatId}
        currentUserId={currentUser?.id}
        currentUserName={currentUser?.name}
      />
    </div>
  );
}
