'use client';

import React, { memo } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface SeenUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

interface SeenAvatarsProps {
  users: SeenUser[];
  maxAvatars?: number;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Shows avatars of users who have seen a message
 * Displays up to maxAvatars, with a "+X" indicator for more
 */
function SeenAvatarsComponent({ users, maxAvatars = 4, size = 'sm', className }: SeenAvatarsProps) {
  if (!users.length) return null;

  const displayUsers = users.slice(0, maxAvatars);
  const remainingCount = Math.max(0, users.length - maxAvatars);

  const avatarSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const fontSize = size === 'sm' ? 'text-[8px]' : 'text-[10px]';
  const spacing = size === 'sm' ? '-space-x-1.5' : '-space-x-2';

  // Generate a consistent color based on user name/id
  const getAvatarColor = (name: string | null, id: string) => {
    const colors = [
      'bg-emerald-600',
      'bg-blue-600', 
      'bg-purple-600',
      'bg-pink-600',
      'bg-amber-600',
      'bg-cyan-600',
      'bg-rose-600',
      'bg-indigo-600',
    ];
    const str = name || id;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className={cn('flex items-center transition-all duration-200 ease-in-out', spacing, className)}>
      {displayUsers.map((user, index) => (
        <Avatar 
          key={user.id} 
          className={cn(
            avatarSize,
            'border border-background ring-1 ring-background transition-transform duration-200'
          )}
          style={{ zIndex: displayUsers.length - index }}
          title={user.name || 'User'}
        >
          {user.avatarUrl ? (
            <AvatarImage src={user.avatarUrl} className="object-cover" />
          ) : null}
          <AvatarFallback className={cn(getAvatarColor(user.name, user.id), 'text-white font-medium', fontSize)}>
            {user.name?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      ))}
      {remainingCount > 0 && (
        <div 
          className={cn(
            avatarSize,
            'rounded-full bg-muted border border-background flex items-center justify-center font-medium text-muted-foreground transition-transform duration-200',
            fontSize
          )}
          style={{ zIndex: 0 }}
          title={`+${remainingCount} more`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}

// Memoize to prevent unnecessary re-renders
export const SeenAvatars = memo(SeenAvatarsComponent, (prev, next) => {
  if (prev.users.length !== next.users.length) return false;
  if (prev.maxAvatars !== next.maxAvatars) return false;
  if (prev.size !== next.size) return false;
  
  // Deep compare users
  for (let i = 0; i < prev.users.length; i++) {
    if (prev.users[i].id !== next.users[i].id) return false;
    if (prev.users[i].avatarUrl !== next.users[i].avatarUrl) return false;
  }
  
  return true;
});
