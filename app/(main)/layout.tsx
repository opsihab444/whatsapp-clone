'use client';

import { AuthGuard } from '@/components/auth/AuthGuard';
import { RealtimeProvider } from '@/components/providers/RealtimeProvider';
import { SidebarHeader } from '@/components/features/sidebar/SidebarHeader';
import { ChatList } from '@/components/features/sidebar/ChatList';
import { NetworkStatus } from '@/components/NetworkStatus';
import { UserSearchResult } from '@/components/features/sidebar/UserSearchResult';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUIStore } from '@/store/ui.store';
import { createClient } from '@/lib/supabase/client';
import { Menu, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { searchUserByEmail, getOrCreateConversation } from '@/services/chat.service';
import { useQueryClient } from '@tanstack/react-query';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [userInfo, setUserInfo] = useState<{
    email: string;
    name: string | null;
    avatar: string | null;
  } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);
  const supabase = createClient();
  const queryClient = useQueryClient();

  const toast = (props: { title: string; description?: string; variant?: 'default' | 'destructive' }) => {
    if (props.variant === 'destructive') {
      console.error(`❌ ${props.title}`, props.description || '');
    } else {
      console.log(`✓ ${props.title}`, props.description || '');
    }
  };

  // Extract active chat ID from pathname
  const activeChatId = pathname.match(/\/c\/([^/]+)/)?.[1] || null;

  // Close sidebar when navigating to a chat on mobile
  useEffect(() => {
    if (activeChatId) {
      setIsSidebarOpen(false);
    }
  }, [activeChatId]);

  // Fetch current user info
  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get user profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, avatar_url')
          .eq('id', user.id)
          .single();

        setUserInfo({
          email: user.email || '',
          name: profile?.full_name || null,
          avatar: profile?.avatar_url || null,
        });
      }
    };

    fetchUserInfo();
  }, [supabase]);

  const handleChatSelect = (chatId: string) => {
    setActiveChatId(chatId);
    router.push(`/c/${chatId}`);
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
        <div className="flex h-screen overflow-hidden bg-background">
          {/* Mobile menu button - only visible on mobile when chat is open */}
          {activeChatId && (
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
              ${activeChatId ? 'hidden md:flex' : 'flex'}
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
              ) : (
                <ChatList
                  searchQuery={searchQuery}
                  activeChatId={activeChatId || undefined}
                  onChatSelect={handleChatSelect}
                />
              )}
            </div>
          </div>

          {/* Main content area - responsive */}
          <div
            id="main-content"
            className={`
              flex-1 flex flex-col overflow-hidden bg-chat-background relative
              ${!activeChatId ? 'hidden md:flex' : 'flex'}
            `}
          >
            {/* Background Pattern Overlay (Optional, can be added later) */}
            <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-repeat z-0" />

            <div className="relative z-10 flex-1 flex flex-col h-full">
              {children}
            </div>
          </div>
        </div>
      </RealtimeProvider>
    </AuthGuard>
  );
}
