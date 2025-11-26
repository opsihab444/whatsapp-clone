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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeDeleteModal}
      />

      {/* Modal */}
      <div className="relative w-full max-w-sm mx-4 bg-[#233138] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Content */}
        <div className="p-6 text-center">
          {/* Warning Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-lg font-medium text-[#e9edef] mb-2">
            Delete message?
          </h2>

          {/* Description */}
          <p className="text-sm text-[#8696a0] mb-4">
            This message will be deleted for everyone in this chat. This action cannot be undone.
          </p>

          {/* Error message */}
          {error && (
            <p className="mb-4 text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex border-t border-[#3b4a54]">
          <button
            onClick={closeDeleteModal}
            disabled={isLoading}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium text-[#00a884]',
              'hover:bg-[#00a884]/10 transition-colors',
              'border-r border-[#3b4a54]',
              'disabled:opacity-50'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isLoading}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium text-red-500',
              'hover:bg-red-500/10 transition-colors',
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
