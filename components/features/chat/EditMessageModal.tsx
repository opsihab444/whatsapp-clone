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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={closeEditModal}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 bg-[#233138] rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3b4a54]">
          <h2 className="text-lg font-medium text-[#e9edef]">Edit message</h2>
          <button
            onClick={closeEditModal}
            className="p-1 rounded-full hover:bg-[#3b4a54] transition-colors"
          >
            <X className="w-5 h-5 text-[#aebac1]" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Original message preview */}
          <div className="mb-4">
            <p className="text-xs text-[#8696a0] mb-2">Original message</p>
            <div className="px-3 py-2 bg-[#1a262c] rounded-lg text-sm text-[#8696a0] line-clamp-2">
              {messageToEdit?.content}
            </div>
          </div>

          {/* Edit textarea */}
          <div>
            <p className="text-xs text-[#8696a0] mb-2">New message</p>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className={cn(
                'w-full px-3 py-2 bg-[#2a3942] rounded-lg text-[#e9edef] text-sm',
                'border border-transparent focus:border-[#00a884] focus:outline-none',
                'resize-none min-h-[44px] max-h-[200px]',
                'placeholder:text-[#8696a0]'
              )}
              disabled={isLoading}
              rows={1}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="mt-2 text-sm text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#3b4a54]">
          <button
            onClick={closeEditModal}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-[#00a884] hover:bg-[#00a884]/10 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !content.trim()}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'bg-[#00a884] text-white hover:bg-[#00a884]/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
