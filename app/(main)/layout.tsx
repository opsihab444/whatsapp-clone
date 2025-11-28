'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { RealtimeProvider } from '@/components/providers/RealtimeProvider';
import { SidebarHeader } from '@/components/features/sidebar/SidebarHeader';
import { ChatList } from '@/components/features/sidebar/ChatList';
import { NetworkStatus } from '@/components/NetworkStatus';
import { UserSearchResult } from '@/components/features/sidebar/UserSearchResult';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useUIStore } from '@/store/ui.store';
import { createClient } from '@/lib/supabase/client';
import { Menu, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { searchUsers, getOrCreateConversation } from '@/services/chat.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { CreateGroupModal } from '@/components/features/group/CreateGroupModal';
import { GroupRow } from '@/components/features/group/GroupRow';
import { useGroups } from '@/hooks/useGroups';
import { useChatList } from '@/hooks/useChatList';
import type { Conversation, GroupConversation } from '@/types';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'groups'>('all');
  const { activeChatId, activeGroupId, setActiveChatId, setActiveGroupId } = useUIStore();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  // Use cached current user hook
  const { data: currentUser } = useCurrentUser();

  // Fetch groups
  const {
    groups,
    isLoading: isGroupsLoading,
    isError: isGroupsError,
    refetch: refetchGroups
  } = useGroups(searchQuery);

  // Fetch chats
  const {
    conversations,
    isLoading: isChatsLoading,
    isError: isChatsError,
    refetch: refetchChats
  } = useChatList(searchQuery);

  // Merge and sort items
  const mergedItems = useMemo(() => {
    const allItems: (Conversation | GroupConversation)[] = [...(groups || []), ...(conversations || [])];

    return allItems.sort((a, b) => {
      let timeA = 0;
      if (a.last_message_time) {
        timeA = new Date(a.last_message_time).getTime();
      } else if ('group' in a) {
        timeA = new Date(a.group.created_at).getTime();
      } else {
        timeA = new Date(a.created_at).getTime();
      }

      let timeB = 0;
      if (b.last_message_time) {
        timeB = new Date(b.last_message_time).getTime();
      } else if ('group' in b) {
        timeB = new Date(b.group.created_at).getTime();
      } else {
        timeB = new Date(b.created_at).getTime();
      }

      return timeB - timeA;
    });
  }, [groups, conversations]);

  // Memoize user info
  const userInfo = useMemo(() => {
    if (!currentUser) return null;
    return {
      email: currentUser.email || '',
      name: currentUser.name || null,
      avatar: currentUser.avatar || null,
    };
  }, [currentUser]);

  const toast = (props: { title: string; description?: string; variant?: 'default' | 'destructive' }) => {
    if (props.variant === 'destructive') {
      console.error(`❌ ${props.title}`, props.description || '');
    } else {
      console.log(`✓ ${props.title}`, props.description || '');
    }
  };

  // Close sidebar when selecting chat/group on mobile
  useEffect(() => {
    if (activeChatId || activeGroupId) {
      setIsSidebarOpen(false);
    }
  }, [activeChatId, activeGroupId]);

  const handleChatSelect = (chatId: string) => {
    setActiveChatId(chatId);
  };

  const handleGroupSelect = (groupId: string) => {
    setActiveGroupId(groupId);
  };

  const [searchResults, setSearchResults] = useState<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  }[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Realtime search function - searches by name or email
  const performSearch = useCallback(async (query: string) => {
    // Clear previous results if query is too short
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    const result = await searchUsers(supabase, query);
    setIsSearching(false);

    if (!result.success) {
      setSearchResults([]);
      return;
    }

    setSearchResults(result.data);
  }, [supabase]);

  // Debounced search effect - triggers on every searchQuery change
  useEffect(() => {
    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If query is empty or too short, clear results immediately
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Set new debounce timer (400ms delay)
    debounceTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 400);

    // Cleanup on unmount or query change
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Keep handleSearchSubmit for Enter key (immediate search)
  const handleSearchSubmit = async (query: string) => {
    // Clear debounce timer for immediate search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    performSearch(query);
  };

  const handleStartChat = async (userId: string) => {
    const convResult = await getOrCreateConversation(supabase, userId);

    if (!convResult.success) {
      toast({
        title: 'Error',
        description: convResult.error.message,
        variant: 'destructive',
      });
      return;
    }

    // Clear search state
    setSearchQuery('');
    setSearchResults([]);

    // Refresh conversations list
    await queryClient.invalidateQueries({ queryKey: ['conversations'] });

    // Open the conversation
    handleChatSelect(convResult.data);
  };

  // Handle back button on mobile
  const handleBack = () => {
    setActiveChatId(null);
    setActiveGroupId(null);
  };

  return (
    <AuthGuard>
      <RealtimeProvider>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md"
        >
          Skip to main content
        </a>
        <NetworkStatus />
        <CreateGroupModal />
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Mobile back button - only visible on mobile when chat/group is open */}
          {(activeChatId || activeGroupId) && (
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-4 left-4 z-50 md:hidden text-foreground bg-background/50 backdrop-blur-sm"
              onClick={handleBack}
              aria-label="Back to chat list"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}

          {/* Sidebar - responsive */}
          <div
            className={`
              w-full md:w-[420px] border-r border-border flex flex-col bg-background
              ${(activeChatId || activeGroupId) ? 'hidden md:flex' : 'flex'}
              ${isSidebarOpen ? '!flex absolute inset-0 z-40' : ''}
            `}
          >
            <SidebarHeader
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSearchSubmit={handleSearchSubmit}
              userEmail={userInfo?.email}
              userName={userInfo?.name}
              userAvatar={userInfo?.avatar}
              activeFilter={activeFilter}
              onFilterChange={setActiveFilter}
            />
            <div className="flex-1 overflow-hidden relative">
              {isSearching ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="flex flex-col h-full animate-fade-in">
                  <div className="px-4 py-3 text-xs font-semibold text-muted-foreground bg-muted/30 border-b">
                    SEARCH RESULTS ({searchResults.length})
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {searchResults.map((user) => (
                      <UserSearchResult key={user.id} user={user} onStartChat={handleStartChat} />
                    ))}
                  </div>
                  <div className="px-4 py-3 bg-muted/30 border-t">
                    <button
                      onClick={() => {
                        setSearchResults([]);
                        setSearchQuery('');
                      }}
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      ← Back to chats
                    </button>
                  </div>
                </div>
              ) : activeFilter === 'groups' ? (
                <div className="h-full overflow-y-auto">
                  {groups && groups.length > 0 ? (
                    groups.map((group) => (
                      <GroupRow
                        key={group.id}
                        group={group}
                        isActive={activeGroupId === group.id}
                        onClick={() => handleGroupSelect(group.id)}
                        currentUserId={currentUser?.id}
                        searchQuery={searchQuery}
                      />
                    ))
                  ) : (
                    <div className="flex items-center justify-center h-full p-4">
                      <div className="text-center">
                        <p className="text-sm font-medium text-muted-foreground mb-1">No groups yet</p>
                        <p className="text-xs text-muted-foreground">Create a group to get started</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full overflow-y-auto">
                  <ChatList
                    items={mergedItems}
                    isLoading={isGroupsLoading || isChatsLoading}
                    activeId={activeChatId || activeGroupId || undefined}
                    onSelect={(item: Conversation | GroupConversation) => {
                      if ('group' in item) {
                        handleGroupSelect(item.id);
                      } else {
                        handleChatSelect(item.id);
                      }
                    }}
                    searchQuery={searchQuery}
                    currentUserId={currentUser?.id}
                    isError={isGroupsError || isChatsError}
                    onRetry={() => {
                      if (isGroupsError) refetchGroups();
                      if (isChatsError) refetchChats();
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Main content area - responsive */}
          <div
            id="main-content"
            className={`
              flex-1 flex flex-col overflow-hidden relative chat-background
              ${!(activeChatId || activeGroupId) ? 'hidden md:flex' : 'flex'}
            `}
          >
            <div className="relative z-10 flex-1 flex flex-col h-full">
              {children}
            </div>
          </div>
        </div>
      </RealtimeProvider>
    </AuthGuard>
  );
}
