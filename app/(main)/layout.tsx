'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { RealtimeProvider } from '@/components/providers/RealtimeProvider';
import { SidebarHeader } from '@/components/features/sidebar/SidebarHeader';
import { ChatList } from '@/components/features/sidebar/ChatList';
import { NetworkStatus } from '@/components/NetworkStatus';
import { UserSearchResult } from '@/components/features/sidebar/UserSearchResult';
import { useState, useEffect, useMemo } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUIStore } from '@/store/ui.store';
import { createClient } from '@/lib/supabase/client';
import { Menu, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { searchUserByEmail, getOrCreateConversation } from '@/services/chat.service';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { CreateGroupModal } from '@/components/features/group/CreateGroupModal';
import { GroupRow } from '@/components/features/group/GroupRow';
import { useGroups } from '@/hooks/useGroups';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | 'groups'>('all');
  const router = useRouter();
  const pathname = usePathname();
  const { setActiveChatId, setActiveGroupId } = useUIStore();
  const supabase = useMemo(() => createClient(), []);
  const queryClient = useQueryClient();

  // Use cached current user hook instead of manual fetch
  const { data: currentUser } = useCurrentUser();

  // Memoize user info to prevent unnecessary re-renders
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

  // Extract active chat/group ID from pathname
  const activeChatId = pathname.match(/\/c\/([^/]+)/)?.[1] || null;
  const activeGroupId = pathname.match(/\/g\/([^/]+)/)?.[1] || null;

  // Fetch groups
  const { groups } = useGroups(searchQuery);

  // Close sidebar when navigating to a chat on mobile
  useEffect(() => {
    if (activeChatId || activeGroupId) {
      setIsSidebarOpen(false);
    }
  }, [activeChatId, activeGroupId]);

  const handleChatSelect = (chatId: string) => {
    setActiveChatId(chatId);
    router.push(`/c/${chatId}`);
  };

  const handleGroupSelect = (groupId: string) => {
    setActiveGroupId(groupId);
    router.push(`/g/${groupId}`);
  };

  const [searchResult, setSearchResult] = useState<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchSubmit = async (query: string) => {
    // Check if query looks like an email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(query)) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);

    // Search for user
    const result = await searchUserByEmail(supabase, query);
    setIsSearching(false);

    if (!result.success) {
      toast({
        title: 'Error',
        description: result.error.message,
        variant: 'destructive',
      });
      return;
    }

    if (!result.data) {
      toast({
        title: 'User not found',
        description: 'No user found with this email address',
        variant: 'destructive',
      });
      return;
    }

    // Show search result
    setSearchResult(result.data);
  };

  const handleStartChat = async (userId: string) => {
    // Create or get conversation
    const convResult = await getOrCreateConversation(supabase, userId);

    if (!convResult.success) {
      toast({
        title: 'Error',
        description: convResult.error.message,
        variant: 'destructive',
      });
      return;
    }

    // Clear search
    setSearchQuery('');
    setSearchResult(null);

    // Invalidate conversations cache to refetch
    queryClient.invalidateQueries({ queryKey: ['conversations'] });

    // Small delay to let cache update
    setTimeout(() => {
      handleChatSelect(convResult.data);
    }, 100);
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
          {/* Mobile menu button - only visible on mobile when chat/group is open */}
          {(activeChatId || activeGroupId) && (
            <Button
              variant="ghost"
              size="icon"
              className="fixed top-4 left-4 z-50 md:hidden text-foreground bg-background/50 backdrop-blur-sm"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              aria-label="Toggle sidebar"
            >
              {isSidebarOpen ? <ArrowLeft className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
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
              ) : searchResult ? (
                <div className="flex flex-col h-full animate-fade-in">
                  <div className="px-4 py-3 text-xs font-semibold text-muted-foreground bg-muted/30 border-b">
                    SEARCH RESULTS
                  </div>
                  <UserSearchResult user={searchResult} onStartChat={handleStartChat} />
                  <div className="px-4 py-3 bg-muted/30 border-t mt-auto">
                    <button
                      onClick={() => {
                        setSearchResult(null);
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
                  {/* Groups Section in All tab */}
                  {groups && groups.length > 0 && (
                    <div>
                      {groups.map((group) => (
                        <GroupRow
                          key={group.id}
                          group={group}
                          isActive={activeGroupId === group.id}
                          onClick={() => handleGroupSelect(group.id)}
                          currentUserId={currentUser?.id}
                        />
                      ))}
                    </div>
                  )}
                  {/* Chats */}
                  <ChatList
                    searchQuery={searchQuery}
                    activeChatId={activeChatId || undefined}
                    onChatSelect={handleChatSelect}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Main content area - responsive */}
          <div
            id="main-content"
            className={`
              flex-1 flex flex-col overflow-hidden relative whatsapp-chat-bg
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
