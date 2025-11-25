'use client';

import React from 'react';

interface TypingIndicatorProps {
  userName: string;
}

export function TypingIndicator({ userName }: TypingIndicatorProps) {
  return (
    <div className="flex items-start gap-2 px-2">
      {/* WhatsApp style bubble with animated dots */}
      <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <span 
            className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-typing-dot"
            style={{ animationDelay: '0ms' }}
          />
          <span 
            className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-typing-dot"
            style={{ animationDelay: '150ms' }}
          />
          <span 
            className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-typing-dot"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    </div>
  );
}
