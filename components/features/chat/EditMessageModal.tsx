'use client';

import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useUIStore } from '@/store/ui.store';
import { editMessage } from '@/services/message.service';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface EditMessageModalProps {
  messages: Array<{ id: string; content: string | null }>;
}

export function EditMessageModal({ messages }: EditMessageModalProps) {
  const { modals, closeEditModal } = useUIStore();
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { isOpen, messageId } = modals.editMessage;

  // Find the message to edit
  const messageToEdit = messages.find((m) => m.id === messageId);

  // Set initial content when modal opens
  useEffect(() => {
    if (isOpen && messageToEdit) {
      setContent(messageToEdit.content || '');
      setError(null);
      // Focus textarea after a short delay
      setTimeout(() => {
        textareaRef.current?.focus();
        textareaRef.current?.select();
      }, 100);
    }
  }, [isOpen, messageToEdit]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  const handleSubmit = async () => {
    if (!messageId || !content.trim() || content.trim() === messageToEdit?.content) {
      closeEditModal();
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const result = await editMessage(supabase, messageId, content.trim());

      if (result.success) {
        // Invalidate messages query to refresh
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        closeEditModal();
      } else {
        setError(result.error?.message || 'Failed to edit message');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      closeEditModal();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={closeEditModal}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-popover/95 backdrop-blur-xl border border-border/50 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2 className="text-lg font-semibold text-foreground">Edit message</h2>
          <button
            onClick={closeEditModal}
            className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Original message preview */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Original message</p>
            <div className="px-4 py-3 bg-muted/50 rounded-xl text-sm text-muted-foreground line-clamp-2 border border-border/50">
              {messageToEdit?.content}
            </div>
          </div>

          {/* Edit textarea */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">New message</p>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className={cn(
                'w-full px-4 py-3 bg-background rounded-xl text-foreground text-sm',
                'border border-border focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all',
                'resize-none min-h-[80px] max-h-[200px]',
                'placeholder:text-muted-foreground/50'
              )}
              disabled={isLoading}
              rows={1}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="text-sm text-destructive font-medium flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-destructive" />
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border/50 bg-muted/30">
          <button
            onClick={closeEditModal}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !content.trim()}
            className={cn(
              'px-6 py-2 text-sm font-medium rounded-lg transition-all shadow-sm',
              'bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:shadow-primary/20',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none'
            )}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
