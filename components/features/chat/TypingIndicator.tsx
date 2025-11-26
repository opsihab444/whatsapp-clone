'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  userName: string;
}

export function TypingIndicator({ userName }: TypingIndicatorProps) {
  return (
    <div className="flex w-full mb-2 px-[4%] md:px-[8%] justify-start">
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
  );
}
