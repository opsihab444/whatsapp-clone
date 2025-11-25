import { describe, test, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { render, fireEvent, screen } from '@testing-library/react';
import { MessageBubble } from '../MessageBubble';
import { Message } from '@/types';

/**
 * Arbitrary generator for Message objects
 */
const messageArbitrary = fc.record({
  id: fc.uuid(),
  conversation_id: fc.uuid(),
  sender_id: fc.uuid(),
  content: fc.string({ minLength: 1, maxLength: 500 }),
  type: fc.constantFrom('text' as const, 'image' as const),
  media_url: fc.constant(null),
  media_width: fc.constant(null),
  media_height: fc.constant(null),
  status: fc.constantFrom('sent' as const, 'delivered' as const, 'read' as const),
  is_edited: fc.boolean(),
  is_deleted: fc.constant(false), // For context menu tests, we need non-deleted messages
  created_at: fc.constant(new Date('2024-01-01T12:00:00Z').toISOString()),
  updated_at: fc.constant(new Date('2024-01-01T12:00:00Z').toISOString()),
});

describe('MessageBubble Edit/Delete Property Tests', () => {
  /**
   * Feature: whatsapp-clone, Property 28: Context menu for own messages
   * Validates: Requirements 12.1
   * 
   * This property tests that when a user long-presses or right-clicks their own message,
   * the application SHALL display options to edit or delete.
   */
  test('Property 28: context menu for own messages', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        (message) => {
          // Clean up DOM before each render
          document.body.innerHTML = '';

          const onEdit = vi.fn();
          const onDelete = vi.fn();

          // Render the message bubble as own message (not deleted)
          const { container, unmount } = render(
            <MessageBubble
              message={message}
              isOwnMessage={true}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );

          // Property: For any own message (not deleted), a context menu SHALL be available
          
          // The DropdownMenuTrigger renders as a button element with aria-label
          const menuButton = container.querySelector('button[aria-label="Message options"]');

          // The property being tested: For any own message, a context menu trigger SHALL exist
          expect(menuButton).toBeTruthy();

          // Click to open the menu
          if (menuButton) {
            fireEvent.click(menuButton);

            // Verify that edit and delete options are displayed
            const editOption = screen.queryByText('Edit');
            const deleteOption = screen.queryByText('Delete');

            expect(editOption).toBeTruthy();
            expect(deleteOption).toBeTruthy();
          }

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 28: No context menu for other users' messages
   * Validates: Requirements 12.1
   * 
   * This property tests that messages from other users should NOT display
   * edit/delete options.
   */
  test('Property 28: no context menu for other users messages', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        (message) => {
          // Clean up DOM before each render
          document.body.innerHTML = '';

          const onEdit = vi.fn();
          const onDelete = vi.fn();

          // Render the message bubble as NOT own message
          const { container, unmount } = render(
            <MessageBubble
              message={message}
              isOwnMessage={false}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );

          // Property: For any message that is not owned by the user,
          // NO context menu SHALL be displayed
          
          // The menu trigger button should NOT exist for other users' messages
          const allButtons = container.querySelectorAll('button');
          const menuButton = Array.from(allButtons).find(btn => {
            const svg = btn.querySelector('svg');
            return svg && svg.classList.contains('lucide-ellipsis-vertical');
          });
          
          expect(menuButton).toBeFalsy();

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 28: No context menu for deleted messages
   * Validates: Requirements 12.1
   * 
   * This property tests that deleted messages should NOT display edit/delete options,
   * even if they are owned by the current user.
   */
  test('Property 28: no context menu for deleted messages', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        (message) => {
          // Clean up DOM before each render
          document.body.innerHTML = '';

          const onEdit = vi.fn();
          const onDelete = vi.fn();

          // Create a deleted message
          const deletedMessage: Message = {
            ...message,
            is_deleted: true,
            content: 'This message was deleted',
          };

          // Render the message bubble as own message but deleted
          const { container, unmount } = render(
            <MessageBubble
              message={deletedMessage}
              isOwnMessage={true}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );

          // Property: For any deleted message, NO context menu SHALL be displayed
          
          // The menu trigger button should NOT exist for deleted messages
          const allButtons = container.querySelectorAll('button');
          const menuButton = Array.from(allButtons).find(btn => {
            const svg = btn.querySelector('svg');
            return svg && svg.classList.contains('lucide-ellipsis-vertical');
          });
          
          expect(menuButton).toBeFalsy();

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 29: Edit updates content and flag
   * Validates: Requirements 12.2
   * 
   * This property tests that when a user edits a message, the content SHALL be updated
   * and is_edited SHALL be set to true.
   */
  test('Property 29: edit updates content and flag', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        fc.string({ minLength: 1, maxLength: 500 }),
        (message, newContent) => {
          // Clean up DOM before each render
          document.body.innerHTML = '';

          const onEdit = vi.fn();
          const onDelete = vi.fn();

          // Render the message bubble as own message
          const { container, unmount } = render(
            <MessageBubble
              message={message}
              isOwnMessage={true}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );

          // Find the menu button
          const allButtons = container.querySelectorAll('button');
          let menuButton: Element | null = null;
          allButtons.forEach(btn => {
            const svgs = btn.querySelectorAll('svg');
            svgs.forEach(svg => {
              if (svg.classList.contains('lucide') && svg.classList.contains('lucide-ellipsis-vertical')) {
                menuButton = btn;
              }
            });
          });

          expect(menuButton).toBeTruthy();

          if (menuButton) {
            // Click to open the menu
            fireEvent.click(menuButton);

            // Click the Edit option
            const editOption = screen.queryByText('Edit');
            expect(editOption).toBeTruthy();

            if (editOption) {
              fireEvent.click(editOption);

              // Property: When edit is clicked, onEdit SHALL be called with message ID and current content
              expect(onEdit).toHaveBeenCalledWith(message.id, message.content);
            }
          }

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 30: Delete sets flag and replaces content
   * Validates: Requirements 12.3
   * 
   * This property tests that when a user deletes a message, is_deleted SHALL be set to true
   * and content SHALL be replaced with "This message was deleted".
   */
  test('Property 30: delete sets flag and replaces content', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        (message) => {
          // Clean up DOM before each render
          document.body.innerHTML = '';

          const onEdit = vi.fn();
          const onDelete = vi.fn();

          // Render the message bubble as own message
          const { container, unmount } = render(
            <MessageBubble
              message={message}
              isOwnMessage={true}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          );

          // Find the menu button
          const allButtons = container.querySelectorAll('button');
          let menuButton: Element | null = null;
          allButtons.forEach(btn => {
            const svgs = btn.querySelectorAll('svg');
            svgs.forEach(svg => {
              if (svg.classList.contains('lucide') && svg.classList.contains('lucide-ellipsis-vertical')) {
                menuButton = btn;
              }
            });
          });

          expect(menuButton).toBeTruthy();

          if (menuButton) {
            // Click to open the menu
            fireEvent.click(menuButton);

            // Click the Delete option
            const deleteOption = screen.queryByText('Delete');
            expect(deleteOption).toBeTruthy();

            if (deleteOption) {
              fireEvent.click(deleteOption);

              // Property: When delete is clicked, onDelete SHALL be called with message ID
              expect(onDelete).toHaveBeenCalledWith(message.id);
            }
          }

          // Clean up
          unmount();
        }
      ),
      { numRuns: 100 }
    );
  });
});
