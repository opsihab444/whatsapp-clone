'use client';

import { Toaster as Sonner } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast:
            'group toast backdrop-blur-lg bg-background/95 border-border shadow-lg rounded-lg',
          description: 'text-muted-foreground',
          actionButton:
            'bg-primary text-primary-foreground hover:bg-primary/90',
          cancelButton:
            'bg-muted text-muted-foreground hover:bg-muted/80',
          error: 'bg-destructive/10 border-destructive/50 text-destructive',
          success: 'bg-green-500/10 border-green-500/50 text-green-700 dark:text-green-400',
          warning: 'bg-yellow-500/10 border-yellow-500/50 text-yellow-700 dark:text-yellow-400',
          info: 'bg-blue-500/10 border-blue-500/50 text-blue-700 dark:text-blue-400',
        },
      }}
    />
  );
}

// Re-export toast function from sonner
export { toast } from 'sonner';
