'use client';

import { Lock } from 'lucide-react';

export function EmptyState() {
  return (
    <main
      className="flex h-full flex-col items-center justify-center bg-muted/30 border-b-[6px] border-primary/0 animate-fade-in relative"
      role="main"
      aria-label="No conversation selected"
    >
      <div className="flex flex-col items-center justify-center text-center max-w-md px-4">
        <div className="mb-10 relative">
          <div className="w-64 h-64 bg-muted rounded-full flex items-center justify-center opacity-50">
            <svg viewBox="0 0 24 24" className="w-32 h-32 text-muted-foreground/40" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM11 7H13V13H11V7ZM11 15H13V17H11V15Z" />
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-light text-foreground mb-4 tracking-tight">
          WhatsApp Web
        </h1>
        <p className="text-muted-foreground text-sm leading-6 mb-8">
          Send and receive messages without keeping your phone online.<br />
          Use WhatsApp on up to 4 linked devices and 1 phone.
        </p>

        <div className="flex gap-4 justify-center">
          <button className="bg-primary text-primary-foreground px-6 py-2.5 rounded-full font-medium text-sm hover:bg-primary/90 transition-all shadow-md hover:shadow-lg hover:scale-105 active:scale-95">
            Start Chatting
          </button>
        </div>
      </div>

      <div className="absolute bottom-10 flex items-center gap-2 text-muted-foreground/60 text-xs">
        <Lock className="w-3 h-3" />
        <span>Your personal messages are end-to-end encrypted</span>
      </div>
    </main>
  );
}
