'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageSquarePlus } from 'lucide-react';

interface UserSearchResultProps {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  onStartChat: (userId: string) => void;
}

export function UserSearchResult({ user, onStartChat }: UserSearchResultProps) {
  const initials = user.full_name
    ? user.full_name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  return (
    <button
      onClick={() => onStartChat(user.id)}
      className="w-full flex items-center gap-3 px-3 py-3 hover:bg-muted/50 transition-colors border-b border-border/40 text-left cursor-pointer group"
      aria-label={`Start chat with ${user.full_name || user.email}`}
    >
      <div className="relative">
        <Avatar className="h-12 w-12 border border-border/50">
          {user.avatar_url && <AvatarImage src={user.avatar_url} alt={user.full_name || user.email} className="object-cover" />}
          <AvatarFallback className="bg-muted text-muted-foreground font-medium">{initials}</AvatarFallback>
        </Avatar>
      </div>

      <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
        <p className="text-[15px] font-medium text-foreground truncate leading-none">
          {user.full_name || user.email}
        </p>
        <p className="text-[13px] text-muted-foreground truncate leading-5">
          {user.email}
        </p>
      </div>

      <div className="text-muted-foreground group-hover:text-primary transition-colors">
        <MessageSquarePlus className="h-5 w-5" />
      </div>
    </button>
  );
}
