'use client';

import { X, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ContactInfoPanelProps {
  isOpen: boolean;
  onClose: () => void;
  user: {
    full_name?: string | null;
    email: string;
    avatar_url?: string | null;
  };
}

export function ContactInfoPanel({ isOpen, onClose, user }: ContactInfoPanelProps) {
  const displayName = user.full_name || user.email;

  return (
    <>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/20 z-40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div 
        className={`absolute top-0 right-0 h-full w-[340px] bg-background border-l border-border/50 flex flex-col z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-6 px-4 py-3 bg-background border-b border-border/50 min-h-[70px]">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-muted-foreground hover:bg-secondary hover:text-foreground rounded-full transition-all duration-300"
            onClick={onClose}
          >
            <X className="h-6 w-6" />
          </Button>
          <h2 className="text-foreground text-base font-medium">Contact info</h2>
        </div>

        <ScrollArea className="flex-1">
          {/* Profile Section */}
          <div className="flex flex-col items-center py-10 bg-background">
            <Avatar className="h-[200px] w-[200px] mb-4">
              <AvatarImage src={user.avatar_url || undefined} className="object-cover" />
              <AvatarFallback className="bg-muted text-muted-foreground text-6xl">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h3 className="text-[22px] text-foreground font-normal mt-2">
              {displayName}
            </h3>
            <p className="text-[14px] text-muted-foreground mt-1">
              {user.email}
            </p>
          </div>

          {/* Media Section */}
          <div className="mt-2 border-t border-border/50">
            <div 
              className="flex items-center justify-between px-8 py-4 hover:bg-secondary/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-6">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <span className="text-foreground text-[15px]">Media, links and docs</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">0</span>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
