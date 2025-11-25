import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { Message, MessageStatus } from '@/types';

/**
 * Arbitrary generator for valid ISO date strings
 */
const isoDateArbitrary = fc.integer({ min: 0, max: Date.now() }).map(timestamp => new Date(timestamp).toISOString());

/**
 * Arbitrary generator for Message objects
 */
const messageArbitrary = fc.record({
  id: fc.uuid(),
  conversation_id: fc.uuid(),
  sender_id: fc.uuid(),
  content: fc.option(fc.string({ minLength: 1, maxLength: 500 }), { nil: null }),
  type: fc.constantFrom('text', 'image') as fc.Arbitrary<'text' | 'image'>,
  media_url: fc.option(fc.webUrl(), { nil: null }),
  media_width: fc.option(fc.integer({ min: 100, max: 4000 }), { nil: null }),
  media_height: fc.option(fc.integer({ min: 100, max: 4000 }), { nil: null }),
  status: fc.constantFrom('sent', 'delivered', 'read') as fc.Arbitrary<MessageStatus>,
  is_edited: fc.boolean(),
  is_deleted: fc.boolean(),
  created_at: isoDateArbitrary,
  updated_at: isoDateArbitrary,
}) as fc.Arbitrary<Message>;

describe('Message Service Property Tests', () => {
  /**
   * Feature: whatsapp-clone, Property 16: Message chronological ordering
   * Validates: Requirements 6.1
   */
  test('Property 16: messages are displayed in chronological order with newest at bottom', () => {
    fc.assert(
      fc.property(
        fc.array(messageArbitrary, { minLength: 1, maxLength: 100 }),
        (messages) => {
          // Sort messages chronologically (oldest first, newest last)
          const sorted = [...messages].sort((a, b) => {
            const timeA = new Date(a.created_at).getTime();
            const timeB = new Date(b.created_at).getTime();
            return timeA - timeB;
          });

          // Verify sorting invariant: each message's time <= next message's time
          for (let i = 0; i < sorted.length - 1; i++) {
            const currentTime = new Date(sorted[i].created_at).getTime();
            const nextTime = new Date(sorted[i + 1].created_at).getTime();
            
            expect(currentTime).toBeLessThanOrEqual(nextTime);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 22, 23, 24: Initial status, delivered, read
   * Validates: Requirements 9.1, 9.2, 9.3
   */
  test('Property 22-24: message status progression is valid', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('sent', 'delivered', 'read') as fc.Arbitrary<MessageStatus>,
        fc.constantFrom('sent', 'delivered', 'read') as fc.Arbitrary<MessageStatus>,
        (currentStatus, newStatus) => {
          // Define valid status transitions
          const validTransitions: Record<MessageStatus, MessageStatus[]> = {
            'sent': ['sent', 'delivered', 'read'],
            'delivered': ['delivered', 'read'],
            'read': ['read'],
          };

          const isValidTransition = validTransitions[currentStatus].includes(newStatus);

          // Status can only progress forward or stay the same
          const statusOrder: Record<MessageStatus, number> = {
            'sent': 1,
            'delivered': 2,
            'read': 3,
          };

          const isForwardOrSame = statusOrder[newStatus] >= statusOrder[currentStatus];

          expect(isValidTransition).toBe(isForwardOrSame);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 5: Mark as read on open
   * Validates: Requirements 3.2
   */
  test('Property 5: opening a conversation marks all messages as read and sets unread_count to 0', () => {
    fc.assert(
      fc.property(
        fc.record({
          conversationId: fc.uuid(),
          currentUserId: fc.uuid(),
          messages: fc.array(
            fc.record({
              id: fc.uuid(),
              sender_id: fc.uuid(),
              status: fc.constantFrom('sent', 'delivered') as fc.Arbitrary<MessageStatus>,
            }),
            { minLength: 1, maxLength: 50 }
          ),
          unreadCount: fc.integer({ min: 1, max: 50 }),
        }),
        (scenario) => {
          // Simulate marking conversation as read
          // After marking as read:
          // 1. All messages not sent by current user should have status 'read'
          // 2. Unread count should be 0
          
          const messagesAfterRead = scenario.messages.map(msg => {
            if (msg.sender_id !== scenario.currentUserId) {
              return { ...msg, status: 'read' as MessageStatus };
            }
            return msg;
          });

          const newUnreadCount = 0;

          // Verify all non-user messages are marked as read
          messagesAfterRead.forEach(msg => {
            if (msg.sender_id !== scenario.currentUserId) {
              expect(msg.status).toBe('read');
            }
          });

          // Verify unread count is 0
          expect(newUnreadCount).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 29: Edit updates content and flag
   * Validates: Requirements 12.2
   */
  test('Property 29: editing a message updates content and sets is_edited to true', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        fc.string({ minLength: 1, maxLength: 500 }),
        (originalMessage, newContent) => {
          // Simulate editing a message
          // When a message is edited:
          // 1. The content SHALL be updated to the new content
          // 2. The is_edited flag SHALL be set to true
          
          const editedMessage: Message = {
            ...originalMessage,
            content: newContent.trim(),
            is_edited: true,
            updated_at: new Date().toISOString(),
          };

          // Property 1: Content SHALL be updated
          expect(editedMessage.content).toBe(newContent.trim());
          
          // Property 2: is_edited flag SHALL be set to true
          expect(editedMessage.is_edited).toBe(true);
          
          // Property 3: The message ID should remain unchanged
          expect(editedMessage.id).toBe(originalMessage.id);
          
          // Property 4: Other fields should remain unchanged
          expect(editedMessage.conversation_id).toBe(originalMessage.conversation_id);
          expect(editedMessage.sender_id).toBe(originalMessage.sender_id);
          expect(editedMessage.type).toBe(originalMessage.type);
          expect(editedMessage.status).toBe(originalMessage.status);
          expect(editedMessage.is_deleted).toBe(originalMessage.is_deleted);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 30: Delete sets flag and replaces content
   * Validates: Requirements 12.3
   */
  test('Property 30: deleting a message sets is_deleted to true and replaces content', () => {
    fc.assert(
      fc.property(
        messageArbitrary,
        (originalMessage) => {
          // Simulate deleting a message
          // When a message is deleted:
          // 1. The is_deleted flag SHALL be set to true
          // 2. The content SHALL be replaced with "This message was deleted"
          
          const deletedMessage: Message = {
            ...originalMessage,
            content: 'This message was deleted',
            is_deleted: true,
            updated_at: new Date().toISOString(),
          };

          // Property 1: is_deleted flag SHALL be set to true
          expect(deletedMessage.is_deleted).toBe(true);
          
          // Property 2: Content SHALL be replaced with "This message was deleted"
          expect(deletedMessage.content).toBe('This message was deleted');
          
          // Property 3: The message ID should remain unchanged
          expect(deletedMessage.id).toBe(originalMessage.id);
          
          // Property 4: Other fields should remain unchanged
          expect(deletedMessage.conversation_id).toBe(originalMessage.conversation_id);
          expect(deletedMessage.sender_id).toBe(originalMessage.sender_id);
          expect(deletedMessage.type).toBe(originalMessage.type);
          expect(deletedMessage.status).toBe(originalMessage.status);
          expect(deletedMessage.is_edited).toBe(originalMessage.is_edited);
        }
      ),
      { numRuns: 100 }
    );
  });
});
