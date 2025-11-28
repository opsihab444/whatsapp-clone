'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { deleteMessage } from '@/services/message.service';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export function DeleteMessageModal() {
  const { modals, closeDeleteModal } = useUIStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { isOpen, messageId } = modals.deleteMessage;

  const handleDelete = async () => {
    if (!messageId) return;

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const result = await deleteMessage(supabase, messageId);

      if (result.success) {
        // Invalidate messages query to refresh
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        closeDeleteModal();
      } else {
        setError(result.error?.message || 'Failed to delete message');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={closeDeleteModal}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm bg-popover/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Content */}
        <div className="p-6 text-center">
          {/* Warning Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center ring-1 ring-destructive/20">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-xl font-semibold text-foreground mb-3">
            Delete message?
          </h2>

          {/* Description */}
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            This message will be deleted for everyone in this chat. This action cannot be undone.
          </p>

          {/* Error message */}
          {error && (
            <p className="mb-4 text-sm text-destructive font-medium bg-destructive/10 py-2 px-3 rounded-lg">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex border-t border-border/50 bg-muted/30">
          <button
            onClick={closeDeleteModal}
            disabled={isLoading}
            className={cn(
              'flex-1 px-4 py-4 text-sm font-medium text-muted-foreground',
              'hover:bg-muted hover:text-foreground transition-colors',
              'border-r border-border/50',
              'disabled:opacity-50'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className={cn(
              'flex-1 px-4 py-4 text-sm font-medium text-destructive',
              'hover:bg-destructive/10 transition-colors',
              'disabled:opacity-50'
            )}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
