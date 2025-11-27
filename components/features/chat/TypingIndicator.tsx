'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface TypingUser {
  userId: string;
  userName: string;
  avatarUrl?: string | null;
}

interface TypingIndicatorProps {
  userName?: string;
  // Multiple typing users with avatars (for group chats)
  typingUsers?: TypingUser[];
  // Max avatars to show before showing "+X"
  maxAvatars?: number;
}

export function TypingIndicator({ userName, typingUsers = [], maxAvatars = 4 }: TypingIndicatorProps) {
  // If typingUsers provided, use that; otherwise fall back to single userName
  const hasMultipleUsers = typingUsers.length > 0;
  const displayUsers = hasMultipleUsers ? typingUsers.slice(0, maxAvatars) : [];
  const remainingCount = hasMultipleUsers ? Math.max(0, typingUsers.length - maxAvatars) : 0;

  return (
    <div className="flex w-full mb-2 px-[4%] md:px-[8%] justify-start">
      <div className="flex items-end gap-2">
        {/* Avatars for typing users */}
        {hasMultipleUsers && (
          <div className="flex items-center -space-x-2">
            {displayUsers.map((user, index) => (
              <Avatar 
                key={user.userId} 
                className={cn(
                  "h-7 w-7 border-2 border-background",
                  "ring-2 ring-background"
                )}
                style={{ zIndex: displayUsers.length - index }}
              >
                <AvatarImage src={user.avatarUrl || undefined} className="object-cover" />
                <AvatarFallback className="bg-muted text-muted-foreground text-[10px]">
                  {user.userName?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
            ))}
            {remainingCount > 0 && (
              <div 
                className="h-7 w-7 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] text-muted-foreground font-medium"
                style={{ zIndex: 0 }}
              >
                +{remainingCount}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col max-w-[75%] md:max-w-[65%] relative items-start">
          <div className="flex relative">
            {/* Tail SVG - same as incoming message */}
            <div className="absolute top-0 w-2 h-3 z-10 -left-2">
              <svg viewBox="0 0 8 13" height="13" width="8" preserveAspectRatio="none" className="fill-chat-bubble-in block">
                <path d="M1.533 3.568L8 12.193V1H2.812C1.042 1 .474 2.156 1.533 3.568z"></path>
              </svg>
            </div>
            
            {/* WhatsApp style bubble with animated dots */}
            <div className="bg-chat-bubble-in rounded-lg rounded-tl-none px-4 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
              <div className="flex items-center gap-1">
                <span 
                  className="w-2 h-2 bg-[#8696a0] rounded-full animate-typing-dot"
                  style={{ animationDelay: '0ms' }}
                />
                <span 
                  className="w-2 h-2 bg-[#8696a0] rounded-full animate-typing-dot"
                  style={{ animationDelay: '150ms' }}
                />
                <span 
                  className="w-2 h-2 bg-[#8696a0] rounded-full animate-typing-dot"
                  style={{ animationDelay: '300ms' }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
