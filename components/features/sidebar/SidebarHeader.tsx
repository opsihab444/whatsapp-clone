'use client';

import { Search, MessageSquarePlus, MoreVertical, CircleDashed, Users, LogOut } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { KeyboardEvent } from 'react';
import { ModeToggle } from '@/components/mode-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut } from '@/services/auth.service';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/store/ui.store';

interface SidebarHeaderProps {
  userEmail?: string;
  userAvatar?: string | null;
  userName?: string | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSearchSubmit?: (query: string) => void;
  activeFilter?: 'all' | 'groups';
  onFilterChange?: (filter: 'all' | 'groups') => void;
}

export function SidebarHeader({
  userEmail,
  userAvatar,
  userName,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  activeFilter = 'all',
  onFilterChange,
}: SidebarHeaderProps) {
  const router = useRouter();
  const { openCreateGroupModal } = useUIStore();

  const initials = userName
    ? userName
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    : userEmail?.slice(0, 2).toUpperCase() || '??';

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery.trim() && onSearchSubmit) {
      onSearchSubmit(searchQuery.trim());
    }
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      const result = await signOut(supabase);

      if (result.success) {
        router.push('/login');
      } else {
        console.error('Logout failed:', result.error);
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <header className="flex flex-col bg-secondary border-r border-border z-20">
      {/* Top Bar: Avatar & Actions */}
      <div className="flex items-center justify-between px-4 py-3 bg-secondary h-[64px]">
        <div className="flex items-center gap-3" role="banner">
          <Avatar className="h-11 w-11 cursor-pointer hover:opacity-80 transition-opacity">
            {userAvatar && <AvatarImage src={userAvatar} alt={userName || userEmail} />}
            <AvatarFallback className="bg-muted text-muted-foreground font-medium text-lg">{initials}</AvatarFallback>
          </Avatar>
        </div>

        <div className="flex items-center gap-2.5">
          <ModeToggle />

          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground hover:bg-muted/10 hover:text-foreground transition-colors">
            <Users className="h-[22px] w-[22px]" />
            <span className="sr-only">Communities</span>
          </Button>

          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground hover:bg-muted/10 hover:text-foreground transition-colors">
            <CircleDashed className="h-[22px] w-[22px]" />
            <span className="sr-only">Status</span>
          </Button>

          <Button 
            variant="ghost" 
            size="icon" 
            className="h-10 w-10 rounded-full text-muted-foreground hover:bg-muted/10 hover:text-foreground transition-colors"
            onClick={openCreateGroupModal}
          >
            <MessageSquarePlus className="h-[22px] w-[22px]" />
            <span className="sr-only">New Group</span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full text-muted-foreground hover:bg-muted/10 hover:text-foreground transition-colors">
                <MoreVertical className="h-[22px] w-[22px]" />
                <span className="sr-only">Menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem>
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-600 focus:text-red-600 cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-3 pb-2 pt-2 bg-background border-b border-border/50">
        <div className="relative group">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 group-focus-within:text-primary transition-colors z-10">
            <Search className="h-[19px] w-[19px]" />
          </div>
          <Input
            type="search"
            placeholder="Search or start new chat"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-12 bg-secondary border-none focus:ring-0 focus:border-none focus-visible:ring-0 h-[38px] rounded-lg text-[15px] placeholder:text-muted-foreground/60 text-foreground shadow-none outline-none"
            aria-label="Search conversations or enter email"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-2.5 flex items-center gap-2 border-b border-border/50 bg-background">
        <Button
          variant="ghost"
          onClick={() => onFilterChange?.('all')}
          className={`h-8 px-3.5 rounded-full text-[14px] ${
            activeFilter === 'all'
              ? 'bg-primary/20 hover:bg-primary/30 text-primary font-medium border border-primary/30'
              : 'hover:bg-accent text-muted-foreground hover:text-foreground font-normal'
          }`}
        >
          All
        </Button>
        <Button
          variant="ghost"
          className="h-8 px-3.5 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground text-[14px] font-normal"
        >
          Unread
        </Button>
        <Button
          variant="ghost"
          className="h-8 px-3.5 rounded-full hover:bg-accent text-muted-foreground hover:text-foreground text-[14px] font-normal"
        >
          Favorites
        </Button>
        <Button
          variant="ghost"
          onClick={() => onFilterChange?.('groups')}
          className={`h-8 px-3.5 rounded-full text-[14px] ${
            activeFilter === 'groups'
              ? 'bg-primary/20 hover:bg-primary/30 text-primary font-medium border border-primary/30'
              : 'hover:bg-accent text-muted-foreground hover:text-foreground font-normal'
          }`}
        >
          Groups
        </Button>
      </div>
    </header>
  );
}
