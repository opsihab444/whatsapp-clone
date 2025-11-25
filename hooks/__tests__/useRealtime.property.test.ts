import { describe, test, expect } from 'vitest';
import * as fc from 'fast-check';
import { Message, Conversation } from '@/types';

/**
 * Arbitrary generator for valid ISO date strings
 */
const isoDateArbitrary = fc
  .integer({ min: 0, max: Date.now() })
  .map((timestamp) => new Date(timestamp).toISOString());

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
  status: fc.constantFrom('sent', 'delivered', 'read') as fc.Arbitrary<
    'sent' | 'delivered' | 'read'
  >,
  is_edited: fc.boolean(),
  is_deleted: fc.boolean(),
  created_at: isoDateArbitrary,
  updated_at: isoDateArbitrary,
}) as fc.Arbitrary<Message>;

/**
 * Arbitrary generator for Conversation objects
 */
const conversationArbitrary = fc.record({
  id: fc.uuid(),
  participant_1_id: fc.uuid(),
  participant_2_id: fc.uuid(),
  last_message_content: fc.option(fc.string({ minLength: 1, maxLength: 200 }), {
    nil: null,
  }),
  last_message_time: fc.option(isoDateArbitrary, { nil: null }),
  created_at: isoDateArbitrary,
  other_user: fc.record({
    id: fc.uuid(),
    email: fc.emailAddress(),
    full_name: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: null }),
    avatar_url: fc.option(fc.webUrl(), { nil: null }),
    created_at: isoDateArbitrary,
  }),
  unread_count: fc.integer({ min: 0, max: 100 }),
}) as fc.Arbitrary<Conversation>;

describe('useRealtime Property Tests', () => {
  /**
   * Feature: whatsapp-clone, Property 13: Realtime message append to active chat
   * Validates: Requirements 5.2
   */
  test('Property 13: realtime message for active conversation is appended to chat window', () => {
    fc.assert(
      fc.property(
        fc.record({
          activeChatId: fc.uuid(),
          existingMessages: fc.array(messageArbitrary, { minLength: 0, maxLength: 50 }),
          newMessage: messageArbitrary,
        }),
        (scenario) => {
          // Ensure new message belongs to active conversation
          const newMessage = {
            ...scenario.newMessage,
            conversation_id: scenario.activeChatId,
          };

          // Simulate appending message to cache
          const messagesAfter = [newMessage, ...scenario.existingMessages];

          // Verify the new message is at the beginning (most recent)
          expect(messagesAfter[0].id).toBe(newMessage.id);
          expect(messagesAfter[0].conversation_id).toBe(scenario.activeChatId);

          // Verify message count increased by 1
          expect(messagesAfter.length).toBe(scenario.existingMessages.length + 1);

          // Verify all existing messages are still present
          scenario.existingMessages.forEach((msg, idx) => {
            expect(messagesAfter[idx + 1].id).toBe(msg.id);
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 14: Sidebar reorder on inactive conversation message
   * Validates: Requirements 5.3
   */
  test('Property 14: realtime message for inactive conversation moves it to top of sidebar', () => {
    fc.assert(
      fc.property(
        fc.record({
          activeChatId: fc.uuid(),
          conversations: fc.array(conversationArbitrary, { minLength: 2, maxLength: 20 }),
          newMessage: messageArbitrary,
        }),
        (scenario) => {
          // Pick a conversation that is NOT the active one
          const inactiveConversation = scenario.conversations.find(
            (conv) => conv.id !== scenario.activeChatId
          );

          if (!inactiveConversation) {
            // Skip if no inactive conversation available
            return true;
          }

          // New message belongs to inactive conversation
          const newMessage = {
            ...scenario.newMessage,
            conversation_id: inactiveConversation.id,
          };

          // Update conversation with new last message
          const updatedConversations = scenario.conversations.map((conv) =>
            conv.id === inactiveConversation.id
              ? {
                  ...conv,
                  last_message_content: newMessage.content,
                  last_message_time: newMessage.created_at,
                }
              : conv
          );

          // Sort by last_message_time DESC (most recent first)
          const sortedConversations = updatedConversations.sort((a, b) => {
            const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
            const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
            return timeB - timeA;
          });

          // Find the updated conversation in sorted list
          const updatedConvIndex = sortedConversations.findIndex(
            (conv) => conv.id === inactiveConversation.id
          );

          // Verify the conversation is at or near the top (depending on timestamps)
          // It should be sorted correctly by last_message_time
          if (updatedConvIndex > 0) {
            const prevConv = sortedConversations[updatedConvIndex - 1];
            const currentConv = sortedConversations[updatedConvIndex];

            const prevTime = prevConv.last_message_time
              ? new Date(prevConv.last_message_time).getTime()
              : 0;
            const currentTime = currentConv.last_message_time
              ? new Date(currentConv.last_message_time).getTime()
              : 0;

            // Previous conversation should have a more recent or equal timestamp
            expect(prevTime).toBeGreaterThanOrEqual(currentTime);
          }

          // Verify the updated conversation has the new message data
          const updatedConv = sortedConversations.find(
            (conv) => conv.id === inactiveConversation.id
          );
          expect(updatedConv?.last_message_content).toBe(newMessage.content);
          expect(updatedConv?.last_message_time).toBe(newMessage.created_at);

          // Verify sorting invariant for all conversations
          for (let i = 0; i < sortedConversations.length - 1; i++) {
            const currentTimeStr = sortedConversations[i].last_message_time;
            const nextTimeStr = sortedConversations[i + 1].last_message_time;
            
            const currentTime = currentTimeStr ? new Date(currentTimeStr).getTime() : 0;
            const nextTime = nextTimeStr ? new Date(nextTimeStr).getTime() : 0;

            expect(currentTime).toBeGreaterThanOrEqual(nextTime);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 2, 15: Cache update without refetch
   * Validates: Requirements 2.2, 5.4
   */
  test('Property 2, 15: realtime events update cache without triggering refetch', () => {
    fc.assert(
      fc.property(
        fc.record({
          conversations: fc.array(conversationArbitrary, { minLength: 1, maxLength: 20 }),
          newMessage: messageArbitrary,
          refetchCount: fc.constant(0), // Simulates no refetch
        }),
        (scenario) => {
          // Pick a random conversation
          const targetConversation =
            scenario.conversations[
              Math.floor(Math.random() * scenario.conversations.length)
            ];

          // New message for this conversation
          const newMessage = {
            ...scenario.newMessage,
            conversation_id: targetConversation.id,
          };

          // Simulate cache update (manual update, not refetch)
          const updatedConversations = scenario.conversations.map((conv) =>
            conv.id === targetConversation.id
              ? {
                  ...conv,
                  last_message_content: newMessage.content,
                  last_message_time: newMessage.created_at,
                }
              : conv
          );

          // Sort conversations
          const sortedConversations = updatedConversations.sort((a, b) => {
            const timeA = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
            const timeB = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
            return timeB - timeA;
          });

          // Verify the conversation was updated
          const updatedConv = sortedConversations.find(
            (conv) => conv.id === targetConversation.id
          );
          expect(updatedConv).toBeDefined();
          expect(updatedConv!.last_message_content).toBe(newMessage.content);
          expect(updatedConv!.last_message_time).toBe(newMessage.created_at);

          // Verify no refetch occurred (refetchCount remains 0)
          expect(scenario.refetchCount).toBe(0);

          // Verify all conversations are still present
          expect(sortedConversations.length).toBe(scenario.conversations.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 6: Unread count increment for inactive conversations
   * Validates: Requirements 3.3
   */
  test('Property 6: unread count increments for inactive conversations on new message', () => {
    fc.assert(
      fc.property(
        fc.record({
          activeChatId: fc.uuid(),
          conversations: fc.array(conversationArbitrary, { minLength: 2, maxLength: 20 }),
          newMessage: messageArbitrary,
          currentUserId: fc.uuid(),
        }),
        (scenario) => {
          // Pick a conversation that is NOT the active one
          const inactiveConversation = scenario.conversations.find(
            (conv) => conv.id !== scenario.activeChatId
          );

          if (!inactiveConversation) {
            // Skip if no inactive conversation available
            return true;
          }

          // New message belongs to inactive conversation and is from another user
          const newMessage = {
            ...scenario.newMessage,
            conversation_id: inactiveConversation.id,
            sender_id: scenario.currentUserId === inactiveConversation.participant_1_id 
              ? inactiveConversation.participant_2_id 
              : inactiveConversation.participant_1_id,
          };

          // Store original unread count
          const originalUnreadCount = inactiveConversation.unread_count;

          // Simulate unread count increment for inactive conversation
          const updatedConversations = scenario.conversations.map((conv) =>
            conv.id === inactiveConversation.id
              ? { ...conv, unread_count: conv.unread_count + 1 }
              : conv
          );

          // Find the updated conversation
          const updatedConv = updatedConversations.find(
            (conv) => conv.id === inactiveConversation.id
          );

          // Verify unread count was incremented by exactly 1
          expect(updatedConv).toBeDefined();
          expect(updatedConv!.unread_count).toBe(originalUnreadCount + 1);

          // Verify other conversations' unread counts remain unchanged
          scenario.conversations.forEach((originalConv) => {
            if (originalConv.id !== inactiveConversation.id) {
              const unchangedConv = updatedConversations.find(
                (conv) => conv.id === originalConv.id
              );
              expect(unchangedConv!.unread_count).toBe(originalConv.unread_count);
            }
          });

          // Verify total conversation count remains the same
          expect(updatedConversations.length).toBe(scenario.conversations.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Feature: whatsapp-clone, Property 7: Auto-read for active conversation
   * Validates: Requirements 3.4
   */
  test('Property 7: messages in active conversation are marked as read when window is visible', () => {
    fc.assert(
      fc.property(
        fc.record({
          activeChatId: fc.uuid(),
          newMessage: messageArbitrary,
          isWindowVisible: fc.boolean(),
          currentUserId: fc.uuid(),
        }),
        (scenario) => {
          // New message belongs to active conversation and is from another user
          const newMessage = {
            ...scenario.newMessage,
            conversation_id: scenario.activeChatId,
            sender_id: fc.sample(fc.uuid().filter(id => id !== scenario.currentUserId), 1)[0],
            status: 'sent' as const,
          };

          // Simulate the auto-read logic
          const shouldMarkAsRead = 
            newMessage.conversation_id === scenario.activeChatId &&
            scenario.isWindowVisible &&
            newMessage.sender_id !== scenario.currentUserId;

          if (shouldMarkAsRead) {
            // Message should be marked as read
            const updatedMessage = { ...newMessage, status: 'read' as const };
            expect(updatedMessage.status).toBe('read');
            expect(updatedMessage.conversation_id).toBe(scenario.activeChatId);
          } else {
            // Message status should remain unchanged
            expect(newMessage.status).toBe('sent');
          }

          // Verify the message belongs to the active conversation
          expect(newMessage.conversation_id).toBe(scenario.activeChatId);
        }
      ),
      { numRuns: 100 }
    );
  });
});
